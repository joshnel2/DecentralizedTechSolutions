# Predictive Memory Architecture (PMA)

> A fundamentally new way for the agent to learn and remember.
> Not an improvement to what exists. A replacement for the paradigm.

---

## The Problem With Everything We Have Now

Every learning system in Apex today — cognitive signature, attorney identity, memory file, resonance memory, edit diff learning, learning patterns, decision reinforcer — follows the same paradigm:

```
OBSERVE → EXTRACT FEATURE → STORE → INJECT INTO PROMPT
```

The attorney writes something. We observe it. We extract a feature ("prefers formal language"). We store it. Next time, we inject "this attorney prefers formal language" into the system prompt and hope the model uses it.

This is how a filing cabinet works. It is not how memory works.

The fundamental flaw: **the agent never PREDICTS anything. It never puts itself on the line. It never says "I think the attorney will do X" before finding out what the attorney actually did.** Without prediction, there is no surprise. Without surprise, there is no real learning. The agent accumulates observations but never develops understanding.

A junior attorney who has worked with a partner for 6 months doesn't consult a preference file before drafting a memo. They have an INTERNAL MODEL of the partner — they can predict what the partner will say, what they'll change, what they'll flag. When the partner surprises them, THAT surprise is the strongest learning signal of all.

We need to build that.

---

## The Core Invention: Prediction Error Memory

### How Human Memory Actually Works

Neuroscience has known this for decades: the brain learns through **prediction errors**, not through observation.

Your brain is constantly predicting what will happen next. When reality matches your prediction, almost nothing happens neurologically — the event is "expected" and barely registers. When reality VIOLATES your prediction, a massive dopamine signal fires. This prediction error signal is what rewrites your neural connections. It is the only thing that rewrites your neural connections.

This is why:
- You remember the one time a judge ruled unexpectedly, not the 100 routine rulings
- You remember the partner who hated your brief, not the ones who said "looks good"
- You learn more from one mistake than from ten successes

### Applying This to the Agent

Instead of:
```
Agent produces work → Attorney edits/approves/rejects → We extract what happened → Store it
```

We do:
```
Agent produces work → Agent PREDICTS what attorney will change → Attorney acts → We compute PREDICTION ERROR → Learn from the error
```

The agent doesn't just learn WHAT the attorney wants. It learns WHERE ITS OWN MODEL OF THE ATTORNEY IS WRONG. That's a fundamentally different signal.

---

## Architecture

### 1. The Prediction Engine

Before the agent delivers ANY work product, it makes predictions about what will happen. These predictions are stored, not shown to the user.

```javascript
// After agent creates a document but BEFORE marking task complete:
const predictions = {
  taskId: 'amp-123',
  documentId: 'doc-456',
  predictedAt: Date.now(),

  // Will the attorney approve, edit, or reject?
  outcomeDistribution: {
    approve_as_is: 0.15,     // Agent thinks 15% chance of no changes
    approve_with_edits: 0.60, // 60% chance attorney edits then approves
    reject: 0.25,             // 25% chance of rejection
  },

  // If edited, WHERE will the edits be?
  predictedEdits: [
    {
      location: 'paragraph_2',
      type: 'substitution',
      confidence: 0.7,
      prediction: 'Attorney will want stronger language in the demand section',
      currentText: 'We request that you...',
      expectedRevision: 'You are hereby directed to...',
    },
    {
      location: 'conclusion',
      type: 'addition',
      confidence: 0.5,
      prediction: 'Attorney may add a specific deadline',
    },
  ],

  // What feedback will the attorney give?
  predictedFeedback: [
    { topic: 'tone', prediction: 'too_soft', confidence: 0.4 },
    { topic: 'length', prediction: 'about_right', confidence: 0.6 },
    { topic: 'citations', prediction: 'sufficient', confidence: 0.7 },
  ],
};
```

### 2. The Prediction Error Computer

