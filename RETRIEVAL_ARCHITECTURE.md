# Privacy-First Legal Retrieval Architecture for Apex

## Honest Preamble

This document is an architectural recommendation with real tradeoffs, not marketing copy. Every choice here has a cost. The goal is to make those costs explicit so decisions can be made with eyes open.

---

## 1. Privacy-First Data Isolation

### The Real Threat Model

Law firms face three distinct privacy threats that most SaaS platforms ignore:

1. **Cross-tenant data leakage**: Firm A's privileged communications appearing in Firm B's search results. This is a career-ending, bar-complaint-generating catastrophe. Zero tolerance.
2. **Intra-tenant unauthorized access**: A junior associate seeing a partner's client's privileged M&A documents. Common in shared-database systems.
3. **Model contamination**: Fine-tuned models or learned patterns leaking information across users. Subtle, hard to detect, and legally ambiguous.

### Architecture: Defense in Depth

We implement **four isolation layers**, any one of which should be sufficient alone. The redundancy is intentional for a legal product.

```
Layer 1: Application-Level Filtering
  Every query includes WHERE firm_id = ? AND user has access
  Enforced in middleware, not trusted to individual route handlers

Layer 2: PostgreSQL Row-Level Security (RLS)
  Database-level enforcement even if application layer is bypassed
  SET app.current_firm_id = ? on every connection

Layer 3: Namespace Isolation for Vector Stores
  pgvector indexes partitioned by firm_id
  Similarity searches physically cannot return cross-tenant results

Layer 4: Encryption at Rest with Per-Tenant Keys
  Each firm's embeddings encrypted with a unique AES-256-GCM key
  Key derived from firm_id + HSM-stored master secret
  Even a full database dump reveals nothing without the key
```

### The Local-First Question

> Should processing happen locally before any cloud sync?

**Recommendation: No, but with important caveats.**

**Arguments for local-first:**
- Documents never leave the lawyer's machine until explicitly synced
- Reduces cloud attack surface
- Gives lawyers a feeling of control

