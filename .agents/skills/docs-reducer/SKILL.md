---
name: docs-reducer
description: Reduce project documentation to the fixed whitelist enforced by the repository's own policy checker. Use when docs have grown, dev-memory/loops/inbox trees have accumulated, AGENTS.md files duplicate global rules, or canonical authority is unclear. Defaults to deletion. The policy checker high-authority list is the hard anchor; never keep a permanent doc the checker does not know about.
---

# Documentation Reducer

## Contract

Reduce project-maintained documentation to the smallest fixed whitelist the repository's own policy checker already enforces. No growth. No new permanent files. Default to delete.

The hard anchor is `scripts/policy/docs.mjs` `highAuthorityDocs`. A doc not on that list is not permanent. If one should be permanent, amend the policy list in the same change — never keep a permanent doc the checker does not know about.

This repo's permanent set (do not grow without amending the policy list):

- Repo level: `AGENTS.md` (+ `CLAUDE.md` symlink alias), `README.md`, `docs/ENGINEERING_CONTEXT.md`, `docs/TESTING.md`, `docs/agent/LOOP.md`.
- Local level: one `AGENTS.md` per real ownership boundary — `apps/app/AGENTS.md`, `packages/AGENTS.md`, `packages/application/AGENTS.md`, `packages/core-engine/AGENTS.md`, `packages/providers/AGENTS.md`, `packages/foundation/AGENTS.md`.

`docs/loops/*.md` is ephemeral: only the active loop or empty. Never permanent.
`docs/dev-memory/**` is not a permanent knowledge tree. Durable facts get promoted into canonical docs; the rest is deleted.

## Bias

Delete over keep. Merge over duplicate. Current-state over history. One home per concept. Root entry docs stay especially small.

A file with no distinct long-term role is removed after extracting durable content. Edit convenience and symmetry are not reasons to retain.

## Preserve (in order)

1. external contracts and product direction;
2. architecture, boundaries, dependency direction, major flows;
3. durable rationale, constraints, compatibility limits, non-obvious invariants;
4. validation commands, harness design, reproducible debugging;
5. implementation detail only when it protects a contract or hard boundary.

Current truth over historical narration. Completed plans, execution logs, task process, and one-off details are not durable.

## Remove

- completed plans, sprint notes, delivery summaries;
- duplicate architecture or workflow docs;
- `memory/`, `memories/`, `_inbox/`, `archive/`, `history/`, `completed/`, `executed/`, `old-plans/` trees used as manual promotion systems — promote durable facts to canonical docs, then delete the tree;
- dated task notes and one-off troubleshooting writeups;
- obsolete decisions and abandoned alternatives;
- repo rules repeated across multiple `AGENTS.md`;
- generated logs, build, test, and crash output treated as docs;
- index files that only point to another index.

Keep an entry/index doc (`README.md`, `CLAUDE.md` alias) only when it routes readers to canonical docs and is the documented entrypoint.

## Scope

Project-maintained docs and instruction files: markdown/MDX, root docs, `docs/`, project `AGENTS.md`, plans, ADRs, notes, memory dirs.

Exclude: vendored docs, generated API refs, build/test/log/cache/temp output, binary assets, production code.

Do not touch unrelated uncommitted changes.

## Workflow

### 1. Establish ground truth

`git status`, `git ls-files`. Read the policy checker `highAuthorityDocs` list. That list is the whitelist target.

### 2. Classify by section

Per section, not just file: `KEEP` (current + canonical), `MERGE` (durable, belongs elsewhere), `REWRITE` (useful but stale/verbose/contradictory), `DELETE` (dup/obsolete/derivable), `REVIEW` (protected or insufficient evidence). Use `REVIEW` sparingly.

### 3. Collapse lifecycle trees

`memory/`, `memories/`, `_inbox/`, `archive/`, `history/`, `completed/`, `executed/`, `old-plans/`: inspect, extract durable facts to canonical docs, verify nothing important is lost, delete files and empty dirs. No new archive dir.

### 4. Handle loops

At most one active project-level loop in `docs/loops/`. Completed loops: merge durable outcomes into canonical docs, delete the file. `docs/loops/` holds the active loop or is empty.

### 5. Handle local AGENTS

Keep a module `AGENTS.md` only when it adds a real local boundary, runtime restriction, validation command, or forbidden dependency direction the root cannot express. Remove ones that only repeat global rules. A kept local AGENTS must also be in the policy high-authority list.

### 6. Rewrite to current state

Retained content describes the system now. Avoid "we recently implemented", "this sprint completed", "the previous plan proposed", "the following files were changed". Prefer: what it is, why the boundary exists, what must stay true, how it works, how it is validated.

### 7. Repair references

After move/delete: search the repo for removed paths and filenames across docs, code, configs, scripts, and comments. Fix valid links. Remove obsolete navigation. Root entry docs point directly to canonical targets. No chains of indirection. Scan beyond markdown — hard-coded paths in code and config too.

### 8. Normalize

One canonical home per concept. Minimal directory depth. No empty index docs. No duplicate current-state declarations. No status field synchronized across files. No new permanent doc without amending the policy list. Prefer no more than two levels below `docs/`.

## Stop Conditions

Do not guess through high-risk ambiguity. Leave unchanged and report when:

- two docs define conflicting public or external contracts;
- a file may carry legal, compliance, security, or release obligations;
- repository evidence is insufficient to identify the authoritative design;
- deleting a local `AGENTS.md` might remove a genuine runtime or ownership boundary.

Keep the unresolved set minimal.

## Validation

1. every removed file was inspected for durable content;
2. every durable fact has a canonical destination;
3. no current architecture or contract was lost;
4. no two remaining docs claim conflicting authority;
5. no completed plan remains active; at most one active loop;
6. no permanent doc exists outside the policy high-authority list, or the list was amended in the same change;
7. all references to removed files were repaired, including hard-coded paths in code and config;
8. no empty documentation directories remain;
9. generated artifacts are not counted as maintained documentation;
10. `git diff --check` passes and `pnpm check:policy` passes;
11. `git status` shows only intended changes.

Search for stale terminology, deleted paths, old status values, previous directory names, and hard-coded path references before completion.

## Final Report

Do not create a cleanup report inside the repo. Return concise: resulting structure, knowledge consolidated, removed content grouped by reason, retained exceptions, verification results, unresolved items.

## Acceptance Criteria

Complete when:

- authoritative project knowledge is findable directly;
- completed work no longer remains as maintained documentation;
- the documentation tree is materially smaller;
- the permanent set matches the policy checker exactly;
- future updates mostly touch a few canonical files;
- Git history, not an internal archive system, preserves past states.
