// Fathom, a token launch radar: the model, whole. This one file runs twice. main.ts requires it in
// Node to write board.json; index.html loads it to refit the same snapshot in the browser, and the
// page then checks its own ranks against the seal main.ts wrote (sealOf). Nothing here names a
// protocol: every number comes from the snapshot's ten fields.
//
//   implied value = launchValue x launchOdds
//   launchValue   what a token of this size and sector trades at: a curve fitted by fitValue on the
//                 snapshot's own traded tokens (compsOf), each term kept only if chooseTerms sees it
//                 lower the miss both left-one-out and walk-forward
//   launchOdds    the share of like protocols that record a token, from TVL, years on record with
//                 no token and seven-day TVL growth: fitOdds, scored blind by brierOf
//   farm plan     farmOf: seven steps, each with a dollar cost and a time, netted to a verdict
(function (root) {
  'use strict';

  var DAY = 864e5;
  // What the reader may change on the page: the deposit, the share of supply dropped to users,
  // and the hourly wage a plan must beat to be called FARM.
  var PARAMS = { ticket: 5000, share: 0.07, wage: 25 };
  var SHRINK = 8; // a sector's effect is its mean residual shrunk as if 8 more tokens sat at zero

  // ---- the ledger: every snapshot protocol lands in exactly one group --------------------------
  var GROUPS = [
    ['watch', 'Ranked: watchlist', 'none on record, on the house list'],
    ['early', 'Ranked: early', 'none on record, below the floor'],
    ['offlist', 'Ranked: off-list', 'none on record, above the floor'],
    ['comp', 'Token trades', 'has a cap: fitted on, never ranked'],
    ['token', 'Token on record', 'a ticker on record, but no cap'],
    ['kin', 'Kin of a token', 'name stem of a token on record'],
    ['bridge', 'Bridge', 'carries other tokens across'],
    ['lst', 'Liquid staking', 'staked form of a traded token'],
    ['cex', 'Exchange custody', 'an exchange balance sheet'],
    ['version', 'Versioned or wrapped', 'a release or wrapped product']
  ];
  var RANKED = { watch: 1, early: 1, offlist: 1 };
  var SET_ASIDE = { 'Bridge': 'bridge', 'Canonical Bridge': 'bridge', 'Liquid Staking': 'lst', 'Liquid Restaking': 'lst', 'Restaked BTC': 'lst' };
  var VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
  var WRAPPED = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

  function isPreToken(p) { return p.mcap_usd == null && p.gecko_id == null && p.symbol == null; }
  function stemOf(name) { return String(name).toLowerCase().split(/[^a-z0-9]+/)[0]; }

  function ledgerOf(p, ctx) {
    if (ctx.watch[p.slug]) return 'watch';
    if (p.category === 'CEX') return 'cex';
    if (!isPreToken(p)) return p.mcap_usd > 0 ? 'comp' : 'token';
    if (SET_ASIDE[p.category]) return SET_ASIDE[p.category];
    if (VERSIONED.test(p.name) || WRAPPED.test(p.name) || EXCHANGE.test(p.name)) return 'version';
    if (ctx.stems[stemOf(p.name)]) return 'kin';
    return p.tvl_usd >= ctx.floor ? 'offlist' : 'early';
  }

  // ---- sectors: DefiLlama's fifty categories folded into seven farm plays ----------------------
  var SECTORS = [
    ['stake', 'Staking', /stak/i],
    ['bridge', 'Bridges', /bridge/i],
    ['credit', 'Lending and credit', /lend|cdp|collateral/i],
    ['rwa', 'RWA and dollars', /rwa|basis|stable|cedefi|btc|reserve/i],
    ['vault', 'Curated vaults', /curator|allocator|yield|farm|index|liquidity manager|vault/i],
    ['trade', 'Trading venues', /dex|deriv|prediction|option|otc|synth|nft|launchpad/i],
    ['infra', 'Networks and other', /^/]
  ];
  function sectorOf(category) {
    for (var i = 0; i < SECTORS.length; i++) if (SECTORS[i][2].test(category || '')) return SECTORS[i][0];
    return 'infra';
  }
  function sectorName(key) {
    for (var i = 0; i < SECTORS.length; i++) if (SECTORS[i][0] === key) return SECTORS[i][1];
    return key;
  }

  // ---- small statistics ---------------------------------------------------------------------------
  function num(a, b) { return a - b; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function quant(values, q) {
    var s = values.slice().sort(num), at = (s.length - 1) * q, i = Math.floor(at);
    return s.length ? s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (at - i) : 0;
  }
  function median(values) { return quant(values, 0.5); }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  /** Gaussian elimination with partial pivoting: x of A x = b. */
  function solve(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.concat(b[i]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var best = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[best][i])) best = j;
      var swap = M[i]; M[i] = M[best]; M[best] = swap;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  /** Least squares by the normal equations, with a whisper of ridge so a thin fold never fails. */
  function ols(X, y) {
    var k = X[0].length, A = [], b = [], i, j;
    for (i = 0; i < k; i++) { A.push(new Array(k).fill(0)); A[i][i] = 1e-9; b.push(0); }
    X.forEach(function (x, r) {
      for (i = 0; i < k; i++) { b[i] += x[i] * y[r]; for (j = 0; j < k; j++) A[i][j] += x[i] * x[j]; }
    });
    return solve(A, b);
  }

  // ---- one protocol or token as the model sees it -------------------------------------------------
  function ageDays(asOf, listed) { return listed ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(listed)) / DAY)) : null; }

  /**
   * The model's inputs: log TVL, years on record (the median when undated) and 7-day growth as a
   * log ratio held to a third either way, so one week's stampede cannot carry a fit.
   */
  function point(o, tvl, change, category, listed, ctx) {
    o.tvl = tvl; o.change = change; o.category = category; o.listed = listed || null;
    o.age = ageDays(ctx.asOf, listed);
    o.lt = Math.log10(Math.max(tvl, 1));
    o.a = Math.min(6, (o.age == null ? ctx.medianAge : o.age) / 365);
    o.g = clamp(Math.log10(1 + Math.max(-90, change == null ? 0 : change) / 100), -0.125, 0.125);
    o.sector = sectorOf(category);
    return o;
  }

  /** The comparables: one row per traded token, its protocols' TVL summed, exchanges left out. */
  function compsOf(protocols, ctx) {
    var family = {};
    protocols.forEach(function (p) { if (p.gecko_id && p.category !== 'CEX') (family[p.gecko_id] = family[p.gecko_id] || []).push(p); });
    return Object.keys(family).sort().map(function (id) {
      var m = family[id].slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; }), cap = 0, tvl = 0, listed = null;
      m.forEach(function (p) {
        cap = Math.max(cap, p.mcap_usd || 0); tvl += p.tvl_usd;
        if (p.listed_at && (!listed || p.listed_at < listed)) listed = p.listed_at;
      });
      return point({ id: id, name: m[0].name, symbol: m[0].symbol, members: m.length, cap: cap, y: Math.log10(Math.max(cap, 1)) }, tvl, m[0].change_7d, m[0].category, listed, ctx);
    }).filter(function (c) { return c.cap > 0; });
  }

  // ---- launch value: log10(cap) on the traded tokens ----------------------------------------------
  function design(r, t) {
    var x = [1];
    if (t.size) x.push(r.lt - 8);
    if (t.growth) x.push(r.g);
    if (t.age) x.push(r.a);
    return x;
  }
  /** With no size term the model is one cap/TVL multiple: the prediction starts from log TVL. */
  function anchor(r, t) { return t.size ? 0 : r.lt; }

  function fitValue(rows, t) {
    var b = ols(rows.map(function (r) { return design(r, t); }), rows.map(function (r) { return r.y - anchor(r, t); }));
    var fit = { t: t, b: b, eff: {} };
    if (t.sector) {
      var sum = {}, n = {};
      rows.forEach(function (r) { sum[r.sector] = (sum[r.sector] || 0) + r.y - valueAt(fit, r); n[r.sector] = (n[r.sector] || 0) + 1; });
      Object.keys(sum).forEach(function (s) { fit.eff[s] = sum[s] / (n[s] + SHRINK); });
    }
    return fit;
  }
  function valueAt(fit, r) { return anchor(r, fit.t) + dot(fit.b, design(r, fit.t)) + (fit.eff[r.sector] || 0); }

  /** Each token priced by a fit that never saw it. */
  function leaveOneOut(rows, t) {
    return rows.map(function (r, i) { return r.y - valueAt(fitValue(rows.filter(function (_, j) { return j !== i; }), t), r); });
  }
  /** The older 60% of dated tokens price the newer 40%: the direction a radar is used in. */
  function walkForward(rows, t) {
    var dated = rows.filter(function (r) { return r.listed; }).sort(function (a, b) { return a.listed < b.listed ? -1 : a.listed > b.listed ? 1 : a.id < b.id ? -1 : 1; });
    var cut = Math.round(dated.length * 0.6), fit = fitValue(dated.slice(0, cut), t);
    return dated.slice(cut).map(function (r) { return r.y - valueAt(fit, r); });
  }
  /** The typical miss as a multiple: x2 means half the tokens were priced within half or double. */
  function missOf(errors) { return Math.pow(10, median(errors.map(Math.abs))); }

  var TERMS = [
    ['flat', 'one cap/TVL multiple'],
    ['size', '+ size curve, cap ~ TVL^b'],
    ['sector', '+ sector effect, shrunk'],
    ['growth', '+ 7-day TVL growth'],
    ['age', '+ years on record']
  ];
  /** Forward selection with two juries: a term stays only if both held-out misses fall. */
  function chooseTerms(rows) {
    var kept = {}, best = null, steps = [];
    TERMS.forEach(function (term) {
      var t = Object.assign({}, kept);
      if (term[0] !== 'flat') t[term[0]] = 1;
      var loo = missOf(leaveOneOut(rows, t)), wf = missOf(walkForward(rows, t));
      var keep = !best || (loo < best[0] && wf < best[1]);
      if (keep) { kept = t; best = [loo, wf]; }
      steps.push({ key: term[0], label: term[1], loo: loo, wf: wf, kept: keep });
    });
    return { terms: kept, steps: steps };
  }

  // ---- launch odds: which like protocols record a token -------------------------------------------
  var ODDS_TERMS = ['base rate', 'TVL', 'years on record', '7-day growth'];
  function oddsX(r, drop) {
    var x = [1, r.lt - 8, r.a, r.g * 8]; // growth runs from -1 to 1
    if (drop) x[drop] = 0;
    return x;
  }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  /** Logistic regression by Newton's method; `drop` zeroes one input for the drop-one test. */
  function fitOdds(rows, drop) {
    var w = [0, 0, 0, 0], k = 4, i, j;
    for (var it = 0; it < 30; it++) {
      var H = [], g = [];
      for (i = 0; i < k; i++) { H.push(new Array(k).fill(0)); H[i][i] = 1e-3; g.push(-1e-3 * w[i]); }
      rows.forEach(function (r) {
        var x = oddsX(r, drop), p = sigmoid(dot(w, x)), v = p * (1 - p);
        for (i = 0; i < k; i++) { g[i] += (r.token - p) * x[i]; for (j = 0; j < k; j++) H[i][j] += v * x[i] * x[j]; }
      });
      var step = solve(H, g);
      for (i = 0; i < k; i++) w[i] += step[i];
    }
    return w;
  }
  function oddsAt(w, r, drop) { return clamp(sigmoid(dot(w, oddsX(r, drop))), 0.03, 0.97); }

  /** Five-fold Brier score: every protocol's odds come from a fit on the other four folds. */
  function brierOf(rows, drop) {
    var sum = 0, base = 0;
    for (var fold = 0; fold < 5; fold++) {
      var train = rows.filter(function (_, i) { return i % 5 !== fold; }), w = fitOdds(train, drop);
      var rate = train.reduce(function (s, r) { return s + r.token; }, 0) / train.length;
      rows.forEach(function (r, i) {
        if (i % 5 !== fold) return;
        sum += Math.pow(oddsAt(w, r, drop) - r.token, 2); base += Math.pow(rate - r.token, 2);
      });
    }
    return { model: sum / rows.length, base: base / rows.length };
  }

  // ---- the farm plan ------------------------------------------------------------------------------
  // Gas per transaction in dollars: planning figures, since the snapshot carries no fee data.
  var GAS = { Ethereum: 3.5, Bitcoin: 1.5, Tron: 1, Binance: 0.1, Solana: 0.01 };
  function gasOf(chain) { return GAS[chain] == null ? 0.05 : GAS[chain]; }
  /** The cheapest of a protocol's three largest chains: where a small farmer should stand. */
  function cheapChain(chains) {
    var best = chains[0] || 'its main chain';
    chains.slice(0, 3).forEach(function (c) { if (gasOf(c) < gasOf(best)) best = c; });
    return best;
  }
  // tx: transactions in the second step; wtx: transactions a week; bps: entry cost; mins: minutes a week.
  var PLAYS = {
    vault: { name: 'Curated vault', tx: 1, wtx: 1, bps: 5, mins: 10,
      open: 'Deposit {D} of USDC into the largest {N} vault on {C} and keep the vault shares in the wallet',
      more: 'Move a quarter of the shares into a second {N} vault, so the wallet shows two positions',
      weekly: 'add $20 or roll the accrued yield back in' },
    credit: { name: 'Supply and borrow', tx: 3, wtx: 1, bps: 10, mins: 15,
      open: 'Supply {D} of USDC or the main asset of {C} to {N}',
      more: 'Borrow 20% against it, keeping the health factor above 2.5, and supply the loan back',
      weekly: 'repay and redraw a tenth of the loan so both sides of the book stay active' },
    trade: { name: 'Liquidity and volume', tx: 5, wtx: 2, bps: 30, mins: 20,
      open: 'Put half of {D} into the deepest pool or market of {N} on {C}',
      more: 'Trade the other half through it in four round trips of equal size',
      weekly: 'make one more round trip and re-centre the liquidity' },
    rwa: { name: 'Mint and hold', tx: 1, wtx: 0.25, bps: 10, mins: 5,
      open: 'Mint or buy {D} of the yield-bearing asset of {N} on {C}, after its allowlist form if it asks for one',
      more: 'Place half of it in the partner pool or vault that {N} lists',
      weekly: 'check the peg and the redemption queue, and transact once a month' },
    stake: { name: 'Stake and delegate', tx: 2, wtx: 0.5, bps: 5, mins: 5,
      open: 'Stake {D} of the staking asset of {C} through {N}',
      more: 'Split the stake across two operators or pools, so one outage cannot idle it all',
      weekly: 'compound the staking reward every second week' },
    bridge: { name: 'Bridge route', tx: 2, wtx: 2, bps: 15, mins: 15,
      open: 'Send {D} of USDC through {N} to {C}',
      more: 'Send it back a day later by a second route {N} supports',
      weekly: 'repeat one round trip on a different weekday' },
    infra: { name: 'Use the network', tx: 3, wtx: 2, bps: 10, mins: 15,
      open: 'Move {D} onto {C} and make a first payment, transfer or deposit with {N}',
      more: 'Use a second feature of {N}, a channel, a pool or a delegation, with half of it',
      weekly: 'make two ordinary transactions so the wallet stays in use' }
  };

  function usd(n) {
    var a = Math.abs(n), s = n < 0 ? '-$' : '$';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e4) return s + Math.round(a / 1e3) + 'K';
    return s + Math.round(a).toLocaleString('en-US');
  }
  function usd2(n) { return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }
  function ageText(days) { return days == null ? 'an undated spell' : days >= 365 ? (days / 365).toFixed(1) + ' years' : days + ' days'; }

  /**
   * One row's farm plan at a deposit: the steps, what each costs and how long it takes, the
   * expected drop (the row's implied value x the share dropped x the deposit's share of TVL) and
   * the verdict net of every fee.
   */
  function farmOf(r, q) {
    q = q || PARAMS;
    var play = PLAYS[r.sector], chain = cheapChain(r.chains), gas = gasOf(chain), D = q.ticket;
    // A young protocol gets a longer hold: its peers took longer to record a token.
    var weeks = r.age_days == null ? 12 : r.age_days < 183 ? 16 : r.age_days < 548 ? 12 : 8;
    var weekly = gas * play.wtx * weeks, entry = D * play.bps / 1e4;
    var fees = gas * (5 + play.tx) + weekly + entry, hours = (75 + play.mins * weeks) / 60;
    var yieldRate = r.implied_value_usd * q.share / r.tvl_usd;
    var drop = yieldRate * D, net = drop - fees, perHour = net / hours;
    // The plan's own exit rule (step 5) applied on day zero: money already leaving is a skip.
    var fleeing = r.change_7d != null && r.change_7d <= -30;
    var verdict = fleeing || net <= 0 ? 'SKIP' : perHour >= q.wage ? 'FARM' : 'THIN';
    var even = yieldRate > play.bps / 1e4 ? (fees - entry) / (yieldRate - play.bps / 1e4) : null;
    function say(text) { return text.replace('{D}', usd(D)).replace(/\{N\}/g, r.name).replace('{C}', chain); }
    var call = verdict === 'FARM' ? 'farm it' : verdict === 'THIN' ? 'thin: farm it only beside something else' :
      fleeing ? 'skip: TVL fell ' + Math.round(-r.change_7d) + '% this week, which already trips the exit rule of step 5' :
      'skip at this size' + (even ? ', it breaks even near ' + usd(even) : '');
    var steps = [
      { text: 'Fund a wallet used for nothing else with ' + usd(D) + ' of USDC and ' + usd2(Math.ceil(fees - entry) + 1) + ' of ' + chain + ' gas, coming in over the chain\'s own bridge if the money starts elsewhere.',
        cost: usd2(gas) + ' gas', time: '20 min' },
      { text: say(play.open) + '.', cost: usd2(gas * 2 + entry) + ' (2 transactions and ' + play.bps + ' bps of entry cost)', time: '15 min' },
      { text: say(play.more) + '.', cost: usd2(gas * play.tx) + ' gas', time: '10 min' },
      { text: 'Each week for ' + weeks + ' weeks, ' + play.weekly + '. ' + r.name + ' has run ' + ageText(r.age_days) + ' with no token on record, and use spread over ' + weeks + ' weekly snapshots is what a later drop can count.',
        cost: usd2(weekly) + ' gas in all', time: play.mins + ' min a week' },
      { text: 'At week ' + weeks / 2 + ' re-read the record: leave early if TVL is under ' + usd(r.tvl_usd * 0.7) + ', 30% below the ' + usd(r.tvl_usd) + ' of this snapshot, or if a ticker appears on its DefiLlama page, because the value here is a pre-token value.',
        cost: '$0.00', time: '10 min' },
      { text: 'After week ' + weeks + ' withdraw to the same wallet and leave it untouched. Claim only through the link the app of ' + r.name + ' itself publishes, and never pay to claim.',
        cost: usd2(gas * 2) + ' gas', time: '15 min' },
      { text: 'Budget check: ' + usd2(fees) + ' of fees and ' + hours.toFixed(1) + ' hours against an expected drop of ' + usd2(drop) + ' (' + Math.round(q.share * 100) + '% of ' + usd(r.implied_value_usd) + ' to depositors, pro rata to ' + usd(D) + ' of ' + usd(r.tvl_usd) + ' TVL) nets ' + usd2(net) + ', ' + usd2(perHour) + ' an hour: ' + call + '.',
        cost: 'nothing more', time: '5 min' }
    ];
    return { play: play.name, chain: chain, gas: gas, deposit: D, weeks: weeks, fees: fees, hours: hours, drop: drop, net: net, perHour: perHour, verdict: verdict, even: even, steps: steps };
  }
  /** A step as board.json carries it: the action, then its cost and its time. */
  function stepText(s) { return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; }

  // ---- the board ----------------------------------------------------------------------------------
  /** FNV-1a over rank, slug and value: the page proves its refit equals board.json with it. */
  function sealOf(rows) {
    var h = 0x811c9dc5, text = rows.map(function (r) { return r.rank + '|' + r.slug + '|' + r.implied_value_usd; }).join('\n');
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /** Snapshot in, everything out: ledger, comparables, both fits, their tests and the ranked rows. */
  function build(snap) {
    var P = snap.protocols, ctx = { asOf: snap.as_of, floor: snap.floor_usd, watch: {}, stems: {}, medianAge: 0 };
    snap.watchlist.forEach(function (s) { ctx.watch[s] = 1; });
    P.forEach(function (p) {
      var stem = stemOf(p.name);
      if (!isPreToken(p) && p.category !== 'CEX' && stem.length > 3) ctx.stems[stem] = 1;
    });
    ctx.medianAge = median(P.filter(function (p) { return p.listed_at; }).map(function (p) { return ageDays(ctx.asOf, p.listed_at); }));

    var counts = {};
    var items = P.map(function (p) {
      var o = point({ p: p, group: ledgerOf(p, ctx) }, p.tvl_usd, p.change_7d, p.category, p.listed_at, ctx);
      counts[o.group] = (counts[o.group] || 0) + 1;
      return o;
    });

    var comps = compsOf(P, ctx), choice = chooseTerms(comps), fit = fitValue(comps, choice.terms);
    var loo = leaveOneOut(comps, choice.terms), wf = walkForward(comps, choice.terms);
    comps.forEach(function (c, i) { c.model = c.cap / Math.pow(10, loo[i]); c.miss = Math.pow(10, Math.abs(loo[i])); });
    var band = [quant(loo, 0.25), quant(loo, 0.75)];
    function inside(errors) { return errors.filter(function (e) { return e >= band[0] && e <= band[1]; }).length / errors.length; }

    // Like with like: dated protocols that are neither an exchange nor a bridged or staked product.
    var peers = items.filter(function (o) { return o.listed && (RANKED[o.group] || o.group === 'kin' || o.group === 'comp' || o.group === 'token') && !SET_ASIDE[o.category]; });
    peers.forEach(function (o) { o.token = RANKED[o.group] || o.group === 'kin' ? 0 : 1; });
    var w = fitOdds(peers), full = brierOf(peers);
    var oddsTest = ODDS_TERMS.map(function (label, i) { return { label: label, w: w[i], without: i ? brierOf(peers, i).model : full.base }; });

    var rows = items.filter(function (o) { return RANKED[o.group]; }).map(function (o) {
      var launch = Math.pow(10, valueAt(fit, o)), odds = oddsAt(w, o);
      var implied = Math.max(1000, Math.round(launch * odds / 1000) * 1000);
      return {
        rank: 0, slug: o.p.slug, name: o.p.name, category: o.category, sector: o.sector, chains: o.p.chains, tier: o.group,
        tvl_usd: o.tvl, change_7d: o.change, listed_at: o.listed, age_days: o.age,
        launch_usd: Math.round(launch), odds: odds, implied_value_usd: implied,
        low_usd: Math.round(implied * Math.pow(10, band[0])), high_usd: Math.round(implied * Math.pow(10, band[1])),
        lt: o.lt, g: o.g, a: o.a, sector_mult: Math.pow(10, fit.eff[o.sector] || 0)
      };
    }).sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; });

    return {
      as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd, total: P.length, watchlist: snap.watchlist.length,
      counts: counts, items: items, comps: comps, fit: fit, steps: choice.steps, band: band,
      tests: { loo: missOf(loo), wf: missOf(wf), flatLoo: choice.steps[0].loo, flatWf: choice.steps[0].wf, holdLoo: inside(loo), holdWf: inside(wf), dated: wf.length },
      odds: { w: w, brier: full.model, base: full.base, peers: peers.length, tokens: peers.filter(function (o) { return o.token; }).length, terms: oddsTest },
      rows: rows, seal: { rows: rows.length, total: rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0), hash: sealOf(rows) }
    };
  }

  /** board.json's rows: the gate's five fields first, then the figures each value came from. */
  function boardRows(model, q) {
    return model.rows.map(function (r) {
      var farm = farmOf(r, q);
      return {
        rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied_value_usd, farm_steps: farm.steps.map(stepText),
        token_status: 'no token on record', tier: r.tier, category: r.category, sector: r.sector, chains: r.chains,
        tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at, no_token_days: r.age_days,
        launch_value_usd: r.launch_usd, launch_odds: Math.round(r.odds * 1e4) / 1e4, low_usd: r.low_usd, high_usd: r.high_usd,
        farm: { play: farm.play, chain: farm.chain, deposit_usd: farm.deposit, weeks: farm.weeks, fees_usd: Math.round(farm.fees * 100) / 100, hours: Math.round(farm.hours * 10) / 10, expected_drop_usd: Math.round(farm.drop * 100) / 100, net_usd: Math.round(farm.net * 100) / 100, verdict: farm.verdict }
      };
    });
  }

  var api = {
    PARAMS: PARAMS, GROUPS: GROUPS, SECTORS: SECTORS, RANKED: RANKED, PLAYS: PLAYS, build: build, boardRows: boardRows, farmOf: farmOf,
    sealOf: sealOf, sectorName: sectorName, gasOf: gasOf, usd: usd, usd2: usd2, ageText: ageText, stepText: stepText, valueAt: valueAt, median: median
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarModel = api;
})(typeof globalThis === 'object' ? globalThis : this);
