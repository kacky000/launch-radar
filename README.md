# launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kacky000/launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kacky000/launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Fathom** is a token launch radar. It reads one sealed DefiLlama snapshot of 758 protocols, finds the
ones that record no token, says what each would be worth if its record stayed as it is, and tells a
reader whether farming it pays once every fee and hour is counted.

- **Every protocol is accounted for.** `ledgerOf()` puts each of the 758 in exactly one of ten groups:
  193 are ranked (the 40 on the house watchlist, 134 below its floor, 19 above it), 119 already trade
  and become comparables, and the rest are set aside for a stated reason.
- **The value is fitted, then tested blind.** `implied value = launch value × launch odds`. Launch
  value is a size curve fitted on the snapshot's own traded tokens; a term is kept only if it lowers
  the miss both left-one-out and when older tokens price newer ones. Launch odds come from a logistic
  fit on TVL, years on record with no token and seven-day TVL growth, scored by five-fold Brier.
  Nothing names a protocol.
- **Every row has a costed farm plan.** `farmOf()` writes seven steps, each with a dollar cost and a
  time, picks the cheapest of the protocol's main chains, and nets the expected drop against fees to
  a verdict: farm, thin or skip.
- **The page proves it matches the board.** `dashboard/model.js` is the only copy of the model:
  `main.ts` runs it to write `board.json`, the page runs it again in the browser, and the two seals
  are compared on screen.

The implied values are this model's own claim, not a forecast that any token will be issued.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
# then open out/dashboard/index.html in a browser (no network needed)
```

Node.js 22.18 or later, standard library only. The view lives in the URL hash, for example
`index.html#p=vesu` opens one protocol and `index.html#tier=early&verdict=FARM` filters the board.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9ykrm1qx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
