# Working on Neurohood

Neurohood helps a filmmaker choose how a scene is told. The first pilot follows Mara hearing tomorrow's distress call. The filmmaker chooses between two directorial readings and sees that choice change a timed storyboard. The vendor pack defines v1 scope, milestones and release acceptance. The work order in `docs/HANDOFF.md` is how we develop the pilot.

## Scope decisions (2026-11-22)

- **v1 ends at pre-production:** look book + mood reel + one pilot animatic (OQ-01 answered).
- **Core crew for v1:** Story agent, Director, Reference researcher, DP, Character designer, Production designer, Storyboard artist, Composer, Editor, Producer.
- **v1.1 additions:** Screenwriter, Voice performer, Lighting/VFX, Sound designer, Fresh viewer (Must/Should), Character animator (Could) (OQ-09 answered).
- **Pilot scene:** the lighthouse — Mara hears the first call from tomorrow.

## Spec and pack

- **Source of truth:** [docs/neurohood-spec.md](docs/neurohood-spec.md) (vendor pack with Claude Code implementation comments).
- **Vendor pack (clean):** [docs/vendor-pack-v1-draft.md](docs/vendor-pack-v1-draft.md).
- Keep the full pack out of automatic context imports. Use `rg -n` to find relevant sections by requirement or test ID.

## Start a session

1. Read the current checkpoint in `docs/HANDOFF.md`. Check the actual branch, working tree and most recent commit. Reconcile anything that changed since the checkpoint.
2. Select the first unfinished, unblocked check. Find only the relevant sections in the vendor pack with `rg -n` on its requirement or test IDs.
3. State the one behaviour Bharat will be able to try, where it enters the application, and how you will verify it. Reuse the repository's stack and test commands. If a product choice affects this behaviour, explain the trade-off and ask one focused question. Continue independent work.

## Implement and verify

- Make the smallest end-to-end change that demonstrates the behaviour. Keep creative roles on a shared runtime with role-specific inputs and tools. Let deterministic code own persistence, gate transitions, spend reservations and cut timing.
- Use original local fixtures and recorded responses for the fast loop. Give fixture and live runs visible labels. For an authorised live run, use the configured provider, a capped workload and the project's reservation path. Track provider charges independently from Claude Code plan usage.
- Run the closest relevant test while editing. Exercise the normal API, UI or media playback path before marking the behaviour verified. Record the exact command, observed result and remaining gaps.
- Preserve the filmmaker's choices and creative ownership. Keep owner decisions and provisional assumptions distinguishable in the handoff.

## Work within Claude Max

The five-hour allowance begins with the first message in its window and can be consumed early. Weekly limits also apply across Claude and Claude Code. Bharat can inspect `/usage` or Settings > Usage before a work block and near an expensive step. Use ordinary effort for routine implementation. Reserve higher effort for decisions such as crash recovery around a billable provider call.

## Leave a restart point

Update the handoff after a verified change and before starting a long or live operation. At a usage warning, finish the smallest useful check, save partial work and record the exact next command while capacity remains. Keep the branch or working changes and the handoff together so a fresh session can recover.
