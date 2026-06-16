# Repository-Local Engineering Memory

This repository keeps engineering memory inside the repo. It does not use global GBrain.

## Before Non-Trivial Work

Search local memory and current project docs first:

```sh
rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md
```

Use results as historical clues only. Verify against current code, tests, docs, and git history.

## Drafts

After meaningful fixes or decisions, write a short draft under:

```text
docs/dev-memory/_inbox/YYYY-MM-DD-short-topic.md
```

Each draft should include:

- Problem or context
- Root cause or decision
- Fix or outcome
- Validation
- Regression risk
- Relevant files, tests, commits, and keywords

## Promotion

When asked to organize memory, move useful drafts into:

- `docs/dev-memory/memories/bug/`
- `docs/dev-memory/memories/architecture/`
- `docs/dev-memory/memories/workflow/`
- `docs/dev-memory/memories/decisions/`

Do not store secrets, raw logs, build output, generated artifacts, or provider keys here.
