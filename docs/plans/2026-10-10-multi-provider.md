# Multi-Provider (Claude Code + Mistral Vibe) & Quota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current Claude footprint numbers, then turn LLM Green into a multi-provider dashboard (Claude Code + Mistral Vibe) with tokens and live Claude rate-limit usage (used % + reset time) as supporting information. The ecological footprint stays the headline metric. No prices or cost, no run-out projection (user decisions 2026-10-10).

**Architecture:** Every data source becomes a *provider adapter* that emits normalized usage events (one schema for all agents). A pure pipeline — `calculate` (footprint) → `summarize` (buckets by day/hour/model/provider/project) — feeds a refactored Express router. Coefficients live in `data/coefficients.json` (single source of truth, also for the planned Swift menu-bar app). `stats-cache.json` is dropped; JSONL is the only Claude source.

**Tech Stack:** Node.js ≥ 18, Express 4, glob 11, `node:test` + `node:assert` (built-in, no new dependencies), vanilla HTML/JS/CSS, Chart.js 4.4.7 (CDN, unchanged).

**Spec:** `docs/research/2026-10-10-multi-provider-mistral-vibe.md` (research, data formats, coefficients, sources). Facts verified while writing this plan are collected in **Reference Facts** below — executors do not need to redo the research.

> **Status 2026-10-10: refinement paused.** Goal: a dashboard that works for both agents, at least roughly, as a use case (also for teaching). Open: Mistral limits (see CLAUDE.md). Before executing, decide whether every task is needed for that goal.

## Global Constraints

- No new npm dependencies. Tests use `node:test`; run with `npm test`.
- All data stays local. The app makes **no network calls** (no OAuth endpoint, no Admin APIs in this plan).
- Never edit `~/.claude/settings.json`, `~/.claude/**`, or `~/.vibe/**` without asking the user first. The app only *reads* those directories.
- Number formatting in the UI: European (`1.234,56`) — reuse `fmt()` / `fmtInt()` in `public/app.js`.
- Settings POST debounce 300 ms; file-watch debounce 500 ms (unchanged).
- Day buckets use **local time** (the user is in Europe/Vienna), not UTC.
- **No prices, no cost, no currency.** Tokens and limits are supporting information only. Do not add `pricing.json`, cost fields or EUR/USD anywhere.
- `data/coefficients.json` keeps one entry per model *family prefix*; the first matching prefix in array order wins, so more specific prefixes come first.
- **No run-out projection.** Limits show used % and reset time only.
- No dependency on CodexBar or other usage tools running in parallel; LLM Green reads its own sources.
- Personal / non-commercial project. Time estimates are given as KI / Review minutes, never person-hours.

## Review Focus

1. **Vibe data missing or partial** (no `~/.vibe`, session with `tokenUsage: null`, no `generations/`, corrupt JSON): the session is skipped, other providers still render, no 500. → tests in Task 8 + adapter-failure test in Task 6.
2. **JSONL written while we read it** (truncated last line): the line is skipped, the rest of the file counts. → malformed-line fixture in Task 2.
3. **New model id appears** (e.g. `claude-nova-1`): counted with the fallback coefficients, listed in `unknownModels`, shown as a banner. It is never silently dropped and never silently merged. → Tasks 1, 4, 11.
4. **Existing `config.json` with flat v1 keys** (`{"pue":1.3}`): migrated to Anthropic overrides, not lost. → Task 5.
5. **Day boundary in local time**: a request at `2026-10-09T23:30Z` belongs to **2026-10-10** in Vienna. → Task 4 test (tests run with `TZ=Europe/Vienna`).

---

## Reference Facts (verified 2026-10-10)

### Claude Code JSONL (`~/.claude/projects/**/*.jsonl`, CLI v2.1.295)
- Relevant lines: `type: "assistant"`, `message.role: "assistant"`, `message.usage` present.
- `message.usage`: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`, `output_tokens_details.thinking_tokens` (already included in `output_tokens`), `service_tier`, `speed` (`standard`|`fast`), `inference_geo` (`global`|`us`|…).
- Top level: `timestamp` (ISO), `cwd`, `gitBranch`, `sessionId`, `requestId`, `uuid`, `isSidechain`, `version`. There is **no `costUSD`**.
- **Dedup bug in the current code:** one API response is written as several lines (one per content block), with the same `message.id` + `requestId`, different `uuid`, and **identical usage**. Measured on the 40 most recent files: 11.522 lines, 5.881 unique `message.id:requestId`, 0 duplicates with differing usage. The current key `message.id:requestId:uuid` therefore counts about **2×**. Correct key: `message.id:requestId`, also across files (subagent files repeat entries).
- `<synthetic>` model lines must be skipped.
- Models in use: `claude-opus-5` (4272), `claude-opus-5-5` (2498), `claude-fable-5-1` (2186), `claude-opus-4-7` (1735), `claude-fable-5` (904), `claude-sonnet-5-5` (13).
- `~/.claude/stats-cache.json`: stale since 2026-02-16 → drop.

### Mistral Vibe (`~/.vibe/`, vibe 2.25.8; override with `VIBE_HOME`)
- **Authoritative per-session totals:** `logs/session/unified/<sid>/generations/<max-seq>/projection-state.json` → `snapshot.session.{createdAt, updatedAt (epoch ms), tokenUsage{inputTokens, cachedInputTokens, outputTokens, totalTokens}}`. `tokenUsage` can be `null` (session without a model call).
- `logs/session/unified/.session-index.json` → `{catalog_version, entries:[{session_id, metadata:{active_model, cwd, …}, session:{tokenUsage, …}}]}`. **Not every session is in the index** (here, the largest one was missing) → the index is used only for model and cwd.
- `journal/*.jsonl` is **compacted**: older records disappear. Sums from the journal undercount (15.375 vs 43.949 input tokens in one session). **Do not use the journal for totals.**
- `meta.json` → `environment.working_directory` (cwd fallback).
- `cachedInputTokens` is a **subset** of `inputTokens` (cached ≤ input in all sessions) → uncached = input − cached.
- Model resolution: `active_model` holds an alias or name. Built-ins (from `vibe/core/config/vibe_schema.py`): `mistral-vibe-cli-latest` (alias `mistral-medium-3.5`, provider `mistral`), `devstral` (alias `local`, provider `llamacpp`). User models in `~/.vibe/config.toml` `[[models]]` blocks (`name`, `provider`, `alias`) override built-ins. **This user has Ollama models** (`ministral-3-8b-16k` alias `local`, `ministral-3-3b-8k` alias `local-fast`) → provider `local`, excluded from the data-centre footprint. `active_model` may be missing → default `mistral-vibe-cli-latest`.
- Granularity is per **session**, attributed to `updatedAt`. Documented limitation: a multi-day session lands on its last day.

### Footprint coefficients
See Task 1 `data/coefficients.json`. Rationale and sources are in the spec, sections 3 and 4. Fable/Mythos = 1,5 × Opus class is an **assumption** with no public data. It is flagged in the JSON `note` and shown in the UI tooltip.

### Claude rate limits (statusline stdin JSON, documented)
`rate_limits.five_hour.{used_percentage, resets_at}`, `rate_limits.seven_day.{…}` (Pro/Max, after the first response), `model.{id, display_name}`. The `resets_at` format is not pinned down in the docs → accept epoch seconds, epoch ms or ISO. The user currently has **no statusline** configured.

---

## File Structure

```
data/
  coefficients.json      NEW  provider infra + ordered model table + equivalences (v2)
src/
  paths.js               NEW  resolve ~/.claude, ~/.vibe, ~/.llm-green (env-overridable for tests)
  coefficients.js        REWRITE  loads data/coefficients.json; getModelProfile, getInfra
  calculator.js          REWRITE  calculate(event), lcaReference(event), rangesFor(byProvider), getEquivalences
  aggregate.js           NEW  summarize(events, opts) → buckets; dayKey/hourKey (local time)
  config.js              NEW  per-provider overrides, v1 migration
  store.js               NEW  runs adapters, isolates failures, per-file cache
  quota.js               NEW  statusline snapshot build/read
  routes.js              REWRITE  createRouter({store, configPath}) factory
  parser.js              DELETE (replaced by providers/claude-code.js)
  providers/
    index.js             NEW  ADAPTERS registry
    claude-code.js       NEW  JSONL → events (fixed dedup)
    vibe-models.js       NEW  config.toml [[models]] parsing + alias resolution
    mistral-vibe.js      NEW  projection-state → session events
scripts/
  statusline-snapshot.js NEW  Claude Code statusLine command: writes snapshot, prints status
server.js                MODIFY  export createApp(); listen only when run directly
public/index.html, app.js, style.css   MODIFY  provider filter, tokens per provider, quota, projects, per-provider settings
test/
  *.test.js              NEW
  fixtures/claude/projects/...   NEW
  fixtures/vibe/...              NEW
package.json             MODIFY  "test" script
```

**Normalized event** (the contract between adapters and the pipeline):

```js
/**
 * @typedef {Object} UsageEvent
 * @property {string} id            globally unique, e.g. "claude-code:msg_01:req_01", "mistral-vibe:<sid>"
 * @property {'claude-code'|'mistral-vibe'} agent
 * @property {'anthropic'|'mistral'|'local'} provider
 * @property {string} model         raw model id ("claude-opus-5-5", "mistral-vibe-cli-latest", "ministral-3-8b-16k")
 * @property {string} timestamp     ISO 8601
 * @property {'request'|'session'} granularity
 * @property {{input:number, output:number, cacheRead:number, cacheWrite5m:number, cacheWrite1h:number}} tokens
 *           input = uncached input only
 * @property {string|null} project  cwd
 * @property {string|null} sessionId
 * @property {string} speed         "standard" | "fast"
 * @property {string|null} geo      "global" | "us" | null
 */
```

**Adapter interface** (`src/providers/*.js` export an object):

```js
{ id: 'claude-code', label: 'Claude Code', provider: 'anthropic',
  detect(paths) /* → boolean, sync */,
  readEvents(paths, cache /* Map, per-adapter, may be ignored */) /* → Promise<UsageEvent[]> */,
  watchDirs(paths) /* → string[] */ }
```

---

## Time Overview

| Task | KI | Review |
|---|---|---|
| 1 Test harness + coefficients v2 | ~10 min | ~10 min |
| 2 Claude Code adapter (dedup fix) | ~15 min | ~10 min |
| 3 Calculator on events | ~10 min | ~10 min |
| 4 Aggregation | ~15 min | ~10 min |
| 5 Config (per provider, migration) | ~10 min | ~5 min |
| 6 Store + router + server refactor | ~25 min | ~15 min |
| 7 Vibe model resolution | ~10 min | ~5 min |
| 8 Mistral Vibe adapter | ~15 min | ~10 min |
| 9 Register Vibe + /api/providers | ~5 min | ~5 min |
| 10 Statusline snapshot + /api/quota | ~15 min | ~10 min |
| 11 Frontend | ~30 min | ~20 min |
| 12 Docs + menu-bar plan amendments | ~15 min | ~10 min |
| **Total** | **~2 h 55 min** | **~1 h 50 min** |

---

### Task 1: Test harness + coefficients v2

**Files:**
- Create: `data/coefficients.json`
- Rewrite: `src/coefficients.js`
- Modify: `package.json`
- Test: `test/coefficients.test.js`

**Interfaces:**
- Produces: `getModelProfile(modelId: string, fallbackProvider = 'anthropic') → {prefix, provider, family, whPer1kInput, whPer1kOutput, activeParamsB?, note?, known: boolean}`; `getInfra(provider: string, overrides = {}) → {label, pue, gridCO2_gPerKwh, wueOnsite_LPerKwh, wueOffsite_LPerKwh, cacheReadFactor, uncertainty, lca?, sources} | {label, excluded: true}` (throws on unknown provider); constants `PROVIDERS`, `MODELS`, `DEFAULT_MODEL`, `EQUIVALENCES`, `INFRA_KEYS`. Temporary legacy exports `DEFAULTS`, `UNCERTAINTY`, `getModelEnergy` keep the old server running until Task 6 removes them.

- [ ] **Step 1: Add the test script**

In `package.json`, replace the `"scripts"` block:

```json
  "scripts": {
    "start": "node server.js",
    "test": "TZ=Europe/Vienna node --test test/*.test.js"
  },
```

- [ ] **Step 2: Write the failing test** — `test/coefficients.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getModelProfile, getInfra } = require('../src/coefficients');

test('current Claude models resolve to their family', () => {
  assert.equal(getModelProfile('claude-opus-5-5').family, 'opus');
  assert.equal(getModelProfile('claude-opus-5-5').whPer1kOutput, 0.30);
  assert.equal(getModelProfile('claude-opus-4-7').family, 'opus');
  assert.equal(getModelProfile('claude-fable-5-1').family, 'fable');
  assert.equal(getModelProfile('claude-sonnet-5-5').family, 'sonnet');
  assert.equal(getModelProfile('claude-haiku-5-5').family, 'haiku');
  assert.equal(getModelProfile('claude-3-5-haiku-20241022').family, 'haiku');
  assert.equal(getModelProfile('claude-opus-5-5').known, true);
});

