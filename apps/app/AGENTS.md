## Adobe Photoshop UXP Research

For any Photoshop UXP, Photoshop DOM, BatchPlay, Imaging API, Manifest,
UXP HTML/CSS, Spectrum Web Components, or SWC wrapper question:

1. Inspect the repository's actual Photoshop version, UXP version,
   manifest version, SWC version, and wrapper aliases first.

2. Search the local official Adobe documentation mirrors before relying
   on memory:

   - .local/share/uxp-photoshop
   - .local/share/uxp
   - .local/share/uxp-photoshop-plugin-samples

3. Use this authority order:

   a. Current repository code and locked dependency versions
   b. Adobe Photoshop UXP official documentation
   c. Adobe generic UXP documentation
   d. Adobe official samples
   e. Adobe changelog and known issues
   f. Adobe GitHub issues and Adobe Community
   g. Third-party sources

4. Never infer UXP support from normal browser compatibility.
   Verify HTML elements, attributes, CSS properties, Web APIs, and
   Spectrum APIs against the project's actual UXP version.

5. Never apply current SWC or Spectrum 2 documentation to a project
   locked to SWC 0.37.0 unless compatibility is proven from source.

6. For conflicting documentation, inspect:
   - the installed package source
   - @swc-uxp-wrappers implementation
   - Adobe official samples
   - the real Photoshop UXP runtime

7. Clearly distinguish:
   - officially documented support
   - official sample behavior
   - wrapper-specific behavior
   - community workaround
   - unverified assumption
