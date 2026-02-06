# How the Background Agent's Learning Memory Works

## What Does the Agent Learn From?

The agent learns from **three sources**, not just AI tasks:

### 1. User Documents (Private per-user)

When a user uploads or views a document, the system extracts learning insights:

| What It Learns | How | File |
|----------------|-----|------|
| **Writing style** | Sentence length, formality level, paragraph structure | `documentLearning.js` |
| **Clause patterns** | Common clauses in contracts (indemnification, termination, etc.) | `documentLearning.js` |
| **Terminology preferences** | "pursuant to" vs "according to", "shall" vs "will" | `documentLearning.js` |
| **Document structure** | Whether user uses headings, numbered sections, recitals, signature blocks | `documentLearning.js` |
| **Naming conventions** | How user names documents (dated, versioned, descriptive) | `manualLearning.js` |

**Wired in at:**
- Document upload: `documents.js` line 1415 (`learnFromDocument`)
- Document content view: `documents.js` line 1593 (`onDocumentAccessed`)

### 2. User Interactions with the Software (Private per-user)

The system learns from how the user **manually** uses the software, not just AI:

| What It Learns | Triggered By | File |
|----------------|-------------|------|
| **Billing description patterns** | Creating a time entry | `manualLearning.js` via `timeEntries.js` |
| **Rate patterns by matter type** | Creating time entries with rates | `manualLearning.js` via `timeEntries.js` |
| **Activity code usage** | Using activity codes on time entries | `manualLearning.js` via `timeEntries.js` |
| **Billing timing** | When during the day/week user enters time | `manualLearning.js` via `timeEntries.js` |
| **Task patterns** | Creating tasks manually | `manualLearning.js` via `matterItems.js` |
| **Scheduling patterns** | Setting due dates on tasks | `manualLearning.js` via `matterItems.js` |
| **Calendar event patterns** | Creating calendar events | `manualLearning.js` via `calendar.js` |
| **Meeting duration patterns** | Scheduling meetings/hearings | `manualLearning.js` via `calendar.js` |
| **Matter naming conventions** | Creating matters | `manualLearning.js` via `matters.js` |
| **Note-taking patterns** | Adding notes to matters | `manualLearning.js` via `matters.js` |
| **Page navigation patterns** | Browsing the app | `interactionLearning.js` via `useInteractionLearning` hook |
| **Feature usage frequency** | Using buttons/actions | `interactionLearning.js` via `useInteractionLearning` hook |
| **Search behavior** | Searching (categories only, not raw text) | `interactionLearning.js` via `useInteractionLearning` hook |
| **Sort/filter preferences** | Changing view settings | `interactionLearning.js` via `useInteractionLearning` hook |
| **Work schedule patterns** | Time-of-day usage | `interactionLearning.js` via `useInteractionLearning` hook |

### 3. AI Task Execution (Shared at firm/global levels)

| What It Learns | Triggered By | File |
|----------------|-------------|------|
| **Successful tool sequences** | Completing AI tasks | `selfReinforcement.js` |
| **Error recovery strategies** | Recovering from failed actions | `selfReinforcement.js` |
| **Task templates** | Successfully completing multi-step tasks | `selfReinforcement.js` |
| **Quality standards** | Highly-rated task completions | `selfReinforcement.js` |
| **User preferences from feedback** | Negative feedback with corrections | `selfReinforcement.js` |
| **Workflow patterns** | Recording successful workflows | `learning.py` |
| **User behavior emulation** | Observing user decision patterns | `learning.py` |

---

## How Does It Not Get Overloaded?

The system uses **7 layered safeguards** to keep learning memory bounded:

### 1. Three-Layer Memory Architecture with Consolidation

| Layer | Retention | Storage | Purpose |
|-------|-----------|---------|---------|
| **Short-term** | 7 days | In-memory cache + DB | Raw task data, recent events |
| **Medium-term** | 90 days | Database patterns table | Statistical patterns extracted from raw data |
| **Long-term** | Indefinite | Compressed heuristics | Distilled wisdom and core principles |

**Consolidation schedule:**
- **Daily**: Raw tasks -> Patterns (7-day rolling window)
- **Weekly**: Patterns -> Heuristics (wisdom distillation)
- **Monthly**: Memory pruning (low-confidence deprecated, storage optimized)

**Compression ratio: ~100:1**

### 2. Hard Caps on Collection Sizes

| Collection | Cap | Location |
|-----------|-----|----------|
| Observations | **500 most recent** | `learning.py` line 345 |
| Examples per preference | **10 max** | `learning.py` line 668 |
| Edit patterns in style guide | **Top 10** | `learning.py` line 613 |
| Database learnings per firm | **100 max** | `selfReinforcement.js` line 383 |
| Context patterns per level | **10 max** | `learning.py` lines 557-559 |
| Lessons for a task | **10 max** | `learning.py` line 1253 |
| Preferences in prompt | **10 max** | `learning.py` line 898 |
| Document insights per user | **50 max** | `documentLearning.js` line 320 |
| Interaction profile | **50 max** | `interactionLearning.js` line 289 |
| Frontend event buffer | **30 max** | `useInteractionLearning.ts` line 14 |

