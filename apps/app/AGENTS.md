## Adobe Photoshop UXP Research

For any Photoshop UXP, Photoshop DOM, BatchPlay, Imaging API, Manifest,
UXP HTML/CSS, Spectrum Web Components, or SWC wrapper question:

1. Inspect the repository's actual Photoshop version, UXP version,
   manifest version, SWC version, and wrapper aliases first.

2. Use this authority order:

   a. Current repository code and locked dependency versions
   b. Adobe Photoshop UXP official documentation
   c. Adobe generic UXP documentation
   d. Adobe official samples
   e. Adobe changelog and known issues
   f. Adobe GitHub issues and Adobe Community
   g. Third-party sources

3. Never infer UXP support from normal browser compatibility.
   Verify HTML elements, attributes, CSS properties, Web APIs, and
   Spectrum APIs against the project's actual UXP version.

4. Never apply current SWC or Spectrum 2 documentation to a project
   locked to SWC 0.37.0 unless compatibility is proven from source.

5. For conflicting documentation, inspect:
   - the installed package source
   - @swc-uxp-wrappers implementation
   - Adobe official samples
   - the real Photoshop UXP runtime

6. Clearly distinguish:
   - officially documented support
   - official sample behavior
   - wrapper-specific behavior
   - community workaround
   - unverified assumption

## App Surface Boundaries

- UI localization is an `apps/app` surface concern. Shared packages must not own UI copy or locale state.
- Shared UI motion, theme generation, toast, and popup-layer behavior are `apps/app` contracts. Longer rationale and implementation detail live in `docs/ENGINEERING_CONTEXT.md`.
- Shared UI and harness CSS must stay inside the repo-owned UXP CSS contract. Mechanical enforcement lives in `pnpm check:policy` and `docs/TESTING.md`.

## Photoshop Placement Contract

Preview writeback follows source anchoring when available and active-document
placement when the user explicitly places an unanchored result.

- `exact-frame`: place back into the captured document and transform to the
  captured rectangle. Reject if the document cannot be strongly verified.
- `document-only`: place back into the captured document without frame
  transform. Reject if the document cannot be strongly verified.
- `unbound` with `no-photoshop-capture`: place into the current active
  Photoshop document at click time. Reject only when no active document exists.
- `unbound` with `multiple-documents`: reject as ambiguous. Do not silently
  choose an active document when source attachments came from different
  Photoshop documents.

Keep this rule at the host bridge/simulator boundary. Shared UI should pass the
round placement intent through unchanged; it should not branch on Photoshop
runtime identity or guess a document target.