When the attorney actually acts, we compare reality against the prediction:

```javascript
// Attorney approved with edits. Compute prediction errors.
const errors = computePredictionErrors(predictions, actualOutcome);

// EXAMPLE OUTPUT:
{
  // Outcome prediction error
  outcomePrediction: 'approve_with_edits',
  outcomeActual: 'approve_with_edits',
  outcomeError: 0.0, // Correct!

  // Edit location errors (this is where the gold is)
  editErrors: [
    {
      predicted: { location: 'paragraph_2', type: 'substitution' },
      actual: null, // Attorney did NOT edit paragraph 2
      errorType: 'FALSE_POSITIVE', // Agent expected a change that didn't happen
      surprise: 0.7, // High surprise — agent was confident this would be edited
      learning: 'The demand language "We request that you..." is acceptable to this attorney',
    },
    {
      predicted: null,
      actual: { location: 'paragraph_4', type: 'deletion', deletedText: 'As you are no doubt aware, ...' },
      errorType: 'FALSE_NEGATIVE', // Agent missed a change entirely
      surprise: 1.0, // Maximum surprise — agent had no idea
      learning: 'This attorney does not tolerate condescending preambles',
    },
    {
      predicted: { location: 'conclusion', type: 'addition' },
      actual: { location: 'conclusion', type: 'addition', addedText: 'Respond by February 28, 2026' },
      errorType: 'CORRECT_PREDICTION',
      surprise: 0.0,
      learning: 'Confirmed: this attorney always adds specific deadlines',
    },
  ],

  // Feedback prediction errors
  feedbackErrors: [
    {
      topic: 'tone',
      predicted: 'too_soft',
      actual: 'appropriate', // Attorney didn't complain about tone
      surprise: 0.4,
      learning: 'The formal-but-not-aggressive tone was correct for this context',
    },
  ],
}
```

### 3. Surprise-Weighted Memory

Here's where it gets interesting. The prediction errors are stored, but **weighted by surprise magnitude**. High-surprise events create strong memories. Low-surprise events barely register.

```javascript
// Memory storage with surprise weighting
{
  memory_type: 'prediction_error',
  content: 'This attorney does not tolerate condescending preambles like "As you are no doubt aware"',
  surprise: 1.0,         // Maximum surprise — agent had no idea
  errorType: 'FALSE_NEGATIVE', // Agent missed this entirely
  halfLife: 365,          // High-surprise memories last a YEAR
  currentStrength: 1.0,   // Starts at full strength
  context: {
    workType: 'client_communication',
    matterType: 'contract_dispute',
    documentType: 'demand_letter',
  },
}

// Compare to a low-surprise memory:
{
  memory_type: 'prediction_error',
  content: 'Confirmed: attorney prefers bullet points in review notes',
  surprise: 0.1,          // Agent already knew this
  errorType: 'CORRECT_PREDICTION',
  halfLife: 14,            // Low-surprise confirmations fade fast
  currentStrength: 0.1,
}
```

The half-life formula:
```
halfLife = baseHalfLife * (1 + surprise * multiplier)

Where:
- baseHalfLife = 14 days (routine confirmations)
- multiplier = 25 (so surprise=1.0 → halfLife = 14 * 26 = 364 days)
- surprise = 0.0 to 1.0

This means:
- Routine confirmations: 14-day half-life (fade quickly)
- Moderate surprises: ~6 month half-life
- Maximum surprises: ~1 year half-life
```

### 4. Contrastive Pairs (The Atomic Unit of Preference)

Edit diff learning already captures substitutions. But PMA stores them as CONTRASTIVE PAIRS — the atomic unit of preference:

```javascript
{
  pairType: 'substitution',
  context: 'demand_letter.opening',
  agent_version: 'We write to demand payment of...',
  attorney_version: 'This letter constitutes formal demand for...',
  direction: {
    formality: +0.3,      // Attorney wanted more formal
    directness: +0.2,     // More direct
    legalese: +0.4,       // More legal terminology
  },
  surprise: 0.6,
  reinforcement_count: 1,
}
```

