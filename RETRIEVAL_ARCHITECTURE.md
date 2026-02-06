# Privacy-First Retrieval Architecture for Apex Legal AI

## Executive Summary

This document outlines a privacy-first, legally-aware retrieval architecture for Apex's AI capabilities. The system implements strict tenant isolation, encrypted embeddings, hybrid RAG+Graph retrieval, and meaningful learning of lawyer preferences—all while maintaining maximum privacy for user data.

## Core Principles

1. **Privacy-First**: User data never crosses tenant boundaries; encryption at rest for embeddings; local processing preferred
2. **Legal Domain Awareness**: Optimized for legal document structures (citation networks, clause dependencies, precedent chains)
3. **Meaningful Learning**: Distinguishes lawyer preferences from matter context, learns across sessions without overfitting
4. **Practical Implementation**: Builds on existing PostgreSQL/Azure infrastructure, incremental rollout

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RETRIEVAL LAYER                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      QUERY PROCESSOR                            │   │
│  │  • Query understanding                                          │   │
│  │  • Intent classification (case law lookup, clause search, etc.) │   │
│  │  • Query expansion with legal terminology                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│  ┌─────────────────┐  ┌────────┴────────┐  ┌─────────────────┐        │
│  │   VECTOR SEARCH │  │  GRAPH EXPANDER │  │  KEYWORD FILTER │        │
│  │   (pgvector)    │  │  (PostgreSQL    │  │  (PostgreSQL    │        │
│  │                 │  │   Recursive CTE)│  │   Full-Text)    │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                 │                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     RESULT FUSION                              │   │
│  │  • Reciprocal Rank Fusion (RRF)                                │   │
│  │  • Relevance scoring with legal domain weights                 │   │
│  │  • Diversity promotion (different document types)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    LEARNING LAYER                               │   │
│  │  • Preference tracking (lawyer style, risk tolerance)           │   │
│  │  • Feedback incorporation (explicit/implicit)                   │   │
│  │  • Pattern detection across sessions                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Privacy-First Data Isolation

### Tenant Isolation Strategy

**Database-Level:**
- All retrieval queries include `WHERE firm_id = ?` (enforced at application layer)
- Row-Level Security (RLS) policies on embedding tables
- Separate PostgreSQL schemas per firm (optional future enhancement)

**Vector Storage:**
- pgvector extension with per-tenant filtering
- Each firm's embeddings stored in same table but isolated by `firm_id`
- Indexes partitioned by `firm_id` for performance

**Encryption at Rest:**
1. **Azure Disk Encryption**: Leverage Azure's built-in encryption for PostgreSQL
2. **Column-Level Encryption**: Encrypt embedding vectors with per-tenant keys (Azure Key Vault)
   - Embeddings encrypted with AES-256-GCM using key per firm
   - Decryption happens in application layer during similarity search
   - Cache decrypted embeddings in memory (LRU) for performance
3. **Key Management**: Each firm's encryption key stored in Azure Key Vault, accessible only to their instance

**Processing Pipeline:**
```
Document → Parse → Chunk → Encrypt → Embed → Store Encrypted Embedding
Query → Encrypt → Embed → Search (with decryption of candidate embeddings)
```

### Implementation Details

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Encrypted embedding table
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,  -- For multi-chunk documents
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),        -- OpenAI embedding dimension
    encrypted_embedding BYTEA,     -- AES-256-GCM encrypted embedding
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure tenant isolation in indexes
    UNIQUE(firm_id, document_id, chunk_index)
);

-- Enable Row-Level Security
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY firm_isolation_policy ON document_embeddings
    USING (firm_id = current_setting('app.current_firm_id')::UUID);

-- Index for similarity search
CREATE INDEX idx_embeddings_firm_vector ON document_embeddings 
    USING ivfflat (embedding vector_cosine_ops)
    WHERE firm_id = ?;  -- Partial index per firm (created dynamically)
