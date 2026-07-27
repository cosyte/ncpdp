#!/usr/bin/env bash
# scripts/check-no-emdash.sh
# Brand rule (founder directive, 2026-07-24): cosyte never uses the em dash.
# The em dash (U+2014) reads as an AI tell, so it is banned outright across
# every cosyte surface. Source of truth: `knowledgebase/06-brand/voice-and-tone.md`
# ("No em dashes. Ever."), which names commit messages explicitly.
#
# Ported into ncpdp on 2026-07-27 from knowledgebase (PR #12, `f4b42f5`), which is
# the TEXT-ONLY variant of this gate: no NUL-byte partition, because this repo
# tracks no binaries. Measured byte-level before the port over all 160 tracked
# files: NONE holds a NUL byte, every one decodes as UTF-8, and none carried an em
# dash in any form (0 of 25 markdown files, 0 of 160 tracked files overall). So this
# gate changed no content. It exists purely to stop a regression, which is the only
# reason to add it to a clean repo. ncpdp's content was remediated separately, before
# this gate existed; nothing here re-did that work.
#
# Do NOT swap in the website copy. That one partitions on the NUL byte to tolerate
# tracked rasters, and here its exclusion rule would be dead weight AND a hole: it
# would silently exempt any text file that later gained a NUL, which is exactly the
# regression this gate is for. It is also not swappable for pathways' preferred
# `git check-attr binary` partition, which needs a `.gitattributes` this repo does
# not have. Adding one is deferred to the cross-repo "what is a text file" rule.
#
# The 31 `.xml` and 3 `.ncpdp` fixtures are real parser test data, and they are
# scanned like anything else: all 34 read as text (verified, not assumed), so the
# scan does cover them rather than classifying any of them out.
#
# The fix is never to re-encode the character: rewrite the sentence with a
# period, a colon, a comma, or parentheses.
#
# Two modes:
#   check-no-emdash.sh                 scan every tracked file
#   check-no-emdash.sh --stdin LABEL   scan text on stdin (CI feeds it the PR
#                                      title, body, and commit messages: the
#                                      voice rule names commit messages, and a
#                                      commit-message em dash is the near-miss
#                                      that prompted the gate in knowledgebase)
#
# Note: this script itself is excluded from the tracked-file scan (it necessarily
# names the encodings it bans). It matches by codepoint and by encoding, so it
# never contains the literal character.
#
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. These are inherited from the shared shape knowingly. They
# are ONE cross-repo fix across the five copies (knowledgebase, hl7, fhir, pathways,
# and now this one), not five separate ones, so they are not fixed here. Do not
# patch them in this copy alone: a divergent variant is worse than a known shared
# limit, EXCEPT where the shape is outright wrong rather than merely bounded.
# (TWO things ARE fixed here rather than disclosed, because each defeats this gate's
# central promise. They defeat it in different ways, and collapsing them into one
# phrase is the kind of compression this header is trying to stop: the `-` operand let
# a LIVE CHARACTER through green, while `-d skip` let an UNREAD ENTRY pass green, which
# is a missed read rather than a missed match. The missing -H is fixed alongside them
# but is cosmetic and does not belong in that sentence: it only makes an already-RED
# report unattributable. All three are shape bugs rather than ncpdp-local ones, so
# carry them back, with one check first: `pathways` already refuses directories by
# another route and so does not need the `-d skip` half.)
#
#   (i)  A tracked TEXT file holding a NUL byte is classified binary by grep and,
#        if it also carries an em dash, reported on stderr rather than skipped, so
#        here it goes RED rather than silently missed. That is fail-closed and is
#        why this shape is the right one for a repo with zero NUL-bearing files.
#        The property to know: the shape has no way to distinguish "binary asset"
#        from "text file that gained a NUL", and neither does this repo, because it
#        declares nothing in `.gitattributes`. dicom and ccda each have a NUL inside
#        real TypeScript source (the byte is the feature there), which is why their
#        ports are blocked on that rule and this one is not.
#   (ii) Encoded-form matching is LITERAL: case-sensitive, and the HTML entities
#        require the semicolon. So `%e2%80%94` (lowercase), `&#X2014;` (capital X),
#        `&#x2014` (no semicolon) and `&#08212;` (zero-padded) all pass this gate.
#        The literal UTF-8 character, the canonical URL encoding, the JS escape, and
#        the three canonical entities are what is caught. Widening the pattern is the
#        cross-repo fix, not a local one.
#  (iii) Stderr capture binds only to the LAST stage of the pipeline, the scanning
#        grep. It does NOT bind to the `grep -zvxF` self-exclusion filter or the
#        `sed -z` prefixer ahead of it. Say the consequence plainly rather than in
#        terms of the helper, because it is exactly the failure this gate exists to
#        refuse: if either earlier stage dies, its stderr is not routed to ERRLOG,
#        refuse_if_incomplete does not fire, and THE GATE PRINTS OK AND EXITS 0 over a
#        tree that may hold a live character. Measured, with a stub `grep` on this copy
#        AND on the shape it was ported from, and with a stub `sed` on this copy only.
#        Be precise about which half is inherited: the `grep -zvxF` stage is shared with
#        all four sibling copies, but the `sed -z` stage exists only here, added by this
#        slice to close the `-` operand. So half of this residual is inherited and half
#        is newly created, and only the inherited half is waiting on the others.
#        Unlike `grep -P`, whose ability to match is proved by the self-test above,
#        `sed -z` has no self-test, and it is GNU-only. Neither point bites on
#        `ubuntu-latest` (GNU sed is present). On a STOCK BSD or macOS toolchain the
#        run fails closed earlier at the `grep -qP` self-test, but do not read that as
#        general cover: with GNU grep on PATH and BSD sed (the documented Homebrew
#        `gnubin` setup), the self-test PASSES, `sed -z` is then rejected, and the gate
#        prints OK over a live character. Measured. That is a real invocation site,
#        since `pnpm check:no-emdash` and the meta-repo `verify.sh` ladder both run
#        this locally. The shared fix is to bind the stderr capture to the whole
#        pipeline, or to self-test `sed -z` the way `grep -P` is self-tested.
#   (iv) The scan reads file CONTENTS only, never file NAMES. A tracked path that
#        itself carries an em dash (`notes<U+2014>draft.md`) passes green as long as
#        its contents are clean. Measured, not assumed. A filename is a cosyte surface
#        and the ban says "ever", so this is a real gap rather than a scoping choice,
#        but closing it widens what every copy of this gate covers and so belongs in
#        the same cross-repo pass as (i) to (iii), not in this one repo.
#
#   Also worth knowing: GNU grep 3.8 classifies a file as binary on ANY encoding
#   error, not only on a NUL byte. See the KNOWN LIMIT note further down for what
#   that means for a fixture deliberately encoded in a legacy charset.
# ---------------------------------------------------------------------------
set -euo pipefail