Over time, contrastive pairs accumulate. When the agent drafts a new demand letter, instead of injecting "this attorney prefers formal language" (vague), it retrieves the three most relevant contrastive pairs:

```
When drafting demand letters for this attorney, note these corrections from their past edits:
- They changed "We write to demand" → "This letter constitutes formal demand for"
- They changed "Please respond by" → "You must respond no later than"
- They deleted "As you are no doubt aware" (condescending preamble)
Apply these patterns to your draft.
```

This is "show, don't tell" — the model sees EXACTLY what the attorney changed, not an abstract description of their preferences.

### 5. The Prediction Improves Itself

The agent's predictions get better over time because the prediction engine itself learns from its errors.

After 10 tasks:
```
Outcome prediction accuracy: 45%  (basically guessing)
Edit location accuracy: 20%       (barely better than random)
Feedback prediction accuracy: 30%
```

After 50 tasks:
```
Outcome prediction accuracy: 72%
Edit location accuracy: 55%
Feedback prediction accuracy: 65%
```

After 200 tasks:
```
Outcome prediction accuracy: 88%
Edit location accuracy: 78%
Feedback prediction accuracy: 82%
```

When prediction accuracy is HIGH, the agent truly UNDERSTANDS the attorney. It can anticipate objections, pre-empt edits, and produce work that needs minimal changes. The prediction accuracy itself becomes the metric for "how well does the agent know this attorney?"

---

## What Makes This Different From Everything Else

| Current System | What It Does | The Problem |
|---------------|-------------|-------------|
| Cognitive Signature | Stores preferences as 16 numbers | Numbers are averaged across all contexts. Doesn't know attorney wants formality=0.9 in court filings but formality=0.5 in internal memos. |
| Attorney Identity | Stores correction principles as text | Principles are abstract: "prefers concise writing." Doesn't tell the model WHAT concise looks like for THIS attorney. |
| Edit Diff Learning | Captures substitutions | Good signals but no prediction — just catalogues what happened. No "surprise" weighting. |
| Memory File | Key-value preferences | Static list. Doesn't know which preferences matter more. Treats "prefers bullet points" the same as "never use condescending preambles." |
| Resonance Memory | Graph of connections | Connects existing memories but doesn't CREATE new understanding. A graph over a filing cabinet is still a filing cabinet. |

| PMA | What It Does | Why It's Different |
|-----|-------------|-------------------|
| Prediction Engine | Agent puts itself on the line BEFORE seeing the outcome | Creates the CONDITIONS for learning, not just the storage |
| Prediction Error | Computes WHERE the agent's model was wrong | Learns from GAPS in understanding, not just observations |
| Surprise Weighting | High-surprise errors create strong, long-lasting memories | Mirrors how human memory actually works — unexpected events stick |
| Contrastive Pairs | Stores (agent_version, attorney_version) pairs | "Show don't tell" — model sees exact examples, not abstract descriptions |
| Self-Improving Prediction | Prediction accuracy improves over time | The metric IS the measurement of understanding |

---

## How It Integrates With the Existing System

PMA doesn't replace the existing systems. It wraps around them and gives them a REASON to exist.

```
BEFORE (current architecture):
┌────────────────────────────────────────────┐
│  15 independent learning systems           │
│  each storing features independently       │
│  assembled into prompt at task start       │
│  no way to know what matters more          │
└────────────────────────────────────────────┘

AFTER (with PMA):
┌────────────────────────────────────────────┐
│  Prediction Engine                         │
│  ├── Uses existing systems to MAKE         │
│  │   predictions about what attorney       │
│  │   will do                               │
│  │                                         │
│  ├── Prediction Error Computer             │
│  │   computes WHERE the model was wrong    │
│  │                                         │
│  ├── Surprise-Weighted Storage             │
│  │   high-surprise errors → strong memory  │
│  │   confirmations → fading memory         │
│  │                                         │
│  ├── Contrastive Pairs                     │
│  │   the ACTUAL corrections, not           │
│  │   descriptions of corrections           │
│  │                                         │
│  └── At prompt time: inject only the       │
│      highest-surprise, most-relevant       │
│      contrastive pairs                     │
└────────────────────────────────────────────┘
```

