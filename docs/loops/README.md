# Loops

This directory holds the **current active Loop only**. Root `AGENTS.md` is the
single authoritative entrypoint that names the active Loop, if any.

- No active Loop is currently declared.
- Completed Loop records are **not retained** here. When a Loop reaches
  `completed`, its durable outcomes are merged into the authoritative docs
  (`AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, module docs)
  or into stable `docs/dev-memory/` records, and the Loop file is deleted.
- Start a new Loop from [`_template.md`](_template.md).
- Stop a blocked slice with [`_decision-packet.md`](_decision-packet.md).

Loop authorship and validation rules live in
[`docs/agent/LOOP.md`](../agent/LOOP.md).
