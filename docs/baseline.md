# Layout baseline

Taken at commit `148e306` ("layout: containers pick one box size, from measured
glyph widths (T0)"), on branch `ralph/jsx-layout`. This is the first baseline
measured against correct box geometry - everything in `docs/layout-champion.md`
and `docs/layout-hypotheses.md` predates the box-sizing fix (`2484ffa`) and the
container box-sizing work (`148e306`), and describes geometry that no longer
exists.

Regenerate with:

```bash
for f in tests/corpus/*.tldsl.jsx; do
  n=$(basename "$f" .tldsl.jsx)
  npx tsx tools/screenshot.mts "$f" "docs/renders/$n.png"
  npx tsx tools/layout-report.mts "$f"
done
npx tsx tools/arrow-truth.mts tests/corpus/*.tldsl.jsx
```

Both tools are deterministic: two consecutive `arrow-truth` runs over the whole
corpus produced byte-identical output, vertices included.

## Per-file

`crossings` is `arrow paths crossing a non-endpoint shape` from
`tools/arrow-truth.mts` - one count per (arrow, crossed shape) pair. `canvas`
and `shapes` come from `tools/layout-report.mts`; `shapes` counts every
positioned element, of which `frames` are containers holding other elements.
`png` is the exported image at `pixelRatio` 2 with 32px padding.

| file | canvas | shapes | frames | arrows | crossings | png |
|---|---|---|---|---|---|---|
| deep-nesting | 594 x 790 | 13 | 4 | 8 | 9 | 1316 x 1708 |
| hexagonal | 1354 x 650 | 27 | 6 | 22 | 6 | 2836 x 1428 |
| long-labels | 2064 x 1066 | 12 | 0 | 8 | 5 | 4256 x 2260 |
| multi-region | 900 x 1222 | 21 | 5 | 14 | 6 | 1928 x 2572 |
| release-pipeline | 1350 x 978 | 17 | 0 | 20 | 5 | 2828 x 2084 |
| sequence | 361 x 1388 | 14 | 0 | 13 | 0 | 850 x 2904 |
| sparse-graph | 707 x 472 | 24 | 0 | 8 | 0 | 1542 x 1072 |
| wide-fanout | 1148 x 870 | 26 | 0 | 25 | 29 | 2424 x 1868 |
| **total** | | **154** | **15** | **118** | **60** | |

## Notes on the shape of the problem

- **60 crossings over 118 arrows.** Half of them (29) are in `wide-fanout`
  alone, where `Dispatcher` fans out to eighteen workers laid out in four rows;
  every chord from the dispatcher to a lower row passes through the rows above.
- `sequence` and `sparse-graph` are clean at zero. Both are single-axis layouts
  with only adjacent edges, so there is nothing for an arrow to skip over.
- The remaining five files sit at 5-9 each, a mix of same-axis skips inside one
  container and edges that leave their frame.
- **The renders are readable.** Labels no longer wrap mid-word anywhere in the
  corpus: `Gateway`, `Normalizer`, `Serializer`, `Dispatcher` and `Worker 18`
  all sit on one line inside their box. The remaining visual damage is arrows,
  not text.

T2 classifies these 60 into same-axis skip / cross-container / fan / other. The
per-file numbers above are what T3 through T5 must beat, and no file may gain a
crossing.

## Renders

One PNG per corpus file in `docs/renders/`, named after the fixture.
