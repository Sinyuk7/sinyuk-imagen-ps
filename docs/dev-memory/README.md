# Project Engineering Records

This directory stores versioned, reusable project engineering knowledge. It is
not Hermes / Codex profile memory, and it is not a project history archive.

## What belongs here

Only **stable, reusable engineering knowledge that cannot live more naturally
in an authoritative doc** (`AGENTS.md`, `docs/ENGINEERING_CONTEXT.md`,
`docs/TESTING.md`, or a module doc). Each record should state:

- the current fact or stable constraint;
- why future development needs to know it;
- how to re-verify it through code, tests, harness, or a command.

## What does not belong here

- completed plans, execution logs, task process, or "what a task did";
- full investigation transcripts, raw logs, crash reports, or chat context;
- one-off implementation details;
- content already covered by current code, tests, or authoritative docs — merge
  it there instead of duplicating it here;
- user preferences, local environment facts, Hermes/Codex profile behavior, or
  cross-project habits (ask before writing those to agent memory).

Never store secrets, raw logs, build output, generated artifacts, or provider
keys.

## Layout

```text
memories/
  architecture/   stable architecture facts and reference material
  decisions/      stable design decisions and their rationale
  bug/            stable bug/pitfall records with reproducible verification
  workflow/       stable reusable workflows (e.g. manual host debugging)
_inbox/           short drafts pending promotion or deletion
```

## Before non-trivial work

Search project engineering records and current docs first:

```sh
rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md
```

Use search results as historical clues only. Verify conclusions against current
code, tests, docs, and git history.

## Drafts

For a new fix, investigation, or design decision with project-shared value,
write a short draft at `docs/dev-memory/_inbox/YYYY-MM-DD-short-topic.md`.
Promote stable drafts into the matching `memories/` subdirectory, or delete
them if they do not produce reusable knowledge.
