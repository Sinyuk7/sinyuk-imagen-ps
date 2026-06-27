---
name: docs-consolidator
description: Consolidate an overgrown documentation tree into a small current-state knowledge base. Use when a repository has duplicated docs, stale plans, memory/archive/inbox trees, redundant AGENTS.md files, or unclear canonical documentation and needs durable knowledge merged, obsolete material removed, and references repaired.
---

# Documentation Consolidator

## Purpose

Reduce project-maintained documentation to the smallest set of canonical files that still preserves the knowledge needed to understand, validate, and safely change the project.

This skill is for documentation cleanup, not archival work.

Use the repository root `AGENTS.md` as the controlling operating rule before making edits.
If this skill text conflicts with root `AGENTS.md` or a more specific maintained document, follow the more authoritative repository rule.

## Preserve First

Keep knowledge that still matters in this order:

1. product direction, system boundaries, and external contracts;
2. architecture, state models, dependency direction, and major flows;
3. durable rationale, constraints, compatibility limits, and non-obvious invariants;
4. validation commands, harness design, and repeatable debugging procedures;
5. implementation detail only when it protects a contract or a hard boundary;
6. task logs, execution history, and completed plans only when they contain one of the items above and can be merged into a canonical doc.

Prefer current truth over historical narration.

## Canonical Targets

Favor a small topic-oriented set:

- `README.md`: purpose, install, usage, public entrypoints, and links;
- `AGENTS.md`: hard repository rules, source-of-truth pointers, and local ownership boundaries;
- `docs/ARCHITECTURE.md`: domain model, dependency direction, major flows, and stable constraints;
- `docs/TESTING.md`: authoritative validation commands, harnesses, gates, and limitations;
- `docs/DECISIONS.md`: only decisions that still constrain the project;
- `docs/ACTIVE.md`: at most one active project-level plan, only if one truly exists.

Do not create files just to match this list.

## What To Remove

Actively look for and collapse, with a bias toward deletion over retention when a file adds no distinct long-term role:

- completed plans, sprint notes, and delivery summaries;
- duplicate architecture or workflow docs;
- memory, inbox, archive, history, or completed trees used as manual promotion systems;
- dated task notes and one-off troubleshooting writeups;
- obsolete decisions and abandoned alternatives;
- copied repo rules repeated across multiple `AGENTS.md` files;
- generated logs, build output, test output, and crash output treated as documentation;
- index files that only point to another index.

Keep index-style documents when they have an explicit navigation or ownership role, even if they mostly contain links.
Examples include `CLAUDE.md`, `README.md`, or similar entry files that intentionally route readers to the canonical docs.
Treat these files as keepers when they:

- identify the authoritative topic or scope;
- point directly to canonical documents;
- serve as the documented entrypoint for humans or agents.

Delete them only when they are genuinely redundant and do not provide a distinct entrypoint, ownership boundary, or navigation function.

If a file is retained only for compatibility, say so explicitly in the canonical doc and keep the compatibility reference narrow.
If the compatibility reference is historical noise and not required by an external contract, remove it instead of preserving it by default.

Do not create a new archive directory.

When a maintained document grows beyond roughly 250 lines or starts mixing canonical knowledge with task history, prefer splitting or deleting the historical material instead of expanding the file further.
Keep root entry docs especially small; avoid broad rewrites unless the canonical role itself must change.

## Scope Rules

Work on project-maintained docs and instruction files only.

Usually include:

- Markdown, MDX, and other maintained text docs;
- root documentation;
- `docs/`;
- project `AGENTS.md` files;
- plans, ADRs, notes, design records, and memory directories.

Usually exclude:

- third-party or vendored docs;
- generated API references;
- build, test, log, cache, and temp output;
- binary assets;
- production code.

Do not discard unrelated uncommitted changes.

## Workflow

### 1. Inspect the current state

Use `git status` and `git ls-files` to establish what exists.

Then inspect:

- documentation directories and instruction files;
- links and references between docs;
- status markers, titles, and timestamps when they help identify the authoritative file.

Do not create an inventory report in the repository.

### 2. Choose canonical destinations

For each topic, select one home.

Prefer updating an existing authoritative document over creating a new one.

If multiple docs claim the same responsibility, merge the valid parts into one canonical file and demote or remove the rest.

When two files overlap, choose the one with the stronger current-state role:

- keep the file with the clearer canonical responsibility or ownership boundary;
- keep the file that contains unique durable knowledge, not just duplicated prose;
- keep the documented entrypoint when the other file is only a detail page;
- keep the file that other maintained docs cite as the source of truth;
- keep both only when one is a stable index/router and the other is a distinct content document;
- if neither file has a distinct long-term role, merge useful content into the more current and less contradictory file, then delete the other;
- if the repository does not provide enough evidence to choose safely, mark it `REVIEW` instead of guessing.