test('Mistral models: specific prefixes win', () => {
  assert.equal(getModelProfile('devstral-small-2').family, 'devstral-small');
  assert.equal(getModelProfile('devstral-2').family, 'devstral');
  const m = getModelProfile('mistral-vibe-cli-latest');
  assert.equal(m.provider, 'mistral');
  assert.equal(m.activeParamsB, 128);
});

test('unknown model falls back and is flagged', () => {
  const p = getModelProfile('claude-nova-1');
  assert.equal(p.known, false);
  assert.equal(p.provider, 'anthropic');
  assert.equal(p.whPer1kOutput, 0.10);
  assert.equal(getModelProfile('x', 'mistral').provider, 'mistral');
});

test('getInfra merges numeric overrides per provider only', () => {
  const a = getInfra('anthropic', { anthropic: { pue: 1.3, gridCO2_gPerKwh: 'abc' }, mistral: { pue: 9 } });
  assert.equal(a.pue, 1.3);
  assert.equal(a.gridCO2_gPerKwh, 385);
  assert.equal(getInfra('mistral').gridCO2_gPerKwh, 80);
  assert.equal(getInfra('mistral').pue, 1.2);
  assert.equal(getInfra('local').excluded, true);
  assert.throws(() => getInfra('nope'), /Unknown provider/);
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npm test`
Expected: FAIL (`getModelProfile is not a function`).

- [ ] **Step 4: Create `data/coefficients.json`**

```json
{
  "version": 2,
  "providers": {
    "anthropic": {
      "label": "Anthropic",
      "pue": 1.14,
      "gridCO2_gPerKwh": 385,
      "wueOnsite_LPerKwh": 0.18,
      "wueOffsite_LPerKwh": 5.11,
      "cacheReadFactor": 0.15,
      "uncertainty": {
        "energy": { "low": 0.5, "high": 2.0 },
        "co2":    { "low": 0.5, "high": 1.8 },
        "water":  { "low": 0.6, "high": 1.5 }
      },
      "sources": [
        "Ren et al. 2025 — AWS PUE 1.14, US grid 385 gCO2/kWh",
        "Jegham et al. 2025 — off-site water 5.11 L/kWh",
        "AWS 2024 sustainability report — on-site WUE 0.18 L/kWh"
      ]
    },
    "mistral": {
      "label": "Mistral",
      "pue": 1.2,
      "gridCO2_gPerKwh": 80,
      "wueOnsite_LPerKwh": 0.2,
      "wueOffsite_LPerKwh": 2.5,
      "cacheReadFactor": 0.15,
      "uncertainty": {
        "energy": { "low": 0.4, "high": 2.5 },
        "co2":    { "low": 0.3, "high": 3.75 },
        "water":  { "low": 0.4, "high": 1.6 }
      },
      "lca": {
        "gCO2ePer1kOutput": 2.85,
        "waterMlPer1kOutput": 112.5,
        "refActiveParamsB": 123,
        "source": "Mistral AI / Carbone 4 / ADEME LCA (July 2025): 1.14 gCO2e and 45 mL per 400-token response, Mistral Large 2, incl. hardware manufacturing"
      },
      "sources": [
        "Assumed FR/SE data centres. Mistral publishes no PUE, WUE or grid values. See docs/research/2026-10-10-multi-provider-mistral-vibe.md"
      ]
    },
    "local": {
      "label": "Local models",
      "excluded": true,
      "sources": ["Runs on the user's own machine (Ollama / llama.cpp). Not part of the data-centre inference footprint."]
    }
  },
  "models": [
    { "prefix": "claude-fable",      "provider": "anthropic", "family": "fable",  "whPer1kInput": 0.045, "whPer1kOutput": 0.45, "note": "No public data. Assumed 1.5x Opus class." },
    { "prefix": "claude-mythos",     "provider": "anthropic", "family": "fable",  "whPer1kInput": 0.045, "whPer1kOutput": 0.45, "note": "No public data. Assumed 1.5x Opus class." },
    { "prefix": "claude-opus",       "provider": "anthropic", "family": "opus",   "whPer1kInput": 0.03,  "whPer1kOutput": 0.30, "note": "Scaled ~3x from Sonnet benchmark (Ren et al. 2025)." },
    { "prefix": "claude-sonnet",     "provider": "anthropic", "family": "sonnet", "whPer1kInput": 0.01,  "whPer1kOutput": 0.10, "note": "Derived from Claude 3.7 Sonnet 0.84 Wh/short query (Ren et al. 2025)." },
    { "prefix": "claude-3-7-sonnet", "provider": "anthropic", "family": "sonnet", "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    { "prefix": "claude-3-5-sonnet", "provider": "anthropic", "family": "sonnet", "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    { "prefix": "claude-haiku",      "provider": "anthropic", "family": "haiku",  "whPer1kInput": 0.003, "whPer1kOutput": 0.03 },
    { "prefix": "claude-3-5-haiku",  "provider": "anthropic", "family": "haiku",  "whPer1kInput": 0.003, "whPer1kOutput": 0.03 },
    { "prefix": "mistral-vibe-cli",  "provider": "mistral", "family": "mistral-medium", "whPer1kInput": 0.03,  "whPer1kOutput": 0.30, "activeParamsB": 128, "note": "Mistral Medium 3.5, 128B dense. Scaled from Opus-class anchor (123B ~ Opus)." },
    { "prefix": "mistral-medium",    "provider": "mistral", "family": "mistral-medium", "whPer1kInput": 0.03,  "whPer1kOutput": 0.30, "activeParamsB": 128 },
    { "prefix": "devstral-small",    "provider": "mistral", "family": "devstral-small", "whPer1kInput": 0.006, "whPer1kOutput": 0.06, "activeParamsB": 24 },
    { "prefix": "devstral",          "provider": "mistral", "family": "devstral",       "whPer1kInput": 0.03,  "whPer1kOutput": 0.30, "activeParamsB": 123 },
    { "prefix": "codestral",         "provider": "mistral", "family": "codestral",      "whPer1kInput": 0.006, "whPer1kOutput": 0.06, "activeParamsB": 22 },
    { "prefix": "mistral-large",     "provider": "mistral", "family": "mistral-large",  "whPer1kInput": 0.012, "whPer1kOutput": 0.12, "activeParamsB": 41, "note": "MoE, ~41B active (unverified)." }
  ],
  "defaultModel": { "family": "unknown", "whPer1kInput": 0.01, "whPer1kOutput": 0.10, "note": "Unknown model: Sonnet-class fallback." },
  "equivalences": {
    "googleSearch_gCO2": 0.11,
    "ledMinute_Wh": 0.17,
    "waterBottle_ml": 500,
    "kmGasoline_gCO2": 230,
    "kmEV_gCO2": 55,
    "phoneCharge_Wh": 17
  }
}
```

- [ ] **Step 5: Rewrite `src/coefficients.js`**

```js
// Coefficients — single source of truth is data/coefficients.json (shared with the Swift app)
const path = require('path');
const raw = require(path.join(__dirname, '..', 'data', 'coefficients.json'));

const PROVIDERS = raw.providers;
const MODELS = raw.models;            // ordered: first matching prefix wins
const DEFAULT_MODEL = raw.defaultModel;
const EQUIVALENCES = raw.equivalences;
const INFRA_KEYS = ['pue', 'gridCO2_gPerKwh', 'wueOnsite_LPerKwh', 'wueOffsite_LPerKwh', 'cacheReadFactor'];

function getModelProfile(modelId, fallbackProvider = 'anthropic') {
  const id = String(modelId || '');
  const hit = MODELS.find(m => id.startsWith(m.prefix));
  if (hit) return { ...hit, known: true };
  return { ...DEFAULT_MODEL, prefix: null, provider: fallbackProvider, known: false };
}

function getInfra(provider, overrides = {}) {
  const base = PROVIDERS[provider];
  if (!base) throw new Error(`Unknown provider: ${provider}`);
  if (base.excluded) return { ...base };
  const own = overrides[provider] || {};
  const merged = { ...base };
  for (const k of INFRA_KEYS) {
    if (typeof own[k] === 'number' && Number.isFinite(own[k])) merged[k] = own[k];
  }
  return merged;
}

// Legacy exports — removed in Task 6 once routes/calculator use the v2 API
const DEFAULTS = Object.fromEntries(INFRA_KEYS.map(k => [k, PROVIDERS.anthropic[k]]));
const UNCERTAINTY = PROVIDERS.anthropic.uncertainty;
const getModelEnergy = (id) => getModelProfile(id);

module.exports = {
  PROVIDERS, MODELS, DEFAULT_MODEL, EQUIVALENCES, INFRA_KEYS, getModelProfile, getInfra,
  DEFAULTS, UNCERTAINTY, getModelEnergy,
};
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 7: Smoke test — old server still runs**

Run: `npm start` (in background), then `curl -s localhost:3456/api/summary | head -c 300`, then stop the server.
Expected: JSON, no `NaN`.

- [ ] **Step 8: Commit**

```bash
git add data/coefficients.json src/coefficients.js package.json test/coefficients.test.js
git commit -m "feat: coefficients v2 with provider profiles and current Claude/Mistral models"
```

---

### Task 2: Claude Code adapter (fixed dedup)

**Files:**
- Create: `src/paths.js`, `src/providers/claude-code.js`
- Create fixtures: `test/fixtures/claude/projects/-Users-test-proj/session-a.jsonl`, `test/fixtures/claude/projects/-Users-test-proj/s1/subagents/agent-x.jsonl`
- Test: `test/claude-code.test.js`

**Interfaces:**
- Produces: `resolvePaths(env = process.env) → {claudeDir, vibeHome, dataDir}` (env overrides: `LLM_GREEN_CLAUDE_DIR`, `LLM_GREEN_VIBE_HOME` / `VIBE_HOME`, `LLM_GREEN_DATA_DIR`).
- Produces: adapter object (see the Adapter interface above) plus `parseClaudeLines(text: string) → UsageEvent[]` (exported for tests).

- [ ] **Step 1: Create fixtures**

`test/fixtures/claude/projects/-Users-test-proj/session-a.jsonl`. Each JSON object goes on **one line**. Line 6 is deliberately truncated.

```
{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-10-09T09:59:00.000Z","sessionId":"s1"}
{"type":"assistant","uuid":"u1","requestId":"req_1","sessionId":"s1","cwd":"/Users/test/proj","timestamp":"2026-10-09T10:00:00.000Z","message":{"id":"msg_A","role":"assistant","model":"claude-opus-5-5","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":1000,"cache_creation_input_tokens":300,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":300},"speed":"standard","inference_geo":"global"}}}
{"type":"assistant","uuid":"u2","requestId":"req_1","sessionId":"s1","cwd":"/Users/test/proj","timestamp":"2026-10-09T10:00:01.000Z","message":{"id":"msg_A","role":"assistant","model":"claude-opus-5-5","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":1000,"cache_creation_input_tokens":300,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":300},"speed":"standard","inference_geo":"global"}}}
{"type":"assistant","uuid":"u3","requestId":"req_s","sessionId":"s1","timestamp":"2026-10-09T10:01:00.000Z","message":{"id":"msg_S","role":"assistant","model":"<synthetic>","usage":{"input_tokens":0,"output_tokens":5}}}
{"type":"assistant","uuid":"u4","requestId":"req_2","sessionId":"s1","cwd":"/Users/test/proj","timestamp":"2026-10-09T23:30:00.000Z","message":{"id":"msg_B","role":"assistant","model":"claude-fable-5-1","usage":{"input_tokens":10,"output_tokens":50,"cache_read_input_tokens":0,"cache_creation_input_tokens":40,"speed":"fast","inference_geo":"us"}}}
{"type":"assistant","uuid":"u5","requestId":"req_x","message":{"id":"msg_X","role":"assist
{"type":"assistant","uuid":"u6","requestId":"req_3","sessionId":"s1","timestamp":"2026-10-09T12:00:00.000Z","message":{"id":"msg_C","role":"assistant","model":"claude-opus-5-5","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
{"type":"assistant","uuid":"u7","requestId":"req_4","sessionId":"s1","cwd":"/Users/test/proj","timestamp":"2026-10-08T12:00:00.000Z","message":{"id":"msg_D","role":"assistant","model":"claude-nova-1","usage":{"input_tokens":0,"output_tokens":10}}}
```

`test/fixtures/claude/projects/-Users-test-proj/s1/subagents/agent-x.jsonl` repeats msg_A in another file (cross-file duplicate):

```
{"type":"assistant","uuid":"u9","requestId":"req_1","sessionId":"s1","cwd":"/Users/test/proj","timestamp":"2026-10-09T10:00:00.000Z","message":{"id":"msg_A","role":"assistant","model":"claude-opus-5-5","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":1000,"cache_creation_input_tokens":300,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":300}}}}
```

- [ ] **Step 2: Write the failing test** — `test/claude-code.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const claude = require('../src/providers/claude-code');
const { resolvePaths } = require('../src/paths');

const FIX = path.join(__dirname, 'fixtures', 'claude');
const paths = { claudeDir: FIX };

test('parseClaudeLines: dedup by message.id+requestId, skip synthetic/zero/malformed', () => {
  const text = fs.readFileSync(path.join(FIX, 'projects', '-Users-test-proj', 'session-a.jsonl'), 'utf-8');
  const evs = claude.parseClaudeLines(text);
  assert.deepEqual(evs.map(e => e.model), ['claude-opus-5-5', 'claude-fable-5-1', 'claude-nova-1']);
  const a = evs[0];
  assert.equal(a.id, 'claude-code:msg_A:req_1');
  assert.equal(a.provider, 'anthropic');
  assert.equal(a.agent, 'claude-code');
  assert.equal(a.granularity, 'request');
  assert.deepEqual(a.tokens, { input: 100, output: 200, cacheRead: 1000, cacheWrite5m: 0, cacheWrite1h: 300 });
  assert.equal(a.project, '/Users/test/proj');
  assert.equal(a.sessionId, 's1');
  const b = evs[1];
  assert.deepEqual(b.tokens, { input: 10, output: 50, cacheRead: 0, cacheWrite5m: 40, cacheWrite1h: 0 });
  assert.equal(b.speed, 'fast');
  assert.equal(b.geo, 'us');
});

test('readEvents: dedups across files and reuses the per-file cache', async () => {
  const cache = new Map();
  const first = await claude.readEvents(paths, cache);
  assert.equal(first.length, 3);
  assert.equal(cache.size, 2);
  const second = await claude.readEvents(paths, cache);
  assert.equal(second.length, 3);
});

test('detect / watchDirs', () => {
  assert.equal(claude.detect(paths), true);
  assert.equal(claude.detect({ claudeDir: '/nonexistent' }), false);
  assert.deepEqual(claude.watchDirs(paths), [path.join(FIX, 'projects')]);
});

test('resolvePaths honours env overrides', () => {
  const p = resolvePaths({ HOME: '/h', LLM_GREEN_VIBE_HOME: '/v' });
  assert.equal(p.claudeDir, '/h/.claude');
  assert.equal(p.vibeHome, '/v');
  assert.equal(p.dataDir, '/h/.llm-green');
  assert.equal(resolvePaths({ HOME: '/h', VIBE_HOME: '/vv' }).vibeHome, '/vv');
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/providers/claude-code'`).

- [ ] **Step 4: Create `src/paths.js`**

```js
const os = require('os');
const path = require('path');

// All on-disk locations, overridable via env (tests, non-default installs)
function resolvePaths(env = process.env) {
  const home = env.HOME || os.homedir();
  return {
    claudeDir: env.LLM_GREEN_CLAUDE_DIR || path.join(home, '.claude'),
    vibeHome: env.LLM_GREEN_VIBE_HOME || env.VIBE_HOME || path.join(home, '.vibe'),
    dataDir: env.LLM_GREEN_DATA_DIR || path.join(home, '.llm-green'),
  };
}

module.exports = { resolvePaths };
```

- [ ] **Step 5: Create `src/providers/claude-code.js`**

```js
// Claude Code adapter — ~/.claude/projects/**/*.jsonl → UsageEvent[]
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const SKIP_MODELS = new Set(['<synthetic>']);

function parseClaudeLines(text) {
  const events = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; } // partial line while Claude Code writes
    if (entry.type !== 'assistant') continue;
    const msg = entry.message;
    if (!msg || msg.role !== 'assistant' || !msg.usage) continue;
    const model = msg.model || 'unknown';
    if (SKIP_MODELS.has(model)) continue;

    // One API response is written as several lines (one per content block) with identical usage
    const id = (msg.id || entry.requestId)
      ? `claude-code:${msg.id || ''}:${entry.requestId || ''}`
      : `claude-code:uuid:${entry.uuid}`;
    if (seen.has(id)) continue;

    const u = msg.usage;
    const cacheWriteTotal = u.cache_creation_input_tokens || 0;
    const split = u.cache_creation || {};
    const cacheWrite1h = split.ephemeral_1h_input_tokens || 0;
    const cacheWrite5m = split.ephemeral_5m_input_tokens != null
      ? split.ephemeral_5m_input_tokens
      : Math.max(0, cacheWriteTotal - cacheWrite1h);
    const tokens = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite5m,
      cacheWrite1h,
    };
    if (!tokens.input && !tokens.output && !tokens.cacheRead && !tokens.cacheWrite5m && !tokens.cacheWrite1h) continue;

    seen.add(id);
    events.push({
      id,
      agent: 'claude-code',
      provider: 'anthropic',
      model,
      timestamp: entry.timestamp,
      granularity: 'request',
      tokens,
      project: entry.cwd || null,
      sessionId: entry.sessionId || null,
      speed: u.speed || 'standard',
      geo: u.inference_geo || null,
    });
  }
  return events;
}

function projectsDir(paths) {
  return path.join(paths.claudeDir, 'projects');
}

async function readEvents(paths, cache = new Map()) {
  const files = (await glob(path.join(projectsDir(paths), '**', '*.jsonl'))).sort();
  const live = new Set(files);
  for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);

  const seen = new Set();
  const out = [];
  for (const file of files) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    let entry = cache.get(file);
    if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
      let text;
      try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      entry = { mtimeMs: st.mtimeMs, size: st.size, events: parseClaudeLines(text) };
      cache.set(file, entry);
    }
    for (const ev of entry.events) {
      if (seen.has(ev.id)) continue; // subagent files repeat entries
      seen.add(ev.id);
      out.push(ev);
    }
  }
  return out;
}

module.exports = {
  id: 'claude-code',
  label: 'Claude Code',
  provider: 'anthropic',
  detect: (paths) => fs.existsSync(projectsDir(paths)),
  readEvents,
  watchDirs: (paths) => [projectsDir(paths)],
  parseClaudeLines,
};
```

- [ ] **Step 6: Run — expect PASS**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Sanity check against real data**

Run:
```bash
node -e "require('./src/providers/claude-code').readEvents(require('./src/paths').resolvePaths()).then(e=>{const m={};for(const x of e)m[x.model]=(m[x.model]||0)+1;console.log(e.length,m)})"
```
Expected: roughly half the per-line counts from Reference Facts (for example `claude-opus-5` ≈ 2.100 instead of 4.272). No `<synthetic>`.

- [ ] **Step 8: Commit**

```bash
git add src/paths.js src/providers/claude-code.js test/claude-code.test.js test/fixtures/claude
git commit -m "feat: Claude Code adapter with normalized events; fix ~2x double counting (dedup by message.id+requestId)"
```

---

### Task 3: Calculator on normalized events

**Files:**
- Rewrite: `src/calculator.js`
- Test: `test/calculator.test.js`

**Interfaces:**
- Consumes: `getModelProfile`, `getInfra`, `PROVIDERS`, `EQUIVALENCES` (Task 1); `UsageEvent` shape.
- Produces:
  - `calculate(event, overrides = {}) → {energy_wh, it_energy_wh, co2_g, water_onsite_ml, water_offsite_ml, water_total_ml, excluded: boolean, knownModel: boolean}`
  - `lcaReference(event, overrides = {}) → {co2_g, water_ml} | null`
  - `rangesFor(byProvider: {[provider]: {energy_wh, co2_g, water_total_ml}}) → {energy_wh:{low,central,high}, co2_g:{…}, water_total_ml:{…}}`
  - `getEquivalences(co2_g, water_ml, energy_wh)` (unchanged).

- [ ] **Step 1: Write the failing test** — `test/calculator.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, lcaReference, rangesFor } = require('../src/calculator');

const ev = (provider, model, tokens) => ({
  provider, model,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...tokens },
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Anthropic Opus: 1k output tokens', () => {
  const r = calculate(ev('anthropic', 'claude-opus-5-5', { output: 1000 }));
  close(r.it_energy_wh, 0.30);
  close(r.energy_wh, 0.342);
  close(r.co2_g, 0.342 * 385 / 1000);
  close(r.water_onsite_ml, 0.30 * 0.18);
  close(r.water_offsite_ml, 0.342 * 5.11);
  close(r.water_total_ml, 0.30 * 0.18 + 0.342 * 5.11);
  assert.equal(r.knownModel, true);
  assert.equal(r.excluded, false);
});

test('cache read uses factor, both cache-write tiers count as input', () => {
  close(calculate(ev('anthropic', 'claude-opus-5-5', { cacheRead: 10000 })).it_energy_wh, 10 * 0.03 * 0.15);
  close(calculate(ev('anthropic', 'claude-opus-5-5', { cacheWrite5m: 1000, cacheWrite1h: 1000 })).it_energy_wh, 0.06);
});

test('Mistral uses its own infrastructure', () => {
  const r = calculate(ev('mistral', 'mistral-vibe-cli-latest', { output: 1000 }));
  close(r.energy_wh, 0.36);
  close(r.co2_g, 0.36 * 80 / 1000);
});

test('overrides apply per provider', () => {
  const r = calculate(ev('anthropic', 'claude-opus-5-5', { output: 1000 }), { anthropic: { pue: 1.0 }, mistral: { pue: 2 } });
  close(r.energy_wh, 0.30);
});

test('local models are excluded', () => {
  const r = calculate(ev('local', 'ministral-3-8b-16k', { output: 1000 }));
  assert.equal(r.excluded, true);
  assert.equal(r.co2_g, 0);
  assert.equal(r.water_total_ml, 0);
});

test('unknown model flagged', () => {
  assert.equal(calculate(ev('anthropic', 'claude-nova-1', { output: 1 })).knownModel, false);
});

test('LCA reference scales by active parameters (Mistral only)', () => {
  const r = lcaReference(ev('mistral', 'mistral-vibe-cli-latest', { output: 1000 }));
  close(r.co2_g, 2.85 * 128 / 123);
  close(r.water_ml, 112.5 * 128 / 123);
  assert.equal(lcaReference(ev('anthropic', 'claude-opus-5-5', { output: 1000 })), null);
  assert.equal(lcaReference(ev('local', 'x', { output: 1000 })), null);
});

test('rangesFor sums provider-specific uncertainty', () => {
  const one = { energy_wh: 1, co2_g: 1, water_total_ml: 1 };
  const r = rangesFor({ anthropic: one, mistral: one, local: { energy_wh: 0, co2_g: 0, water_total_ml: 0 } });
  close(r.co2_g.low, 0.5 + 0.3);
  close(r.co2_g.central, 2);
  close(r.co2_g.high, 1.8 + 3.75);
  close(r.energy_wh.high, 2.0 + 2.5);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`calculate` reads `tokens.input_tokens` / `lcaReference is not a function`).

- [ ] **Step 3: Rewrite `src/calculator.js`**

```js
const { getModelProfile, getInfra, PROVIDERS, EQUIVALENCES } = require('./coefficients');

const ZERO = {
  energy_wh: 0, it_energy_wh: 0, co2_g: 0,
  water_onsite_ml: 0, water_offsite_ml: 0, water_total_ml: 0,
};

// tokens → energy (Wh) → CO2 (g) → water (mL), using the event's provider infrastructure
function calculate(event, overrides = {}) {
  const infra = getInfra(event.provider, overrides);
  if (infra.excluded) return { ...ZERO, excluded: true, knownModel: true };

  const profile = getModelProfile(event.model, event.provider);
  const t = event.tokens;
  const itEnergy_wh =
    (t.input / 1000) * profile.whPer1kInput +
    (t.output / 1000) * profile.whPer1kOutput +
    (t.cacheRead / 1000) * profile.whPer1kInput * infra.cacheReadFactor +
    ((t.cacheWrite5m + t.cacheWrite1h) / 1000) * profile.whPer1kInput;
  const energy_wh = itEnergy_wh * infra.pue;

  // Wh × L/kWh = mL
  const water_onsite_ml = itEnergy_wh * infra.wueOnsite_LPerKwh;
  const water_offsite_ml = energy_wh * infra.wueOffsite_LPerKwh;

  return {
    energy_wh,
    it_energy_wh: itEnergy_wh,
    co2_g: energy_wh * infra.gridCO2_gPerKwh / 1000,
    water_onsite_ml,
    water_offsite_ml,
    water_total_ml: water_onsite_ml + water_offsite_ml,
    excluded: false,
    knownModel: profile.known,
  };
}

// Provider-reported lifecycle figure (Mistral LCA), shown as an upper reference only
function lcaReference(event, overrides = {}) {
  const infra = getInfra(event.provider, overrides);
  if (infra.excluded || !infra.lca) return null;
  const profile = getModelProfile(event.model, event.provider);
  const scale = profile.activeParamsB ? profile.activeParamsB / infra.lca.refActiveParamsB : 1;
  const k = event.tokens.output / 1000;
  return {
    co2_g: k * infra.lca.gCO2ePer1kOutput * scale,
    water_ml: k * infra.lca.waterMlPer1kOutput * scale,
  };
}

// Uncertainty ranges summed over providers (each provider has its own multipliers)
function rangesFor(byProvider) {
  const out = {
    energy_wh: { low: 0, central: 0, high: 0 },
    co2_g: { low: 0, central: 0, high: 0 },
    water_total_ml: { low: 0, central: 0, high: 0 },
  };
  const map = { energy_wh: 'energy', co2_g: 'co2', water_total_ml: 'water' };
  for (const [provider, b] of Object.entries(byProvider)) {
    const u = PROVIDERS[provider] && PROVIDERS[provider].uncertainty;
    if (!u) continue;
    for (const [field, key] of Object.entries(map)) {
      out[field].low += b[field] * u[key].low;
      out[field].central += b[field];
      out[field].high += b[field] * u[key].high;
    }
  }
  return out;
}

function getEquivalences(co2_g, water_ml, energy_wh) {
  return {
    googleSearches: co2_g / EQUIVALENCES.googleSearch_gCO2,
    ledMinutes: energy_wh / EQUIVALENCES.ledMinute_Wh,
    waterBottles: water_ml / EQUIVALENCES.waterBottle_ml,
    kmDrivingGasoline: co2_g / EQUIVALENCES.kmGasoline_gCO2,
    kmDrivingEV: co2_g / EQUIVALENCES.kmEV_gCO2,
    phoneCharges: energy_wh / EQUIVALENCES.phoneCharge_Wh,
  };
}

module.exports = { calculate, lcaReference, rangesFor, getEquivalences };
```

Note: `src/routes.js` still imports `calculateTotals` / `withUncertainty`, so the server is broken until Task 6. That is acceptable because Tasks 3–6 run back to back; do not run `npm start` in between.

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/calculator.js test/calculator.test.js
git commit -m "feat: event-based calculator with per-provider infrastructure, LCA reference and summed ranges"
```

---

### Task 4: Aggregation

**Files:**
- Create: `src/aggregate.js`
- Test: `test/aggregate.test.js`

**Interfaces:**
- Consumes: `calculate`, `lcaReference` (Task 3).
- Produces:
  - `summarize(events, {overrides = {}, provider = 'all', since = null, until = null}) → {totals, byDay, byHour, byModel, byProvider, byProject, byDayModel, byHourModel, unknownModels: string[]}`. Every bucket (`Bucket`) is `{energy_wh, it_energy_wh, co2_g, water_onsite_ml, water_offsite_ml, water_total_ml, lca_co2_g, lca_water_ml, requests, sessions: number, tokens:{input, output, cache_read, cache_creation, total}}`. `byDayModel[day][model]` and `byHourModel[hour][model]` are Buckets. `since`/`until` are epoch ms (`since` inclusive, `until` exclusive).
  - `dayKey(ms) → 'YYYY-MM-DD'` and `hourKey(ms) → 'YYYY-MM-DDTHH'` (local time); `emptyBucket() → Bucket` (finalized, zeros); `mapValues(obj, fn)`.

- [ ] **Step 1: Write the failing test** — `test/aggregate.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, dayKey, hourKey } = require('../src/aggregate');

const ev = (id, provider, model, ts, tokens, extra = {}) => ({
  id, provider, model, timestamp: ts, speed: 'standard', geo: 'global',
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...tokens },
  project: null, sessionId: null, ...extra,
});

const events = [
  ev('a', 'anthropic', 'claude-opus-5-5', '2026-10-09T23:30:00.000Z', { output: 1000 }, { project: '/p/a', sessionId: 's1' }),
  ev('b', 'mistral', 'mistral-vibe-cli-latest', '2026-10-09T10:00:00.000Z', { output: 1000 }, { project: '/p/b', sessionId: 'v1' }),
  ev('c', 'local', 'ministral-3-8b-16k', '2026-10-09T11:00:00.000Z', { output: 1000 }, { sessionId: 'v2' }),
  ev('d', 'anthropic', 'claude-nova-1', '2026-10-09T12:00:00.000Z', { output: 1000 }, { sessionId: 's1' }),
  ev('e', 'anthropic', 'claude-opus-5-5', 'not-a-date', { output: 1000 }),
];

test('runs in Europe/Vienna', () => {
  assert.equal(dayKey(Date.parse('2026-10-09T23:30:00.000Z')), '2026-10-10');
  assert.equal(hourKey(Date.parse('2026-10-09T23:30:00.000Z')), '2026-10-10T01');
});

test('day buckets use local time; invalid timestamps are skipped', () => {
  const s = summarize(events);
  assert.equal(s.byDay['2026-10-10'].requests, 1);
  assert.equal(s.byDay['2026-10-09'].requests, 3);
  assert.equal(s.totals.requests, 4);
  assert.equal(s.byDayModel['2026-10-10']['claude-opus-5-5'].tokens.output, 1000);
});

test('provider filter, unknown models, local excluded from footprint', () => {
  const all = summarize(events);
  assert.deepEqual(all.unknownModels, ['claude-nova-1']);
  assert.equal(all.byProvider.local.co2_g, 0);
  assert.equal(all.byProvider.local.tokens.output, 1000);
  assert.ok(all.byProvider.mistral.lca_co2_g > 0);

  const m = summarize(events, { provider: 'mistral' });
  assert.equal(m.totals.requests, 1);
  assert.deepEqual(Object.keys(m.byProvider), ['mistral']);
});

test('projects, sessions, time window', () => {
  const s = summarize(events);
  assert.deepEqual(Object.keys(s.byProject).sort(), ['(unknown)', '/p/a', '/p/b']);
  assert.equal(s.totals.sessions, 3);
  const w = summarize(events, { since: Date.parse('2026-10-09T10:30:00.000Z'), until: Date.parse('2026-10-09T12:00:00.000Z') });
  assert.equal(w.totals.requests, 1);
});

test('tokens.total includes cache traffic', () => {
  const s = summarize([ev('x', 'anthropic', 'claude-opus-5-5', '2026-10-09T10:00:00Z',
    { input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5 })]);
  assert.deepEqual(s.totals.tokens, { input: 1, output: 2, cache_read: 3, cache_creation: 9, total: 15 });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/aggregate'`).

- [ ] **Step 3: Create `src/aggregate.js`**

```js
// Buckets events by day/hour/model/provider/project. Day and hour keys are local time.
const { calculate, lcaReference } = require('./calculator');

const pad = (n) => String(n).padStart(2, '0');
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hourKey(ms) {
  return `${dayKey(ms)}T${pad(new Date(ms).getHours())}`;
}

function newBucket() {
  return {
    energy_wh: 0, it_energy_wh: 0, co2_g: 0,
    water_onsite_ml: 0, water_offsite_ml: 0, water_total_ml: 0,
    lca_co2_g: 0, lca_water_ml: 0,
    requests: 0, sessions: new Set(),
    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0, total: 0 },
  };
}

function add(b, ev, r) {
  b.energy_wh += r.energy_wh;
  b.it_energy_wh += r.it_energy_wh;
  b.co2_g += r.co2_g;
  b.water_onsite_ml += r.water_onsite_ml;
  b.water_offsite_ml += r.water_offsite_ml;
  b.water_total_ml += r.water_total_ml;
  if (r.lca) { b.lca_co2_g += r.lca.co2_g; b.lca_water_ml += r.lca.water_ml; }
  b.requests += 1;
  if (ev.sessionId) b.sessions.add(ev.sessionId);
  const t = ev.tokens;
  const cw = t.cacheWrite5m + t.cacheWrite1h;
  b.tokens.input += t.input;
  b.tokens.output += t.output;
  b.tokens.cache_read += t.cacheRead;
  b.tokens.cache_creation += cw;
  b.tokens.total += t.input + t.output + t.cacheRead + cw;
}

function finalize(b) {
  return { ...b, sessions: b.sessions.size, tokens: { ...b.tokens } };
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

function emptyBucket() {
  return finalize(newBucket());
}

function summarize(events, { overrides = {}, provider = 'all', since = null, until = null } = {}) {
  const totals = newBucket();
  const byDay = {}, byHour = {}, byModel = {}, byProvider = {}, byProject = {};
  const byDayModel = {}, byHourModel = {};
  const unknown = new Set();

  for (const ev of events) {
    if (provider !== 'all' && ev.provider !== provider) continue;
    const ts = Date.parse(ev.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (since != null && ts < since) continue;
    if (until != null && ts >= until) continue;

    const r = { ...calculate(ev, overrides), lca: lcaReference(ev, overrides) };
    if (!r.knownModel) unknown.add(ev.model);

    const d = dayKey(ts);
    const h = hourKey(ts);
    add(totals, ev, r);
    add(byDay[d] ||= newBucket(), ev, r);
    add(byHour[h] ||= newBucket(), ev, r);
    add(byModel[ev.model] ||= newBucket(), ev, r);
    add(byProvider[ev.provider] ||= newBucket(), ev, r);
    add(byProject[ev.project || '(unknown)'] ||= newBucket(), ev, r);
    add((byDayModel[d] ||= {})[ev.model] ||= newBucket(), ev, r);
    add((byHourModel[h] ||= {})[ev.model] ||= newBucket(), ev, r);
  }

  return {
    totals: finalize(totals),
    byDay: mapValues(byDay, finalize),
    byHour: mapValues(byHour, finalize),
    byModel: mapValues(byModel, finalize),
    byProvider: mapValues(byProvider, finalize),
    byProject: mapValues(byProject, finalize),
    byDayModel: mapValues(byDayModel, m => mapValues(m, finalize)),
    byHourModel: mapValues(byHourModel, m => mapValues(m, finalize)),
    unknownModels: [...unknown].sort(),
  };
}

module.exports = { summarize, dayKey, hourKey, emptyBucket, mapValues };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/aggregate.js test/aggregate.test.js
git commit -m "feat: aggregate events into local-time day/hour/model/provider/project buckets with LCA reference"
```

---

### Task 5: Config per provider (with v1 migration)

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: `INFRA_KEYS`, `PROVIDERS` (Task 1).
- Produces: `normalizeConfig(raw) → {overrides: {[provider]: {[infraKey]: number}}}`; `loadConfig(path)`; `saveConfig(path, cfg)`; `applyUpdate(cfg, body) → cfg` where `body = {provider?: 'anthropic'|'mistral', pue?, gridCO2_gPerKwh?, wueOnsite_LPerKwh?, wueOffsite_LPerKwh?, cacheReadFactor?}`.

- [ ] **Step 1: Write the failing test** — `test/config.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeConfig, loadConfig, saveConfig, applyUpdate } = require('../src/config');

test('v1 flat keys migrate to anthropic overrides', () => {
  const c = normalizeConfig({ pue: 1.3, gridCO2_gPerKwh: 200 });
  assert.deepEqual(c.overrides, { anthropic: { pue: 1.3, gridCO2_gPerKwh: 200 } });
});

test('v2 shape is kept; unknown and excluded providers dropped', () => {
  const c = normalizeConfig({ overrides: { mistral: { pue: 1.1, junk: 5 }, local: { pue: 2 }, foo: {} } });
  assert.deepEqual(c.overrides, { mistral: { pue: 1.1 } });
});

test('applyUpdate targets one provider, defaults to anthropic', () => {
  let c = normalizeConfig({});
  c = applyUpdate(c, { provider: 'mistral', gridCO2_gPerKwh: '120' });
  c = applyUpdate(c, { pue: 1.2 });
  c = applyUpdate(c, { provider: 'nope', pue: 9 });
  assert.deepEqual(c.overrides, { mistral: { gridCO2_gPerKwh: 120 }, anthropic: { pue: 1.2 } });
});

test('load/save round trip; missing or corrupt file → defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmg-'));
  const p = path.join(dir, 'config.json');
  assert.deepEqual(loadConfig(p).overrides, {});
  fs.writeFileSync(p, '{oops');
  assert.deepEqual(loadConfig(p).overrides, {});
  saveConfig(p, applyUpdate(normalizeConfig({}), { pue: 1.5 }));
  assert.equal(loadConfig(p).overrides.anthropic.pue, 1.5);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/config'`).

