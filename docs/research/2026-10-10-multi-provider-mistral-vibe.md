# Research: Mistral Vibe, live usage/limits, multi-provider expansion

Date: 2026-10-10 · Status: research done, implementation planned in `docs/plans/2026-10-10-multi-provider.md` (without cost: the user only wants tokens and quota, decided 2026-10-10; the price facts below are kept for reference) · Flags: ⚠️ = unverified / undocumented

## 0. Urgent findings in the current app

1. **Coefficients are stale.** Models actually in `~/.claude/projects/**/*.jsonl`: `claude-opus-5` (4272 req), `claude-opus-5-5` (2498), `claude-fable-5-1` (2186), `claude-opus-4-7` (1735), `claude-fable-5` (904), `claude-sonnet-5-5` (13), `<synthetic>` (19). None except Haiku 4.5 is in `MODEL_ENERGY` → all fall to `DEFAULT_ENERGY` (Sonnet class) → Opus/Fable likely **underestimated ~3×+**. `<synthetic>` must be filtered.
2. **`stats-cache.json` is dead** — `lastComputedDate: 2026-02-16`, `costUSD: 0`. Switch fully to JSONL.
3. **Double counting (~2×).** One API response is written as several JSONL lines (one per content block) with identical `message.id` + `requestId` + usage but different `uuid`. Current dedup key `message.id:requestId:uuid` → 11.522 lines counted vs 5.881 real requests (40 most recent files, 0 mismatching duplicates). Fix: dedup by `message.id:requestId`, also across files.
4. JSONL `usage` now has: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens`, `output_tokens_details.thinking_tokens`, `server_tool_use.{web_search,web_fetch}_requests`, `service_tier`, `speed`, `inference_geo`. Top level: `cwd`, `gitBranch`, `sessionId`, `isSidechain`, `effort`, `version`. **No `costUSD`** anymore → cost must be computed from pricing.

## 1. Mistral Vibe — local data

Installed here: `vibe 2.25.8`, data in `~/.vibe/` (override `VIBE_HOME`).

| File | Content |
|---|---|
| `logs/session/unified/.session-index.json` | per session: `metadata.active_model`, `reasoning_effort`, `cwd`, `session.tokenUsage{inputTokens,cachedInputTokens,outputTokens,totalTokens}`, `createdAt/updatedAt` (ms) |
| `logs/session/unified/<uuid>/journal/*.jsonl` | `action_result` records with `payload.result.result.usage{input_tokens,cached_input_tokens,output_tokens,total_tokens}`, `payload.action_id` (dedup key); **no model id** (join via index) |
| `logs/session/unified/<uuid>/generations/<max>/projection-state.json` | **authoritative** `snapshot.session.tokenUsage` + `createdAt/updatedAt` — use this |

- ⚠️ Cached tokens appear to be a **subset** of input (`cached ≤ input` in all sessions; e.g. 12288/12440) → uncached = input − cached.
- **Verified 2026-10-10: the journal is compacted** — older records vanish (one session: journal 15.375 vs true 43.949 input tokens). The index can also miss sessions (the largest one here, 431.740 input tokens, was absent). → Use `generations/<latest>/projection-state.json` per session directory; index only for `active_model`/`cwd`.
- User has local Ollama models in `~/.vibe/config.toml` (`ministral-3-8b-16k` alias `local`, `ministral-3-3b-8k` alias `local-fast`) → provider `local`, excluded from data-centre footprint.
- ⚠️ Journal is an internal hash-chained recovery format; may change between versions. Only documented export: `--output-dir` → `export.json` (programmatic runs).
- Model ids: default `mistral-vibe-cli-latest` = alias `mistral-medium-3.5` (128B dense); `devstral-2` migrated away; `devstral-small-latest` still exists.

## 2. Live usage & limits

### Claude

| Source | Gives | Status |
|---|---|---|
| **Statusline stdin JSON** | `cost.total_cost_usd`, `context_window.used_percentage`, `rate_limits.five_hour/seven_day{used_percentage,resets_at}` (Pro/Max, after first response) | ✅ documented — [statusline](https://code.claude.com/docs/en/statusline). No model-specific weekly limit. |
| OpenTelemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1`) | `claude_code.token.usage`, `claude_code.cost.usage`, event `api_request` (cost_usd, tokens, duration) | ✅ documented — [monitoring](https://code.claude.com/docs/en/monitoring-usage) |
| `GET api.anthropic.com/api/oauth/usage` | 5h/7d windows incl. per-model; new format `limits[]{kind,percent,resets_at,scope}` | ⚠️ undocumented; needs header `anthropic-beta: oauth-2025-04-20`; **ToS gray zone** ("not collect, store, or intermediate … session tokens" — [legal](https://code.claude.com/docs/en/legal-and-compliance)) |
| Admin API `usage_report/messages`, `cost_report` | org usage/cost | ✅ but needs admin key — not for individual accounts |

**Recommendation:** a tiny statusline script writes the latest snapshot to `~/.llm-green/ratelimits.json`; dashboard + menu bar app read it. ToS-safe, no Keychain, no network. OAuth path becomes opt-in, default off. → affects plan Phases 5–6 in `docs/plans/2026-04-24-menu-bar-app.md` (also add the missing `anthropic-beta` header to Task 6.1).

### Mistral

| Source | Gives | Status |
|---|---|---|
| Admin API `GET /v1/admin/analytics/vibe/usage/by_workspace` | daily tokens per model, sessions, tool calls | ✅ [docs](https://docs.mistral.ai/admin/admin-api/usage-metrics), Admin key |
| `/v1/admin/usage`, `/rate-limit`, `/spend-limit` | monthly billing (`vibe_usage`), limits, spend cap | ✅ documented |
| `x-ratelimit*` response headers | remaining tokens | ⚠️ third-party only |
| Vibe `/status` / `/stats` | session stats | no plan quota |
| Le Chat Pro / Vibe plan quota | only "× free tier", then pay-as-you-go | no absolute numbers published |

No subscription-window equivalent to Anthropic's 5h/7d. Realistic display for Mistral: **local token totals + € cost at API price + optional admin-key spend vs. spend-limit**.

## 3. Environmental factors for Mistral

**Mistral LCA (Jul 2025; Carbone 4 + ADEME, ISO 14040/44, AFNOR Frugal AI)** for Mistral Large 2 (123B dense) — [Mistral](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai):
- Training + 18 months operation: 20.4 ktCO2e, 281,000 m³ water, 660 kg Sb eq
- Marginal inference, 400-token response: **1.14 gCO2e, 45 mL water, 0.16 mg Sb eq** → 2.85 g / 112.5 mL per 1k output tokens
- Includes embodied hardware, idle capacity; not published: Wh, PUE, WUE, grid, locations

**Do not plug the LCA in directly.** Bottom-up operational estimate for the same 400 tokens is ≈0.14 Wh → ~0.06 g CO₂ (20× lower) and ~0.4 mL water (100× lower). LCA counts output tokens only; agentic coding is input-heavy. → Show as a second **"LCA (provider-reported)"** method next to the operational one.

### Proposed model coefficients (operational, scaled by active params, anchored on 123B ≈ current Opus class)

| Prefix | Params | Wh/1k in | Wh/1k out | Range | LCA ref g / mL per 1k out |
|---|---|---|---|---|---|
| `mistral-medium-3.5`, `mistral-vibe-cli` | 128B | 0.03 | 0.30 | ×0.4–2.5 | 2.97 / 117 |
| `devstral-2`, `devstral-medium` | 123B | 0.03 | 0.30 | ×0.4–2.5 | 2.85 / 112.5 |
| `mistral-large-3` | ~41B active ⚠️ | 0.012 | 0.12 | ×0.3–3 | ~0.95 / ~37 |
| `devstral-small`, `codestral` | 24B / 22B | 0.006 | 0.06 | ×0.4–2.5 | 0.56 / 22 |

Cache reads: existing `cacheReadFactor` 0.15 (consistent with Mistral's 10% price ratio).

### Proposed infrastructure defaults (Mistral, none published)

| Factor | Central | Range | Basis |
|---|---|---|---|
| Grid intensity | 80 gCO₂/kWh | 25–300 | FR/SE ~20–60; upper = EU avg / third-party cloud ⚠️ |
| PUE | 1.2 | 1.1–1.4 | new EU sites |
| WUE onsite | 0.2 L/kWh | 0–0.5 | free cooling likely |
| Water offsite | 2.5 L/kWh | 1–4 | nuclear evaporative cooling ⚠️ needs source |

Compare current global defaults (Anthropic/AWS US): PUE 1.14, 385 g/kWh, 0.18 + 5.11 L/kWh.

## 4. Architecture proposal

### Coefficients per provider

```js
PROVIDERS = {
  anthropic: { pue, gridCO2_gPerKwh, wueOnsite, wueOffsite, uncertainty, sources: [] },
  mistral:   { ..., lca: { gCO2PerKOut: 2.85, mLPerKOut: 112.5, refParamsB: 123 } },
}
MODEL_ENERGY[prefix] = { provider, whPer1kInput, whPer1kOutput, activeParamsB }
```
`config.json` overrides become per provider. Fits Phase 0 (`data/coefficients.json` as single source of truth); add `data/pricing.json` and `data/event.schema.json` next to it.

### Normalized event

```json
{
  "schema": "llmgreen.event/v1",
  "id": "claude-code:msg_..:req_..",
  "provider": "anthropic", "agent": "claude-code", "agentVersion": "2.1.295",
  "timestamp": "2026-10-10T08:53:12Z",
  "model": { "raw": "claude-opus-5-5", "family": "opus" },
  "tokens": { "input": 120, "output": 850, "cacheRead": 45000, "cacheWrite5m": 0, "cacheWrite1h": 3200, "reasoning": 400 },
  "context": { "project": "/Users/…/claude-green", "branch": "main", "sessionId": "…", "sidechain": false },
  "routing": { "serviceTier": "standard", "speed": "standard", "geo": "global" },
  "source": { "kind": "jsonl", "path": "…", "line": 812 }
}
```
For Vibe: `tokens.input = input_tokens − cached_input_tokens`, `cacheRead = cached_input_tokens`.

### Adapter interface (`src/providers/{claude-code,mistral-vibe}.js`)

```js
/** @typedef {{ id, displayName,
 *   detect(): Promise<boolean>,
 *   readEvents({since}): AsyncIterable<Event>,   // normalized + deduped
 *   watchPaths?(): string[],                       // for fs.watch / SSE
 *   readQuota?(): Promise<Quota[]|null>            // {window, usedPct, resetsAt, scope}
 * }} ProviderAdapter */
