---
"@cosyte/ncpdp": patch
---

The package root now re-exports every export of `@cosyte/ncpdp/telecom`, not only part of it.

`@cosyte/ncpdp` already carried every export of the SCRIPT, common and profiles subpaths, but only 57 of the 91 Telecom exports. The rest, among them `adjudication`, `compound`, `cobOtherPayments`, `requestDur`, `priorAuthorization`, `responseCob`, `telecomMoney`, `fieldValues` and their types, are now importable from the root as well. Nothing is removed and the subpath is unchanged. This would otherwise call for a minor, since it adds exports to the root.