- [ ] **Step 3: Create `src/config.js`**

```js
// User coefficient overrides, persisted to config.json (gitignored)
const fs = require('fs');
const { INFRA_KEYS, PROVIDERS } = require('./coefficients');

const editable = (p) => Boolean(PROVIDERS[p]) && !PROVIDERS[p].excluded;

function pickNumbers(vals) {
  const out = {};
  if (!vals || typeof vals !== 'object') return out;
  for (const k of INFRA_KEYS) {
    if (vals[k] === undefined) continue;
    const v = Number(vals[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function normalizeConfig(raw) {
  const cfg = { overrides: {} };
  if (!raw || typeof raw !== 'object') return cfg;
  const legacy = pickNumbers(raw); // v1: flat keys meant Anthropic
  if (Object.keys(legacy).length) cfg.overrides.anthropic = legacy;
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [p, vals] of Object.entries(raw.overrides)) {
      if (!editable(p)) continue;
      const picked = pickNumbers(vals);
      if (Object.keys(picked).length) cfg.overrides[p] = { ...(cfg.overrides[p] || {}), ...picked };
    }
  }
  return cfg;
}

function loadConfig(file) {
  try { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf-8'))); }
  catch { return normalizeConfig({}); }
}

function saveConfig(file, cfg) {
  try { fs.writeFileSync(file, JSON.stringify(cfg, null, 2)); } catch { /* non-critical */ }
}

function applyUpdate(cfg, body = {}) {
  const next = { ...cfg, overrides: { ...cfg.overrides } };
  const provider = body.provider || 'anthropic';
  const picked = pickNumbers(body);
  if (editable(provider) && Object.keys(picked).length) {
    next.overrides[provider] = { ...(cfg.overrides[provider] || {}), ...picked };
  }
  return next;
}

module.exports = { normalizeConfig, loadConfig, saveConfig, applyUpdate };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: per-provider coefficient overrides with v1 config migration"
```

