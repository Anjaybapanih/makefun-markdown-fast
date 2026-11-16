[![make.fun bounty](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/Anjaybapanih/makefun-markdown-fast/rank.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![reward](https://make.fun/Anjaybapanih/makefun-markdown-fast/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

# makefun-markdown-fast

A fast, dependency-free Markdown parser for the [make.fun](https://make.fun/bounty/markdown-render-speed-02) `markdown-render-speed-02` bounty.

`parse(markdown)` returns byte-identical HTML to marked 18.1.3 (GFM on) for the 720-case suite (680 CommonMark/GFM spec examples + 40 generated READMEs). `main.ts` is the driver: it reads `/input/cases.json` and writes `/output/html.json`.

## Design

- Fast paths per token class (ASCII alnum runs, whitespace runs, single punctuation) with a full fallback for anything exotic.
- Rules bucketed by first byte once at build time, then longest-match inside the small bucket — never O(tokens × rules) scanning.
- Index-based scanning (never re-slice the rest of the document), first-character dispatch, regexes compiled at import, `charCodeAt` scans in hot paths.
- Hand-written block parser (CommonMark + GFM tables, strikethrough, task lists, extended autolinks) and inline parser (emphasis with the odd-match rule, links/references, code spans, entities).

## Usage

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
