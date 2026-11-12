---
"@cosyte/ncpdp": patch
---

Documentation only: the README now says that below 1.0 every release is a patch, and that a breaking or narrowing change ships as a patch whose changelog entry states the change and what a caller must do. A caret range such as `^0.1.0` does not protect you from one, so pin the exact version and read the entry before raising it. The limitations are now one page, Limitations and non-goals, in the reference. No code changed.