---

### Task 6: Store, router and server refactor (drop stats-cache)

**Files:**
- Create: `src/store.js`, `src/providers/index.js`
- Rewrite: `src/routes.js`, `server.js`
- Modify: `src/coefficients.js` (remove legacy exports), `public/app.js` (SSE handler only)
- Delete: `src/parser.js`
- Test: `test/store.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: Claude adapter (Task 2), `summarize`/`dayKey`/`hourKey`/`emptyBucket`/`mapValues` (Task 4), `rangesFor`/`getEquivalences` (Task 3), `getInfra`/`PROVIDERS` (Task 1), config functions (Task 5).
- Produces:
  - `createStore({adapters, paths, logger = console}) → {load() → Promise<{events, status}>, watchDirs() → string[], last}`. `status` is `[{id, label, provider, detected, events, error}]`.
  - `createRouter({store, configPath, paths, now = Date.now}) → {router, startWatching, stopWatching}`.
  - `createApp({paths?, adapters?, configPath?}) → {app, store, startWatching, stopWatching}` from `server.js`.
  - API (query `provider=all|anthropic|mistral|local` on all data endpoints):
    - `GET /api/summary` → `Bucket & {ranges, equivalences, perModel, perProvider, unknownModels, config}`. `config = {...anthropicInfra, providers: {anthropic, mistral}}` (the flat anthropic keys keep the old sliders working).
    - `GET /api/daily?days=N` → `[{date, co2_g, water_total_ml, water_onsite_ml, water_offsite_ml, energy_wh, lca_co2_g, messages, sessions, tokensByModel: {[model]: {input, output, cache_read, cache_creation, co2_g, water_total_ml, water_onsite_ml, water_offsite_ml, energy_wh}}}]`: one entry per local day, oldest first, zero-filled.
    - `GET /api/hourly` → 24 entries, the same fields plus `hour: "H:00"`, no `date`.
    - `GET /api/models` → `{[model]: Bucket}`.
    - `GET /api/projects?days=N` → `[{project, ...Bucket}]` sorted by `co2_g` desc.
    - `GET/POST /api/config`, `GET /api/stream` (SSE `{"type":"update"}`).

- [ ] **Step 1: Write the failing store test** — `test/store.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../src/store');

