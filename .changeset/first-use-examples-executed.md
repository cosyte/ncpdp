---
"@cosyte/ncpdp": patch
---

The quickstart's first example and the README's first usage example are now executed by the test suite, read straight out of the page they are printed on.

The SCRIPT NewRx the quickstart prints is committed byte for byte as a test fixture, so the PHI scan reads it, and doing that surfaced a patient first name the scan's synthetic declarations did not cover: the example now uses a declared synthetic name instead, and nothing it claims changed. The README's Telecom example is run against the package and its printed output compared with the block beside it. The quickstart's TypeScript example is also compiled with the settings `tsc --init` writes for a new project, so an example that does not compile fails the suite too. A changed value in either example fails the suite, every import either example uses is checked against the published subpaths, and every install command the README and the installation page print is checked against the package's own name.
