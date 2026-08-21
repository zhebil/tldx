# Epoch baselines

Frozen snapshots of the champion, saved by the **step-9 drift audit** every
fifth wake (see the Phase B protocol in `docs/ralph-plan.md`).

Phase B keeps a hypothesis unless the judge says it is worse. That trades a
revert-everything failure mode for a slow-decay one, so the audit is the
ratchet: every fifth wake blind-A/Bs the *current* champion against the epoch
saved five wakes earlier. If the older snapshot wins more files than it loses,
the loop has drifted and the next wake bisects the ledger.

One directory per audit, `wake-NN/`:

- `reports/<corpus-file>.md` - `tools/layout-report.mts` output, deterministic.
- `pngs/<corpus-file>.png` - `tools/screenshot.mts` output, what tldraw drew.

Both are needed. The report describes what layout intended; the PNG shows what
was actually rendered, and where they disagree the PNG is the truth.

Reports are not comparable across a change to `layout-report.mts` itself. The
`wake-30` reports carry an `arrow paths crossing a non-endpoint shape` line that
wake 32 deleted from the tool; a plain `diff` against any later epoch shows all
six files as changed for that reason alone. Drop the line before comparing.

These directories are **write-once**. Never regenerate an old epoch - a
baseline you refresh is not a baseline. The current champion always lives in
`docs/layout-champion.md`; these are history.

| Epoch | Champion at the time | Audit result |
| --- | --- | --- |
| `wake-30` | B1 + B20 + B9 (wake-28 revision) | vacuous - epoch established, nothing to compare against |
| `wake-35` | B1 + B20 + B9 (unchanged - B27 kept at wake 31, reverted at wake 34) | no drift - all six files a structural tie, byte-identical PNGs |