const quiet = { warn() {} };
const ok = { id: 'ok', label: 'OK', provider: 'anthropic', detect: () => true,
  readEvents: async () => [{ id: '1' }], watchDirs: () => ['/tmp/ok'] };
const broken = { id: 'broken', label: 'Broken', provider: 'mistral', detect: () => true,
  readEvents: async () => { throw new Error('boom'); }, watchDirs: () => ['/tmp/broken'] };
const absent = { id: 'absent', label: 'Absent', provider: 'mistral', detect: () => false,
  readEvents: async () => { throw new Error('must not be called'); }, watchDirs: () => ['/tmp/absent'] };

test('a failing or absent adapter does not break the others', async () => {
  const store = createStore({ adapters: [ok, broken, absent], paths: {}, logger: quiet });
  const { events, status } = await store.load();
  assert.equal(events.length, 1);
  assert.deepEqual(status.map(s => [s.id, s.detected, s.events, s.error]), [
    ['ok', true, 1, null], ['broken', true, 0, 'boom'], ['absent', false, 0, null],
  ]);
  assert.deepEqual(store.watchDirs(), ['/tmp/ok', '/tmp/broken']);
});
```

- [ ] **Step 2: Write the failing API test** — `test/api.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');

const FIX = path.join(__dirname, 'fixtures');

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmg-'));
  const paths = { claudeDir: path.join(FIX, 'claude'), vibeHome: path.join(FIX, 'vibe'), dataDir: dir };
  const { app } = createApp({ paths, configPath: path.join(dir, 'config.json') });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try { await fn(base, dir); } finally { server.close(); }
}

test('summary counts the deduplicated fixture once', async () => {
  await withServer(async (base) => {
    const s = await (await fetch(`${base}/summary?provider=anthropic`)).json();
    assert.deepEqual(s.tokens, { input: 110, output: 260, cache_read: 1000, cache_creation: 340, total: 1710 });
    assert.equal(s.requests, 3);
    assert.deepEqual(s.unknownModels, ['claude-nova-1']);
    assert.equal(s.config.pue, 1.14);
    assert.equal(s.config.providers.mistral.gridCO2_gPerKwh, 80);
    assert.ok(s.ranges.co2_g.high > s.ranges.co2_g.central);
  });
});

test('daily is zero-filled, local-time, oldest first', async () => {
  await withServer(async (base) => {
    const daily = await (await fetch(`${base}/daily?days=36500&provider=anthropic`)).json();
    const byDate = Object.fromEntries(daily.map(d => [d.date, d]));
    assert.equal(byDate['2026-10-10'].tokensByModel['claude-fable-5-1'].output, 50);
    assert.equal(byDate['2026-10-09'].messages, 1);
    assert.equal(byDate['2026-10-08'].messages, 1);
    assert.ok(daily[0].date < daily[daily.length - 1].date);
    const hourly = await (await fetch(`${base}/hourly`)).json();
    assert.equal(hourly.length, 24);
    assert.match(hourly[0].hour, /^\d{1,2}:00$/);
  });
});

test('projects and config round trip', async () => {
  await withServer(async (base) => {
    const projects = await (await fetch(`${base}/projects?days=36500&provider=anthropic`)).json();
    assert.equal(projects[0].project, '/Users/test/proj');
    const res = await fetch(`${base}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'mistral', gridCO2_gPerKwh: 100 }) });
    const cfg = await res.json();
    assert.equal(cfg.providers.mistral.gridCO2_gPerKwh, 100);
    assert.equal(cfg.gridCO2_gPerKwh, 385);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/store'`, `createApp is not a function`).

- [ ] **Step 4: Create `src/providers/index.js`**

```js
// Registered provider adapters (order = display order)
const ADAPTERS = [
  require('./claude-code'),
];

module.exports = { ADAPTERS };
```

- [ ] **Step 5: Create `src/store.js`**

```js
// Runs all adapters; one failing adapter never takes down the dashboard
function createStore({ adapters, paths, logger = console }) {
  const caches = new Map(adapters.map(a => [a.id, new Map()]));
  let last = { events: [], status: [] };

  async function load() {
    const events = [];
    const status = [];
    for (const a of adapters) {
      const detected = Boolean(a.detect(paths));
      let count = 0;
      let error = null;
      if (detected) {
        try {
          const evs = await a.readEvents(paths, caches.get(a.id));
          events.push(...evs);
          count = evs.length;
        } catch (e) {
          error = e.message;
          logger.warn(`[${a.id}] ${e.message}`);
        }
      }
      status.push({ id: a.id, label: a.label, provider: a.provider, detected, events: count, error });
    }
    last = { events, status };
    return last;
  }

  function watchDirs() {
    return adapters.filter(a => a.detect(paths)).flatMap(a => a.watchDirs(paths));
  }

  return { load, watchDirs, get last() { return last; } };
}

module.exports = { createStore };
```

- [ ] **Step 6: Rewrite `src/routes.js`**

```js
const fs = require('fs');
const express = require('express');
const { summarize, dayKey, hourKey, emptyBucket, mapValues } = require('./aggregate');
const { rangesFor, getEquivalences } = require('./calculator');
const { getInfra, PROVIDERS } = require('./coefficients');
const { loadConfig, saveConfig, applyUpdate } = require('./config');

const HOUR_MS = 60 * 60 * 1000;
const FILTERS = new Set(['anthropic', 'mistral', 'local']);

function addDays(ms, n) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function modelEntry(b) {
  return {
    input: b.tokens.input, output: b.tokens.output,
    cache_read: b.tokens.cache_read, cache_creation: b.tokens.cache_creation,
    co2_g: b.co2_g, water_total_ml: b.water_total_ml,
    water_onsite_ml: b.water_onsite_ml, water_offsite_ml: b.water_offsite_ml,
    energy_wh: b.energy_wh,
  };
}
function periodEntry(b, models) {
  return {
    co2_g: b.co2_g, water_total_ml: b.water_total_ml,
    water_onsite_ml: b.water_onsite_ml, water_offsite_ml: b.water_offsite_ml,
    energy_wh: b.energy_wh,
    lca_co2_g: b.lca_co2_g, messages: b.requests, sessions: b.sessions,
    tokensByModel: mapValues(models || {}, modelEntry),
  };
}

function createRouter({ store, configPath, now = Date.now }) {
  const router = express.Router();
  let config = loadConfig(configPath);
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const providerOf = (req) => (FILTERS.has(req.query.provider) ? req.query.provider : 'all');
  const daysOf = (req) => Math.max(1, parseInt(req.query.days, 10) || 30);

  function publicConfig() {
    const providers = {};
    for (const p of Object.keys(PROVIDERS)) {
      if (!PROVIDERS[p].excluded) providers[p] = getInfra(p, config.overrides);
    }
    return { ...providers.anthropic, providers };
  }

  async function run(req, opts = {}) {
    const { events } = await store.load();
    return summarize(events, { overrides: config.overrides, provider: providerOf(req), ...opts });
  }

  router.get('/summary', wrap(async (req, res) => {
    const s = await run(req);
    res.json({
      ...s.totals,
      ranges: rangesFor(s.byProvider),
      equivalences: getEquivalences(s.totals.co2_g, s.totals.water_total_ml, s.totals.energy_wh),
      perModel: s.byModel,
      perProvider: s.byProvider,
      unknownModels: s.unknownModels,
      config: publicConfig(),
    });
  }));

  router.get('/daily', wrap(async (req, res) => {
    const today = startOfLocalDay(now());
    const since = addDays(today, -(daysOf(req) - 1));
    const s = await run(req, { since });
    const out = [];
    for (let t = since; t <= today; t = addDays(t, 1)) {
      const key = dayKey(t);
      out.push({ date: key, ...periodEntry(s.byDay[key] || emptyBucket(), s.byDayModel[key]) });
    }
    res.json(out);
  }));

  router.get('/hourly', wrap(async (req, res) => {
    const d = new Date(now());
    d.setMinutes(0, 0, 0);
    const start = d.getTime() - 23 * HOUR_MS;
    const s = await run(req, { since: start });
    const out = [];
    for (let i = 0; i < 24; i++) {
      const t = start + i * HOUR_MS;
      const key = hourKey(t);
      out.push({ hour: `${new Date(t).getHours()}:00`, ...periodEntry(s.byHour[key] || emptyBucket(), s.byHourModel[key]) });
    }
    res.json(out);
  }));

  router.get('/models', wrap(async (req, res) => {
    res.json((await run(req)).byModel);
  }));

  router.get('/projects', wrap(async (req, res) => {
    const since = addDays(startOfLocalDay(now()), -(daysOf(req) - 1));
    const s = await run(req, { since });
    res.json(Object.entries(s.byProject)
      .map(([project, b]) => ({ project, ...b }))
      .sort((a, b) => b.co2_g - a.co2_g));
  }));

  router.get('/config', (req, res) => res.json(publicConfig()));

  router.post('/config', express.json(), (req, res) => {
    config = applyUpdate(config, req.body || {});
    saveConfig(configPath, config);
    res.json(publicConfig());
  });

  // SSE — clients refetch on {"type":"update"}
  const sseClients = new Set();
  router.get('/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  let watchers = [];
  let debounce = null;
  function broadcast() {
    const msg = `data: ${JSON.stringify({ type: 'update', at: now() })}\n\n`;
    for (const c of sseClients) c.write(msg);
  }
  function startWatching() {
    for (const dir of store.watchDirs()) {
      try {
        watchers.push(fs.watch(dir, { recursive: true }, () => {
          clearTimeout(debounce);
          debounce = setTimeout(broadcast, 500);
        }));
        console.log(`Watching ${dir}`);
      } catch (e) {
        console.warn(`Could not watch ${dir}: ${e.message}`);
      }
    }
  }
  function stopWatching() {
    watchers.forEach(w => w.close());
    watchers = [];
    clearTimeout(debounce);
  }

  return { router, startWatching, stopWatching };
}

module.exports = { createRouter };
```

- [ ] **Step 7: Rewrite `server.js`**

```js
const express = require('express');
const path = require('path');
const { createRouter } = require('./src/routes');
const { createStore } = require('./src/store');
const { resolvePaths } = require('./src/paths');
const { ADAPTERS } = require('./src/providers');

const PORT = 3456;

function createApp({ paths = resolvePaths(), adapters = ADAPTERS, configPath = path.join(__dirname, 'config.json') } = {}) {
  const store = createStore({ adapters, paths });
  const { router, startWatching, stopWatching } = createRouter({ store, configPath, paths });
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', router);
  return { app, store, startWatching, stopWatching };
}

if (require.main === module) {
  const { app, startWatching } = createApp();
  app.listen(PORT, () => {
    console.log(`LLM Green dashboard running at http://localhost:${PORT}`);
    startWatching();
  });
}

module.exports = { createApp };
```

- [ ] **Step 8: Remove legacy exports and the old parser**

In `src/coefficients.js`, delete the block starting with `// Legacy exports` and its three `const` lines. Change `module.exports` to:

```js
module.exports = { PROVIDERS, MODELS, DEFAULT_MODEL, EQUIVALENCES, INFRA_KEYS, getModelProfile, getInfra };
```

Run: `git rm src/parser.js`

- [ ] **Step 9: Fix the SSE handler in `public/app.js`**

Replace the whole `es.onmessage = (e) => { … };` block with:

```js
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'update') refresh();
    } catch { /* ignore parse errors */ }
  };
```

Directly above `function connectSSE()`, add:

```js
// Refetch without the loading overlay (live updates)
async function refresh() {
  const [summary, data] = await Promise.all([
    fetch('/api/summary').then(r => r.json()),
    fetchTimeframeData(),
  ]);
  allTimeSummary = summary;
  renderAll(data);
  updateTimestamp();
}
```

- [ ] **Step 10: Run tests — expect PASS**

Run: `npm test`
Expected: all pass, including `api.test.js`.

- [ ] **Step 11: Smoke test with real data**

Run: `npm start` (in background). Then:
```bash
curl -s localhost:3456/api/summary | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log(j.requests,j.tokens,j.co2_g,j.unknownModels)})"
curl -s 'localhost:3456/api/daily?days=7' | head -c 400
```
Expected: plausible numbers, no `NaN`, `unknownModels` empty or only genuinely new ids. Open `http://localhost:3456`: cards and chart render; the week view shows recent days (it was empty since February). Stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A src server.js public/app.js test
git commit -m "refactor: event store + router factory; drop stale stats-cache; local-time daily/hourly; /api/projects"
```

---

### Task 7: Vibe model resolution

**Files:**
- Create: `src/providers/vibe-models.js`
- Test: `test/vibe-models.test.js`

**Interfaces:**
- Produces: `parseVibeModels(tomlText: string) → [{name, provider?, alias?}]`; `resolveVibeModel(raw: string|null, userModels) → {name: string, provider: 'mistral'|'local'}`.

- [ ] **Step 1: Write the failing test** — `test/vibe-models.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVibeModels, resolveVibeModel } = require('../src/providers/vibe-models');

