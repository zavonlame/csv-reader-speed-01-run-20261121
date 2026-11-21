# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zavonlame/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zavonlame/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: a hand-written single-pass CSV parser that answers exactly like the reference on every case — including broken rows, stray CRs and unterminated quotes — at a fraction of its CPU time.

## How it stays fast

The reference reads one character at a time and grows every field a character at a time. This parser instead jumps between the characters that steer it: a line with no quote and no stray CR is one slice split on commas, a quoted field is one slice up to its closing quote found by a native search, and an unquoted field is cut out in slices around its delimiters. Nothing is built a character at a time, and nothing is allocated per field.

## How it stays exact

Every broken-row rule of csv-reader 1.0.0 is reproduced: the leading BOM is dropped, empty lines are no records, a lone CR outside quotes is dropped with a `stray_cr`, a quoted field turns `""` into one quote and every CR or CRLF inside it into one LF, junk after a closing quote is appended with a `quote_junk`, a quote that never closes is read as a literal with an `unterminated_quote`, and records are padded or cut to the first record's width with `short_row` / `long_row`. All six practice cases match the reference's expected answers exactly.

## Run it

```sh
MAKEFUN_INPUT_DIR=~/workspace/make-fun/kits/csv-reader-speed-01-run-20261121/csv-reader-speed-01-run-20261121-kit/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Verify it

Run it on the kit's practice set and compare every answer with the kit's
expected answers (`practice/reference/expected.json`, one `output` per case):
all six cases must match exactly, including every error object. Run it twice
into fresh output directories and the two `answers.json` files must be
byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ye09dzcs&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
