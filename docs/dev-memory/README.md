# Project Engineering Records

This directory stores versioned project engineering records. It is not Hermes / Codex profile memory. Record only project facts, decisions, root causes, and workflows that future collaborators or agents need to share.

## Before Non-Trivial Work

Search project engineering records and current docs first:

```sh
rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md
```

Use search results as historical clues only. Verify conclusions against current code, tests, docs, and git history.

## Drafts

For fixes, investigations, or design decisions with project-shared value, write a short draft first:

```text
docs/dev-memory/_inbox/YYYY-MM-DD-short-topic.md
```

Drafts should include:

- Problem or context
- Root cause or decision
- Fix or outcome
- Validation
- Regression risk
- Relevant files, tests, commits, and keywords

## Promotion

When organizing records, move stable notes to:

- `docs/dev-memory/memories/bug/`
- `docs/dev-memory/memories/architecture/`
- `docs/dev-memory/memories/workflow/`
- `docs/dev-memory/memories/decisions/`

Do not write user preferences, local environment facts, Hermes/Codex profile behavior, or cross-project habits here. Ask before writing those to agent memory. Never store secrets, raw logs, build output, generated artifacts, or provider keys.