**Arguments against (and why we chose cloud-first):**
- Embedding generation requires GPU compute most desktops lack
- Local vector stores fragment search (can't find a document you uploaded from your phone on your laptop)
- Sync conflicts in legal documents are dangerous (two versions of a contract = malpractice risk)
- Desktop Electron apps have their own security surface (local file access, memory dumps)
- Legal clients increasingly expect cloud availability and collaboration

**Our hybrid approach:**
1. Document text extraction happens on upload (cloud-side) with encrypted transit (TLS 1.3)
2. Chunking and embedding happen server-side within the tenant boundary
3. The desktop client can cache encrypted chunks locally for offline search
4. The desktop client NEVER stores raw embeddings or decrypted content at rest
5. A "confidential matter" flag forces local-only processing with no cloud embedding (for extremely sensitive matters)

### Encryption Implementation

```
Document Upload Flow:
1. Client uploads document over TLS 1.3
2. Server extracts text (PDF/DOCX parsing)
3. Text is chunked with legal-aware splitter
4. Each chunk gets contextual metadata prepended (Anthropic's approach)
5. Embedding generated via Azure OpenAI
6. Embedding encrypted with firm-specific AES-256-GCM key
7. Encrypted embedding + encrypted chunk text stored in PostgreSQL
8. Original document stored in Azure File Share (Azure SSE encryption)
9. Audit log entry created

Similarity Search Flow:
1. Query embedding generated
2. Firm's decryption key loaded from key cache (or Azure Key Vault)
3. Candidate embeddings decrypted in-memory
4. Cosine similarity computed
5. Results filtered by user's document access permissions
6. Decrypted data evicted from memory after response
```

**Performance impact of encryption:** ~15-25ms overhead per search query for decryption of top-100 candidates. Acceptable. The LRU cache of recently-decrypted embeddings reduces this to ~2-5ms for repeat queries within the same session.

### What We Will NOT Do

- **No cross-tenant model fine-tuning.** Ever. We use Azure OpenAI's embedding models as-is. No firm's data influences the model weights seen by another firm.
- **No "anonymized" cross-tenant pattern sharing for retrieval.** The risk of de-anonymization in legal contexts is too high. A unique clause structure or citation pattern can identify a firm's client.
- **No shared embedding space.** Each firm's vectors live in their own logical namespace. There is no "global" similarity search.

---

## 2. Retrieval Architecture Evaluation

### The Candidates

| Architecture | How It Works | Strengths | Weaknesses |
|---|---|---|---|
| **Traditional RAG** | Embed chunks, vector similarity search, stuff into prompt | Fast (<100ms), simple, well-understood | Misses relationships between documents, no reasoning chains, chunk boundaries lose context |
| **GraphRAG** | Knowledge graph of entities/relationships, graph traversal for retrieval | Captures citation networks, clause dependencies, entity relationships | Complex to build and maintain, graph construction is expensive, cold-start problem |
| **Hybrid RAG + Graph** | Vector search for initial retrieval, graph for relationship expansion | Best of both worlds, vector handles novel queries while graph handles known relationships | Two systems to maintain, fusion scoring is tricky, slower than pure vector |
| **RAPTOR** | Hierarchical summarization trees, search at multiple abstraction levels | Excellent for long documents (100+ page contracts), captures document-level themes | Expensive to build (many LLM calls for summaries), stale summaries when docs change |
| **Contextual Retrieval** | Prepend document/section context to each chunk before embedding | Simple improvement to any RAG system, 35-50% relevance improvement per Anthropic's benchmarks | Increases embedding storage by ~2x, re-embedding needed if context schema changes |
| **ColBERT/Late Interaction** | Token-level embeddings with late interaction scoring | Most nuanced matching, handles ambiguous queries well | Heavy compute (10-50x more storage than single-vector), requires custom infrastructure |

### Legal Domain Analysis

Legal documents have unique properties that most RAG literature ignores:

**Case Law:**
- Natural citation graphs (case A cites case B which overrules case C)
- Hierarchical authority (Supreme Court > Circuit Court > District Court)
- Temporal dynamics (recent cases may overrule older ones)
- Jurisdiction specificity (NY precedent irrelevant in TX state court)
- **Best served by: Graph + Vector hybrid**

**Contracts:**
- Clause interdependencies ("Indemnification" references "Definitions" which references "Parties")
- Boilerplate vs. negotiated terms (the negotiated parts matter most)
- Version lineages (v1 -> v2 -> v3 with redlines)
- Cross-reference resolution ("as defined in Section 3.2(a)")
- **Best served by: RAPTOR (hierarchical) + Contextual Retrieval**

**Pleadings/Motions:**
- Procedural posture matters (summary judgment vs. motion to dismiss = different retrieval needs)
- Court-specific requirements (local rules, formatting)
- Argument structure (IRAC: Issue, Rule, Application, Conclusion)
- **Best served by: Contextual Retrieval + Vector**

**Client/Matter Hierarchy:**
- One client may have many matters
- Matters have natural document groupings (discovery, pleadings, correspondence)
- Cross-matter precedent within a client (how we handled similar issue before)
- **Best served by: Graph (matter/client hierarchy) + Vector**

### Our Recommendation: Layered Hybrid

We recommend a **four-layer retrieval stack**, implemented incrementally:

```
                    ┌─────────────────────────────┐
                    │      QUERY UNDERSTANDING     │
                    │  Intent classification:       │
                    │  - Case law lookup            │
                    │  - Clause search              │
                    │  - Precedent chain            │
                    │  - General knowledge          │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐    ┌────────────────────┐    ┌──────────────────┐
│ LAYER 1:      │    │ LAYER 2:           │    │ LAYER 3:         │
│ Contextual    │    │ Graph Expansion    │    │ RAPTOR           │
│ Vector Search │    │                    │    │ Hierarchical     │
│               │    │ Citation networks  │    │ Summaries        │
│ Chunks with   │    │ Clause deps        │    │                  │
│ prepended     │    │ Matter hierarchy   │    │ Document-level   │
│ context       │    │ Client groupings   │    │ summaries for    │
│               │    │                    │    │ long docs        │
│ pgvector      │    │ PostgreSQL         │    │                  │
│ cosine sim    │    │ recursive CTE      │    │ Pre-computed     │
│               │    │                    │    │ summary tree     │
└───────┬───────┘    └────────┬───────────┘    └────────┬─────────┘
        │                     │                         │
        └─────────────────────┼─────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   LAYER 4:         │
                    │   Result Fusion    │
                    │                    │
                    │   RRF + legal      │
                    │   domain weights   │
                    │   + lawyer prefs   │
                    │   + jurisdiction   │
                    │   matching         │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │   FINAL RESULTS    │
                    │   with provenance  │
                    │   and explanations │
                    └────────────────────┘
```

### Why NOT ColBERT

ColBERT/late interaction models offer superior matching quality but require:
- Token-level embedding storage (128 tokens * 128 dims per chunk = 16K floats vs. 1536 for a single embedding)
- Custom index infrastructure (not supported by pgvector)
- Separate serving infrastructure (PLAID index, etc.)
- The quality improvement over contextual retrieval + graph is marginal for our use case

**Verdict:** Revisit when pgvector or a managed service supports late interaction natively. Not worth the infrastructure complexity today.

### Why NOT Pure GraphRAG

Microsoft's GraphRAG approach (full document -> entity extraction -> community detection -> summarization) is powerful but:
- Requires many LLM calls per document (entity extraction, relationship extraction, community summarization)
- Cold-start problem: useless until the entire corpus is processed
- Graph maintenance is expensive when documents change frequently
- The "community detection" step assumes a large interconnected corpus; most law firms have siloed matters

**Verdict:** We take the graph RELATIONSHIPS (citations, dependencies, hierarchies) but skip the community detection and entity extraction pipeline. We build the graph incrementally as documents are processed, not as a batch job.

### Implementation Priority

| Phase | What | Why First | Effort |
|-------|------|-----------|--------|
| 1 | Contextual Vector Search | Biggest bang for buck. 35-50% relevance improvement over naive RAG. Works with existing pgvector setup. | 1 week |
| 2 | Document Relationship Graph | Citation networks and clause dependencies are the killer feature for legal. | 1 week |
| 3 | RAPTOR Hierarchical Summaries | Transforms long-document search. A 200-page contract becomes searchable at multiple abstraction levels. | 1 week |
| 4 | Result Fusion + Lawyer Preferences | Tie it all together with personalized ranking. | 1 week |

---

## 3. Meaningful Learning (Not Just Retrieval)

### The Core Distinction: Lawyer vs. Matter

This is the most important design decision in the learning system. Every pattern the system observes falls into one of three buckets:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LEARNING HIERARCHY                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LAYER 1: LAWYER IDENTITY (persists across ALL matters)             │
│  ─────────────────────────────────────────────────────              │
│  Signal strength: HIGH (observed across 5+ matters)                 │
│  Examples:                                                          │
│    • Writing style: "Uses Oxford comma, prefers 'shall' over        │
│      'will', writes in active voice"                                │
│    • Risk tolerance: "Conservative on indemnification, aggressive   │
│      on limitation of liability"                                    │
│    • Citation style: "Bluebook 21st edition, prefers parenthetical  │
│      explanations"                                                  │
│    • Jurisdiction preferences: "Primary: NY, secondary: DE for      │
│      corporate matters"                                             │
│    • Document type affinity: "References motions in limine most     │
│      for evidence questions, uses treatises for statutory interp"   │
│                                                                     │
│  LAYER 2: PRACTICE AREA PATTERNS (persists within practice area)    │
│  ───────────────────────────────────────────────────────            │
│  Signal strength: MEDIUM (observed across 3+ matters of same type)  │
│  Examples:                                                          │
│    • Contract drafting: "Always includes anti-assignment clause,    │
│      prefers mutual indemnification"                                │
│    • Litigation: "Front-loads strongest argument, uses IRAC for     │
│      legal analysis sections"                                       │
│    • M&A: "Prioritizes rep & warranty coverage over purchase        │
│      price adjustment"                                              │
│                                                                     │
│  LAYER 3: MATTER-SPECIFIC CONTEXT (scoped to one matter)            │
│  ──────────────────────────────────────────────────────             │
│  Signal strength: LOW (single matter, may not generalize)           │
│  Examples:                                                          │
│    • "Client prefers email updates on Fridays"                      │
│    • "Opposing counsel responds slowly, pad deadlines"              │
│    • "Judge Smith requires courtesy copies"                         │
│    • "This contract uses 'Company' not 'Buyer'"                    │
│                                                                     │
│  THE KEY RULE:                                                      │
│  Patterns observed in a SINGLE matter start as Layer 3.             │
│  If the SAME pattern appears across 3+ matters of the same type,   │
│  it promotes to Layer 2.                                            │
│  If it appears across 5+ matters of ANY type, it promotes to       │
│  Layer 1.                                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### What Patterns Should Persist Across Sessions

| Pattern Type | Persist? | Why | Storage |
|---|---|---|---|
| Writing style (formality, voice, sentence structure) | Yes, Layer 1 | A lawyer's writing voice is their professional identity | `lawyer_preferences` table |
| Preferred clause structures | Yes, Layer 2 | These represent deliberate legal choices, not accidents | `lawyer_preferences` with `context = practice_area` |
| Risk tolerance by clause type | Yes, Layer 2 | Risk appetite is stable within practice areas | `lawyer_preferences` with JSONB risk profiles |
| Jurisdiction preferences | Yes, Layer 1 | Jurisdictional expertise is a core lawyer attribute | `lawyer_preferences` |
| Citation format preferences | Yes, Layer 1 | Style consistency matters for professional credibility | `lawyer_preferences` |
| Document type affinity by question type | Yes, Layer 2 | "For evidence questions, I always check the FRE manual first" | `retrieval_feedback` aggregated into `lawyer_preferences` |
| Opposing counsel behavior | No (Layer 3) | Specific to a matter, dangerous to generalize | `matter_context` table (new) |
| Client communication preferences | Maybe (Layer 3 -> 2) | If same client across matters, promote | `client_preferences` table (new) |
| Search query patterns | Yes, Layer 1 | How a lawyer formulates questions reveals thinking patterns | `retrieval_feedback` analysis |

### How the System Learns Which Documents Matter

The retrieval feedback loop is the most valuable learning signal:

```
1. Lawyer asks: "What's the standard for summary judgment in NY?"

2. System retrieves 10 documents:
   - 3 case law documents
   - 2 treatise sections
   - 2 prior firm memos
   - 3 statutory provisions

3. Lawyer clicks on and uses: firm memo from 2024, Celotex case

4. System records:
   - query_type: "procedural_standard"
   - question_category: "summary_judgment"
   - selected_types: ["firm_memo", "case_law"]
   - ignored_types: ["treatise", "statute"]
   - time_to_selection: 3 seconds (fast = high confidence match)

5. After 10 similar queries, system learns:
   "For procedural standard questions, this lawyer prefers
    firm memos first, then case law. Deprioritize treatises."

6. This promotes from Layer 3 to Layer 2 (practice area pattern)
   because it's consistent across litigation matters.
```

### Distinguishing Signal from Noise

Not every observation should become a learning. The system uses a **confidence threshold with temporal decay**:

```
Confidence Formula:
  confidence = min(0.99, base_confidence + 0.49 * (1 - exp(-occurrences / 10)))

Where:
  base_confidence = 0.3 for inferred patterns
  base_confidence = 0.7 for explicit user preferences
  occurrences = number of times pattern observed

Temporal Decay:
  effective_confidence = confidence * exp(-days_since_last_seen / 180)

Promotion Thresholds:
  Layer 3 -> Layer 2: confidence >= 0.6 AND distinct_matters >= 3
  Layer 2 -> Layer 1: confidence >= 0.8 AND distinct_practice_areas >= 2
```

### What the System Should NEVER Learn

- **Privileged communication content.** The system learns PATTERNS (e.g., "this lawyer is formal in client emails") not CONTENT (e.g., "the client said they were negligent").
- **Opposing party strategies.** Learning from one matter's strategy and applying it to another could create conflicts of interest.
- **Settlement amounts or terms.** Each negotiation is unique; pattern-matching here is dangerous.
- **Judicial decision predictions.** "Judge X usually rules for defendants" is bias, not intelligence.

---

## 4. Technical Implementation

### Database Schema Additions

The following tables extend the existing schema to support the full retrieval + learning pipeline:

#### Hierarchical Summary Trees (RAPTOR)

```sql
CREATE TABLE IF NOT EXISTS document_summary_tree (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 0,  -- 0 = chunk, 1 = section, 2 = document
    parent_id UUID REFERENCES document_summary_tree(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    embedding VECTOR(1536),
    child_chunk_ids UUID[],  -- References to child nodes
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_id, document_id, level, parent_id)
);
```

#### Matter-Specific Context

```sql
CREATE TABLE IF NOT EXISTS matter_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_key VARCHAR(100) NOT NULL,
    context_value JSONB NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    source VARCHAR(50) DEFAULT 'inferred',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_id, matter_id, lawyer_id, context_type, context_key)
);
```

#### Preference Promotion Tracking

```sql
CREATE TABLE IF NOT EXISTS preference_promotion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_id UUID NOT NULL,
    from_layer INTEGER NOT NULL,  -- 3 = matter, 2 = practice area, 1 = lawyer
    to_layer INTEGER NOT NULL,
    evidence_count INTEGER NOT NULL,
    distinct_matters INTEGER NOT NULL,
    promoted_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Contextual Retrieval Enhancement

The single highest-ROI change. Before embedding a chunk, prepend context:

```
Original chunk:
  "The indemnifying party shall defend, indemnify, and hold harmless..."

Contextual chunk (what we actually embed):
  "[Document: Master Services Agreement | Section: 8. Indemnification |
   Matter Type: SaaS Vendor Agreement | Jurisdiction: New York |
   Date: 2024-03-15 | Author: J. Smith]
   The indemnifying party shall defend, indemnify, and hold harmless..."
