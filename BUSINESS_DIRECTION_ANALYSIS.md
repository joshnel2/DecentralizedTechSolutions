# Business Direction Analysis — February 2026

> Personal context: 22 years old, working at a law firm as the AI person,
> $60K net worth, saving $4K/month. Evaluating two paths forward.

---

## Option A: Keep Building Apex (AI Legal Practice Management)

### What You've Actually Built

This isn't a weekend hack. Looking at the codebase:

- Full React/TypeScript frontend with matters, clients, billing, calendar, documents, time tracking
- Backend with 40+ AI-callable tools wired to real legal workflows
- Autonomous agent infrastructure (amplifier service, tool bridge, review queue)
- Per-firm and per-attorney learning system (memory extraction, preference learning)
- Azure OpenAI integration with multi-model support
- Document analysis pipeline, retrieval architecture, matter permissions
- A thoughtful AI strategy document that correctly identifies where the moat is

This is 6-12 months of serious engineering work. It's a real product.

### Why This Could Work

1. **You have unfair domain access.** You literally sit inside a law firm every day. You see how lawyers actually work, what they waste time on, and what they'd pay to automate. Most legal tech founders are engineers guessing at lawyer pain points. You're not guessing.

2. **Your moat thesis is correct.** The `AI_FUTURE_STRATEGY.md` nails it: don't compete on model intelligence, compete on legal infrastructure that makes each model generation more valuable. The learning flywheel (attorney feedback → better agent → more trust → harder tasks → more feedback) is a real network effect that compounds.

3. **AI tailwinds are real.** Every model improvement makes your 40+ tools more effective without you writing code. You're building on top of an exponentially improving substrate. The value of your platform goes UP as AI gets better, not down.

4. **The market is massive.** US legal services is a ~$350B/year market. Clio has 150K firms and is valued at $3B+. Even capturing a tiny sliver of this market is a large business.

5. **The timing is right.** Autonomous AI agents for professional services are going from "interesting demo" to "production-ready" right now in 2026. You're early but not too early.

### Why You're Not Getting Traction (Honestly)

The cold feet you're feeling probably comes from one of these:

1. **You're an engineer, not a salesperson (yet).** Building the product is the easy part. Selling to law firms — which are conservative, risk-averse, relationship-driven organizations — is genuinely hard. A 22-year-old showing up to a managing partner and saying "replace Clio with my software" is a tough sell regardless of how good the product is.

2. **Enterprise sales cycles are long.** Law firms don't impulse-buy practice management software. Evaluation → pilot → migration → training can take 6-12 months. If you've been at this for a few months and nobody's paying yet, that's actually normal for this market.

3. **You might be building features instead of selling.** This repo has *a lot* of architecture documents and features. That's great engineering, but the question is: have you talked to 50 potential customers? Have you done demos? Have you gotten rejection with specific reasons? If not, the problem isn't the product — it's distribution.

4. **Solo founder energy is finite.** You're working a full-time job AND building this. That's brutal. The product suffers, the sales suffer, or you suffer. Usually all three.

### What Would Need to Happen for Apex to Succeed

- **Find 1-3 pilot firms** (your own firm? friends of colleagues?) who will use it for free for 3 months in exchange for feedback
- **Narrow the wedge.** Don't sell "full practice management" day one. Sell one killer feature — maybe the AI assistant that actually does legal research and drafts documents. Get people hooked on that, then expand.
- **Get paying customers before adding features.** The codebase is already feature-rich. The bottleneck is distribution, not product.
- **Consider going full-time.** With $60K saved and $4K/month burn rate (assuming you stop saving and live on savings), you have ~15 months of runway. That's enough to prove or disprove this.

---

## Option B: Data Collection for AI Companies (Phone-on-Forehead Video)

### The Idea

Pay people to strap their phone to their forehead, record their day, and sell the ego-centric video data to frontier AI companies training multimodal models.

### Why This Is Probably a Bad Idea

**1. The legal liability is catastrophic.**

You'd be recording every person the wearer encounters — in their homes, workplaces, stores, public spaces — without consent. Wiretapping and recording laws vary wildly by jurisdiction:

- In two-party consent states (California, Illinois, Florida, etc.), recording someone without their knowledge is a *criminal offense*
- GDPR in Europe would make this effectively illegal
- Even in one-party consent jurisdictions, continuous recording in private spaces creates enormous liability
- You'd be one lawsuit away from bankruptcy