# LOCALE PIN, load-bearing. `grep -P` compiles `\x{NNNN}` as a Unicode codepoint only
# in PCRE's UTF-8 mode, which GNU grep enables from the locale. Under LC_CTYPE=POSIX
# (a bare container, cron, `sh -c`, any shell that inherits no locale) GNU grep 3.8
# instead ABORTS with "character code point value in \x{} or \o{} is too large".
# An earlier version of this gate discarded that on stderr and `|| true`d the
# pipeline, so it printed OK having scanned nothing. Do not remove the pin, and do
# not restore the stderr redirect.
#
# The pin cannot be traded for a raw-byte pattern: `\xe2\x80\x94` matches the em dash
# under POSIX but NOT under a UTF-8 locale, where PCRE reads it as three characters.
# One pattern cannot cover both, so the locale is fixed and the pattern follows it.
export LC_ALL=C.UTF-8

# Matches U+2014 as the literal character and as its encodings: %E2%80%94 (URL),
# the JS backslash-u escape, and the &mdash; / &#8212; / &#x2014; HTML entities.
# See residual (ii) above for exactly which near-misses this does NOT catch.
PATTERN='\x{2014}|%E2%80%94|\\u2014|&mdash;|&#8212;|&#x2014;'

# SELF-TEST: prove the scanner can still see what it is meant to catch before any
# clean result is believed. `printf` emits U+2014 as its UTF-8 bytes, so this file
# still never contains the literal character.
if ! printf 'a\xe2\x80\x94b\n' | grep -qP "$PATTERN"; then
  echo "ERROR: check-no-emdash - the scanner cannot match a known em dash." >&2
  echo "       grep -P is unavailable or not in UTF-8 mode (LC_ALL=${LC_ALL})." >&2
  echo "       Refusing to report a clean tree on a scanner that cannot see." >&2
  exit 1