```

This means a search for "indemnification in SaaS agreements" will rank this chunk higher than a generic indemnification clause from a real estate contract, because the context metadata is part of the embedding.

### Retrieval Pipeline

```
1. QUERY UNDERSTANDING
   - Classify intent: case_law_lookup | clause_search | precedent_chain | general
   - Extract entities: jurisdiction, practice area, document type, date range
   - Expand query with legal synonyms (e.g., "damages" -> "damages OR remedy OR relief")

2. PARALLEL RETRIEVAL
   a. Contextual Vector Search (pgvector):
      - Generate query embedding with same contextual format
      - Cosine similarity against firm's embeddings
      - Top 50 candidates

   b. Keyword Search (PostgreSQL full-text):
      - ts_query against chunk_text
      - Exact citation matching (e.g., "42 U.S.C. § 1983")
      - Top 30 candidates

   c. Graph Expansion (for case law and contract queries):
      - Recursive CTE traversal of document_relationships
      - Citation chain following (up to depth 3)
      - Clause dependency resolution
      - Top 20 candidates

   d. RAPTOR Summary Search (for long-document queries):
      - Search at summary level first
      - Drill down to relevant sections
      - Top 10 candidates

3. RESULT FUSION
   - Reciprocal Rank Fusion (RRF) across all sources:
     RRF_score = sum(1 / (k + rank_in_source)) for each source
   - Legal domain weights:
     * Higher court > lower court
     * Recent > old (with exceptions for landmark cases)
     * Same jurisdiction > other jurisdiction
   - Lawyer preference weights (from learning system)

