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

**Below 1.0, every release is a patch.** Every changeset declares `patch`, whatever it carries: a
fix, an addition, a removal or a break. A breaking or narrowing change does not move the minor. It
ships as a patch whose changeset states the change and what a caller must do, and the summary is
the entry a consumer reads in `CHANGELOG.md`.

The rule is about the **published surface**, which means the values and types exported from
`@cosyte/ncpdp`, `@cosyte/ncpdp/script`, `@cosyte/ncpdp/telecom`, `@cosyte/ncpdp/common` and
`@cosyte/ncpdp/profiles`, and the behaviour a consumer sees when they call into it. Everything else
in this repository is invisible to the people your changeset is written for.

What the summary has to say depends on what a consumer of the last published version could observe:

- **An export removed or renamed; a parse, emit, warning or refusal that now accepts or returns
  less; a value that used to come back and now does not.** This is a break or a narrowing. Start
  the summary with the word `Breaking` or `Narrowing`, say what changed, and add a `What to do:`
  statement that tells a caller what to change. It does not matter whether the change is an
  improvement.
- **An export added, or behaviour a caller gains without changing anything.** Say what a consumer
  can now do.
- **A fix, or nothing a consumer can observe:** documentation, tests, repository tooling, CI or
  package metadata. Say what the fix is.

Because a break ships in a patch, a caret range does not protect a consumer, which is why the
statement of the change and of what to do is not optional.

`pnpm check:changeset-bumps` enforces three things. Every changeset names `@cosyte/ncpdp` and no
other package. Every changeset declares `patch`: `minor`, `major` and `none` are refused, and so is
a file whose frontmatter it cannot read. And a summary whose first word is `Breaking` or
`Narrowing` (in any case) must contain `What to do:` followed by text, or the check fails. It reads
only the words you chose: it cannot tell that a summary you did not mark describes a break, so
marking it is still yours.

## When the honest answer is `major`

**Do not put `major` in a changeset.** The checker refuses it, deliberately. This package is
released as part of a coordinated batch of `@cosyte/*` libraries that are moving to the same
version together, and a `major` here takes this one package off that number on its own.

So when a change genuinely breaks a consumer, the bump stays `patch`. Say it in the summary, in the
terms a consumer needs (what is gone, what it affected, what to do instead), and mark the change as
a **break candidate** for whoever is sequencing the release. What is not allowed is the break going
unsaid.

## The published surface is recorded, and the record has to move with you

`test/public-surface.json` holds every exported value and type of all five entry points.
`pnpm test` compares it against the compiler's answer in both directions, so adding, removing,
renaming or changing the kind of an export reds until you run `pnpm surface:record` and commit the
result in the same change. That diff is the shortest honest answer to "does this changeset need to
say what a caller must do": if an export left the record or was renamed, it does.

(The org-wide version ladder lives outside this repository. This file states only the rule this
repository applies, so that the rule and the check that enforces it cannot drift apart.)
