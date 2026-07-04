Status: draft
Authority: follow-up after provider architecture remediation
Owner: `apps/app` UXP host verification with `packages/providers` request evidence
Created: 2026-07-04

# UXP FormData Wire Probe

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/providers/ARCHITECTURE.md`
- `packages/providers/TESTING.md`

## Goal

Verify real Photoshop UXP `FormData` serialization against a local echo server so Node multipart characterization is not misread as host proof.

## Non-goals

- No provider production behavior change
- No UI changes
- No generic release smoke expansion

## Scope

Allowed:

- host-side probe harness
- release-only opt-in test wiring
- documentation of observed Node vs UXP differences

Forbidden:

- default dev test suite changes that touch real Photoshop
- image-endpoint transport contract changes without new evidence

## Required host setup

- Real Photoshop
- UXP Developer Tool
- Local echo server reachable from the panel
- Opt-in `pnpm test:release`
- Dedicated env flag enabling the probe

## Assertions

- `Content-Type` includes a boundary
- boundary matches body delimiters
- part name / filename / MIME type match expected request shape
- body bytes are captured for comparison

## Known differences to verify

- Node vs UXP boundary generation
- filename inference differences for inline image blobs

## Validation

- `pnpm check:policy`
- opt-in `pnpm test:release` with the dedicated env flag

## Stop rule

- Stop if Photoshop/UXP host access is unavailable; this loop is manual-host dependent.