fi

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - em dash (U+2014, or an encoded form) found in ${what}." >&2
  echo "       cosyte never uses em dashes (founder directive; 06-brand/voice-and-tone.md)." >&2
  echo "       Rewrite with a period, colon, comma, or parentheses." >&2
  exit 1
}

# Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Both modes route grep's stderr
# here and refuse to continue if it is non-empty, because exit status cannot carry
# that signal: grep exits 1 on "no match", which xargs in turn reports as 123, so
# "clean" and "died part way through the batch" are indistinguishable by code.
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - the scan reported errors, so it did not read all of" >&2
  echo "       its input. Refusing to report green from an incomplete scan." >&2
  exit 1
}

# ---- stdin mode: text that is not a file (commit messages, PR title and body) ----
if [ "${1:-}" = "--stdin" ]; then
  LABEL="${2:-stdin}"
  HITS=$(grep -nP -e "$PATTERN" - 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  [ -n "$HITS" ] && fail_with_hits "$LABEL" "$HITS"
  echo "check-no-emdash: OK (no em dashes in ${LABEL})"
  exit 0
fi

# ---- default mode: every tracked file ----
#
# `git ls-files` is relative to the working directory, so from a subdirectory it
# lists a subtree and the scan would report OK having skipped the rest of the repo.
# Anchor at the top level, which also keeps the self-exclusion path below correct.
cd "$(git rev-parse --show-toplevel)"

# The choices below each close a route by which the scan could report green without
# having actually read its input, because a gate that prints OK when it did not read
# its input is worse than no gate at all. Each was checked RED in this repo, with a
# seeded fixture per route, before the port landed.
#
# This list is NOT a claim of exhaustiveness, and an earlier draft of this comment
# wrongly read as one. A refuter pass found a route the draft's own wording implied
# was closed (the `-` operand, below). Treat it as the routes that are known and
# closed, not as proof that no other exists.
#
#   -0 -r on xargs, fed by `git ls-files -z`: -r drops the grep invocation entirely
#   when the file list is empty (without it, grep falls back to reading stdin and
#   prints OK), and the NUL separator is what makes the list verbatim. Unseparated,
#   `git ls-files` C-quotes any path holding a space, a quote, or a non-ASCII byte,
#   and grep is then handed a name no file has. This repo's fixture tree is ASCII
#   today, but a C-quoted path is one `git add` away.
#
#   the file list is built as its own command, not as the head of the pipeline, so a
#   `git ls-files` that fails (an unreadable or corrupt index) stops the run. Piped,
#   its status is erased by the `|| true` the no-match case needs, and the scan would
#   report OK over an empty list. An empty list is refused for the same reason.
#
#   -e before the pattern and -- after the file list, so neither a pattern nor a
#   tracked filename that starts with a dash is read as a grep option. A file named
#   `-q` would otherwise silence the whole batch and the gate would print OK.
#
#   `sed -z 's|^|./|'` prefixes every path, which is what actually closes the dash
#   family. `--` alone does NOT: it stops `-` being parsed as an OPTION, but grep then
#   reads the bare operand `-` as STANDARD INPUT, and xargs points its child's stdin at
#   /dev/null. A tracked file literally named `-` (a `cmd > -` typo, which `git add -A`
#   stages without complaint) was therefore never opened, and the gate printed OK and
#   exited 0 over a live em dash. Measured, not theorised: it is why this line exists.
#   The prefix is applied AFTER the self-exclusion filter below, so that filter still
#   compares against the plain repo-relative path.
#
#   -H so every hit carries its filename. grep omits the name when it is handed exactly
#   one file, which an xargs batch boundary can produce, and an unattributable hit in a
#   red build is a worse report for no saving.
#
#   NO -d skip. It was in the shape this was ported from, and it is the one fail-OPEN
#   flag in the pipeline: with it, a tracked symlink to a directory is skipped silently
#   (no stderr, so refuse_if_incomplete never fires and the gate goes green). Without
#   it grep says "Is a directory" on stderr and the run goes red. git tracks no plain
#   directories, so dropping it costs nothing here and fails closed instead of open,
#   which is this script's stated posture. One caveat for whoever carries this back: a
#   tracked GITLINK (mode 160000, a submodule) also presents as a directory, so without
#   `-d skip` a repo with a submodule goes hard red. ncpdp has none, and neither does
#   knowledgebase, hl7, fhir, or pathways, so the carry-back is safe as written. A
#   consumer that does have one needs the gitlinks filtered out of the list, not
#   `-d skip` restored, which would reopen the symlink hole.
#
#   no -I: -I skips any file grep reads as binary, which includes a text file holding
#   invalid UTF-8, so an em dash inside one would be skipped silently. This repo is
#   TypeScript, markdown, JSON, YAML, one shell script, and NCPDP SCRIPT XML + Telecom
#   text fixtures, with no binaries at all (all 160 tracked files hold no NUL byte and
#   decode as UTF-8, measured 2026-07-27). Losing -I makes a future binary a loud false
#   positive (grep prints "Binary file X matches", the gate goes red, a human looks)
#   instead of a silent miss. Fail closed, not open.
#
#   KNOWN LIMIT, stated because ncpdp is a parser repo where it is plausible. The
#   pattern matches U+2014 as UTF-8 and as the five textual encodings listed with it. It
#   does NOT match an em dash encoded in some other charset, and a SCRIPT fixture with an
#   `encoding="ISO-8859-1"` XML declaration carrying CP1252 0x97, or a Telecom fixture in
#   a legacy codepage, is a plausible future artifact here. Measured, not assumed: such a
#   file scans clean and this gate stays GREEN. There is none today (all 160 tracked files
#   decode as UTF-8). The -I discussion above does not rescue it: GNU grep 3.8 DOES
#   classify such a file as binary (any encoding error is enough, a NUL is not required),
#   but it only surfaces that as the "binary file matches" diagnostic when the pattern
#   actually matches, and a pattern written in UTF-8 never matches a bare CP1252 0x97. So
#   nothing reaches refuse_if_incomplete and the run stays quiet. This is not a wholesale
#   skip of mixed-encoding files, though: a UTF-8 em dash on another line of the same file
#   is still caught normally, and that case DOES go red.
#   This is accepted rather than fixed: the ban is a rule about prose that people write,
#   and fixture bytes are grounded data, not brand copy. If a legacy-charset fixture ever
#   lands, a reviewer covers it, not this script. Do not widen the pattern to chase it,
#   and do not re-add -I.
#
#   stderr is captured and any of it fails the run (see refuse_if_incomplete above).
#
# The one file the scan does not cover is this script, which has to name the encodings
# it bans. Nothing checks the checker, so keep it free of the literal character: it
# matches by codepoint and by encoding and never spells one out.
git ls-files -z > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-emdash - no tracked files to scan. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

HITS=$(grep -zvxF 'scripts/check-no-emdash.sh' < "$FILELIST" |
  sed -z 's|^|./|' |
  xargs -0 -r grep -H -nP -e "$PATTERN" -- 2>>"$ERRLOG" || true)

refuse_if_incomplete

[ -n "$HITS" ] && fail_with_hits "the tracked files listed above" "$HITS"

echo "check-no-emdash: OK (no em dashes in the tracked files; this script is excluded)"
