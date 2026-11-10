# @cosyte/ncpdp/profiles

Public barrel for the `@cosyte/ncpdp` profile subsystem. Assembles
the `profiles` namespace object and re-exports the public profile API:
`defineProfile`, `setDefaultProfile`, `getDefaultProfile`,
`partitionWarnings`, the `NcpdpProfileError` class, and the supporting types.

Contract (mirrors x12/hl7): individual built-ins are NOT top-level named
exports: consumers reach them via `profiles.surescripts`, `profiles.pbm`.

**NCPDP spans two unrelated standards**, so the registry holds one profile
per standard: `profiles.surescripts` (SCRIPT) and `profiles.pbm` (Telecom).
A profile is descriptive: it attaches to a parse result for
attribution (`msg.profile` / `tx.profile`) and powers `partitionWarnings`,
but NEVER alters the lenient parse.

**Shipped built-ins are intentionally few.** A built-in profile ships a
quirk only when a committed fixture demonstrates the convention. New
built-ins land as the fixture corpus grows.

## Variables

### profiles

> `const` **profiles**: `object`

Namespace object exposing the shipped built-in profiles, one per NCPDP
standard. Each is authored via the public `defineProfile()` API and grounded
in a committed fixture that demonstrates it.

#### Type Declaration

##### pbm

> `readonly` **pbm**: [`NcpdpProfile`](../ncpdp.md#ncpdpprofile)

##### surescripts

> `readonly` **surescripts**: [`NcpdpProfile`](../ncpdp.md#ncpdpprofile)

#### Example

```ts
import { parseTelecom } from "@cosyte/ncpdp/telecom";
import { profiles } from "@cosyte/ncpdp/profiles";
const tx = parseTelecom(raw, { profile: profiles.pbm });
tx.profile?.name; // "pbm"
```

## References

### defineProfile

Re-exports [defineProfile](../ncpdp.md#defineprofile)

***

### getDefaultProfile

Re-exports [getDefaultProfile](../ncpdp.md#getdefaultprofile)

***

### NcpdpProfile

Re-exports [NcpdpProfile](../ncpdp.md#ncpdpprofile)

***

### NcpdpProfileDescription

Re-exports [NcpdpProfileDescription](../ncpdp.md#ncpdpprofiledescription-1)

***

### NcpdpProfileEffect

Re-exports [NcpdpProfileEffect](../ncpdp.md#ncpdpprofileeffect)

***

### NcpdpProfileError

Re-exports [NcpdpProfileError](../ncpdp.md#ncpdpprofileerror)

***

### NcpdpProfileQuirk

Re-exports [NcpdpProfileQuirk](../ncpdp.md#ncpdpprofilequirk)

***

### NcpdpProfileSpec

Re-exports [NcpdpProfileSpec](../ncpdp.md#ncpdpprofilespec)

***

### NcpdpStandard

Re-exports [NcpdpStandard](../ncpdp.md#ncpdpstandard)

***

### NcpdpWarningCode

Re-exports [NcpdpWarningCode](../ncpdp.md#ncpdpwarningcode)

***

### NcpdpWarningPartition

Re-exports [NcpdpWarningPartition](../ncpdp.md#ncpdpwarningpartition)

***

### partitionWarnings

Re-exports [partitionWarnings](../ncpdp.md#partitionwarnings)

***

### setDefaultProfile

Re-exports [setDefaultProfile](../ncpdp.md#setdefaultprofile)
