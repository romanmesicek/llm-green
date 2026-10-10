# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LLM Green is an inference-only CO2, water, and energy footprint dashboard for Claude Code. It reads local Claude Code usage data (`~/.claude/stats-cache.json` and `~/.claude/projects/**/*.jsonl`) and calculates environmental impact metrics. All data stays local; nothing leaves the user's machine.

**Character:** Personal / open-source project, **not commercial**. No App Store distribution, no paid notarization. Ad-hoc signing is sufficient for local use.

## Commands

```bash
npm install    # Install dependencies (express, glob)
npm start      # Run server at http://localhost:3456
```

There is no build step, no linter, and no test suite.

## Architecture

**Backend (Node.js/Express):**
- `server.js` — Entry point. Starts Express on port 3456, serves `public/` as static files, mounts routes.
- `src/coefficients.js` — Energy-per-token constants per model (Opus, Sonnet, Haiku), infrastructure defaults (PUE, grid CO2 intensity, water usage), equivalence factors, and uncertainty multipliers. Uses prefix matching for model IDs with date suffixes.
- `src/parser.js` — Reads and aggregates Claude Code usage from `stats-cache.json` (cumulative) and JSONL files (per-request granular). Deduplicates JSONL by `message.id + requestId + uuid`.
- `src/calculator.js` — Core formulas: tokens → energy (Wh) → CO2 (gCO2e) → water (mL). Adds ±50% uncertainty ranges and human-relatable equivalences.
- `src/routes.js` — REST API (`/api/summary`, `/api/daily`, `/api/hourly`, `/api/models`, `/api/config`) and SSE endpoint (`/api/stream`). Watches `stats-cache.json` for live updates broadcast to connected clients.

**Frontend (vanilla HTML/JS/CSS, no build):**
- `public/index.html` — Single-page dashboard layout.
- `public/app.js` — Fetches API data, renders cards/equivalences, handles settings sliders (debounced POST to `/api/config`), manages SSE connection and timeframe toggles (Week/Month/Year).
- `public/charts.js` — Chart.js dual y-axis timeline (CO2 + Water).
- `public/style.css` — Dark theme with CSS variables.

**Data flow:** Claude Code writes usage stats → `parser.js` reads/aggregates → `calculator.js` applies coefficients → `routes.js` serves via REST/SSE → browser renders dashboard.

## Key conventions

- Number formatting uses European locale: `1.234,56` (comma as decimal separator, dot as thousands separator).
- User coefficient overrides persist to `config.json` (gitignored).
- Settings changes debounce at 300ms; file watch debounces at 500ms.
- Cache read energy factor defaults to 0.15 (15% of normal token energy) — this is the most uncertain coefficient.

## Planned: macOS Menu Bar App

A native Swift menu-bar companion is planned alongside the web dashboard. It will share the same coefficient source of truth and combine two data sources:

- **Pfad 4 — Local JSONL scan** of `~/.claude/projects/**/*.jsonl` → tokens → CO₂/water/energy (reuses the logic from `src/parser.js` + `src/calculator.js`, ported to Swift).
- **Pfad 1 — OAuth API** `GET https://api.anthropic.com/api/oauth/usage` for real 5-hour / 7-day rate-limit windows (token from macOS Keychain).

Detailed implementation plan: **`docs/plans/2026-04-24-menu-bar-app.md`** — 8 phases, TDD cycles, exact file paths.

### Next session: start with subagent-driven execution

When resuming work on the menu bar app, **begin by invoking `superpowers:subagent-driven-development`** to dispatch a fresh subagent per plan task with review between tasks. Do **not** execute inline — the plan is large enough that subagent isolation per task gives faster iteration and keeps the main context clean. The plan's Execution Handoff section (bottom of the plan file) confirms this as the recommended approach.

Before starting, re-read the plan's `## Assumptions & Open Questions` section and verify that:
- macOS 14+ target is still acceptable,
- `data/coefficients.json` extraction (Phase 0 Task 0.1) is still the chosen single-source-of-truth approach.

## Planned: Multi-provider (Claude Code + Mistral Vibe) & quota

**Plan:** `docs/plans/2026-10-10-multi-provider.md` — 12 TDD tasks, exact code, fixtures, and a Reference Facts section (data formats, coefficients). **Research:** `docs/research/2026-10-10-multi-provider-mistral-vibe.md`.

Known bugs the plan fixes (Tasks 1, 2, 6):
- JSONL dedup key `message.id:requestId:uuid` double-counts about 2× → use `message.id:requestId`.
- Current models (Opus 5.x, Fable 5.x, Sonnet/Haiku 5.5) are missing from `MODEL_ENERGY` → Sonnet-class fallback.
- `stats-cache.json` has been stale since 2026-02-16 → JSONL only.

This plan supersedes Task 0.1 of the menu-bar plan; Task 12 appends amendments there. Execute subagent-driven and run Tasks 3–6 back to back (the server can't start until Task 6). Task 10 Step 8 needs the user's OK before editing `~/.claude/settings.json`.

**Scope decisions (2026-10-10):** the ecological footprint stays the headline metric; tokens and limits are supporting info. No prices/cost, no run-out projection (limits = used % + reset time). No dependency on CodexBar running in parallel.

**Status (2026-10-10): refinement paused.** Goal: a dashboard that works for both agents (Claude Code + Mistral Vibe), at least roughly, as a use case, also for teaching (students). Plan review via grill-with-docs stopped after question 3. Open question 4: Mistral limits. Option A: leave them out and document CodexBar's `admin.mistral.ai/subscription` → `vibe_budget` approach as Out of Scope (recommended). Option B: opt-in manual cookie plus a network call. Glossary: `CONTEXT.md`.
