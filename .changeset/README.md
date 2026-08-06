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

During pre-alpha, pick **patch**, which keeps the package on the `0.0.x` ladder until its first
alpha. See the cosyte version ladder in the meta-repo's `documentation/conventions.md`.