```

## 2. Retrieval Architecture for Legal Documents

### Hybrid RAG + Graph Approach

**Component 1: Vector Search (Semantic Similarity)**
- Model: `text-embedding-3-small` (1536 dimensions) via Azure OpenAI
- Chunking: Legal-aware chunking (by section, clause, or paragraph)
- Index: IVFFlat with cosine similarity (pgvector)

**Component 2: Knowledge Graph (Relationship Expansion)**
```
Nodes: Documents, Clauses, Cases, Statutes
Edges: Cites, References, Amends, DependsOn, SimilarTo
```

**Graph Schema:**
```sql
CREATE TABLE document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id),
    source_document_id UUID NOT NULL REFERENCES documents(id),
    target_document_id UUID NOT NULL REFERENCES documents(id),
    relationship_type VARCHAR(50) NOT NULL,  -- 'cites', 'references', 'amends', 'depends_on'
    confidence FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (source_document_id != target_document_id)
);

-- For citation networks
CREATE TABLE case_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    citing_case_id UUID NOT NULL,
    cited_case_id UUID NOT NULL,
    citation_context TEXT,
    page_number VARCHAR(20),
    verified BOOLEAN DEFAULT false
);
```

**Component 3: Contextual Retrieval Enhancement**
- Prepend metadata to chunks before embedding:
  - Jurisdiction
  - Matter type
  - Document type
  - Date
  - Author
- Improves relevance for legal queries

### Retrieval Process

```
1. Query → Embedding
2. Vector Search: Find top-k similar chunks (k=50)
3. Graph Expansion:
   - For each retrieved document, find related documents via relationship graph
   - Expand citation chains for case law queries
   - Expand clause dependencies for contract queries
4. Reciprocal Rank Fusion (RRF):
   - Combine vector similarity scores with graph proximity scores
   - Apply legal domain weights (precedent > secondary sources)
5. Re-ranking:
   - Jurisdiction match bonus
   - Recency bonus (more recent cases for some queries)
   - Lawyer preference weighting
6. Return top-n results with explanations
```

### Legal-Specific Optimizations

**Case Law Retrieval:**
- Prioritize higher court decisions
- Respect jurisdiction hierarchy
- Consider overruling/superseding status
- Follow precedent chains via citation graph

**Contract Retrieval:**
- Clause interdependency awareness
- Definition propagation across clauses
- Cross-reference resolution
- Version comparison

**Pleading Retrieval:**
- Procedural posture matching
- Court-specific formatting requirements
- Local rule compliance

## 3. Meaningful Learning System

### Preference Hierarchy

```
Layer 1: Lawyer Preferences (persistent across all matters)
  • Writing style (formal/casual, aggressive/conservative)
  • Risk tolerance (high/medium/low)
  • Jurisdiction preferences (favored jurisdictions)
  • Citation style (Bluebook, ALWD, local)
  • Formatting preferences (headings, spacing, numbering)

Layer 2: Matter-Type Preferences
  • Contract drafting: favored clause libraries
  • Litigation: motion style, argument structure
  • Transactional: diligence checklist priorities

Layer 3: Matter-Specific Context
  • Client preferences
  • Opposing counsel behavior patterns
  • Judge/court idiosyncrasies
  • Settlement history
```

### Learning Mechanisms

**Explicit Learning:**
- Lawyer tags preferences ("save as my standard NDA clause")
- Direct feedback ("this result was helpful/not helpful")
- Style guide import

**Implicit Learning:**
- Edit pattern analysis (what lawyer consistently changes)
- Retrieval feedback (which results are clicked/used)
- Session pattern detection (recurring query types)
- Success metric tracking (which retrievals lead to successful outcomes)

**Implementation Tables:**
```sql
CREATE TABLE lawyer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    lawyer_id UUID NOT NULL REFERENCES users(id),
    preference_type VARCHAR(50) NOT NULL,  -- 'writing_style', 'risk_tolerance', etc.
    preference_key VARCHAR(100) NOT NULL,   -- e.g., 'citation_format'
    preference_value JSONB NOT NULL,        -- e.g., '{"style": "bluebook", "edition": "21st"}'
    confidence FLOAT DEFAULT 0.5,
    source VARCHAR(50) DEFAULT 'explicit',  -- 'explicit', 'inferred', 'imported'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(firm_id, lawyer_id, preference_type, preference_key)
);

