# Contributor License Agreement

This Contributor License Agreement (`CLA`) applies to external contributors of this repository.

## Scope

You are an external contributor if you are not acting as `OWNER`, `MEMBER`, or `COLLABORATOR` on the repository.

This CLA is required before non-trivial pull requests from external contributors are merged.

## Terms

By signing this CLA, you state that:

1. You have the legal right to submit the contribution.
2. You grant the maintainer a perpetual, worldwide, non-exclusive, irrevocable license to use, reproduce, modify, relicense, distribute, and sublicense your contribution as part of this project or other project distributions.
3. You understand the repository source is currently published under `MPL-2.0`, and the maintainer may in the future add, change, or offer separate commercial licenses for the project or for distributions that include your contribution.
4. You are not knowingly submitting material that you do not have the right to license.
5. You agree that this CLA record, together with your GitHub account identity and explicit sign-off text, is sufficient evidence of assent.

## How External Contributors Sign

Open a GitHub issue using the `cla-sign.yml` template and submit it from the same GitHub account that will open the pull request.

The issue body must keep the required affirmation text intact.

## How Pull Requests Link The CLA

External contributor pull requests must include a line in the PR body:

```text
CLA Issue: https://github.com/<owner>/<repo>/issues/<number>
```

The linked issue must:

- be open or closed in the same repository;
- be authored by the same GitHub user as the pull request author;
- use the CLA signing template content;
- contain the exact affirmation sentence:

```text
I have read and agree to the CLA terms in CLA.md for my contributions to this repository.
```

Maintainers may apply `cla:exempt` only for changes that do not need a CLA record, such as typo-only documentation fixes or mechanical metadata edits.

## Maintainer Operation

1. Ask the contributor to open a CLA signing issue with the provided template.
2. Verify the issue author matches the pull request author.
3. Verify the issue body still includes the required affirmation sentence.
4. Verify the PR body includes a valid `CLA Issue:` link.
5. Merge only after the workflow passes, or apply `cla:exempt` if the change is truly exempt.

## Notes

This file is operational project policy, not legal advice. If you need entity-specific or jurisdiction-specific terms, contact the maintainer before contributing.
