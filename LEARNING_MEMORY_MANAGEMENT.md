# How the Background Agent's Learning Memory Doesn't Get Overloaded

## The Problem

The background agent is constantly learning from every task it completes, every user
edit it observes, every workflow it records, and every piece of feedback it receives.
Without safeguards, this would lead to unbounded memory growth, slower performance,
and eventually system failure.

## The Solution: 7 Layered Safeguards

The system uses multiple complementary strategies to keep learning memory bounded,
relevant, and efficient.

---

### 1. Three-Layer Memory Architecture with Consolidation

The system uses a **short-term → medium-term → long-term** memory pipeline that
progressively compresses data:

| Layer | Retention | Storage | Purpose |
|-------|-----------|---------|---------|
| **Short-term** | 7 days | In-memory cache + DB | Raw task data, recent events |
| **Medium-term** | 90 days | Database patterns table | Statistical patterns extracted from raw data |
| **Long-term** | Indefinite | Compressed heuristics | Distilled wisdom and core principles |

**How consolidation works:**
- **Daily** (midnight): Raw tasks are analyzed and patterns are extracted. The 7-day
  rolling window means old raw data naturally expires.
- **Weekly** (Sunday): Patterns are distilled into heuristics. Multiple observations
  like "document reviews take 25% longer" become a single reliable rule.
- **Monthly** (1st): Memory pruning runs — low-confidence patterns are deprecated,
  rarely-used heuristics are archived, and storage is optimized.

**Compression ratio: ~100:1** — hundreds of raw task records become a handful of
proven heuristics.

*See: `backend/src/services/amplifier/memoryDemoSimple.js`*

---

### 2. Hard Caps on Collection Sizes

Every collection in the system has explicit size limits:

| Collection | Cap | Location |
|-----------|-----|----------|
| Observations | **500 most recent** | `learning.py` line 345: `recent_observations = self._observations[-500:]` |
| Examples per preference | **10 max** | `learning.py` line 668: `existing.examples = list(set(existing.examples))[:10]` |
| Edit patterns in style guide | **Top 10** | `learning.py` line 613: `top_patterns = sorted(...)[:10]` |
| Database learnings per firm | **100 max** | `selfReinforcement.js` line 383: `LIMIT 100` |
| Context patterns per level | **10 max** | `learning.py` lines 557-559: `.[:10]` per level |
| Lessons for a task | **10 max** | `learning.py` line 1253: `return list(set(lessons))[:10]` |
| Preferences in prompt | **10 max** | `learning.py` line 898: `for pref in relevant[:10]` |
| Learnings for a task | **10 max** | `selfReinforcement.js` line 370: `return relevantLearnings.slice(0, 10)` |
| Success patterns | **5 max** | `learning.py` line 1274: `return patterns[:5]` |
| Past observations checked | **Last 100** | `learning.py` lines 1247, 1264: `self._observations[-100:]` |

These hard caps ensure that no matter how much the agent learns, the working set
stays bounded.

---

### 3. Confidence-Based Filtering

Not all learnings are treated equally. The system uses confidence scores (0.0 to 1.0)
to filter what gets stored and what gets used:

**Storage thresholds:**
- Database cache only loads learnings with `confidence >= 0.5`
- Low-confidence learnings are deprioritized during pruning

**Retrieval thresholds (hierarchical):**
- **User-level** patterns: `confidence >= 0.3` (more lenient — personal data)
- **Firm-level** patterns: `confidence >= 0.5` (medium threshold)
- **Global patterns**: `confidence >= 0.6` (higher bar for shared data)

**Confidence growth is bounded:**
- Confidence increases use `min(1.0, existing + 0.1)` — capped at 1.0
- Database uses a diminishing-returns formula:
  `confidence = min(0.99, 0.50 + 0.49 * (1 - exp(-occurrences / 10)))`
- This means confidence grows rapidly at first, then plateaus — even 1000
  occurrences won't exceed 0.99

*See: `backend/src/db/migrations/add_ai_learning_patterns.sql` lines 103-111*

