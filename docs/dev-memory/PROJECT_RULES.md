# Project Rules

## Development Phase Invariant

This project is in a zero-user, zero-history-burden development stage.

This is the highest-priority project rule in this repository. It applies before architecture preferences, implementation convenience, review comments, generated artifact templates, design documents, implementation plans, test descriptions, and code changes.

There are no existing users, no production data, no historical API contracts, no published plugin contract, and no legacy behavior to preserve. All decisions must optimize for the cleanest current-state architecture and simplest correct implementation.

The following concepts are forbidden unless the user explicitly overrides this invariant in the same conversation:

- compatibility layers
- migration paths
- upgrade paths
- version gates
- feature gates for old behavior
- legacy fallbacks
- old-contract support
- deprecated behavior preservation
- phased rollout logic
- backwards/forwards compatibility analysis
- versioned API/contract/spec labels such as `Stable v1`, `Stable v1.1`, `v2 contract`, or similar version declarations
- preserving behavior because it existed in a previous artifact, task, draft, implementation, or review comment
- speculative future-proofing such as `for future support`, `future model selection`, `future compatibility`, or placeholder fields not required by the current design

Before editing or accepting design/spec/task/review text, scan for and eliminate forbidden language including `Stable v`, `v1`, `v1.1`, `legacy`, `compat`, `compatibility`, `migration`, `fallback`, `deprecated`, `rollout`, `upgrade`, `old contract`, `backward`, `forward`, and `future support` when those terms describe product/API/contract behavior rather than third-party dependency versions or external API paths.

Do not classify invariant violations as polish or archive-later work. Any occurrence in active design/spec/task/review text is a blocking defect and must be fixed before implementation proceeds.

Breaking changes are acceptable by default during this stage when they improve correctness, clarity, or architecture.

## Documentation Authority

- Root `AGENTS.md` is the hard-rule entrypoint only.
- Non-hard repo context belongs in `docs/ENGINEERING_CONTEXT.md`.
- This file contains detailed project rules.
- Current architecture loop documents live under `docs/loops/`.
- Module `STATUS.md` files contain current progress when the module still keeps one.
- Unresolved work belongs in the active loop document or a module-local active status document, not in deleted root placeholders.
- Module `SPEC.md` files are authoritative for current module contracts.
- `archive/` files are historical reference. They can inform UI intent, but they do not override current `AGENTS.md`, `SPEC.md`, `STATUS.md`, or active loop documents.