```
Swift mirror: `protocol ProviderAdapter { func events(since:) -> AsyncStream<UsageEvent>; func quota() async -> [Quota]? }` + `Codable UsageEvent`; shared fixtures in `test/fixtures/`. Plan Task 1.1 should use this schema instead of a Claude-specific type.

## 5. Roadmap (prioritized)

| # | Item | KI | Review |
|---|---|---|---|
| 1 | Coefficient fix (Opus 5/5.5, Fable 5/5.1, Sonnet/Haiku 5.5, Opus 4.7), filter `<synthetic>`, warn on unknown model | ~10 min | ~10 min |
| 2 | Drop `stats-cache.json`, JSONL only | ~20 min | ~10 min |
| 3 | Event schema + adapter registry, port Claude parser | ~40 min | ~20 min |
| 4 | Mistral Vibe adapter + provider coefficients | ~30 min | ~15 min |
| 5 | Provider toggle/stack in UI (per-provider cards, combined total) | ~25 min | ~15 min |
| 6 | Cost in $/€ from `data/pricing.json` (Claude: cache tiers, geo/speed; Mistral: API prices) | ~25 min | ~15 min |
| 7 | Per-project breakdown (`cwd`) | ~20 min | ~10 min |
| 8 | Statusline rate-limit snapshot + quota gauges next to footprint | ~30 min | ~15 min |
| 9 | "LCA method" toggle (Mistral-reported vs operational) | ~20 min | ~15 min |
| 10 | Export CSV/JSON + methodology report (Scope 3 Cat. 1 style — not "CSRD-compliant") | ~40 min | ~30 min |
| 11 | Local OTLP receiver for live Claude cost/tokens | ~35 min | ~15 min |
| 12 | Optional: Mistral Admin-API spend vs spend-limit | ~25 min | ~10 min |
| 13 | Opt-in OAuth usage endpoint (ToS risk) | ~30 min | ~20 min |
| 14 | Further adapters (Codex, Gemini CLI) using ccusage formats as reference | ~25 min each | ~10 min each |

## Open questions
- Does `active_model` change mid-session in Vibe? (join model per session may be wrong)
- Mistral Large 3 active params; share of Mistral inference in France; offsite water factor FR
- Energy anchors for Opus 5.x / Fable — still extrapolations, no vendor data

## Sources
Claude: code.claude.com/docs/en/{statusline,monitoring-usage,legal-and-compliance} · platform.claude.com/docs/en/manage-claude/usage-cost-api · platform.claude.com/docs/en/api/rate-limits · github.com/ryoppippi/ccusage · pypi.org/project/ccusage (OAuth response shape)
Mistral: github.com/mistralai/mistral-vibe · docs.mistral.ai/admin/admin-api/usage-metrics · mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai · mistral.ai/news/devstral-2-vibe-cli · huggingface.co/mistralai/Mistral-Medium-3.5-128B · mistral.ai/en/pricing · datacenterdynamics.com (EcoDataCenter Borlänge)
