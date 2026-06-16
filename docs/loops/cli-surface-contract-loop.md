# CLI Surface Contract Loop

- Status: design only
- Scope owner: `apps/cli`
- Shared context: `docs/ENGINEERING_CONTEXT.md`
- Trigger: review of the pasted PM scoring document for `@imagen-ps/cli`
- Constraint: this document is an execution plan. It does not authorize implementation in this turn.

## Current Verdict

The scoring document is directionally useful but over-expands the current product scope.

Correct observations:

- The README currently leads with profile JSON and `provider-generate` rather than a task-first path.
- `job get` and `job retry` are easy to misread as durable job operations.
- Mock-first CLI usage is a real strength and should be presented as zero-cost contract mode.
- `env:` secret references, `@file` input, JSON stdout/stderr, and `--out` artifacts are the right automation primitives.
- Secrets and output contracts need clearer documentation.

Incorrect or premature observations:

- A persistent job store is not a CLI-only fix. `apps/app` history is also session-local, and durable jobs belong in `packages/application` / `packages/core-engine` after a shared design.
- `init --mock`, top-level `generate/edit`, `doctor`, `schema`, `batch`, asset management, cost guardrails, and telemetry are not all P0 for this repo stage.
- The CLI must not become a parallel product runtime. It is the Node surface over shared application/session commands.
- Product comparisons to Replicate CLI, Comfy CLI, Stripe CLI, GitHub CLI, AWS CLI, and Claude Code are useful as references, but they do not override local module boundaries.
- The current project has no users and no historical contract burden. Do not preserve old behavior just because it exists; also do not add bridge layers for older behavior or speculative product surfaces.

## North Star

`@imagen-ps/cli` should be a repo-local Node automation surface for provider profile setup, provider contract validation, mock/live smoke testing, and artifact-producing generation/editing flows.

It should stay aligned with the Photoshop / UXP app:

- `apps/cli` owns commander parsing, stdout/stderr JSON, Node filesystem adapters, and `--out` artifact writing.
- `packages/application` owns command facade, session controller, request builders, profile/model coordination, and runtime assembly.
- `packages/core-engine` owns job facts, lifecycle, store, events, runner, and dispatch boundary.
- `packages/providers` owns provider validation, transport, normalization, and error mapping.
- `apps/app` owns React UI, UXP shell, host bridge, and Photoshop / UXP IO.

## Non-Goals

- No Photoshop, UXP, React, or UI imports in `apps/cli`.
- No CLI-private durable job model that diverges from `apps/app` history or application/session semantics.
- No telemetry, account login, browser auth, remote asset registry, batch scheduler, cost accounting, or provider marketplace.
- No generic image CLI positioning.
- No broad command churn unless the slice explicitly changes parser and contract tests.

## Evidence

- `docs/ENGINEERING_CONTEXT.md` defines dependency direction as `surface apps -> application/session -> core-engine + providers`.
- `apps/cli/AGENTS.md` says the CLI is the Node CLI surface only and must preserve parser, stdout/stderr, and `--out` artifact contracts unless a loop slice allows changes.
- `apps/app/SPEC.md` and `apps/app/STATUS.md` define a shared `AppServices = { commands, host }` seam over `@imagen-ps/application`.
- `docs/TESTING.md` records CLI contract coverage for parser errors, provider/profile commands, `job submit --out`, and process-local `job get/retry`.
- `packages/application/src/session/types.ts` exposes session-local `getSnapshot()`, `submitJob()`, and `retryJob()`.
- `packages/core-engine/src/store.ts` currently implements an in-memory `JobStore`.

## Classification Of PM Suggestions