If the overlap is a duplicate plus a canonical file, default to removing the duplicate after extracting any durable content.
Do not keep extra files just because they are easier to edit.

### 3. Classify content by section

Classify sections, not just whole files:

- `KEEP`: current and already canonical;
- `MERGE`: durable but belongs elsewhere;
- `REWRITE`: useful but too historical, verbose, or contradictory;
- `DELETE`: duplicate, obsolete, derivable, or low value;
- `REVIEW`: protected or impossible to resolve from repository evidence.

Use `REVIEW` sparingly.

### 4. Rewrite into current-state language

Rewrite retained content so it describes the system now.

Avoid phrasing like:

- “we recently implemented”;
- “this sprint completed”;
- “the previous plan proposed”;
- “the following files were changed”.

Prefer:

- what the system is now;
- why the boundary exists;
- what must remain true;
- how the flow works;
- how it is validated.

### 5. Collapse temporary lifecycle systems

If the repo does not have a strong external reason to keep them, remove lifecycle trees such as:

- `memory/`;
- `memories/`;
- `_inbox/`;
- `archive/`;
- `history/`;
- `completed/`;
- `executed/`;
- `old-plans/`.

Before deleting, inspect the contents, extract durable knowledge, merge it into canonical docs, verify nothing important is lost, then delete the old files and empty directories.

Do not move obsolete docs into a new archive.

### 6. Handle plans and decisions

Keep at most one project-level active plan.

If several active plans exist, determine whether they are really one initiative; merge overlapping scope, or report the conflict if they are genuinely distinct.

For completed plans, keep only durable architecture, decisions, constraints, and validation knowledge. Delete the rest.

Keep a decision only if it still constrains current or future implementation, is not obvious from current code, and would be hard to reconstruct later.

A retained decision should be short and current-state oriented:

```markdown
## Decision title

**Status:** Active

**Context:** Why the decision was required.

**Decision:** The chosen direction.

**Rationale:** Why this remains preferable.

**Consequences:** The important trade-offs or constraints.
```

### 7. Handle local AGENTS files carefully

Keep a module-level `AGENTS.md` only when it adds a real local boundary, runtime restriction, validation command, forbidden dependency direction, or safety constraint that the root file cannot express cleanly.

Remove local files that only repeat global rules or boilerplate.

### 8. Repair references

After moving or deleting docs:

- search the repository for removed paths and filenames, including docs, code, configs, scripts, and comments;
- fix valid links;
- remove obsolete navigation;
- avoid chains of indirection;
- make root entry docs point directly to canonical targets.

Prefer direct links such as `README -> docs/ARCHITECTURE.md`.

### 9. Normalize the final structure

Keep the result small and stable:

- one canonical home per concept;
- minimal directory depth;
- no empty index documents;
- no duplicate current-state declarations;
- no status field that must be synchronized across multiple files;
- no new document without a distinct long-term responsibility.

Prefer no more than two directory levels below `docs/` unless there is a clear operational reason.

## Validation

Before finishing, verify:

1. every removed file was inspected for durable content;
2. every durable fact has a canonical destination;
3. no current architecture or contract was lost;
4. no two remaining docs claim conflicting authority;
5. no completed plan remains active;
6. there is at most one active project-level plan;
7. all references to removed files were repaired;
8. no empty documentation directories remain;
9. generated artifacts are not counted as maintained documentation;
10. `git diff --check` passes;
11. any available doc or link checks pass;
12. `git status` shows only intended changes.

Search for stale terminology, deleted paths, old status values, previous directory names, and hard-coded path references before completion.

## Stop Conditions

Do not guess through high-risk ambiguity.

Leave a file unchanged and report it when:

- two docs define conflicting public or external contracts;
- a file may carry legal, compliance, security, or release obligations;
- repository evidence is insufficient to identify the authoritative design;
- a generated document’s publishing path is unclear;
- deleting a local AGENTS file might remove a genuine runtime or ownership boundary.

Keep unresolved items as small as possible.

## Final Report

Do not create a new cleanup report inside the repository.

Return a concise result with:

- resulting structure;
- important knowledge consolidated;
- removed content grouped by reason;
- retained exceptions;
- verification results;
- unresolved items, if any.

## Acceptance Criteria

The task is complete when:

- the authoritative project knowledge is easy to find directly;
- completed work no longer remains as maintained documentation;
- the documentation tree is materially smaller;
- future updates mostly touch a few canonical files;
- Git history, not an internal archive system, preserves past states.
