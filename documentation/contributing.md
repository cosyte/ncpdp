Relocated out of `README.md` so the front page fits its byte budget. The section below is the text
that used to sit there, unchanged and under its original heading, and `README.md` links here at the
point it left. Relocation, not deletion.

## Contributing

**Where to ask.** Open an issue at
[github.com/cosyte/ncpdp/issues](https://github.com/cosyte/ncpdp/issues). That is the only support
channel: there is no chat, mailing list or private support address.

**External pull requests.** The repository is public and MIT-licensed, and it takes pull requests
on the same terms as any other change. There is no CONTRIBUTING.md and no code of conduct in the
repository yet, so this section is the whole contributor guide.

**What a contribution must clear before merge.** A pull request has to go green on the required
status checks on `main`. Locally that is:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm run check && pnpm run build
```

Lint runs at `--max-warnings=0` and coverage is gated per directory at 90 percent. Two gates check
the text as well as the code: no em dash in any tracked file or in the pull request title, body or
commit messages, and no internal project identifier on a published surface. A change that alters
behaviour also needs a changeset, and a changeset that renames a stable warning code is describing
a breaking change.