| Suggestion | Decision | Reason |
|---|---|---|
| Reposition as provider abstraction validator plus automation surface | Accept | Matches repo boundaries and mock/live smoke usage. |
| Rewrite README to surface mock-first path | Accept | Documentation-only and reduces wrong expectations. |
| Clarify repo-local/internal status | Accept | Current README already hints this but should be sharper. |
| Clarify secret storage and `env:` references | Accept | Needed for safe CLI usage and UXP contrast. |
| Clarify JSON stdout/stderr schema | Accept with narrow scope | Existing contract is `{ error: string }`; do not invent large schema until parser tests change. |
| Add durable `~/.imagen-ps/jobs` | Reject for CLI-only loop | Durable jobs are shared application/core-engine design, not CLI adapter storage. |
| Hide or remove `job get/retry` | Consider in a parser slice | Could reduce UX risk, but it changes parser contract and tests. |
| Rename `job get/retry` to session commands | Reject for now | Exposes implementation limits instead of improving shared model. |
| Add top-level `generate/edit` aliases | Consider after docs | Useful if implemented as thin aliases over `job submit`, but parser and README must change together. |
| Add `init --mock` | Consider after docs | Useful convenience, but lower priority than correcting existing contract docs. |
| Add `doctor` | Defer | Valuable only after deciding exact checks and failure schema. |
| Add `provider schema` | Defer | Must come from provider/application descriptors, not CLI-local guesses. |
| Add batch, asset upload, cost guardrails | Reject for this loop | Product expansion beyond current stage. |

## Execution Plan

### Before Phase 1

Phase 0 must resolve the current document authority gap before any Phase 1 documentation edit starts. The current checkout may not contain `docs/loops/application-session-refactor-loop.md`, while root/package `AGENTS.md` still reference it.

The human decision must choose one of these outcomes:

- Restore the missing application/session loop document.
- Update the authority reference to a current document.
- Treat this CLI loop as the approved follow-up after confirming the application/session refactor is complete.

Do not execute Phase 1 until that decision is recorded in the task notes or a follow-up doc update.

### Phase 0 - Baseline Audit

Goal:

- Confirm the current CLI contract and the app/application/session boundary before changing any command or README text.

Allowed scope:

- Read-only inspection under `apps/cli`, `apps/app`, `packages/application`, `packages/core-engine`, `packages/providers`, `docs/ENGINEERING_CONTEXT.md`, and `docs/TESTING.md`.
- Run local build/test commands.

Forbidden scope:

- No source edits.
- No command renames.
- No new public CLI commands.
- No storage schema changes.

