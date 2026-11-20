// Fathom, a token launch radar (make.fun token-radar-01). Node 22, standard library only.
//
// The model lives in dashboard/model.js so that there is one copy of it: this program requires it
// to write /output/board.json, and the page loads the same file to refit the snapshot in the
// browser. main.ts therefore only reads, checks, writes and copies:
//
//   /input/snapshot.json  ->  model.build()  ->  /output/board.json   the ranked rows
//                                               /output/data.js      the snapshot and the board's seal
//                                               /output/dashboard/   the page, copied
//                                               /output/screenshots/ three captures, copied
//                                               /output/dossier.json written last by the house library
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}
interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}
interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
}
interface Model {
  rows: unknown[];
  counts: Record<string, number>;
  comps: unknown[];
  tests: { loo: number; wf: number; flatLoo: number; flatWf: number };
  odds: { brier: number; base: number };
  seal: { rows: number; total: number; hash: string };
}
interface RadarModel {
  build(snapshot: Snapshot): Model;
  boardRows(model: Model): BoardRow[];
}

const here = fileURLToPath(new URL('.', import.meta.url));
const radar = createRequire(import.meta.url)('./dashboard/model.js') as RadarModel;

function fail(message: string, code = 1): never {
  process.stderr.write(`fathom: ${message}\n`);
  process.exit(code);
}

/** --name value or --name=value from the command line, else the fallback. */
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** The snapshot, with every field the model reads forced to its type so a stray value cannot leak in. */
function readSnapshot(file: string): Snapshot {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (typeof raw.as_of !== 'string' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) fail(`${file} is not a snapshot`, 2);
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const figure = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const protocols = (raw.protocols as Record<string, unknown>[]).map((p) => ({
    slug: String(p.slug),
    name: String(p.name),
    category: text(p.category),
    chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
    tvl_usd: figure(p.tvl_usd) ?? 0,
    change_7d: figure(p.change_7d),
    mcap_usd: figure(p.mcap_usd),
    listed_at: text(p.listed_at),
    gecko_id: text(p.gecko_id),
    symbol: text(p.symbol),
  }));
  return {
    as_of: raw.as_of,
    source: String(raw.source ?? ''),
    floor_usd: figure(raw.floor_usd) ?? 0,
    protocols,
    watchlist: (raw.watchlist as unknown[]).map(String),
  };
}

/** The gate's own rules, checked here first: a board it would refuse is never written. */
function gateIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, the gate takes 100 to 4,000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `row ${i + 1} carries rank ${r.rank}`;
    if (!known.has(r.slug) || seen.has(r.slug)) return `${r.slug} is invented or repeated`;
    seen.add(r.slug);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `rank ${r.rank} is worth more than rank ${r.rank - 1}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    const odd = r.farm_steps.find((s) => s.trim().length < 20 || s.trim().length > 600);
    if (odd !== undefined) return `${r.slug} has a farm step of ${odd.trim().length} characters`;
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  return missing.length > 0 ? `the watchlist's ${missing.slice(0, 5).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the board` : null;
}

/** Copy a directory's plain files, skipping dot names; the names copied, sorted. */
function copyFlat(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((n) => !n.startsWith('.') && statSync(join(from, n)).isFile()).sort();
  for (const n of names) copyFileSync(join(from, n), join(to, n));
  return names;
}

const inputArg = option('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json or its directory>`, 2);
const out = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = readSnapshot(inputFile);
const model = radar.build(snapshot);
const rows = radar.boardRows(model);
const issue = gateIssue(rows, snapshot);
if (issue !== null) fail(`the board would be refused: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({
  as_of: snapshot.as_of,
  model: 'fathom-1: implied value = launch value (fitted on the traded tokens) x launch odds (fitted on like protocols)',
  seal: model.seal,
  rows,
})}\n`);
// The page gets the snapshot itself, not the answers: it refits and re-ranks, then compares seals.
writeFileSync(join(out, 'data.js'), `window.RADAR_INPUT=${JSON.stringify({ snapshot, seal: model.seal })};\n`);

const pageFiles = copyFlat(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFlat(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} of the 3 captures the gate asks for`);

// Last, because the scorer rebuilds the dossier from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

const t = model.tests;
process.stdout.write(
  `fathom: ${snapshot.protocols.length} protocols read, ${rows.length} ranked (${model.counts.watch ?? 0} of ${snapshot.watchlist.length} watchlist), ${model.comps.length} traded tokens fitted\n` +
    `fathom: held-out miss x${t.loo.toFixed(2)} left-one-out and x${t.wf.toFixed(2)} walk-forward (one flat multiple: x${t.flatLoo.toFixed(2)} and x${t.flatWf.toFixed(2)}); odds Brier ${model.odds.brier.toFixed(3)} against ${model.odds.base.toFixed(3)}\n` +
    `fathom: wrote board.json (seal ${model.seal.hash}), data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length}) and dossier.json to ${out}\n`,
);
