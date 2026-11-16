[![make.fun bounty](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/Anjaybapanih/makefun-markdown-fast/rank.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![reward](https://make.fun/Anjaybapanih/makefun-markdown-fast/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

# makefun-markdown-fast

A fast, dependency-free Markdown parser for the [make.fun](https://make.fun/bounty/markdown-render-speed-02) `markdown-render-speed-02` bounty.

`parse(markdown)` returns byte-identical HTML to marked 18.1.3 (GFM on) for the 720-case suite (680 CommonMark/GFM spec examples + 40 generated READMEs). `main.ts` is the driver: it reads `/input/cases.json` and writes `/output/html.json`.

**Round 3 status (2026-11-16): 720/720 on the practice set** — all 680 spec cases and all 40 docs pass, byte-identical to marked 18.1.3 (GFM on). Speed is inside the rank-15 bar (local full-driver wall ~1.6–1.9s vs marked ~1.6–1.7s on the same driver; in-process `parse()` CPU ~0.5s).

## Design

- Fast paths per token class (ASCII alnum runs, whitespace runs, single punctuation) with a full fallback for anything exotic.
- Rules bucketed by first byte once at build time, then longest-match inside the small bucket — never O(tokens × rules) scanning.
- Index-based scanning (never re-slice the rest of the document), first-character dispatch, regexes compiled at import, `charCodeAt` scans in hot paths.
- Hand-written block parser (CommonMark + GFM tables, strikethrough, task lists, extended autolinks) and inline parser (emphasis with the odd-match rule, links/references, code spans, entities).

## Round 3 fixes (parity, not speed)

- Bare container-marker lines (`>` between two `> >` blocks) now close the inner container they fail to match, so nested blockquotes split instead of swallowing the next block (doc-06, doc-14, doc-33).
- `tryBlockquote` honours a partially consumed tab from an enclosing list item, so a tab-indented `>` inside an item starts a blockquote (doc-25).
- A bare `>` line between two list items in a blockquote makes the list loose (doc-15, doc-22; cm-320 stays tight because its `>` sits inside a nested quote).
- An HTML block that is the last child of a blockquote or list item renders without its trailing newline (doc-30).
- Extended autolinks (and emails) inside a link label are suppressed only when an enclosing bracket will actually form a link; when every enclosing bracket fails the autolink forms (doc-39).
- A code span opener inside a link label must not swallow the label's `]` when the bracket will form a link — the backticks stay literal so the link forms (doc-28, doc-09; the unconditional scope limits that regressed cm-links/doc-36 are not used).
- `findBracketClose` treats backtick runs at/after the run being decided as literal, and runs already blocked as literal too — otherwise a blocked `` `` `` in the label was read as a span opener whose closer sits past the `]`, so the `]` was skipped and the next `` ` `` formed a span with a later line (doc-09).
- A backtick run blocked inside a forming link's label pairs with a later same-length run (the "phantom" code span): emphasis delimiters lying strictly between the two, outside any link label, stay literal in marked — the phantom span extends to the LAST same-length run in the paragraph, not the first (doc-28, doc-09; the `*fast*` inside `[default run*fast*]` still forms because it sits inside a label, doc-35).
- Inside a link label, an emphasis span that encloses a "bad" code span (content contains a backtick, e.g. `` `` a ` b `` ``) does not form in marked, while the same emphasis outside a label does (doc-16, doc-20, doc-23).

## Usage

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