CREATE TABLE retrieval_feedback (
    id UUID PRIMARY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    lawyer_id UUID NOT NULL,
    query_hash VARCHAR(64) NOT NULL,  -- SHA-256 of query
    retrieved_document_ids UUID[] NOT NULL,
    selected_document_id UUID,         -- Which one lawyer used
    rating INTEGER,                    -- 1-5 scale
    session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE edit_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    lawyer_id UUID NOT NULL,
    original_text_hash VARCHAR(64) NOT NULL,
    edited_text_hash VARCHAR(64) NOT NULL,
    context VARCHAR(100),              -- 'contract_clause', 'motion_intro', etc.
    occurrences INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);
```

### Learning Algorithm

1. **Pattern Detection**: Cluster similar edits across documents
2. **Confidence Scoring**: Higher confidence with more occurrences
3. **Temporal Decay**: Older patterns weighted less than recent ones
4. **Context Awareness**: Separate patterns by document/matter type
5. **Feedback Incorporation**: Adjust retrieval rankings based on past success

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
1. Install pgvector extension in PostgreSQL
2. Create embedding tables with tenant isolation
3. Implement document chunking service
4. Integrate Azure OpenAI embeddings
5. Basic vector search API

### Phase 2: Hybrid Retrieval (Week 2)
1. Implement relationship graph tables
2. Build graph expansion service
3. Create citation parser for legal documents
4. Implement RRF fusion algorithm
5. Add legal-specific ranking factors

### Phase 3: Privacy Enhancements (Week 3)
1. Implement per-tenant encryption key management
2. Add column-level encryption for embeddings
3. Set up Azure Key Vault integration
4. Add caching layer for decrypted embeddings
5. Audit logging for all retrieval operations

### Phase 4: Learning System (Week 4)
1. Create preference tracking tables
2. Implement edit pattern detection
3. Build feedback collection API
4. Create preference-aware retrieval weighting
5. Add lawyer preference dashboard

### Phase 5: Integration & Optimization (Week 5)
1. Integrate with existing AI agent
2. Add retrieval-augmented generation (RAG)
3. Performance optimization (indexing, caching)
4. Monitoring and alerting
5. Documentation and training

## Technical Stack

**Backend:**
- PostgreSQL 15+ with pgvector extension
- Node.js (existing backend)
- Azure OpenAI (embeddings and chat)
- Azure Key Vault (encryption keys)
- Redis (caching decrypted embeddings)

**Python Agent:**
- Extend existing `learning.py` for preference detection
- Add retrieval integration to `lawyer_brain.py`
- Graph analysis with NetworkX

**Frontend:**
- React components for feedback collection
- Preference management UI
- Retrieval result explanations

## Security & Compliance

### Data Protection
- All embeddings encrypted at rest with per-tenant keys
- No cross-tenant data leakage (RLS enforced)
- Audit logs for all retrieval operations
- Regular security assessments

### Legal Compliance
- GDPR/CCPA ready (data deletion per tenant)
- HIPAA compliance for healthcare law firms
- SOC 2 Type II alignment
- E-discovery preservation capabilities

### Monitoring
- Embedding quality metrics (silhouette scores)
- Retrieval success rates
- Privacy violation detection
- Performance metrics (latency, recall)

## Success Metrics

1. **Retrieval Accuracy**: NDCG@10 for legal query test set
2. **Privacy Compliance**: Zero cross-tenant data leaks
3. **Performance**: <500ms p95 latency for retrieval
4. **User Satisfaction**: >4.0/5.0 feedback ratings
5. **Learning Effectiveness**: Preference detection accuracy >80%

## Conclusion

This architecture provides a robust, privacy-first foundation for legal AI retrieval. By combining vector search with legal knowledge graphs and meaningful learning, Apex will deliver superior legal research capabilities while maintaining the highest privacy standards required by law firms.

The incremental implementation approach allows for continuous delivery of value while managing technical complexity and risk.