# Provider Expansion Docs

This directory splits provider/model expansion work into three questions plus one index.

## Documents

1. [01-new-model-information-brief.md](./01-new-model-information-brief.md)
   - Use this when someone needs to summarize everything required for one new model.
   - Stays implementation-agnostic on purpose.

2. [02-new-protocol-provider-information-brief.md](./02-new-protocol-provider-information-brief.md)
   - Use this when someone needs to summarize everything required for one new protocol, API format, or provider relay.
   - Stays implementation-agnostic on purpose.

3. [03-repo-playbook.md](./03-repo-playbook.md)
   - Use this after the information brief is complete.
   - Explains how this repository maps that information into provider catalog, application, UI follow-through, and validation.

## Recommended Order

1. Fill the model brief or the protocol/provider brief first.
2. Decide whether the change is:
   - a new model on an existing protocol; or
   - a new protocol / new provider family.
3. Use the repo playbook to implement the change in this repository.