const TOML = `
active_theme = "dark"

[[providers]]
name = "ollama"
api_base = "http://localhost:11434/v1"

[[models]]
name = "ministral-3-8b-16k"          # exakt wie in \`ollama list\`
provider = "ollama"
alias = "local"

[[models]]
name = "ministral-3-3b-8k"
provider = "ollama"
alias = "local-fast"

[tools.bash]
name = "not-a-model"
`;

test('parseVibeModels reads only [[models]] blocks', () => {
  assert.deepEqual(parseVibeModels(TOML), [
    { name: 'ministral-3-8b-16k', provider: 'ollama', alias: 'local' },
    { name: 'ministral-3-3b-8k', provider: 'ollama', alias: 'local-fast' },
  ]);
  assert.deepEqual(parseVibeModels(''), []);
});

test('resolveVibeModel: user models override built-ins', () => {
  const user = parseVibeModels(TOML);
  assert.deepEqual(resolveVibeModel('local', user), { name: 'ministral-3-8b-16k', provider: 'local' });
  assert.deepEqual(resolveVibeModel('local', []), { name: 'devstral', provider: 'local' });
  assert.deepEqual(resolveVibeModel('mistral-medium-3.5', user), { name: 'mistral-vibe-cli-latest', provider: 'mistral' });
  assert.deepEqual(resolveVibeModel(null, user), { name: 'mistral-vibe-cli-latest', provider: 'mistral' });
  assert.deepEqual(resolveVibeModel('devstral-small-latest', user), { name: 'devstral-small-latest', provider: 'mistral' });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/providers/vibe-models.js`**

```js
// Resolve Vibe's active_model (alias or name) to a model id + provider class
const DEFAULT_MODEL = 'mistral-vibe-cli-latest';

// From mistral-vibe vibe/core/config/vibe_schema.py (v2.25.8)
const BUILTINS = [
  { name: 'mistral-vibe-cli-latest', alias: 'mistral-medium-3.5', provider: 'mistral' },
  { name: 'devstral', alias: 'local', provider: 'llamacpp' },
];

// Minimal reader for [[models]] blocks — enough for name/provider/alias, no TOML dependency
function parseVibeModels(toml = '') {
  const models = [];
  let cur = null;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      cur = line === '[[models]]' ? {} : null;
      if (cur) models.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^(name|provider|alias)\s*=\s*"([^"]*)"/);
    if (m) cur[m[1]] = m[2];
  }
  return models.filter(m => m.name);
}

function resolveVibeModel(raw, userModels = []) {
  const key = raw || DEFAULT_MODEL;
  const hit = [...userModels, ...BUILTINS].find(m => m.alias === key || m.name === key);
  if (!hit) return { name: key, provider: 'mistral' };
  return { name: hit.name, provider: hit.provider === 'mistral' ? 'mistral' : 'local' };
}

