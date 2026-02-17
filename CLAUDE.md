# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LLM Green is an inference-only CO2, water, and energy footprint dashboard for Claude Code. It reads local Claude Code usage data (`~/.claude/stats-cache.json` and `~/.claude/projects/**/*.jsonl`) and calculates environmental impact metrics. All data stays local; nothing leaves the user's machine.

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
