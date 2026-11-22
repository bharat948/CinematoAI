# Neurohood development handoff

## Current checkpoint

| Item | State |
| --- | --- |
| Date | 2026-11-22 |
| Branch | `master` (uncommitted — scaffold complete) |
| Last verified | **WO#5 — Recover a billable job (budget reservations, retries, recovery).** 29 tests pass. Fake priced provider (`FakeProvider`) with configurable cost and failure count. `ProviderChain` executes with retry (3× per provider) + fallback to next provider, then escalates. `submitJob` atomically reserves worst-case cost against budget (including parallel held reservations); if insufficient, job is `paused_budget` and project stage becomes `paused_budget`. `runJob` calls the chain, records actual spend, releases reservation. `resumeJobs` resumes `reserved`/`running` jobs after restart. Budget can be raised to un-pause. **Verified:** TC-060 (budget USD 2, 4 jobs complete, 5th paused, spend = $2.00), AC-10 (spend never exceeds $5 ceiling), AC-09 (primary fails → fallback succeeds, asset records fallback provider), AC-08 (completed jobs survive restart; reserved job resumes after restart with no duplicate charges), race (two parallel requests for $0.50 budget — one wins, one pauses). No live provider spend (fixture label). |
| Spec location | `neurohood-spec.md` (root). Vendor pack: `Neurohood vendor documentation pack (v1.0 draft).md` (root). |
| Changed files | `server/src/db.ts` (added jobs, budget_reservations tables; budget_usd column on projects), `server/src/providers.ts` (new — Provider interface, FakeProvider, ProviderChain), `server/src/jobs.ts` (new — submitJob, runJob, resumeJobs, getBudgetSummary, chain registry), `server/src/routes/jobs.ts` (new — POST/GET /jobs, GET/POST /budget), `server/src/routes/projects.ts` (budgetUsd in creation + responses), `server/src/index.ts` (jobs route wired), `server/src/api.test.ts` (29 tests) |
| Test command | `cd server && npx vitest run` (29 tests pass) |
| Next action | Implement WO#6 — Run the live pilot: real adapters under agreed cap, full Gate 2 pack, chosen animatic, timed review. |

## Decisions log

| Date | Decision | Traces to | Evidence |
| --- | --- | --- | --- |
| 2026-11-22 | v1 scope is pre-production (look book + mood reel + pilot animatic), not finished short | OQ-01 | Owner decision |
| 2026-11-22 | Core v1 crew: Story, Director, Ref researcher, DP, Character designer, Production designer, Storyboard artist, Composer, Editor, Producer | OQ-09 | Owner decision |
| 2026-11-22 | v1.1 additions: Screenwriter, Voice performer, Lighting/VFX, Sound designer, Fresh viewer (Must/Should); Character animator (Could) | OQ-09 | Owner decision |

## Remaining open questions

| OQ | Question | Status |
| --- | --- | --- |
| OQ-01 | v1 scope | **Answered:** pre-production |
| OQ-02 | Primary user persona | Open — assumed: independent filmmakers pitching |
| OQ-03 | Default autonomy mode | Open — assumed: Collaborative for pilot |
| OQ-04 | Hard cost ceiling per project | Open — USD 25 placeholder until M0 pricing |
| OQ-05 | Hosted models only, self-hosted, or mix? | Open — assumed: hosted APIs for v1 |
| OQ-06 | Main workspace: chat, visual canvas, or both? | Open — assumed: chat-first for pilot, boards later |
| OQ-07 | Preferred cloud | Open — not needed for local pilot |
| OQ-08 | Engagement model | N/A (self-built) |
| OQ-09 | Added roles in v1 or v1.1? | **Answered:** v1.1 |

## Working assumptions

- Collaborative mode is the default (OQ-03 provisional).
- One local lighthouse scene for all pilot work.
- Original fixtures and zero live generation spend for the first four checks.
- Stack will follow the suggested direction in vendor pack section 2.1 (TypeScript, PostgreSQL, React) but confirmed when scaffolding starts.

## Work order

Each row is a stopping point. Split across sessions if needed. The first four demonstrate the shape of the product locally.

| # | Behaviour | Proof to leave in the repo | Key requirements |
| --- | --- | --- | --- |
| 1 | **Resume the interview** — Enter the lighthouse idea, see the first interview question, answer it, reopen the same project at the next unanswered question after restart | UC-01, UC-02, TC-001, TC-014. Restart service and reopen. Verify next question and saved answer occurs once. Record demo and test commands. | BR-01, BR-02, FR-04, AG-STY |
| 2 | **Lock the story** — Edit and approve the story at Gate 1. Persist the approved bible version. | UC-03, FR-12, FR-30, AC-06. Approval survives restart; sending it twice advances the project once. A downstream job waits for the decision. | BR-06, FR-10, FR-11, FR-12, FR-30 |
| 3 | **Choose a reading** — Show two Mara readings at Gate 2 using labelled fixtures for look tests, sound sketch and thumbnails. Save the filmmaker's selection. | BR-20, sections 3.2 and 3.9, AC-44 (choice only). Select each version on separate runs and reload. Show which shot reveals the date first in each. | BR-20, AG-DIR-12, FR-30 |
| 4 | **Watch the choice** — Assemble approved panels into a playable 24fps animatic with temp captions and temp audio. Render from an EDL. Expose the cut in the app. | UC-15, UC-17, AC-36, AC-38, AC-39 (pilot subset), TC-102. Play both readings. Change a shot, observe flagged neighbours and spanning cues, open a timed note on the correct cut version. | BR-16, BR-19, AG-DIR-11 to 15 |
| 5 | **Recover a billable job** — Exercise reservations, retries and recovery with a fake priced provider before enabling live calls. | FR-40, FR-41, FR-42, AC-08, AC-10, TC-060. Race two requests for remaining budget. Simulate restart after provider acceptance and before local completion. | BR-10, FR-40, FR-41, FR-42 |
| 6 | **Run the live pilot** — Real adapters under agreed cap. Full Gate 2 pack, chosen animatic, timed review. Collect human evidence. | M2/M3, AC-35, AC-36, AC-37, AC-44, TC-100, TC-103. Save cut version, provider usage, viewer manifest, separate model and human results. | Full pilot acceptance |

## Update protocol

After each work block, replace the checkpoint with: date, branch, base commit, changed files, requirement IDs, what ran and what happened, the exact next command, its expected result, any blocking owner decision, and whether evidence used fixtures, live providers or humans.
