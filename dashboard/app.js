// Fathom's page. It holds no numbers of its own: RadarModel.build (model.js) refits the sealed
// snapshot here, and everything drawn below is read from that result. The whole view lives in the
// URL hash (tab, filters, sort, deposit, open protocol), so any screen can be linked or captured.
(function () {
  'use strict';
  var M = window.RadarModel, IN = window.RADAR_INPUT, app = document.getElementById('app');
  var panel = document.getElementById('detail'), shade = document.getElementById('shade');
  if (!M || !IN) return;

  var model = M.build(IN.snapshot), fit = model.fit, usd = M.usd, usd2 = M.usd2;
  var sealed = IN.seal && IN.seal.hash === model.seal.hash && IN.seal.total === model.seal.total;
  var bySlug = {}, F = {};
  model.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var others = model.items.filter(function (o) { return !M.RANKED[o.group]; });
  var lo = Math.log10(Math.min.apply(null, model.rows.map(function (r) { return r.low_usd; })));
  var hi = Math.log10(Math.max.apply(null, model.rows.map(function (r) { return r.high_usd; })));

  var DEFAULTS = { tab: 'pre', tier: 'all', verdict: 'all', sector: 'all', chain: 'all', q: '', sort: '', dir: 1, ticket: 5000, share: 7, p: '' };
  var state = readHash();

  // ---- helpers ------------------------------------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(n) { return n == null ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function share(x) { return Math.round(x * 100) + '%'; }
  function times(x) { return '×' + x.toFixed(2); }
  function age(days) { return days == null ? 'undated' : days >= 365 ? (days / 365).toFixed(1) + ' y' : days + ' d'; }
  function signed(n) { return (n > 0 ? '+' : '') + usd2(n); }
  function params(ticket) { return { ticket: ticket || +state.ticket, share: state.share / 100, wage: M.PARAMS.wage }; }
  function chainsText(chains) { return esc(chains.slice(0, 2).join(', ')) + (chains.length > 2 ? ' +' + (chains.length - 2) : ''); }
  function groupOf(key) { return M.GROUPS.filter(function (g) { return g[0] === key; })[0]; }

  function readHash() {
    var s = Object.assign({}, DEFAULTS);
    location.hash.slice(1).split('&').forEach(function (pair) {
      var at = pair.indexOf('='), k = pair.slice(0, at);
      if (at > 0 && k in DEFAULTS) s[k] = decodeURIComponent(pair.slice(at + 1));
    });
    s.dir = +s.dir < 0 ? -1 : 1;
    return s;
  }
  function set(patch) {
    Object.assign(state, patch);
    var hash = Object.keys(DEFAULTS).filter(function (k) { return String(state[k]) !== String(DEFAULTS[k]); })
      .map(function (k) { return k + '=' + encodeURIComponent(state[k]); }).join('&');
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* a sandboxed frame: the view still changes */ }
    render();
  }

  // ---- the three tables ---------------------------------------------------------------------------
  // Each column: key, heading, sort value, cell. `text` columns sort A to Z first, the rest high to low.
  function tierTag(r) { return '<span class="tag ' + r.tier + '">' + (r.tier === 'watch' ? 'Watchlist' : r.tier === 'early' ? 'Early' : 'Off-list') + '</span>'; }
  function nameCell(r) {
    return '<b>' + esc(r.name) + '</b>' + tierTag(r) + '<small>' + esc(r.category || 'Uncategorised') + ' · ' + chainsText(r.chains) + '</small>';
  }
  function place(v) { return ((Math.log10(v) - lo) / (hi - lo) * 100).toFixed(1); }
  function rangeCell(r) {
    var a = +place(r.low_usd), b = +place(r.high_usd);
    return '<b>' + usd(r.implied_value_usd) + '</b> <small class="in">' + usd(r.low_usd) + ' to ' + usd(r.high_usd) + '</small>' +
      '<span class="rng"><i style="left:' + a + '%;width:' + (b - a).toFixed(1) + '%"></i><u style="left:' + place(r.implied_value_usd) + '%"></u></span>';
  }
  function verdictPill(v) { return '<span class="v ' + v.toLowerCase() + '">' + v + '</span>'; }

  var TABLES = {
    pre: { sort: 'rank', dir: 1, cols: [
      ['rank', '# · range', function (r) { return r.rank; }, function (r) { return '<b>' + r.rank + '</b><small>' + r.rank_lo + '–' + r.rank_hi + '</small>'; }, 'text'],
      ['name', 'Protocol', function (r) { return r.name.toLowerCase(); }, nameCell, 'text'],
      ['tvl', 'TVL', function (r) { return r.tvl_usd; }, function (r) { return usd(r.tvl_usd); }],
      ['d7', '7d TVL', function (r) { return r.change_7d == null ? -1e9 : r.change_7d; }, function (r) { return '<span class="' + (r.change_7d < 0 ? 'neg' : 'pos') + '">' + pct(r.change_7d) + '</span>'; }],
      ['age', 'No token for', function (r) { return r.age_days == null ? -1 : r.age_days; }, function (r) { return age(r.age_days); }],
      ['odds', 'Launch odds', function (r) { return r.odds; }, function (r) { return '<span class="meter"><i style="width:' + share(r.odds) + '"></i></span>' + share(r.odds); }],
      ['launch', 'If it launches', function (r) { return r.launch_usd; }, function (r) { return usd(r.launch_usd); }],
      ['implied', 'Implied value · P25 to P75', function (r) { return r.implied_value_usd; }, rangeCell],
      ['net', 'Net of fees', function (r) { return F[r.slug].net; }, function (r) { return verdictPill(F[r.slug].verdict) + ' ' + signed(F[r.slug].net); }],
      ['hour', 'Net / hour', function (r) { return F[r.slug].perHour; }, function (r) { return usd2(F[r.slug].perHour); }],
      ['plan', 'Farm plan', function (r) { return F[r.slug].play; }, function (r) { var f = F[r.slug]; return esc(f.play + ' · ' + f.chain) + '<small>' + usd2(f.fees) + ' fees · ' + f.hours.toFixed(1) + ' h · ' + f.weeks + ' wk · ' + (f.even ? 'pays from ' + usd(f.even) : 'never pays') + '</small>'; }, 'text']
      // "pays from": the deposit at which the expected drop first covers the plan's fees
    ] },
    comps: { sort: 'cap', dir: -1, cols: [
      ['name', 'Traded token', function (c) { return c.name.toLowerCase(); }, function (c) { return '<b>' + esc(c.name) + '</b><span class="tag">' + esc(c.symbol || c.id) + '</span><small>' + esc(c.category || '') + ' · ' + c.members + (c.members > 1 ? ' protocols summed' : ' protocol') + '</small>'; }, 'text'],
      ['tvl', 'TVL', function (c) { return c.tvl; }, function (c) { return usd(c.tvl); }],
      ['d7', '7d TVL', function (c) { return c.change == null ? -1e9 : c.change; }, function (c) { return pct(c.change); }],
      ['age', 'On record', function (c) { return c.age == null ? -1 : c.age; }, function (c) { return age(c.age); }],
      ['cap', 'Market cap', function (c) { return c.cap; }, function (c) { return '<b>' + usd(c.cap) + '</b>'; }],
      ['model', 'Priced blind', function (c) { return c.model; }, function (c) { return usd(c.model); }],
      ['miss', 'Miss', function (c) { return c.miss; }, function (c) { return '<span class="' + (c.miss > 3 ? 'neg' : 'pos') + '">' + times(c.miss) + '</span>'; }],
      ['ratio', 'Cap / TVL', function (c) { return c.cap / c.tvl; }, function (c) { return (c.cap / c.tvl).toFixed(3); }]
    ] },
    aside: { sort: 'tvl', dir: -1, cols: [
      ['name', 'Protocol', function (o) { return o.p.name.toLowerCase(); }, function (o) { return '<b>' + esc(o.p.name) + '</b><small>' + esc(o.category || 'Uncategorised') + ' · ' + chainsText(o.p.chains) + '</small>'; }, 'text'],
      ['group', 'Ledger group', function (o) { return o.group; }, function (o) { return '<span class="tag">' + esc(groupOf(o.group)[1]) + '</span>'; }, 'text'],
      ['tvl', 'TVL', function (o) { return o.tvl; }, function (o) { return usd(o.tvl); }],
      ['cap', 'Market cap', function (o) { return o.p.mcap_usd || 0; }, function (o) { return o.p.mcap_usd ? usd(o.p.mcap_usd) : '<small class="in">none in snapshot</small>'; }],
      ['why', 'Why it is not ranked', function (o) { return o.group; }, function (o) { return esc(groupOf(o.group)[2]) + (o.p.symbol ? ' (' + esc(o.p.symbol) + ')' : ''); }, 'text']
    ] }
  };

  function visible() {
    var q = state.q.trim().toLowerCase();
    function hit(name, category, chains) { return !q || (name + ' ' + (category || '') + ' ' + chains.join(' ')).toLowerCase().indexOf(q) >= 0; }
    var list = state.tab === 'comps' ? model.comps.filter(function (c) { return hit(c.name + ' ' + (c.symbol || ''), c.category, []); })
      : state.tab === 'aside' ? others.filter(function (o) { return hit(o.p.name, o.category, o.p.chains); })
      : model.rows.filter(function (r) {
        return hit(r.name, r.category, r.chains) && (state.tier === 'all' || r.tier === state.tier) && (state.sector === 'all' || r.sector === state.sector) &&
          (state.chain === 'all' || r.chains.indexOf(state.chain) >= 0) && (state.verdict === 'all' || F[r.slug].verdict === state.verdict);
      });
    var table = TABLES[state.tab], key = state.sort || table.sort, dir = state.sort ? state.dir : table.dir;
    var col = table.cols.filter(function (c) { return c[0] === key; })[0] || table.cols[0];
    return list.slice().sort(function (a, b) { var x = col[2](a), y = col[2](b); return x < y ? -dir : x > y ? dir : 0; });
  }

  function drawTable() {
    var table = TABLES[state.tab], list = visible(), key = state.sort || table.sort, dir = state.sort ? state.dir : table.dir;
    var head = table.cols.map(function (c) {
      return '<th data-sort="' + c[0] + '" class="' + (c[4] || 'n') + (c[0] === key ? ' on' : '') + '">' + c[1] + (c[0] === key ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
    }).join('');
    var body = list.map(function (r) {
      return '<tr' + (state.tab === 'pre' ? ' data-open="' + esc(r.slug) + '"' : '') + '>' + table.cols.map(function (c) { return '<td class="' + (c[4] || 'n') + '">' + c[3](r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    document.getElementById('table').innerHTML = '<table class="' + state.tab + '"><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td class="none" colspan="12">Nothing matches these filters.</td></tr>') + '</tbody></table>';
    var total = state.tab === 'comps' ? model.comps.length : state.tab === 'aside' ? others.length : model.rows.length;
    var sum = state.tab === 'pre' ? ' · ' + usd(list.reduce(function (s, r) { return s + r.implied_value_usd; }, 0)) + ' implied in view' : '';
    document.getElementById('count').textContent = list.length + ' of ' + total + ' shown' + sum;
    return list;
  }

  // ---- the summary above the table ----------------------------------------------------------------
  function kpis() {
    var t = model.tests, o = model.odds, n = { FARM: 0, THIN: 0, SKIP: 0 }, best = model.rows[0];
    model.rows.forEach(function (r) { n[F[r.slug].verdict]++; if (F[r.slug].perHour > F[best.slug].perHour) best = r; });
    return [
      ['Ranked, no token on record', model.rows.length, 'of ' + model.total + ' read · ' + model.counts.watch + '/' + model.watchlist + ' watchlist · ' + model.counts.early + ' below the ' + usd(model.floor_usd) + ' floor'],
      ['Implied value, whole board', usd(model.seal.total), 'rank 1 ' + esc(model.rows[0].name) + ' ' + usd(model.rows[0].implied_value_usd)],
      ['Typical miss, priced blind', times(t.loo), 'a flat multiple misses ' + times(t.flatLoo) + ' · older pricing newer ' + times(t.wf) + ' against ' + times(t.flatWf)],
      ['Is the range honest?', share(t.holdWf), 'of ' + t.dated + ' newer tokens land inside P25 to P75 · ' + share(t.holdLoo) + ' left-one-out · stated 50%'],
      ['Launch odds, Brier score', o.brier.toFixed(3), 'base rate alone ' + o.base.toFixed(3) + ' · ' + o.tokens + ' of ' + o.peers + ' like protocols record a token'],
      ['Worth farming with ' + usd(+state.ticket), n.FARM + ' farm', n.THIN + ' thin · ' + n.SKIP + ' skip · best ' + esc(best.name) + ' ' + usd2(F[best.slug].perHour) + '/h']
    ].map(function (k, i) { return '<div class="kpi k' + i + '"><h3>' + k[0] + '</h3><strong>' + k[1] + '</strong><p>' + k[2] + '</p></div>'; }).join('');
  }

  function ledger() {
    var bar = M.GROUPS.map(function (g, i) { return '<i class="g' + i + '" style="flex:' + (model.counts[g[0]] || 0) + '"></i>'; }).join('');
    var rows = M.GROUPS.map(function (g, i) {
      return '<li><i class="g' + i + '"></i><b>' + (model.counts[g[0]] || 0) + '</b><span>' + g[1] + '</span><small>' + g[2] + '</small></li>';
    }).join('');
    return '<section class="card ledger"><h2>' + model.total + ' protocols read, each in exactly one group <code>ledgerOf()</code></h2><div class="bar">' + bar + '</div><ul>' + rows + '</ul></section>';
  }

  /** The curve in words, from the fitted coefficients themselves. */
  function formula() {
    var t = fit.t, b = fit.b, i = 1, s = t.size ? usd(Math.pow(10, b[0])) + ' × (TVL / $100M)^' + b[i++].toFixed(3) : times(Math.pow(10, b[0])) + ' × TVL';
    if (t.growth) s += ' × 10^(' + b[i++].toFixed(2) + ' × 7d growth)';
    if (t.age) s += ' × 10^(' + b[i++].toFixed(2) + ' × years)';
    if (t.sector) s += ' × sector';
    var w = model.odds.w.map(function (x) { return (x < 0 ? '− ' : '+ ') + Math.abs(x).toFixed(2); });
    return s + '<br><b>launch odds</b> = sigmoid(' + w[0].replace(' ', '') + ' ' + w[1] + ' × log10(TVL / $100M) ' + w[2] + ' × years with no token ' + w[3] + ' × 7-day TVL growth), each weight fitted on ' + model.odds.peers + ' like protocols';
  }

  function evidence() {
    var steps = model.steps.map(function (s) {
      return '<tr class="' + (s.kept ? 'kept' : 'cut') + '"><td>' + s.label + '</td><td class="n">' + times(s.loo) + '</td><td class="n">' + times(s.wf) + '</td><td>' + (s.kept ? (s.key === 'flat' ? 'baseline' : '✓ kept') : 'not kept') + '</td></tr>';
    }).join('');
    var o = model.odds, terms = o.terms.slice(1).map(function (t) {
      return '<tr class="' + (t.without > o.brier ? 'kept' : 'cut') + '"><td>less ' + t.label + '</td><td class="n">' + t.without.toFixed(3) + '</td><td>' + (t.without > o.brier ? '✓ ' : 'no help ') + t.w.toFixed(2) + '</td></tr>';
    }).join('');
    return '<section class="card proof"><h2>Does it hold on tokens it never saw? <code>chooseTerms()</code> <code>brierOf()</code></h2>' +
      '<p class="eq"><b>implied value</b> = launch value × launch odds &nbsp;·&nbsp; <b>launch value</b> = ' + formula() + '</p><div class="two">' +
      '<table><thead><tr><th>Value on ' + model.comps.length + ' traded tokens</th><th class="n">left one out</th><th class="n">older → newer</th><th></th></tr></thead><tbody>' + steps + '</tbody></table>' +
      '<table><thead><tr><th>Odds, 5-fold Brier</th><th class="n">score</th><th>weight</th></tr></thead><tbody>' +
      '<tr><td>base rate alone</td><td class="n">' + o.base.toFixed(3) + '</td><td>baseline</td></tr><tr class="kept"><td>TVL + years + growth</td><td class="n">' + o.brier.toFixed(3) + '</td><td>✓ used</td></tr>' + terms + '</tbody></table></div>' +
      '<p class="note">A term stays only if both blind tests improve. Misses are typical multiples: ×2 means half the tokens were priced within half or double their real cap. Odds are the share of like protocols that record a token, not a forecast that one will launch.</p></section>';
  }

  function scatter() {
    var W = 300, H = 212;
    function X(v) { return (34 + (Math.min(10.6, Math.max(6.6, v)) - 6.6) / 4 * (W - 42)).toFixed(1); }
    function Y(v) { return (H - 20 - (Math.min(11, Math.max(4, v)) - 4) / 7 * (H - 30)).toFixed(1); }
    var grid = [7, 8, 9, 10].map(function (v) { return '<text x="' + X(v) + '" y="' + (H - 6) + '" text-anchor="middle">' + usd(Math.pow(10, v)) + '</text>'; }).join('') +
      [5, 7, 9, 11].map(function (v) { return '<text x="30" y="' + (+Y(v) + 3) + '" text-anchor="end">' + usd(Math.pow(10, v)) + '</text><line class="grid" x1="34" x2="' + (W - 8) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>'; }).join('');
    var dots = model.comps.map(function (c) { return '<circle class="c" cx="' + X(c.lt) + '" cy="' + Y(c.y) + '" r="2.3"/>'; }).join('') +
      model.rows.map(function (r) { return '<circle class="b" cx="' + X(r.lt) + '" cy="' + Y(Math.log10(r.implied_value_usd)) + '" r="1.7"/>'; }).join('');
    function curve(lt) { return M.valueAt(fit, { lt: lt, g: 0, a: 2, sector: '' }); }
    return '<section class="card plot"><h2>Cap on TVL <code>fitValue()</code></h2><svg viewBox="0 0 ' + W + ' ' + H + '">' + grid + dots +
      '<line class="fit" x1="' + X(6.6) + '" y1="' + Y(curve(6.6)) + '" x2="' + X(10.6) + '" y2="' + Y(curve(10.6)) + '"/></svg>' +
      '<p class="note"><i class="dot c"></i>traded <i class="dot b"></i>this board <i class="dot f"></i>fitted curve</p></section>';
  }

  // ---- controls -----------------------------------------------------------------------------------
  function chips(key, options) {
    return '<span class="chips">' + options.map(function (o) {
      return '<button data-k="' + key + '" data-v="' + o[0] + '" class="' + (String(state[key]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</span>';
  }
  function select(key, options) {
    return '<select data-k="' + key + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(state[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function tally(of) {
    var n = {};
    model.rows.forEach(function (r) { of(r).forEach(function (k) { n[k] = (n[k] || 0) + 1; }); });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a < b ? -1 : 1); }).map(function (k) { return [k, n[k]]; });
  }
  function toolbar() {
    var c = model.counts, pre = state.tab === 'pre';
    var sectors = [['all', 'Any sector']].concat(tally(function (r) { return [r.sector]; }).map(function (s) { return [s[0], M.sectorName(s[0]) + ' (' + s[1] + ')']; }));
    var chains = [['all', 'Any chain']].concat(tally(function (r) { return r.chains; }).slice(0, 30).map(function (s) { return [s[0], s[0] + ' (' + s[1] + ')']; }));
    return '<nav class="tabs">' + chips('tab', [['pre', 'No token on record <b>' + model.rows.length + '</b>'], ['comps', 'Tokens that trade <b>' + model.comps.length + '</b>'], ['aside', 'Not ranked <b>' + others.length + '</b>']]) +
      '<span class="size">Deposit ' + chips('ticket', [[1000, '$1K'], [5000, '$5K'], [25000, '$25K']]) + ' Dropped to users ' + chips('share', [[3, '3%'], [7, '7%'], [12, '12%']]) + '</span></nav>' +
      '<div class="filters"><input id="q" type="search" placeholder="Search name, category or chain" value="' + esc(state.q) + '">' +
      (pre ? chips('tier', [['all', 'All tiers'], ['watch', 'Watchlist ' + c.watch], ['early', 'Early ' + c.early], ['offlist', 'Off-list ' + c.offlist]]) +
        chips('verdict', [['all', 'Any verdict'], ['FARM', 'Farm'], ['THIN', 'Thin'], ['SKIP', 'Skip']]) + select('sector', sectors) + select('chain', chains) : '') +
      '<button data-reset="1">Reset</button>' + (pre ? '<button data-csv="1">CSV</button>' : '') + '<span id="count"></span></div>';
  }

  // ---- the detail view ----------------------------------------------------------------------------
  /** How one row's value is reached, factor by factor, from the fitted coefficients. */
  function walk(r) {
    var t = fit.t, b = fit.b, i = 1, out = [];
    out.push([t.size ? 'Size curve at ' + usd(r.tvl_usd) + ' of TVL' : 'Flat multiple of ' + usd(r.tvl_usd) + ' TVL', usd(Math.pow(10, b[0] + (t.size ? b[i++] * (r.lt - 8) : r.lt)))]);
    if (t.growth) out.push(['7-day TVL growth of ' + pct(r.change_7d) + ', fitted weight ' + b[i].toFixed(2), times(Math.pow(10, b[i++] * r.g))]);
    if (t.age) out.push([age(r.age_days) + ' on record, fitted weight ' + b[i].toFixed(2), times(Math.pow(10, b[i++] * r.a))]);
    if (t.sector) out.push(['Sector: ' + M.sectorName(r.sector), times(r.sector_mult)]);
    out.push(['= value if a token launches', usd(r.launch_usd)]);
    // The odds, input by input, in logit points: what this row's own figures add to the intercept.
    var w = model.odds.w, add = function (x) { return (x > 0 ? '+' : '') + x.toFixed(2); };
    out.push(['· ' + age(r.age_days) + ' with no token on record, weight ' + w[2].toFixed(2) + ' a year', add(w[2] * r.a)]);
    out.push(['· ' + usd(r.tvl_usd) + ' of TVL, weight ' + w[1].toFixed(2) + ' per tenfold', add(w[1] * (r.lt - 8))]);
    out.push(['· 7-day TVL growth of ' + pct(r.change_7d) + ', weight ' + w[3].toFixed(2), add(w[3] * r.g * 8)]);
    out.push(['Launch odds = sigmoid(' + w[0].toFixed(2) + ' + the three lines above)', '× ' + share(r.odds)]);
    out.push(['= implied value, rank ' + r.rank + ' of ' + model.rows.length + ' (' + r.rank_lo + ' to ' + r.rank_hi + ' over 200 refits)', usd(r.implied_value_usd)]);
    return out.map(function (x) { return '<tr class="' + (x[0].charAt(0) === '=' ? 'sum' : '') + '"><td>' + esc(x[0]) + '</td><td class="n">' + x[1] + '</td></tr>'; }).join('');
  }

  function drawDetail() {
    var r = bySlug[state.p];
    panel.hidden = shade.hidden = !r;
    if (!r) return;
    var f = F[r.slug], near = model.comps.slice().sort(function (a, b) { return Math.abs(a.lt - r.lt) - Math.abs(b.lt - r.lt); }).slice(0, 5);
    var steps = f.steps.map(function (s, i) { return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(s.text) + '</td><td>' + esc(s.cost) + '</td><td>' + esc(s.time) + '</td></tr>'; }).join('');
    var sizes = [1000, 5000, 25000].map(function (ticket) {
      var x = M.farmOf(r, params(ticket));
      return '<tr class="' + (ticket === +state.ticket ? 'sum' : '') + '"><td>' + usd(ticket) + '</td><td class="n">' + usd2(x.drop) + '</td><td class="n">' + usd2(x.fees) + '</td><td class="n">' + signed(x.net) + '</td><td class="n">' + usd2(x.perHour) + '</td><td>' + verdictPill(x.verdict) + '</td></tr>';
    }).join('');
    panel.innerHTML = '<header><button data-k="p" data-v="" aria-label="Close">Close ✕</button><h1><span class="rk">#' + r.rank + '</span> ' + esc(r.name) + ' ' + tierTag(r) + ' ' + verdictPill(f.verdict) + '</h1>' +
      '<p>' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) + ' · on DefiLlama since ' + esc(r.listed_at || 'an unrecorded date') + ' · records no token</p></header>' +
      '<div class="stats"><div><h3>Implied value</h3><strong>' + usd(r.implied_value_usd) + '</strong><p>P25 to P75: ' + usd(r.low_usd) + ' to ' + usd(r.high_usd) + '</p></div>' +
      '<div><h3>TVL</h3><strong>' + usd(r.tvl_usd) + '</strong><p>' + pct(r.change_7d) + ' in seven days</p></div>' +
      '<div><h3>No token for</h3><strong>' + age(r.age_days) + '</strong><p>launch odds ' + share(r.odds) + '</p></div>' +
      '<div><h3>Net on ' + usd(f.deposit) + '</h3><strong>' + signed(f.net) + '</strong><p>' + usd2(f.perHour) + ' an hour over ' + f.weeks + ' weeks</p></div></div>' +
      '<div class="cols"><section><h2>How the value is reached <code>valueAt()</code> <code>oddsAt()</code></h2><table class="walk"><tbody>' + walk(r) + '</tbody></table>' +
      '<h2>What the market pays at this size</h2><table><thead><tr><th>Nearest traded tokens by TVL</th><th class="n">TVL</th><th class="n">Real cap</th><th class="n">Cap / TVL</th></tr></thead><tbody>' +
      near.map(function (c) { return '<tr><td>' + esc(c.name) + ' <small class="in">' + esc(c.symbol || '') + '</small></td><td class="n">' + usd(c.tvl) + '</td><td class="n">' + usd(c.cap) + '</td><td class="n">' + (c.cap / c.tvl).toFixed(3) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Does the size of the deposit change the answer? <code>farmOf()</code></h2><table><thead><tr><th>Deposit</th><th class="n">Drop</th><th class="n">Fees</th><th class="n">Net</th><th class="n">Per hour</th><th></th></tr></thead><tbody>' + sizes + '</tbody></table>' +
      '<p class="note">Drop = implied value × ' + state.share + '% to users × your share of TVL. ' + (f.even ? 'Fees are covered from a deposit of about ' + usd(f.even) + '.' : 'No deposit covers the entry cost at this drop.') + ' FARM means the net beats $' + M.PARAMS.wage + ' an hour. The position\'s own yield and the T-bill it gives up are taken to cancel: the snapshot records neither.</p></section>' +
      '<section><h2>Farm plan: ' + esc(f.play) + ' on ' + esc(f.chain) + '</h2><table class="plan"><thead><tr><th class="n">#</th><th>Step</th><th>Cost</th><th>Time</th></tr></thead><tbody>' + steps +
      '<tr class="sum"><td></td><td>All seven steps on ' + usd(f.deposit) + '</td><td>' + usd2(f.fees) + '</td><td>' + f.hours.toFixed(1) + ' h in ' + f.weeks + ' wk</td></tr></tbody></table>' +
      '<p class="note">Gas is a planning figure of ' + usd2(f.gas) + ' a transaction on ' + esc(f.chain) + ', the cheapest of its three largest chains. The snapshot records no token for ' + esc(r.name) + '; it does not say none exists or will.</p></section></div>';
  }

  // ---- render and events --------------------------------------------------------------------------
  function render() {
    model.rows.forEach(function (r) { F[r.slug] = M.farmOf(r, params()); });
    app.innerHTML = '<header class="top"><div class="brand"><i class="mark"></i><div><h1>Fathom</h1><p>a token launch radar: what a protocol with no token would be worth, and whether farming it pays</p></div></div>' +
      '<div class="meta"><p>DefiLlama snapshot ' + esc(model.as_of) + ' · ' + model.total + ' protocols · refitted in this browser, no network</p><p>' +
      '<span class="ok">✓ watchlist ' + model.counts.watch + '/' + model.watchlist + ' ranked</span><span class="ok">✓ ' + model.total + '/' + model.total + ' accounted for</span>' +
      '<span class="' + (sealed ? 'ok' : 'bad') + '">' + (sealed ? '✓ this refit = board.json' : '✗ differs from board.json') + ' · seal ' + model.seal.hash + '</span></p></div></header>' +
      '<div class="kpis">' + kpis() + '</div><div class="evidence">' + ledger() + evidence() + scatter() + '</div>' + toolbar() + '<div id="table"></div>';
    drawTable();
    drawDetail();
  }

  function csv() {
    var lines = [['rank', 'slug', 'name', 'tier', 'tvl_usd', 'change_7d', 'no_token_days', 'launch_odds', 'launch_value_usd', 'implied_value_usd', 'verdict', 'net_usd', 'fees_usd', 'hours'].join(',')];
    visible().forEach(function (r) {
      var f = F[r.slug];
      lines.push([r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', r.tier, r.tvl_usd, r.change_7d, r.age_days, r.odds.toFixed(4), r.launch_usd, r.implied_value_usd, f.verdict, f.net.toFixed(2), f.fees.toFixed(2), f.hours.toFixed(1)].join(','));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'fathom-board.csv';
    a.click();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-k],[data-sort],[data-open],[data-reset],[data-csv],#shade');
    if (!t || t.tagName === 'SELECT') return;
    if (t.id === 'shade') set({ p: '' });
    else if (t.dataset.csv) csv();
    else if (t.dataset.reset) set(Object.assign({}, DEFAULTS, { tab: state.tab, ticket: state.ticket, share: state.share }));
    else if (t.dataset.open) set({ p: t.dataset.open });
    else if (t.dataset.sort) {
      var key = t.dataset.sort, table = TABLES[state.tab], col = table.cols.filter(function (c) { return c[0] === key; })[0];
      set({ sort: key, dir: (state.sort || table.sort) === key ? -(state.sort ? state.dir : table.dir) : col[4] ? 1 : -1 });
    } else if (t.dataset.k === 'tab') set({ tab: t.dataset.v, sort: '', dir: 1, p: '' });
    else { var patch = {}; patch[t.dataset.k] = t.dataset.v; set(patch); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.tagName === 'SELECT' && e.target.dataset.k) { var patch = {}; patch[e.target.dataset.k] = e.target.value; set(patch); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    state.q = e.target.value; // only the table is redrawn, so the search box keeps its focus
    drawTable();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.p) set({ p: '' }); });
  window.addEventListener('hashchange', function () { state = readHash(); render(); });

  render();
})();
