# Neurohood development handoff

## Current checkpoint

| Item | Starting state |
| --- | --- |
| Last verified | Documentation review only. Application code, runtime commands, provider spend and human results are unverified. |
| Repository | Record the actual branch, last verified commit and any working changes on first use. |
| Spec location | Use `docs/neurohood-spec.md` in a new checkout. If the pack already has a canonical path, record it here. Keep `CLAUDE.md` at the repo root and this handoff under `docs/`. |
| Working assumptions | One local lighthouse scene, Collaborative mode, original fixtures, zero live generation spend for the first checks. OQ-01, OQ-03, OQ-04 and OQ-09 remain product-owner decisions. |
| First action | Inspect the repository and identify its normal project-creation path, durable store and test runner. In a Git checkout start with `git status --short --branch` and `rg --files`. If greenfield, use a minimal slice of the suggested stack in §2.1 and record the choice. |
| First observable result | A filmmaker enters the lighthouse idea, sees the first interview question, answers it, and can reopen the same project at the next unanswered question after a restart. |

## Suggested work order

Each row has a stopping point. Split a row across sessions if needed. The first four demonstrate the shape of the product locally. M2 and M3 still call for real media and acceptance evidence.

| Order | Behaviour to build | Proof to leave in the repository |
| --- | --- | --- |
| 1. Resume the interview | Use the normal project entry point, a test owner and a scripted Story adapter. Persist the project and turn. | UC-01, UC-02, TC-001, TC-014. Restart the service and reopen the same project. Verify the next question and that the saved answer occurs once. Record the demo and test commands. |
| 2. Lock the story | Let the filmmaker edit and approve the story at Gate 1. Persist which bible version was approved. | UC-03, FR-12, FR-30, AC-06. Show that approval survives restart and that sending it twice advances the project once. A downstream job waits for the decision. |
| 3. Choose a reading | Show the two Mara readings at Gate 2 using labelled fixtures for the look tests, sound sketch and thumbnails. Save the filmmaker’s selection against the reviewed version. | BR-20, §§3.2 and 3.9, AC-44 (choice only). Select each version on separate runs and reload. Show which shot reveals the date first in each. |
| 4. Watch the choice | Assemble approved original panels into a playable 24 fps animatic with temporary captions and temp audio. Render from an edit decision list. Expose the cut in the app. | UC-15, UC-17, AC-36, AC-38, AC-39 (pilot subset), TC-102. Play both readings and inspect the reveal. Change a shot, observe the affected neighbours and spanning cues, and open a timed note on the correct cut version. |
| 5. Recover a billable job | Exercise reservations, retries and recovery with a fake priced provider before enabling live calls. | FR-40, FR-41, FR-42, AC-08, AC-10, TC-060. Race two requests for the remaining budget. Simulate a restart after provider acceptance and before local completion. Record reserved and settled amounts and the number of provider jobs. |
| 6. Run the live pilot | Bring up real adapters incrementally under the agreed cap. Exercise the full Gate 2 pack, the chosen animatic, timed review and an isolated Fresh Viewer. Collect the required human evidence. | M2/M3, AC-35, AC-36, AC-37, AC-44, TC-100, TC-103. Save the cut version, provider usage, viewer input manifest, and separate model and human results. AC-44 requires the Fresh Viewer and at least 3 of 5 first-time humans to identify both the realisation and its cue. |

Use the first live run to revise the estimate for the ten-scene reference project in §8.3. Carry the remaining M0–M5 work in the milestone backlog, including the full crew, exports, real-provider evaluations, accessibility, load, recovery and UAT. One successful lighthouse run supplies pilot evidence.

## Update after each work block

Replace the current checkpoint with a short record of the date, branch and base commit, changed files or uncommitted work, requirement IDs, what ran and what happened. Include the exact next command, its expected result, any blocking owner decision, and whether the evidence used fixtures, live providers or humans. For a partial step, record the failing assertion or last durable job ID. For a live call, record reservation or settlement status so a resumed session can reconcile it before retrying.

To estimate the next block, record active work time and the number of checks completed. Record provider cost only when measured. If the operator observed the plan meter, note any usage warning or reset relevant to resuming.

## Prompts to paste

**First session**

> Read CLAUDE.md and docs/HANDOFF.md. Inspect the repository, then implement the first interview checkpoint with a fixture Story adapter. Show me how to enter the lighthouse idea and resume after restart. Run the matching check and update the handoff with the exact result and next command.

**Next session or next day**

> Read the current handoff and check it against the working tree. Reproduce the last recorded result or failure using its command. Continue the first unfinished check, show the observable result, and update the handoff.