### 3. Confidence-Based Filtering

- Database only loads learnings with `confidence >= 0.5`
- **User-level** patterns: threshold `>= 0.3` (lenient for personal data)
- **Firm-level** patterns: threshold `>= 0.5` (medium)
- **Global patterns**: threshold `>= 0.6` (strict)
- Confidence uses diminishing-returns formula: `min(0.99, 0.50 + 0.49 * (1 - exp(-occurrences/10)))`

### 4. Database Deduplication

```sql
content_hash GENERATED ALWAYS AS (encode(sha256(content::text::bytea), 'hex')) STORED

ON CONFLICT (firm_id, learning_type, content_hash)
DO UPDATE SET
  confidence = GREATEST(confidence, EXCLUDED.confidence),
  occurrence_count = occurrence_count + 1
```

1000 observations of the same pattern = **1 database row** with a high occurrence count.

### 5. In-Memory Cache with TTL

| Cache | TTL | Max Size |
|-------|-----|----------|
| Learnings cache | 5 minutes | 100 per firm |
| Document style cache | 10 minutes | 50 per user |
| Interaction profile cache | 10 minutes | 50 per user |

### 6. Pattern Merging Instead of Accumulation

When the same thing is observed again:
- **Edit patterns**: Occurrence count increments (not new entry)
- **Workflow patterns**: Running average updated (not new record)
- **Style preferences**: Examples deduplicated and capped at 10
- **Interaction patterns**: Frequency aggregated with running total
- **Manual learning**: Numeric fields use running averages

### 7. Hierarchical Privacy-Based Scoping

| Level | Scope | Filter Threshold |
|-------|-------|-----------------|
| **User** | Private to individual | `>= 0.3` |
| **Firm** | Shared within firm | `>= 0.5` |
| **Global** | Anonymized across all users | `>= 0.6` |

Global patterns are stripped of all identifying information:
```python
safe_keys = ['task_type', 'action_type', 'success_rate', 'action_sequence',
             'step_count', 'priority', 'frequency', 'document_type', 'matter_type']
```

### 8. Frontend Event Batching

The `useInteractionLearning` hook uses additional safeguards:
- Events buffered in memory (not sent per click)
- Flushed every 60 seconds OR when buffer hits 30 events
- Minimum 3 events required to trigger a flush
- Server processes events into aggregated patterns, not raw clicks
- Categories (not raw text) are stored for search queries

---

## Architecture Diagram

```
USER ACTIONS                    LEARNING LAYER                 AGENT CONTEXT
===========                     ==============                 =============

Upload document ──────> documentLearning.js ──────┐
View document content ──> (writing style,         │
                          terminology,             │
                          clause patterns)         │
                                                   │
Create time entry ────> manualLearning.js ────────┤
Create task ──────────> (billing patterns,        │
Create event ─────────>  naming conventions,      ├──> ai_learning_patterns DB
Create matter ────────>  scheduling patterns,     │         │
Add note ─────────────>  workflow sequences)      │         │
                                                   │         ▼
Navigate app ─────────> interactionLearning.js ───┤    Agent Prompt Context
Use features ─────────> (page frequency,          │    (get_full_learning_context)
Search ───────────────>  feature usage,            │         │
Filter/Sort ──────────>  work schedule,            │         │
                         search behavior)          │         ▼
                                                   │    Better Personalized
AI task completes ────> selfReinforcement.js ─────┤    Responses & Actions
User feedback ────────> (tool patterns,           │
                         error recovery,           │
                         quality standards)        │
                                                   │
User edits AI output ─> learning.py ──────────────┘
                        (edit patterns,
                         style preferences,
                         workflow patterns)

MEMORY MANAGEMENT:
  Raw Events ──[daily]──> Patterns ──[weekly]──> Heuristics
  (7 day TTL)             (90 day TTL)            (permanent)
  
  All layers: deduplication, confidence caps, size limits, TTL caching
```

---

## Summary

| Question | Answer |
|----------|--------|
| Does it learn from documents? | Yes - writing style, terminology, structure, clause patterns |
| Does it learn from manual software use? | Yes - time entries, tasks, calendar, matters, notes, navigation, search |
| Does it learn from AI tasks? | Yes - tool patterns, error recovery, quality standards |
| Will it get overloaded? | No - 7 safeguards: consolidation, hard caps, confidence filtering, deduplication, TTL caching, pattern merging, hierarchical scoping |
| Is it private? | Yes - user patterns are private; firm patterns shared within firm; global patterns fully anonymized |
