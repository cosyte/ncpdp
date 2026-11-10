---
id: triage-warnings-with-profiles
title: Triage warnings with a trading-partner profile
sidebar_label: Triage warnings with a profile
description: "Attach a trading-partner profile to a parse and split its warnings into the ones the partner's conventions predict and the ones to alert on."
---

# Triage warnings with a trading-partner profile

A trading partner sends messages under its own conventions, and some of those conventions raise
warnings every time. A profile names the conventions and the warnings they predict, so you can alert
only on the rest. A profile never changes how a message parses.

## Attach a profile and split the warnings

Pass the profile to the parser, then give the warnings and the profile to `partitionWarnings`:

```ts runnable
import { parseTelecom } from "@cosyte/ncpdp/telecom";
import { partitionWarnings, profiles } from "@cosyte/ncpdp/profiles";

const FS = "\x1c";
const GS = "\x1d";

// A rejected response whose reject code has no label in this library.
const header = "D0" + "B1" + "1" + "R" + "01" + "1234567890".padEnd(15);
const raw = header + GS + ["AM21", "ANR", "FB99"].join(FS);

const t = parseTelecom(raw, { profile: profiles.pbm });
t.profile?.name; // => "pbm"

const { expected, unexpected } = partitionWarnings(t.warnings, profiles.pbm);
expected.map((w) => w.code); // => ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"]
unexpected; // => []
```

Alert on `unexpected`. Here the PBM profile predicts unrecognized reject codes, so the one warning is
expected.

We ship two built-in profiles, one per standard: `profiles.surescripts` for SCRIPT and `profiles.pbm`
for Telecom. Each convention a built-in names is shown by a committed synthetic fixture, and the
[profile notes](./spec-notes-profiles.md) list them.

## Set a default profile

`setDefaultProfile` sets a default profile that every parse uses when it is given none. An explicit
`profile` option always wins, `null` opts one call out of the default, and leaving the option out
uses the default.

The default is held once per entry point, because each entry point is its own bundle. Only the
package root exports both `setDefaultProfile` and a parser, so import them together from
`@cosyte/ncpdp`. `@cosyte/ncpdp/script` and `@cosyte/ncpdp/telecom` do not export
`setDefaultProfile`, and a default set through `@cosyte/ncpdp/profiles` reaches no parser. With a
parser imported from a subpath, pass `{ profile }` on each call instead.

```ts runnable
import { getDefaultProfile, parseScript, profiles, setDefaultProfile } from "@cosyte/ncpdp";

setDefaultProfile(profiles.surescripts);

const xml = '<Message version="2017071"><Header /><Body /></Message>';
parseScript(xml).profile?.name; // => "surescripts"
parseScript(xml, { profile: null }).profile; // => undefined

setDefaultProfile(null);
getDefaultProfile(); // => undefined
```

## Define your own profile

`defineProfile` validates a profile and returns it frozen. A profile can extend others; each quirk
names the standard, its effect (`relaxes`, `adds`, or `requires`), a summary, where the convention is
documented, the warnings it predicts, and the fixture in your own test corpus that shows it.

```ts runnable
import { defineProfile, profiles } from "@cosyte/ncpdp/profiles";

const partner = defineProfile({
  name: "synthetic-switch",
  description: "A synthetic switch that also forwards unmodeled response statuses.",
  extends: profiles.pbm,
  quirks: [
    {
      id: "status-passthrough",
      standard: "telecom",
      effect: "adds",
      summary: "Forwards Transaction Response Status values this library does not model.",
      fixture: "telecom/synthetic-switch-status.ncpdp",
      sourceCategory: "The partner's synthetic payer sheet, section on response statuses.",
      expectedWarnings: ["NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS"],
    },
  ],
});

partner.lineage; // => ["pbm", "synthetic-switch"]
partner.describe().expectedWarnings; // => ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE", "NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS"]
```

`defineProfile` throws `NcpdpProfileError` for a profile it cannot accept: a missing name, an
unknown option, or a quirk with no fixture path, an unknown standard or effect, or a warning code
outside the package's registries. It checks that the fixture path is relative and well formed; it
does not read the file.

Reference: [`partitionWarnings`](./api/@cosyte/ncpdp.md#partitionwarnings),
[`defineProfile`](./api/@cosyte/ncpdp.md#defineprofile),
[`setDefaultProfile`](./api/@cosyte/ncpdp.md#setdefaultprofile), and
[`profiles`](./api/@cosyte/ncpdp/profiles.md#profiles).

## Next

- [Trading-partner profiles](./spec-notes-profiles.md): the built-in quirks and the fixture behind
  each.
- [Diagnostic codes](./diagnostic-codes.md): every warning a profile can predict.