The existing cognitive signature, attorney identity, etc. become INPUTS to the prediction engine. The prediction errors become the signal that UPDATES those systems. The contrastive pairs become the primary injection into prompts, replacing abstract preference descriptions.

---

## The Metric That Matters

Today you have no way to quantify "how well does the agent know this attorney?" You have counts (50 memory entries, 16 cognitive dimensions, 30 learning patterns) but no accuracy metric.

With PMA, you have one number: **prediction accuracy**.

```
"The agent correctly predicts what Attorney Johnson will change
in 78% of cases, up from 45% when she started using the platform."
```

That's a number you can show to a managing partner. That's a number that goes up over time and proves value. That's a number that makes switching to a competitor painful because they start at 45% again.

THAT is the moat.

---

## Implementation: What to Build

### Phase 1: Prediction Storage (1-2 days)

Add a `task_predictions` table:
```sql
CREATE TABLE task_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  prediction_type VARCHAR(50) NOT NULL, -- 'outcome', 'edit_location', 'feedback'
  prediction JSONB NOT NULL,
  actual_outcome JSONB,
  surprise_score DECIMAL(3,2),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Before `task_complete`, call a lightweight prediction function that uses the existing cognitive signature + attorney identity to predict the outcome. Store it.

### Phase 2: Prediction Error Computation (2-3 days)

When the attorney acts on a deliverable (approve/reject in review queue, edit a document), compute prediction errors against stored predictions. Store the errors with surprise scores.

Wire into the existing review queue approval/rejection flow and the edit diff learning document change detection.

### Phase 3: Contrastive Pair Storage + Retrieval (2-3 days)

Add a `contrastive_pairs` table. Each pair has context (work_type, document_type, section), the agent's version, the attorney's version, directional signals, and a surprise score.

At prompt time, retrieve the 3-5 most relevant contrastive pairs (matched by work type + document type + section) and inject them as concrete examples.

### Phase 4: Surprise-Weighted Prompt Injection (1-2 days)

Replace the current unified learning context builder with surprise-weighted retrieval. Instead of "top 15 entries by confidence," use "top entries by (surprise * recency * relevance)."

High-surprise memories dominate the prompt. Low-surprise confirmations barely appear. The agent focuses on the things it got WRONG, not the things it already knows.

### Phase 5: Prediction Accuracy Dashboard (1 day)

Surface the prediction accuracy metric in the UI. Per attorney, per work type, over time. This is the number that proves the system is learning.

---

## Why This Is a Real Innovation

Nobody in legal AI — Clio, Harvey, CoCounsel, EvenUp, none of them — has prediction error learning. They all use the same paradigm: observe → store → inject.

PMA is different because:

1. **It's the only system that gets BETTER at learning, not just better at storing.** The prediction engine improves its own accuracy, which means the quality of future learning signals improves too. It's a compounding effect.

2. **It prioritizes the right memories.** Current systems treat all observations equally. PMA knows that the one time the attorney deleted your entire introduction is more important than 50 routine approvals.

3. **It uses contrastive pairs instead of abstract descriptions.** Models are dramatically better at following concrete examples than abstract instructions. "This attorney prefers formal language" is vague. "This attorney changed 'We write to demand' to 'This letter constitutes formal demand for'" is precise.

4. **It provides a quantifiable metric for learning.** Prediction accuracy is a single number that proves value, compounds over time, and creates switching costs. No competitor can import your prediction accuracy.
