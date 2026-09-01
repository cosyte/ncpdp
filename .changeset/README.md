# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **changelog** and the **publish** for `@cosyte/ncpdp`. `config.json` names
a `changelog` generator, so the release writes its own version heading into `CHANGELOG.md` and
**your changeset summary is the entry a reader sees there**. Write it for a consumer, and do not
hand-edit `CHANGELOG.md`: everything above its
`Released before this file was generated` heading is generated output.

Two shapes to avoid in a summary, both measured on real releases:

- **No ATX heading at the start of a line.** Continuation lines are indented by exactly two spaces,
  which is the content column of the entry's own bullet, so a `##` line becomes a real heading
  nested inside the release section, permanently, once published. Use an inline code span instead.
- **Keep the opening sentence under the release-notes cap**, because it becomes the release bullet
  and the notes gate refuses rather than trims.

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

## Which bump to pick

The rule is about the **published surface**, which means the values and types exported from
`@cosyte/ncpdp`, `@cosyte/ncpdp/script`, `@cosyte/ncpdp/telecom`, `@cosyte/ncpdp/common` and
`@cosyte/ncpdp/profiles`, and the behaviour a consumer sees when they call into it. Everything else
in this repository is invisible to the people your changeset is written for.

- **`minor`** when a consumer of the last published version could observe the difference: an export
  added, removed or renamed; a parse, emit, warning or refusal that behaves differently; a value
  that used to come back and now does not. It does not matter whether the change is an improvement.
- **`patch`** when it is a fix, or when nothing a consumer can observe moved at all: documentation,
  tests, repository tooling, CI, or package metadata.

Two of those pairings surprise people, so they are written down rather than left to be re-derived:
**a documentation-only change is a `patch` even when it documents something big**, and **a change
that only narrows or removes something is a `minor`, not a `patch`** - a removal is the most
consumer-visible thing a release can carry, and calling it a `patch` is how a consumer gets a
breaking change from a version number that promised them a fix.

`pnpm check:changeset-bumps` enforces this much: a changeset here must declare `patch` or `minor`
and must name `@cosyte/ncpdp`. It cannot tell whether you picked the right one of the two, so that
part is still yours.

## When the honest answer is `major`

**Do not put `major` in a changeset.** The checker refuses it, deliberately. This package is
released as part of a coordinated batch of `@cosyte/*` libraries that are moving to the same
version together, and a `major` here takes this one package off that number on its own. That is a
decision about the batch rather than about your change.

So when a change genuinely breaks a consumer, the bump is not where you say so. Say it in the
summary, in the terms a consumer needs (what is gone, what it affected, what to do instead), mark
the change as a **break candidate** for whoever is sequencing the release, and leave the bump at
`minor`. The `0.x` ladder permits that; a breaking change in a `minor` is exactly what a leading
zero means. What it does not permit is the break going unsaid.

## The published surface is recorded, and the record has to move with you

`test/public-surface.json` holds every exported value and type of all five entry points.
`pnpm test` compares it against the compiler's answer in both directions, so adding, removing,
renaming or changing the kind of an export reds until you run `pnpm surface:record` and commit the
result in the same change. That diff is the shortest honest answer to "is this a `minor`": if the
record moved, it is.

(The org-wide version ladder lives outside this repository. This file states only the rule this
repository applies, so that the rule and the check that enforces it cannot drift apart.)