As someone who works at a law firm, you know this better than most.

**2. The data quality would be terrible.**

- Phone cameras strapped to foreheads produce shaky, poorly framed video
- Hair, sweat, hats interfere with the lens
- People's "normal days" are mostly boring — sitting at a desk, watching TV, commuting
- The valuable data (complex physical tasks, rare scenarios) is rare by definition
- Meta already did this properly with their Ego4D dataset using purpose-built cameras with fish-eye lenses, and it cost them enormously

**3. AI companies don't want random daily life footage.**

Frontier AI companies (OpenAI, Anthropic, Google, Meta) need *specific* data:
- Curated instruction-following demonstrations
- Domain-specific expert workflows
- Carefully labeled and annotated datasets
- Data that fills specific gaps in their training distribution

Random forehead-cam footage of someone's Tuesday is low-value commodity data. The companies that succeed in data collection (Scale AI — $14B valuation, Surge AI, Appen) do so by providing *structured, labeled, task-specific* data, not raw footage dumps.

**4. You'd be competing with well-funded incumbents.**

- Scale AI: $1B+ raised, valued at $14B
- Appen: Public company, decades of experience
- Prolific: Academic-grade participant recruitment
- Mechanical Turk: Amazon's data collection marketplace

These companies have infrastructure, relationships with AI labs, and legal frameworks already built. You'd be entering their market with a worse product (random video vs. structured data) and no relationships.

**5. The unit economics don't work.**

How much do you pay someone to record their day? $50? $100? Now multiply by the number of hours of video you need (thousands to millions), add storage costs (video is expensive), add the legal/compliance infrastructure, add the sales team to sell to AI labs. The margins are razor-thin even for Scale AI, and they have massive scale advantages.

---

## My Honest Recommendation

**Keep building Apex, but change your approach.**

Here's why:

1. **You've already built something real.** The sunk cost fallacy is real, but this isn't sunk cost — the product is genuinely good and in a genuinely large market. Walking away from 6-12 months of engineering to start a legally questionable data collection startup would be a mistake.

2. **Your competitive advantages are in legal, not data.** You work at a law firm. You understand lawyers. You've built tools that solve real legal workflow problems. You have zero competitive advantage in data collection for AI labs.

3. **The "not gaining traction" problem is solvable.** It's almost certainly a distribution/sales problem, not a product problem. The fix is: talk to more potential customers, narrow your initial offering, and consider whether you're willing to go full-time.

4. **The data collection idea has fatal flaws** (legal liability, data quality, competition, unit economics). It's the kind of idea that sounds interesting in the shower but falls apart on examination.

### The Real Question You're Asking

I think the real question isn't "which idea is better?" — it's "am I willing to do the hard, uncomfortable work of selling Apex to law firms?" Building code is comfortable. Cold-calling managing partners is not. If the answer is "I don't want to sell to lawyers," then the answer might not be a different product — it might be finding a co-founder who loves sales, or joining an AI legal tech startup that already has distribution.

### Tactical Next Steps

1. **This month:** Demo Apex to 10 law firms (start with your own, then use your firm's network). Track every objection.
2. **This month:** Pick the ONE feature that gets the strongest reaction and make that your wedge.
3. **Next 3 months:** Get 2-3 firms using it for free. Prove it saves time.
4. **Month 4:** Start charging. Even $500/month per firm proves the model.
5. **Month 6:** If you have 3+ paying customers and can see the path to 30, consider going full-time. If not, you have a profitable side project and valuable experience.

### The Financial Math

Your financial position is actually quite strong for 22:
- $60K saved + $4K/month savings = $108K in one year if you keep your job
- If you go full-time with $60K saved and ~$3K/month expenses, you have 20 months of runway
- You do NOT need to go full-time yet. Get paying customers first, then make the leap.

---

## Bottom Line

Apex is a better bet by a wide margin. The data collection idea has serious legal, practical, and competitive problems. Your lack of traction with Apex is likely a sales/distribution problem, not a product problem. The product is good. The market is real. The AI tailwinds are strong. The question is whether you're willing to do the uncomfortable work of selling it.

You're 22 with $60K saved and a real product in a massive market. That's a better position than 99% of first-time founders. Don't let the discomfort of "it's not growing fast enough" push you into a worse idea. Push through the discomfort, talk to customers, and give Apex a real shot at distribution before you walk away.