---

### 4. Database Deduplication

The database prevents duplicate learnings using content hashing:

```sql
-- Content hash is auto-generated for deduplication
content_hash VARCHAR(64) GENERATED ALWAYS AS (
  encode(sha256(content::text::bytea), 'hex')
) STORED

-- Upsert on conflict: merge instead of duplicate
ON CONFLICT (firm_id, learning_type, content_hash)
DO UPDATE SET
  confidence = GREATEST(ai_learnings.confidence, EXCLUDED.confidence),
  occurrence_count = ai_learnings.occurrence_count + 1,
  updated_at = NOW()
```

When the same pattern is observed again, instead of creating a new row, the existing
row's confidence is boosted and its occurrence count increments. This means 1000
observations of the same pattern still occupy exactly **one database row**.

*See: `backend/src/db/migrations/add_ai_learnings.sql` lines 17, 33*

---

### 5. In-Memory Cache with TTL

The system doesn't query the database on every request. Instead, it uses a time-based
cache:

```javascript
const CACHE_TTL_MS = 300000; // 5 minutes

// Cache is refreshed only when stale
if (now - lastCacheRefresh > CACHE_TTL_MS) {
  await refreshCache(firmId);
}
```

The cache loads at most 100 learnings per firm, sorted by confidence. This bounds
the in-memory footprint regardless of how many learnings exist in the database.

*See: `backend/src/services/amplifier/selfReinforcement.js` lines 17-18, 376-396*

---

### 6. Pattern Merging Instead of Accumulation

When the same pattern is observed again, the system **merges** instead of appending:

**Edit patterns:** If the user corrects "hereinafter" → "from now on" multiple times,
the occurrence count on the existing pattern increments rather than creating new entries.

**Workflow patterns:** When a successful workflow is recorded for a task type that
already has a pattern, the existing pattern is updated:
- Success/failure counts are incremented
- Average time is recalculated with a running average
- The action sequence is only replaced if the old one had a low success rate

**Style preferences:** When a preference is updated, examples are deduplicated:
```python
existing.examples.extend(examples)
existing.examples = list(set(existing.examples))[:10]  # Dedupe and cap
```

This means repeated learning of the same concept doesn't grow memory — it
strengthens existing knowledge.

*See: `backend/agent/learning.py` lines 661-691 (preferences), 786-799 (edit patterns),
934-964 (workflows)*

---

### 7. Hierarchical Privacy-Based Scoping

The three-level hierarchy (user → firm → global) naturally partitions memory:

- **User-level:** Only that user's personal patterns (smallest set)
- **Firm-level:** Shared patterns within the firm (medium set, shared load)
- **Global-level:** Anonymized, highly compressed patterns (largest but most filtered)

Each level has its own filtering threshold, and global patterns go through an
**anonymization step** that strips out identifying information, keeping only
aggregate statistical data like task types, success rates, and action sequences.

Safe fields allowed in global patterns:
```python
safe_keys = [
    'task_type', 'action_type', 'pattern_type', 'category',
    'avg_time', 'avg_hours', 'success_rate', 'action_sequence',
    'step_count', 'priority', 'frequency', 'document_type',
    'matter_type', 'practice_area', 'event_type'
]
```

This means global patterns are inherently small — they're stripped down to just
the essential statistical fields.

*See: `backend/agent/learning.py` lines 472-512*

---

## Summary: Why It Works

| Strategy | What it prevents |
|----------|-----------------|
| 3-layer consolidation | Raw data accumulation (100:1 compression) |
| Hard caps | Unbounded collection growth |
| Confidence filtering | Low-quality data polluting memory |
| Database deduplication | Duplicate entries |
| TTL caching | Excessive database queries & memory use |
| Pattern merging | Redundant entries for repeated observations |
| Hierarchical scoping | Any single level growing too large |

The net effect: the agent can learn continuously for months or years without
memory overload. Old, low-value data naturally fades away while proven patterns
strengthen and persist — similar to how human memory works with short-term
recall consolidating into long-term wisdom.