4. POST-PROCESSING
   - Deduplicate overlapping chunks
   - Group by document (show best chunk per document)
   - Add provenance ("Found via: citation graph from Case X")
   - Add confidence score
```

### Performance Budget

| Operation | Target | Approach |
|---|---|---|
| Embedding generation | <200ms | Azure OpenAI, batched when possible |
| Vector similarity search | <50ms | pgvector IVFFlat index, pre-filtered by firm_id |
| Graph expansion | <100ms | Recursive CTE with depth limit 3, indexed on firm_id + source_doc |
| RAPTOR summary search | <50ms | Search summary level first (much smaller index) |
| Result fusion | <10ms | In-memory computation |
| Total retrieval latency | <500ms p95 | Parallel execution of retrieval sources |

---

## 5. Tradeoffs We Accept

### Tradeoff 1: Storage Cost vs. Privacy
Per-tenant encryption doubles effective storage (encrypted + metadata overhead). For a 10,000-document firm with 50,000 chunks, this means ~500MB additional storage. At Azure prices, about $0.50/month. Worth it.

### Tradeoff 2: Latency vs. Encryption
Encrypted embeddings add 15-25ms per search. We mitigate with an LRU cache, but cold searches are slower. For a legal product where accuracy matters more than milliseconds, acceptable.

### Tradeoff 3: Complexity vs. Retrieval Quality
The four-layer retrieval stack is more complex than simple vector search. But legal documents have structure that vector search alone cannot capture. A citation network is not a "nice to have" for case law research; it's the difference between useful and useless.

### Tradeoff 4: Learning Conservatism vs. Personalization Speed
Our confidence thresholds (5+ observations before Layer 1 promotion) mean the system learns slowly. A new lawyer won't see personalized results for weeks. This is intentional: in legal, a wrong inference based on sparse data is worse than no inference at all.

### Tradeoff 5: No Cross-Tenant Intelligence
We sacrifice the ability to say "lawyers in general prefer X" in exchange for absolute privacy. A multi-tenant legal AI competitor might learn faster by pooling data across firms. We choose privacy over speed-of-learning, because our customers (law firms) will too.

---

## 6. What We Deliberately Defer

| Feature | Why Defer | When to Revisit |
|---|---|---|
| ColBERT/late interaction | Infrastructure complexity, marginal quality gain over contextual retrieval | When pgvector or a managed service adds native support |
| Full GraphRAG (entity extraction + community detection) | Too expensive per document, cold-start problem | When LLM costs drop 10x or a legal-specific NER model exists |
| Cross-tenant anonymized patterns | Privacy risk too high for legal domain | Never, unless a law firm consortium explicitly opts in |
| Real-time embedding updates | Current batch-on-upload is sufficient | When document edit frequency increases significantly |
| Multi-modal retrieval (images in documents, tables) | Text extraction handles most legal docs | When scanned document volume justifies OCR pipeline |

---

## 7. Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Retrieval NDCG@10 | > 0.75 | Manual evaluation set of 100 legal queries |
| Cross-tenant data leaks | 0 | Automated penetration testing + audit logs |
| Search latency p95 | < 500ms | Application monitoring |
| Lawyer satisfaction | > 4.0/5.0 | In-app feedback after search |
| Learning accuracy | > 80% preference prediction | Compare predicted vs. actual document selection |
| Encryption coverage | 100% of embeddings | Database audit query |

---

## 8. Implementation Files

| Component | File | Purpose |
|---|---|---|
| Tenant isolation middleware | `backend/src/middleware/tenantIsolation.js` | Enforces firm_id on every query, sets RLS context |
| Encryption service | `backend/src/services/encryptionService.js` | Per-tenant key management, AES-256-GCM encrypt/decrypt |
| Contextual chunker | `backend/src/services/contextualChunker.js` | Legal-aware chunking with metadata prepending |
| Hybrid retrieval pipeline | `backend/src/services/retrievalPipeline.js` | Orchestrates vector + graph + RAPTOR + keyword search |
| RAPTOR summary builder | `backend/src/services/raptorSummaryService.js` | Hierarchical summary tree construction |
| Learning preference engine | `backend/src/services/lawyerPreferenceEngine.js` | Three-layer learning with promotion logic |
| Retrieval feedback collector | `backend/src/services/retrievalFeedback.js` | Implicit + explicit feedback for learning loop |
| Database migration | `backend/src/db/migrations/add_retrieval_learning_tables.sql` | Schema for summary trees, matter context, promotion logs |