Validation commands:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
rg -n "from '@imagen-ps/(core-engine|providers)'|photoshop|uxp|react" apps/cli/src apps/cli/tests
```

Success criteria:

- Current CLI tests pass.
- The boundary `rg` command returns no matches.
- The audit records whether `docs/loops/application-session-refactor-loop.md` exists in the current checkout.

Stop conditions:

- Build or default tests fail.
- The CLI imports UI, UXP, Photoshop, provider transport, or runtime internals.
- The active loop document referenced by `AGENTS.md` is missing and cannot be reconciled with current docs.

Rollback:

- No rollback needed; this phase is read-only.

Human decision point:

- If the active application/session loop file is still missing, decide whether to restore it, replace the reference, or treat this CLI loop as the active follow-up.

### Phase 1 - Documentation Truth Pass

Goal:

- Make README and testing docs tell the truth about the current CLI without adding new behavior.

Allowed scope:

- `apps/cli/README.md`
- `docs/TESTING.md` only if test command descriptions are stale.
- This loop document if implementation discoveries require plan correction.

Forbidden scope:

- No TypeScript source edits.
- No parser changes.
- No new commands.
- No persistent job storage.
- No claims about real Photoshop / UXP behavior from CLI docs.

Required content:

- Define the CLI as a repo-local Node automation and provider contract surface.
- Put mock-first quickstart before real provider setup.
- Document inline JSON and `@file` JSON input behavior for commands that accept structured input.
- Document `job get/retry` as process-local session commands, not durable job lookup.
- Document `provider-secrets.json` as CLI file-backed secret storage, and recommend `env:` references for real keys.
- State that UXP uses injected secure storage and does not reuse CLI file storage.
- Keep current stdout/stderr contract exactly aligned with implementation: success JSON to stdout, `{ "error": "<message>" }` to stderr.
- Document `--out` as `<out>/<jobId>/image.*` plus sidecar metadata.

Validation commands:

```bash
pnpm --filter @imagen-ps/cli test
node - <<'JS'
const fs = require('node:fs');
const rules = fs.readFileSync('docs/dev-memory/PROJECT_RULES.md', 'utf8');
const source = rules.split('\n').find((line) => line.includes('Before editing') && line.includes('including'));
const terms = [...source.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const files = [
  'apps/cli/README.md',
  'docs/TESTING.md',
  'docs/loops/cli-surface-contract-loop.md',
];
let failed = false;
const externalApiPath = '/api/' + 'v' + '1';
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (line.includes(externalApiPath)) {
      return;
    }
    for (const term of terms) {
      if (!line.includes(term)) {
        continue;
      }
      console.error(`${file}:${index + 1}: contains blocked project-stage term: ${term}`);
      failed = true;
    }
  });
}
process.exit(failed ? 1 : 0);
JS
```

Success criteria:

- README no longer implies durable `job get/retry`.
- README preserves existing runnable commands.
- README keeps existing inline JSON and `@file` examples accurate.
- No forbidden project-stage language is introduced.
- CLI tests still pass.

Stop conditions:

- README examples require commands that do not exist.
- README claims UXP or Photoshop behavior owned by `apps/app`.
- Documentation introduces a new contract label or product promise without implementation.

Rollback:

- Revert only the documentation files changed in this phase.

Human decision point:

- Decide whether documentation-only correction is enough before changing parser behavior.

### Phase 2 - Job Semantics Decision Slice

Goal:

- Decide whether to keep, remove, or change the CLI exposure of `job get/retry` in a way that remains aligned with shared application/session semantics.

Allowed scope:

- `apps/cli/src/commands/job/*`
- `apps/cli/tests/contract/job.contract.test.ts`
- `apps/cli/README.md`
- `docs/TESTING.md`
- Application/core design notes only if the decision requires shared durable jobs.

Forbidden scope:

- No CLI-only durable job persistence.
- No direct access to `@imagen-ps/core-engine` from `apps/cli`.
- No change to `apps/app` history behavior in this slice.
- No async queue, cancellation, logs, or wait semantics.

Options:

- Option A: Keep `job get/retry`, but make descriptions and error text explicitly process-local.
- Option B: Remove `job get/retry` from CLI parser and tests until shared durable job design exists.
- Option C: Design shared durable jobs in `packages/application` / `packages/core-engine` first, then expose CLI and app history together in a later loop.

Validation commands:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm --filter @imagen-ps/application test
rg -n "getCliSession|createImagenSession|retryJob|getJob" apps/cli/src packages/application/src apps/app/src
```

Success criteria:

- CLI user-visible behavior matches docs and tests.
- App session-local history remains coherent.
- No divergent CLI-only storage model exists.

Stop conditions:

- Any implementation requires changing shared job lifecycle without an application/core plan.
- Tests need to assert behavior that app/application cannot support.

Rollback:

- Revert this phase's parser and test changes.
- Keep Phase 1 documentation only if it remains accurate.

Human decision point:

- Choose Option A, B, or C before implementation.

Recommended decision:

- Choose Option A as the low-risk short-term correction. This is not a reason to preserve existing behavior by default; it is only the smallest change that keeps CLI docs, tests, and current app/session semantics aligned. Revisit Option C only when `apps/app` needs persistent history or cross-session job recovery.

### Phase 3 - Task-First Alias Slice

Goal:

- Improve first-run ergonomics with thin task-first aliases only if they do not fork business logic.

Allowed scope:

- `apps/cli/src/index.ts`
- New files under `apps/cli/src/commands/generate*` or `apps/cli/src/commands/task*`
- `apps/cli/tests/contract/*`
- `apps/cli/README.md`

Forbidden scope:

- No new provider semantics in CLI.
- No request mapping duplication beyond calling existing `@imagen-ps/application` request paths.
- No UI/app changes.
- No removal of existing `job submit provider-generate/provider-edit` unless a slice explicitly updates all tests and docs.

Candidate behavior:

```bash
imagen generate --profile mock-dev --prompt "simple blue square icon" --out ./imagen-output
imagen edit --profile mock-dev --image ./input.png --prompt "clean up background" --out ./imagen-output
```

Design constraint:

- Aliases must translate to the same `submitJob({ workflow, input })` command path used by `job submit`.
- `--out` must reuse `saveImageWithSidecar`.
- File image loading must stay in CLI Node adapters and produce provider-shaped `Asset` input.

Validation commands:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
pnpm test
```

Success criteria:

- Existing `job submit` tests still pass.
- New aliases produce the same job/output artifact shape as `job submit`.
- README can present task-first quickstart without lying about available commands.

Stop conditions:

- Alias implementation starts duplicating provider request builders.
- Alias requires app/UXP/Photoshop imports.
- Parser output contract becomes inconsistent across command families.

Rollback:

- Remove alias command files, registration, tests, and README sections from this phase.

Human decision point:

- Decide whether the ergonomic gain is worth parser surface expansion after Phase 1/2.

### Phase 4 - Mock Init Convenience Slice

Goal:

- Reduce first-run friction by creating a mock profile through a small CLI convenience command, if still needed after README correction.

Allowed scope:

- CLI parser and Node adapter code.
- CLI contract tests.
- README quickstart.

Forbidden scope:

- No real provider init wizard.
- No interactive prompts.
- No credential handling beyond mock values and `env:` documentation.
- No global setup outside `IMAGEN_CONFIG_DIR` / default config dir.

Candidate behavior:

```bash
imagen init --mock
```

Validation commands:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
```

Success criteria:

- Creates or updates only a mock profile.
- Does not write real secrets.
- Does not hide the underlying profile schema from contract tests.

Stop conditions:

- Command becomes a general project initializer.
- Command writes files outside the CLI config dir.
- Command requires app/application API additions not justified by this slice.

Rollback:

- Remove init command, tests, and README usage.

Human decision point:

- Decide whether to implement this slice before or after task-first aliases.

### Phase 5 - Shared Durable Job Design Gate

Goal:

- Only if persistent history/retry becomes a real requirement, design it once across CLI and UXP app before splitting implementation into smaller slices.

Allowed scope:

- Design document first.
- Follow-up implementation slices only after design approval.
- `packages/core-engine` job store contract.
- `packages/application` session commands.
- Host-injected storage adapters for CLI and UXP.
- App history and CLI `job get/retry/list` only after shared storage semantics are settled.

Forbidden scope:

- No CLI-only `~/.imagen-ps/jobs` shortcut.
- No UXP native path leakage into shared packages.
- No provider output persistence inside provider adapters.
- No background daemon.

Required design questions:

- Is a completed job record stored separately from image artifacts?
- Does UXP store job metadata in `localFileSystem.getDataFolder()`?
- Are generated assets stored by host adapters as `StoredAssetRef` instead of native paths?
- Which commands are session-local versus durable?
- How are failed jobs retried without storing secret values in job inputs?

Validation commands:

```bash
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/cli test
pnpm --filter @imagen-ps/app test
pnpm test
rg -n "node:fs|node:path|node:os|photoshop|uxp|react|@imagen-ps/app|@imagen-ps/cli" packages/application packages/core-engine
```

Success criteria:

- CLI and app consume the same application/session durable job abstraction.
- Shared packages remain host-agnostic.
- Secret values are not persisted in job records.
- UXP storage uses host adapters; CLI storage uses Node adapters.

Stop conditions:

- Design needs host-specific APIs in shared packages.
- Retrying a durable job requires persisted raw secret values.
- Durable asset references cannot be represented host-neutrally.

Rollback:

- Revert shared storage changes and surface wiring from this phase.
- Keep earlier documentation if still accurate.

Human decision point:

- Approve durable job/history as a cross-surface requirement and approve the follow-up slice breakdown before any implementation.

## Review Checklist

- The plan preserves `apps/cli` as a Node surface.
- Parser/stdout/stderr/`--out` changes happen only inside explicit parser slices.
- No slice adds Photoshop, UXP, React, provider transport, or runtime internals to CLI.
- Any durable state is designed in shared application/core boundaries first.
- README examples must correspond to implemented commands in the same slice.
- Tests are named before implementation starts.
- Stop conditions and rollback are concrete for every phase.

## Recommended Immediate Next Action

After review approval and the Phase 0 authority decision, execute Phase 1 only.

Do not implement task-first aliases, mock init, doctor, schema, batch, or durable jobs until the corrected README has removed the current expectation mismatch and the team has made the Phase 2 job semantics decision.