module.exports = { parseVibeModels, resolveVibeModel, DEFAULT_MODEL };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/providers/vibe-models.js test/vibe-models.test.js
git commit -m "feat: resolve Mistral Vibe model aliases incl. local Ollama models"
```

---

### Task 8: Mistral Vibe adapter

**Files:**
- Create: `src/providers/mistral-vibe.js`
- Create fixtures under `test/fixtures/vibe/` (listed in Step 1)
- Test: `test/mistral-vibe.test.js`

**Interfaces:**
- Consumes: `parseVibeModels`, `resolveVibeModel` (Task 7); `paths.vibeHome` (Task 2).
- Produces: adapter object `{id: 'mistral-vibe', label: 'Mistral Vibe', provider: 'mistral', detect, readEvents, watchDirs}` that emits session-granularity `UsageEvent`s.

- [ ] **Step 1: Create fixtures**

All paths are below `test/fixtures/vibe/`.

`config.toml`:
```toml
[[models]]
name = "ministral-3-8b-16k"
provider = "ollama"
alias = "local"
```

`logs/session/unified/.session-index.json`:
```json
{ "catalog_version": 1, "entries": [
  { "session_id": "sess-1", "metadata": { "active_model": "mistral-medium-3.5", "cwd": "/Users/test/proj" }, "session": {} },
  { "session_id": "sess-2", "metadata": { "active_model": "local", "cwd": "/Users/test/other" }, "session": {} },
  { "session_id": "sess-4", "metadata": { "active_model": "mistral-medium-3.5", "cwd": "/x" }, "session": {} }
] }
```

`logs/session/unified/sess-1/generations/0000000000000001/projection-state.json` (older generation, must be ignored):
```json
{ "snapshot": { "session": { "createdAt": 1791295860005, "updatedAt": 1791295861000, "tokenUsage": { "cachedInputTokens": 0, "inputTokens": 100, "outputTokens": 1, "totalTokens": 101 } } } }
```

`logs/session/unified/sess-1/generations/0000000000000003/projection-state.json`:
```json
{ "snapshot": { "session": { "createdAt": 1791295860005, "updatedAt": 1791295863837, "tokenUsage": { "cachedInputTokens": 1024, "inputTokens": 11991, "outputTokens": 35, "totalTokens": 12026 } } } }
```

`logs/session/unified/sess-2/generations/0000000000000002/projection-state.json`:
```json
{ "snapshot": { "session": { "createdAt": 1791296000000, "updatedAt": 1791296100000, "tokenUsage": { "cachedInputTokens": 0, "inputTokens": 500, "outputTokens": 100, "totalTokens": 600 } } } }
```

`logs/session/unified/sess-3/meta.json` (session missing from the index):
```json
{ "session_id": "sess-3", "environment": { "working_directory": "/Users/test/third" } }
```

`logs/session/unified/sess-3/generations/0000000000000005/projection-state.json`:
```json
{ "snapshot": { "session": { "createdAt": 1791297000000, "updatedAt": 1791297100000, "tokenUsage": { "cachedInputTokens": 100, "inputTokens": 400, "outputTokens": 50, "totalTokens": 450 } } } }
```

`logs/session/unified/sess-4/generations/0000000000000001/projection-state.json` (no model call):
```json
{ "snapshot": { "session": { "createdAt": 1791298000000, "updatedAt": 1791298000500, "tokenUsage": null } } }
```

`logs/session/unified/sess-5/meta.json` (no `generations/` directory):
```json
{ "session_id": "sess-5" }
```

`logs/session/unified/sess-6/generations/0000000000000001/projection-state.json` (corrupt):
```
{"snapshot": {"session":
```

- [ ] **Step 2: Write the failing test** — `test/mistral-vibe.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vibe = require('../src/providers/mistral-vibe');

const paths = { vibeHome: path.join(__dirname, 'fixtures', 'vibe') };

test('one event per session from the latest generation; broken sessions skipped', async () => {
  const evs = (await vibe.readEvents(paths)).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  assert.deepEqual(evs.map(e => e.sessionId), ['sess-1', 'sess-2', 'sess-3']);

  const [s1, s2, s3] = evs;
  assert.equal(s1.id, 'mistral-vibe:sess-1');
  assert.equal(s1.agent, 'mistral-vibe');
  assert.equal(s1.provider, 'mistral');
  assert.equal(s1.model, 'mistral-vibe-cli-latest');
  assert.equal(s1.granularity, 'session');
  assert.equal(s1.timestamp, new Date(1791295863837).toISOString());
  assert.deepEqual(s1.tokens, { input: 10967, output: 35, cacheRead: 1024, cacheWrite5m: 0, cacheWrite1h: 0 });
  assert.equal(s1.project, '/Users/test/proj');

  assert.equal(s2.provider, 'local');
  assert.equal(s2.model, 'ministral-3-8b-16k');

  assert.equal(s3.model, 'mistral-vibe-cli-latest');
  assert.equal(s3.project, '/Users/test/third');
  assert.deepEqual(s3.tokens, { input: 300, output: 50, cacheRead: 100, cacheWrite5m: 0, cacheWrite1h: 0 });
});

test('missing ~/.vibe → not detected, readEvents returns []', async () => {
  const none = { vibeHome: '/nonexistent/vibe' };
  assert.equal(vibe.detect(none), false);
  assert.deepEqual(await vibe.readEvents(none), []);
  assert.equal(vibe.detect(paths), true);
  assert.deepEqual(vibe.watchDirs(paths), [path.join(paths.vibeHome, 'logs', 'session', 'unified')]);
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `src/providers/mistral-vibe.js`**

```js
// Mistral Vibe adapter — per-session totals from the latest generations/*/projection-state.json.
// The journal/*.jsonl files are compacted and undercount, so they are not used.
const fs = require('fs');
const path = require('path');
const { parseVibeModels, resolveVibeModel } = require('./vibe-models');

const sessionsDir = (paths) => path.join(paths.vibeHome, 'logs', 'session', 'unified');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function readIndex(dir) {
  const idx = readJson(path.join(dir, '.session-index.json'));
  const map = new Map();
  for (const e of (idx && idx.entries) || []) {
    if (e && e.session_id) map.set(e.session_id, e.metadata || {});
  }
  return map;
}

function latestSnapshot(sessionDir) {
  let gens;
  try { gens = fs.readdirSync(path.join(sessionDir, 'generations')).sort().reverse(); } catch { return null; }
  for (const g of gens) {
    const state = readJson(path.join(sessionDir, 'generations', g, 'projection-state.json'));
    if (state && state.snapshot && state.snapshot.session) return state.snapshot.session;
  }
  return null;
}

async function readEvents(paths) {
  const dir = sessionsDir(paths);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  const index = readIndex(dir);
  let toml = '';
  try { toml = fs.readFileSync(path.join(paths.vibeHome, 'config.toml'), 'utf-8'); } catch { /* defaults */ }
  const userModels = parseVibeModels(toml);

  const events = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const sid = ent.name;
    const snap = latestSnapshot(path.join(dir, sid));
    const tu = snap && snap.tokenUsage;
    if (!tu) continue;

    const meta = index.get(sid) || {};
    const { name, provider } = resolveVibeModel(meta.active_model, userModels);
    const sessionMeta = meta.cwd ? null : readJson(path.join(dir, sid, 'meta.json'));
    const cached = tu.cachedInputTokens || 0;
    const ms = snap.updatedAt || snap.createdAt;
    if (!ms) continue;

    events.push({
      id: `mistral-vibe:${sid}`,
      agent: 'mistral-vibe',
      provider,
      model: name,
      timestamp: new Date(ms).toISOString(),
      granularity: 'session',
      tokens: {
        input: Math.max(0, (tu.inputTokens || 0) - cached), // cached is a subset of input
        output: tu.outputTokens || 0,
        cacheRead: cached,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
      },
      project: meta.cwd || (sessionMeta && sessionMeta.environment && sessionMeta.environment.working_directory) || null,
      sessionId: sid,
      speed: 'standard',
      geo: null,
    });
  }
  return events;
}

module.exports = {
  id: 'mistral-vibe',
  label: 'Mistral Vibe',
  provider: 'mistral',
  detect: (paths) => fs.existsSync(sessionsDir(paths)),
  readEvents,
  watchDirs: (paths) => [sessionsDir(paths)],
};
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Sanity check against real data**

Run:
```bash
node -e "require('./src/providers/mistral-vibe').readEvents(require('./src/paths').resolvePaths()).then(e=>console.log(e.map(x=>[x.sessionId.slice(0,8),x.model,x.provider,x.tokens.input,x.tokens.cacheRead,x.tokens.output])))"
```
Expected: the sessions from Reference Facts, including `df73428f` (431.740 input incl. cached, i.e. `input` 33.532 + `cacheRead` 398.208) and nothing for `edd0e29f` (`tokenUsage` null).

- [ ] **Step 7: Commit**

```bash
git add src/providers/mistral-vibe.js test/mistral-vibe.test.js test/fixtures/vibe
git commit -m "feat: Mistral Vibe adapter (session totals from projection-state, local models excluded)"
```

---

### Task 9: Register Vibe + `/api/providers`

**Files:**
- Modify: `src/providers/index.js`, `src/routes.js`
- Test: `test/api.test.js` (extend)

**Interfaces:**
- Consumes: Vibe adapter (Task 8), `store.load().status` (Task 6).
- Produces: `GET /api/providers → [{id, label, provider, detected, events, error}]`.

- [ ] **Step 1: Extend the failing test** — append to `test/api.test.js`:

```js
test('providers endpoint and mixed totals', async () => {
  await withServer(async (base) => {
    const providers = await (await fetch(`${base}/providers`)).json();
    assert.deepEqual(providers.map(p => [p.id, p.detected, p.events]), [['claude-code', true, 3], ['mistral-vibe', true, 3]]);
    const all = await (await fetch(`${base}/summary`)).json();
    assert.deepEqual(Object.keys(all.perProvider).sort(), ['anthropic', 'local', 'mistral']);
    assert.equal(all.perProvider.local.co2_g, 0);
    const m = await (await fetch(`${base}/summary?provider=mistral`)).json();
    assert.equal(m.requests, 2);
    assert.ok(m.lca_co2_g > m.co2_g);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (404 on `/providers`).

- [ ] **Step 3: Register the adapter** — `src/providers/index.js`:

```js
// Registered provider adapters (order = display order)
const ADAPTERS = [
  require('./claude-code'),
  require('./mistral-vibe'),
];

module.exports = { ADAPTERS };
```

- [ ] **Step 4: Add the route** — in `src/routes.js`, directly after the `/projects` route:

```js
  router.get('/providers', wrap(async (req, res) => {
    res.json((await store.load()).status);
  }));
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/providers/index.js src/routes.js test/api.test.js
git commit -m "feat: register Mistral Vibe provider; /api/providers"
```

---

### Task 10: Statusline snapshot + `/api/quota`

**Files:**
- Create: `src/quota.js`, `scripts/statusline-snapshot.js`
- Modify: `src/routes.js`
- Test: `test/quota.test.js`

**Interfaces:**
- Consumes: `paths.dataDir` (Task 2).
- Produces:
  - `buildSnapshot(statuslineInput, nowMs) → {capturedAt, model, windows: {fiveHour: {usedPct, resetsAt}|null, sevenDay: …}}`
  - `readQuota(paths, nowMs = Date.now()) → {claude: null | {capturedAt, ageMinutes, windows: {fiveHour: {usedPct, resetsAt, expired}|null, sevenDay: …}}}`
  - `formatStatusLine(input) → string`; `SNAPSHOT_FILE = 'claude-statusline.json'`
  - `GET /api/quota` → `readQuota(paths)`

- [ ] **Step 1: Write the failing test** — `test/quota.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSnapshot, readQuota, formatStatusLine, SNAPSHOT_FILE } = require('../src/quota');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const input = {
  model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
  rate_limits: {
    five_hour: { used_percentage: 23, resets_at: Math.floor(Date.parse('2026-10-10T14:00:00Z') / 1000) },
    seven_day: { used_percentage: 41.5, resets_at: '2026-10-14T08:00:00Z' },
  },
};

test('buildSnapshot normalises resets_at (epoch s, epoch ms, ISO)', () => {
  const s = buildSnapshot(input, NOW);
  assert.equal(s.capturedAt, NOW);
  assert.equal(s.model, 'claude-opus-5-5');
  assert.deepEqual(s.windows.fiveHour, { usedPct: 23, resetsAt: Date.parse('2026-10-10T14:00:00Z') });
  assert.equal(s.windows.sevenDay.resetsAt, Date.parse('2026-10-14T08:00:00Z'));
  const ms = buildSnapshot({ rate_limits: { five_hour: { used_percentage: 1, resets_at: NOW } } }, NOW);
  assert.equal(ms.windows.fiveHour.resetsAt, NOW);
  assert.equal(ms.windows.sevenDay, null);
});

test('readQuota: missing file → null; passed reset → expired 0 %', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmg-'));
  assert.deepEqual(readQuota({ dataDir: dir }, NOW), { claude: null });
  fs.writeFileSync(path.join(dir, SNAPSHOT_FILE), JSON.stringify(buildSnapshot(input, NOW - 30 * 60000)));
  const q = readQuota({ dataDir: dir }, Date.parse('2026-10-10T15:00:00Z'));
  assert.equal(q.claude.ageMinutes, 210);
  assert.deepEqual(q.claude.windows.fiveHour, { usedPct: 0, resetsAt: null, expired: true });
  assert.equal(q.claude.windows.sevenDay.usedPct, 41.5);
  assert.equal(q.claude.windows.sevenDay.expired, false);
});

test('formatStatusLine', () => {
  assert.equal(formatStatusLine(input), 'Opus 5.5 · 5h 23% · 7d 42%');
  assert.equal(formatStatusLine({}), 'Claude');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/quota.js`**

```js
// Claude subscription rate limits, captured from Claude Code's statusLine stdin JSON
const fs = require('fs');
const path = require('path');

const SNAPSHOT_FILE = 'claude-statusline.json';

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function windowOf(w) {
  if (!w || typeof w.used_percentage !== 'number') return null;
  return { usedPct: w.used_percentage, resetsAt: toMs(w.resets_at) };
}

function buildSnapshot(input, now) {
  const rl = (input && input.rate_limits) || {};
  return {
    capturedAt: now,
    model: (input && input.model && input.model.id) || null,
    windows: { fiveHour: windowOf(rl.five_hour), sevenDay: windowOf(rl.seven_day) },
  };
}

function readQuota(paths, now = Date.now()) {
  let snap;
  try { snap = JSON.parse(fs.readFileSync(path.join(paths.dataDir, SNAPSHOT_FILE), 'utf-8')); }
  catch { return { claude: null }; }
  const windows = {};
  for (const [k, w] of Object.entries(snap.windows || {})) {
    if (!w) { windows[k] = null; continue; }
    // No newer snapshot since the reset means no usage since then
    const expired = w.resetsAt != null && w.resetsAt <= now;
    windows[k] = { usedPct: expired ? 0 : w.usedPct, resetsAt: expired ? null : w.resetsAt, expired };
  }
  return { claude: { capturedAt: snap.capturedAt, ageMinutes: Math.round((now - snap.capturedAt) / 60000), windows } };
}

function formatStatusLine(input) {
  const parts = [(input && input.model && input.model.display_name) || 'Claude'];
  const rl = (input && input.rate_limits) || {};
  if (rl.five_hour && typeof rl.five_hour.used_percentage === 'number') parts.push(`5h ${Math.round(rl.five_hour.used_percentage)}%`);
  if (rl.seven_day && typeof rl.seven_day.used_percentage === 'number') parts.push(`7d ${Math.round(rl.seven_day.used_percentage)}%`);
  return parts.join(' · ');
}

module.exports = { buildSnapshot, readQuota, formatStatusLine, SNAPSHOT_FILE };
```

- [ ] **Step 4: Create `scripts/statusline-snapshot.js`**

```js
#!/usr/bin/env node
// Claude Code statusLine command: saves rate-limit snapshot for LLM Green, prints a short status
const fs = require('fs');
const path = require('path');
const { resolvePaths } = require('../src/paths');
const { buildSnapshot, formatStatusLine, SNAPSHOT_FILE } = require('../src/quota');

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { /* print default */ }
  try {
    const { dataDir } = resolvePaths();
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, SNAPSHOT_FILE);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(buildSnapshot(input, Date.now())));
    fs.renameSync(`${file}.tmp`, file); // atomic for readers
  } catch { /* never break the statusline */ }
  process.stdout.write(formatStatusLine(input));
});
```

- [ ] **Step 5: Add the route** — `src/routes.js`

At the top, add `const { readQuota } = require('./quota');`. Change the signature to `function createRouter({ store, configPath, paths, now = Date.now })`. Directly after the `/providers` route, add:

```js
  router.get('/quota', (req, res) => res.json(readQuota(paths, now())));
```

- [ ] **Step 6: Run — expect PASS**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Manual script check**

Run:
```bash
echo '{"model":{"display_name":"Opus 5.5"},"rate_limits":{"five_hour":{"used_percentage":12,"resets_at":1791600000}}}' | LLM_GREEN_DATA_DIR=$TMPDIR/llmg node scripts/statusline-snapshot.js; echo; cat $TMPDIR/llmg/claude-statusline.json
```
Expected: `Opus 5.5 · 5h 12%` and the snapshot JSON.

- [ ] **Step 8: Ask the user, then enable the statusline**

**Ask the user first** (Global Constraints). If they agree, use the `update-config` skill to add to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "node \"/Users/rm/Library/Mobile Documents/com~apple~CloudDocs/Development/Apps/claude-green/scripts/statusline-snapshot.js\"" }
```

After the next Claude response, `~/.llm-green/claude-statusline.json` should exist and `curl -s localhost:3456/api/quota` should show the windows. If `rate_limits` is missing (API-key login, or before the first response), `windows` is `null` and that is expected.

- [ ] **Step 9: Commit**

```bash
git add src/quota.js scripts/statusline-snapshot.js src/routes.js test/quota.test.js
git commit -m "feat: Claude rate-limit snapshot via statusLine command; /api/quota"
```

---

### Task 11: Frontend — provider filter, usage limits, projects, per-provider settings

**Files:**
- Modify: `public/index.html`, `public/app.js`, `public/style.css`

**Interfaces:**
- Consumes: `/api/summary`, `/api/daily`, `/api/hourly`, `/api/projects`, `/api/providers`, `/api/quota`, `/api/config` (Tasks 6, 9, 10), all with `provider=` where applicable.

No unit tests (vanilla frontend, no harness). Verification is manual in Step 6.

- [ ] **Step 1: `public/index.html` — markup**

(a) In the header, directly before `<span class="last-updated" id="lastUpdated"></span>`, insert:

```html
      <div class="provider-toggle" id="providerToggle">
        <button class="toggle-btn active" data-provider="all">All</button>
        <button class="toggle-btn" data-provider="anthropic">Claude</button>
        <button class="toggle-btn" data-provider="mistral">Mistral</button>
      </div>
```

(b) Directly before `<section class="cards">`, insert:

```html
    <div class="banner hidden" id="unknownBanner"></div>
```

(c) Before `<!-- Row 3: Settings -->`, insert:

```html
    <!-- Row 2b: Quota + Projects -->
    <section class="charts">
      <div class="panel">
        <h2>Usage Limits</h2>
        <div id="quota"></div>
      </div>
      <div class="panel">
        <h2>Top Projects</h2>
        <div id="projects"></div>
      </div>
    </section>
```

(d) In `#settingsPanel`, as its first child, insert:

```html
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-name">Coefficients for</span>
              <select id="settingsProvider">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="mistral">Mistral</option>
              </select>
            </div>
            <p class="setting-desc" id="settingsSources"></p>
          </div>
```

- [ ] **Step 2: `public/app.js` — state and query helper**

Below `let currentDays = 30;`, add:

```js
let currentProvider = 'all';
const q = (params = {}) => {
  const p = new URLSearchParams({ provider: currentProvider, ...params });
  return `?${p.toString()}`;
};
```

In `fetchTimeframeData`, replace both `fetch(...)` URLs:

```js
  if (currentDays === 1) {
    return fetch(`/api/hourly${q()}`).then(r => r.json());
  }
  return fetch(`/api/daily${q({ days: currentDays })}`).then(r => r.json());
```

In `loadDashboard` and `refresh`, replace `fetch('/api/summary')` with `fetch(\`/api/summary${q()}\`)`.

- [ ] **Step 3: `public/app.js` — range and LCA in cards**

In `aggregateDaily`, add `let totalLca = 0;` next to the other totals. Inside `for (const day of daily) {`, at the top, add:

```js
    totalLca += (day.lca_co2_g || 0);
```

Add `lca_co2_g: totalLca,` to the returned object.

In `renderCards`, replace the `// CO2 range` block with:

```js
  // CO2 range — provider-specific uncertainty ratios from the summary
  const r = allTimeSummary && allTimeSummary.ranges && allTimeSummary.ranges.co2_g;
  const lo = r && r.central ? r.low / r.central : 0.5;
  const hi = r && r.central ? r.high / r.central : 1.8;
  document.getElementById('co2Range').textContent =
    `Range: ${fmt(agg.co2_g * lo)} — ${fmt(agg.co2_g * hi)} gCO2e` +
    (agg.lca_co2_g > 0 ? ` | Mistral LCA ref.: ${fmt(agg.lca_co2_g)} g` : '');
```

- [ ] **Step 4: `public/app.js` — banner, quota, projects, provider toggle**

Add these functions above `// All-time summary`:

```js
function renderUnknownBanner(summary) {
  const el = document.getElementById('unknownBanner');
  const list = (summary && summary.unknownModels) || [];
  el.classList.toggle('hidden', list.length === 0);
  el.textContent = list.length
    ? `Unknown model(s) estimated with fallback coefficients: ${list.join(', ')} — add them to data/coefficients.json`
    : '';
}

const fmtWhen = (ms) => new Date(ms).toLocaleString('de-AT', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function bar(label, w) {
  if (!w) return `<div class="quota-row"><span>${label}</span><span class="dim">no data</span></div>`;
  const pct = Math.max(0, Math.min(100, w.usedPct));
  const reset = w.resetsAt ? fmtWhen(w.resetsAt) : '—';
  return `<div class="quota-row"><span>${label}</span><span>${fmt(pct)} %</span><span class="dim">resets ${reset}</span></div>
    <div class="quota-bar${pct >= 80 ? ' warn' : ''}"><div style="width:${pct}%"></div></div>`;
}

async function renderQuota() {
  const data = await fetch('/api/quota').then(r => r.json());
  const el = document.getElementById('quota');
  const c = data.claude;
  const claudeHtml = c
    ? `<h3>Claude <span class="dim">(snapshot ${fmtInt(c.ageMinutes)} min old)</span></h3>${bar('5 hours', c.windows.fiveHour)}${bar('7 days', c.windows.sevenDay)}`
    : `<h3>Claude</h3><p class="dim">No snapshot yet. Enable the statusline script (README → Usage limits).</p>`;
  el.innerHTML = claudeHtml +
    `<h3>Mistral Vibe</h3><p class="dim">Mistral publishes no plan quota or limit API. Tokens only (switch to Mistral above).</p>`;
}

async function renderProjects() {
  const rows = await fetch(`/api/projects${q({ days: currentDays })}`).then(r => r.json());
  const el = document.getElementById('projects');
  if (!rows.length) { el.innerHTML = '<p class="dim">No usage in this timeframe.</p>'; return; }
  el.innerHTML = `<table class="projects"><thead><tr><th>Project</th><th>Tokens</th><th>gCO2e</th><th>Wh</th></tr></thead><tbody>` +
    rows.slice(0, 10).map(p => `<tr title="${p.project}"><td>${p.project.split('/').filter(Boolean).pop() || p.project}</td>
      <td>${fmtInt(p.tokens.total)}</td><td>${fmt(p.co2_g)}</td><td>${fmt(p.energy_wh)}</td></tr>`).join('') +
    '</tbody></table>';
}

async function setupProviderToggle() {
  const status = await fetch('/api/providers').then(r => r.json());
  const detected = new Set(status.filter(s => s.detected).map(s => s.provider));
  document.querySelectorAll('#providerToggle .toggle-btn').forEach(btn => {
    const p = btn.dataset.provider;
    if (p !== 'all' && !detected.has(p)) btn.disabled = true;
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#providerToggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentProvider = p;
      await refresh();
    });
  });
}
```

Change `renderAll` to also refresh projects:

```js
function renderAll(daily) {
  const agg = aggregateDaily(daily);
  renderCards(agg, allTimeSummary);
  renderEquivalences(agg.equivalences);
  updateTimelineChart(daily, currentDays);
  renderUnknownBanner(allTimeSummary);
  renderProjects();
}
```

In `refresh()`, after `updateTimestamp();`, add `renderQuota();`.

In the `DOMContentLoaded` handler, after `setupSettings();`, add `setupProviderToggle();` and `renderQuota();`.

- [ ] **Step 5: `public/app.js` — per-provider settings**

Replace the slider-loading block in `loadDashboard` (`if (allTimeSummary.config) { … }`) with `loadSliders();`, and add:

```js
function loadSliders() {
  const cfg = allTimeSummary && allTimeSummary.config;
  if (!cfg) return;
  const p = document.getElementById('settingsProvider').value;
  const c = cfg.providers[p];
  setSlider('gridCO2', c.gridCO2_gPerKwh);
  setSlider('pue', c.pue);
  setSlider('wueOnsite', c.wueOnsite_LPerKwh);
  setSlider('wueOffsite', c.wueOffsite_LPerKwh);
  setSlider('cacheFactor', c.cacheReadFactor);
  document.getElementById('settingsSources').textContent = (c.sources || []).join(' · ');
}
```

In `setupSettings`, inside the debounced handler, change `const body = {};` to:

```js
        const body = { provider: document.getElementById('settingsProvider').value };
```

and replace `loadDashboard();` there with `refresh();`. At the end of `setupSettings`, add:

```js
  document.getElementById('settingsProvider').addEventListener('change', loadSliders);
```

- [ ] **Step 6: `public/style.css` — styles**

Append:

```css
.provider-toggle { display: flex; gap: 4px; margin-right: 12px; }
.provider-toggle .toggle-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.banner { background: var(--surface); border: 1px solid var(--amber); color: var(--amber);
  border-radius: var(--radius); padding: 10px 14px; margin-bottom: 16px; font-size: 0.85rem; }
.banner.hidden { display: none; }
.dim { color: var(--text-dim); font-size: 0.85rem; }
#quota h3 { font-size: 0.9rem; margin: 12px 0 6px; }
.quota-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.85rem; }
.quota-bar { height: 6px; background: var(--border); border-radius: 3px; margin: 4px 0 10px; overflow: hidden; }
.quota-bar > div { height: 100%; background: var(--green); }
.quota-bar.warn > div { background: var(--amber); }
table.projects { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
table.projects th, table.projects td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--border); }
table.projects th:first-child, table.projects td:first-child { text-align: left; }
#settingsProvider { background: var(--surface-hover); color: var(--text);
  border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; }
```

If the existing `.toggle-btn` styles are scoped to `.timeframe-toggle`, add `.provider-toggle .toggle-btn` to the same selectors.

- [ ] **Step 7: Manual verification**

Run `npm start` and open `http://localhost:3456`:
1. All / Claude / Mistral switch the cards, chart and projects. Mistral is disabled if `~/.vibe` is missing.
2. The tokens card follows the provider filter (Claude vs Mistral token totals).
3. Mistral view: the range line shows the "Mistral LCA ref." value, which is larger than the operational CO2.
4. Settings: switching to Mistral shows 80 / 1.2 / 0.2 / 2.5. Moving a slider changes only that provider's numbers (check with All vs Claude).
5. Usage Limits shows Claude windows with used % and reset time, the bar turns amber from 80 % (after Task 10 Step 8), or the hint.
6. Week view at 360 px width: no horizontal scroll.
Stop the server.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat(ui): provider filter, usage limits, top projects, per-provider settings"
```

---

### Task 12: Documentation + menu-bar plan amendments

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/research/2026-10-10-multi-provider-mistral-vibe.md`, `docs/plans/2026-04-24-menu-bar-app.md`

- [ ] **Step 1: `CLAUDE.md`**

- Commands: add `npm test   # node:test suite (TZ=Europe/Vienna)`. Remove "There is no … test suite."
- Project: "reads `~/.claude/projects/**/*.jsonl` (Claude Code) and `~/.vibe/logs/session/unified/` (Mistral Vibe)". Remove `stats-cache.json`.
- Architecture: replace the backend list with the modules from this plan's File Structure, the event schema and the adapter interface. Data flow: `adapters → store → summarize(calculate, lcaReference) → routes → browser`.
- Key conventions: dedup key `message.id:requestId`; local-time day buckets; `data/coefficients.json` (ordered prefixes, first match wins) is the single source of truth; config v2 shape `{overrides: {provider: {...}}}`; no prices/cost by design (user decision 2026-10-10).
- Replace the "Research" section pointer with: plan `docs/plans/2026-10-10-multi-provider.md` (status: done).

- [ ] **Step 2: `README.md`**

- Title tagline: "for Claude Code and Mistral Vibe".
- "What It Does": add Mistral Vibe, tokens per provider, usage limits (used % + reset), per-project view. Note that local Ollama/llama.cpp models are counted as tokens but excluded from the footprint.
- New section **Usage limits (optional)**: the statusLine JSON snippet from Task 10 Step 8. It writes `~/.llm-green/claude-statusline.json`, nothing leaves the machine, and it only works for Pro/Max subscriptions.
- New section **Methodology: Mistral**: infrastructure assumptions (80 g/kWh, PUE 1.2, WUE 0.2 + 2.5 L/kWh, wide ranges) and why the LCA figure (1,14 g / 45 mL per 400 tokens) is shown as a reference and not used as the footprint (it includes embodied hardware and counts output tokens only).
- Limitations: Vibe is per session (attributed to the last activity); Fable/Mythos coefficients are assumptions; limits come from the last statusline snapshot (only while Claude Code runs).
- Quick Start: `npm test`.

- [ ] **Step 3: Research doc**

The double-counting and journal-compaction findings were already added when this plan was written. Only change the status line at the top to: "Status: implemented via `docs/plans/2026-10-10-multi-provider.md`".

- [ ] **Step 4: Menu-bar plan amendments** — append to `docs/plans/2026-04-24-menu-bar-app.md` (before `## Execution Handoff`):

```markdown
## Amendments (2026-10-10, from docs/plans/2026-10-10-multi-provider.md)

- **Task 0.1 is superseded.** `data/coefficients.json` already exists in v2 format (`providers`, ordered `models` with `prefix`, `defaultModel`, `equivalences`). The Swift loader must use first-matching-prefix in array order and per-provider infrastructure. No pricing data (out of scope by user decision).
- **Task 1.1 Domain types** mirror the Node `UsageEvent` (id, agent, provider, model, timestamp, granularity, tokens{input, output, cacheRead, cacheWrite5m, cacheWrite1h}, project, sessionId, speed, geo) instead of a Claude-only type.
- **Task 1.0 / 1.3 dedup:** do **not** keep `messageId:requestId:uuid`. One response spans several lines with identical usage; the correct key is `message.id:requestId` (also across files). Measured double counting ≈ 2×. Also skip `<synthetic>`.
- **Mistral Vibe:** port `src/providers/mistral-vibe.js` (projection-state per session; journals are compacted).
- **Phases 5–6 (OAuth):** prefer the statusLine snapshot `~/.llm-green/claude-statusline.json` (documented, ToS-safe, no Keychain). Keep OAuth only as opt-in. If kept, Task 6.1 needs the header `anthropic-beta: oauth-2025-04-20`, and the response may use `limits[]` instead of `seven_day_*`.
```

- [ ] **Step 5: Run the full suite one last time**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md docs/research/2026-10-10-multi-provider-mistral-vibe.md docs/plans/2026-04-24-menu-bar-app.md
git commit -m "docs: multi-provider architecture, methodology for Mistral, menu-bar plan amendments"
```

---

## Out of Scope (later plans)

| Idea | Why later | KI | Review |
|---|---|---|---|
| Local OTLP receiver (`claude_code.token.usage`) | Needs user env vars; JSONL covers it | ~35 min | ~15 min |
| Prices / cost (API list-price equivalent, `pricing.json`) | User does not want it (2026-10-10); research doc has the price table if that changes | ~10 min | ~10 min |
| OAuth usage endpoint (model-specific weekly limit) | Undocumented, ToS grey zone | ~30 min | ~20 min |
| Footprint of local models (Apple Silicon Wh/token, AT grid) | Separate methodology | ~30 min | ~20 min |
| Export CSV/JSON + methodology report | Wait until numbers are stable | ~40 min | ~30 min |
| Electricity Maps / carbon-aware hints | Data-centre region unknown (`inference_geo: global`) | ~30 min | ~15 min |
| Codex / Gemini CLI adapters | Not in use; the adapter interface makes them cheap later | ~25 min each | ~10 min each |

## Self-Review

- **Spec coverage:**
  - Research §0: dedup, stale cache, coefficients → Tasks 1, 2, 6.
  - §1: Vibe data → Tasks 7, 8.
  - §2: quota → Task 10; Mistral has no quota API → Task 11 hint.
  - §3: coefficients and LCA → Tasks 1, 3, 11.
  - §4: provider coefficients, event schema, adapters → Tasks 1, 2, 6, 8.
  - §5 roadmap items 1–9 except item 6 (cost, dropped by the user) → Tasks 1–11. Items 6 and 10–14 → Out of Scope.
- **Placeholder scan:** none.
- **Type consistency:**
  - `UsageEvent.tokens` keys `input/output/cacheRead/cacheWrite5m/cacheWrite1h` are used in Tasks 2, 3, 4, 8.
  - Bucket `tokens` keys `input/output/cache_read/cache_creation/total` match the existing frontend.
  - `createRouter({store, configPath, paths, now})` is consistent across Tasks 6 and 10.
  - `summarize` options `{overrides, provider, since, until}` are consistent.
- **Review Focus** items 1–5 each have a test in the owning task: Task 8 (+ store test in Task 6), Task 2, Tasks 1/4/6, Task 5, Task 4.

## Execution Handoff

Recommended: **subagent-driven** (`superpowers:subagent-driven-development`), in line with CLAUDE.md. Tasks 3–6 share interfaces and leave the server unstartable until Task 6, so run them back to back without pauses. Task 10 Step 8 needs the user's consent before touching `~/.claude/settings.json`.
