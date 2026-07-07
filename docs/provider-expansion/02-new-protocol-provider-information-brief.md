# New Protocol / New Provider Information Brief

Use this document to collect the complete fact set for one new protocol, API format, or provider relay.
Goal: produce a provider/protocol brief that is good enough for any implementation team to decide whether the change is only a new model, or requires a real protocol/provider integration.

This document is intentionally implementation-agnostic. It describes what must be known, not how this repository stores it.

## 1. Boundary Decision

Collect:

- Protocol name
- Provider / vendor name
- Whether this is:
  - a new endpoint under an existing protocol
  - a new request dialect under an existing protocol
  - a new response dialect under an existing protocol
  - a genuinely new API format
  - a relay / gateway over an existing upstream

Questions:

- Is this change truly a new protocol boundary?
- Can the behavior fit an existing canonical request and response contract?
- Is the difference only transport/config, or semantic request/response meaning?

Definition of done:

- The change is classified as `existing protocol extension` or `new protocol/provider`.

## 2. Connection And Auth

Collect:

- Base URL rules
- Path structure
- Required path templates
- Auth mode
- Required headers
- Forbidden caller-supplied headers
- Timeout expectations
- Multi-endpoint or failover behavior

Questions:

- What part belongs to saved connection config?
- Which auth headers are provider-owned and must not be overridden?
- Does the provider support endpoint measurement or connection testing?

Definition of done:

- A complete connection/auth contract is documented.

## 3. Canonical Request Mapping

Collect:

- Supported operations
- Canonical request fields
- Provider-specific request fields
- Required output parameters
- Multipart vs JSON vs reference-based payload rules
- File upload rules

Questions:

- Can existing canonical request fields express the upstream semantics?
- Which fields belong in a request strategy or codec?
- Which caller-supplied fields must be ignored or rejected?

Definition of done:

- Request mapping is specific enough to build a stable request builder.

## 4. Response And Normalization

Collect:

- Success payload shape
- Image output locations:
  - URL
  - inline base64
  - file token
  - mixed payload
- Error payload shape
- Partial success behavior
- Usage or cost fields
- Safety or moderation signals

Questions:

- How should the response be normalized into canonical assets and text?
- Which malformed or oversized payloads must degrade safely?

Definition of done:

- Response parsing rules are specific enough to build a stable parser.

## 5. Model Discovery And Catalog Policy

Collect:

- Discovery endpoint, if any
- Discovery payload shape
- Whether discovery returns only IDs or richer facts
- Whether the provider should preserve unknown discovered IDs
- Whether local curated catalog rules are still needed

Questions:

- Is discovery authoritative, advisory, or incomplete?
- Which facts belong in remote discovery, and which belong in a local curated catalog?

Definition of done:

- Discovery ownership is explicit.

## 6. Recovery, Billing, And Replay Safety

Collect:

- Whether paid requests are replay-safe
- Idempotency support
- Retry-safe failure classes
- Non-retry-safe ambiguity classes
- Billing query capability
- Rate-limit behavior

Questions:

- Which failures can be retried automatically?
- Which failures must fail closed to avoid duplicate billing?

Definition of done:

- Retry and billing policy is explicit.

## 7. Exposure And Product Constraints

Collect:

- Whether the provider should be user-configurable
- Whether it supports model selection
- Whether it supports default model fallback
- Whether it supports connection test
- Whether it supports endpoint measurement

Questions:

- Which parts are true provider capability versus UI/product policy?
- Which features should be hidden or marked unsupported?

Definition of done:

- Product-facing capability flags are explicit.

## 8. Evidence

Collect:

- Official docs
- OpenAPI or schema reference
- Example requests and responses
- Error examples
- Verified live traces or smoke results, if available
- Known contradictions between docs and real behavior

Questions:

- Which facts are documented versus experimentally verified?
- Which unknowns still block safe implementation?

Definition of done:

- Every important claim has evidence or is clearly marked as unknown.

## Output Format

A finished protocol/provider brief should end with:

- `Boundary decision`
- `Connection/auth summary`
- `Request mapping summary`
- `Response summary`
- `Discovery summary`
- `Recovery/billing summary`
- `Evidence list`
