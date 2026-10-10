# LLM Green — Raycast Extension (Menu-Bar + Detail-View)

> **Status: ON HOLD (Stand 2026-05-20).** Bevor eigenes Plugin gebaut wird, evaluiert der User zuerst die existierende Extension **Agent Usage** (thuggyduck), ob deren Multi-Agent-Tracking ausreicht. Erst danach Entscheidung über Eigenbau.

**Idee:** Raycast-Extension, die lokal gemessenen Claude-Code-Verbrauch aus `~/.claude/stats-cache.json` und `~/.claude/projects/**/*.jsonl` direkt in Raycast anzeigt — als Menu-Bar-Item (Live-Footprint in der Leiste) und als Detail-Command (vollständiges Dashboard wie die Web-App, aber ohne Browser).

**Motivation:** Schnellerer Zugriff als der Browser-Dashboard, in den Workflow eingebettet, ohne dass ein Node-Server laufen muss.

---

## Recherche-Ergebnis (2026-05-20)

### Wettbewerb im Raycast Store

| Extension | Funktion | Repo |
|---|---|---|
| **ClaudeCast** (qazi0) | 800+ User, JSONL-Streaming inkrementell, eigene SVG-Charts, Cost-by-Project, Streaming-Chunk-Dedup, Per-Modell-Pricing (Opus 4.7/4.1, Sonnet 200K). TypeScript. **Direkter Konkurrent — beste Architektur-Referenz.** | github.com/qazi0/claude-cast |
| **ccusage** (nyatinte) | Raycast-Wrapper um die `ccusage` CLI. Menu-Bar + Detail. | im offiziellen `raycast/extensions`-Monorepo |
| **Agent Usage** (thuggyduck) | Multi-Agent (Claude, Codex, Copilot, Gemini, Kimi, Droid, Amp …). Breiter, weniger Claude-Tiefe. **Diese testet der User zuerst.** | raycast.com/thuggyduck/agent-usage |
| **markhudsonn/raycast-llm-usage** | Menu-Bar für Claude-API-Rate-Limits (5h/7d Windows). | github.com/markhudsonn/raycast-llm-usage |

**Wichtigste Erkenntnis: Keine dieser Extensions zeigt CO₂/Wasser/Energie.** Das ist die freie Nische und das Differenzierungsmerkmal von LLM Green.

### Technische Machbarkeit

- **Menu-Bar-API:** `MenuBarExtra`-React-Komponente. Title + Icon + Tooltip in der Leiste, Dropdown mit `Item`/`Submenu`/`Section`, Keyboard-Shortcuts, Alt-Modifier für alternative Items. Background-Refresh via `interval`-Key in `package.json` (z.B. `"5m"`, `"10m"`). Praktisches Minimum ~5 min — nicht für Echtzeit gedacht, aber für Footprint-Anzeige völlig ausreichend.
- **File-Zugriff:** `~/.claude/` ist ohne TCC-Permissions lesbar (liegt nicht unter Documents/Desktop/Downloads). `fs/promises` (readFile, readdir) funktioniert direkt in der Node-Runtime von Raycast. **Kein Sandboxing** über das hinaus, was Raycast als Parent-Prozess von macOS erbt.
- **File-Watching:** Persistente `fs.watch`-Watcher sind nicht sinnvoll, weil Menu-Bar-Commands nur beim Background-Tick laufen. Pattern: bei jedem Tick komplett neu einlesen.
- **Plattform:** macOS-only (Raycast-Constraint).

### Quellen

- [Raycast Store: ClaudeCast](https://www.raycast.com/qazi0/claudecast) · [GitHub](https://github.com/qazi0/claude-cast)
- [Raycast Store: Agent Usage](https://www.raycast.com/thuggyduck/agent-usage)
- [GitHub: nyatinte/raycast-extension-ccusage](https://github.com/nyatinte/raycast-extension-ccusage)
- [Raycast API: Menu Bar Commands](https://developers.raycast.com/api-reference/menu-bar-commands)
- [Raycast API: Background Refresh](https://developers.raycast.com/information/lifecycle/background-refresh)
- [Raycast API: Security / Sandboxing](https://developers.raycast.com/information/security)
- [raycast/extensions Monorepo](https://github.com/raycast/extensions)

---

## Empfehlung (falls Eigenbau)

**Nicht forken — from scratch, aber ClaudeCast als Architektur-Referenz lesen.** Forken bringt nichts: ClaudeCast & Co. zeigen `$`-Kosten, LLM Green zeigt gCO₂e / mL Wasser / Wh Energie — andere Domain, anderer Value Prop. ClaudeCast liefert aber kostenlos: JSONL-Streaming-Pattern, Dedup-Logik (`message.id + requestId + uuid` — haben wir eh schon in `src/parser.js`), TypeScript-Types für Anthropic-Pricing.

### Drei Architektur-Eckpunkte

1. **Shared Calculator als TypeScript-Modul.** `src/calculator.js` + `src/coefficients.js` zu TypeScript portieren und als gemeinsame Quelle für Web-Dashboard, Raycast und die geplante Swift-Menu-Bar-App nutzen. Single source of truth — eliminiert Drift zwischen drei Implementierungen. Konkret: entweder npm-Workspace mit Package `@llm-green/core`, oder die in `docs/plans/2026-04-24-menu-bar-app.md` schon vorgesehene `data/coefficients.json` plus dünner TS-Wrapper.

2. **Background-Refresh ≠ Live-SSE.** Vergiss den SSE-Stream aus dem Web-Dashboard. Stattdessen `interval: "5m"` im `package.json` und bei jedem Tick komplett neu einlesen. Menu-Bar-Title zeigt z.B. `🌱 12,3 g CO₂`. User-Click öffnet Detail-Command mit On-Demand-Refresh.

3. **Positioniere bewusst „Footprint" statt „Cost".** Alle Konkurrenten zeigen Dollar. Menu-Bar-Title transportiert das Differential: `🌱 12,3 g CO₂ heute` (oder rotierend `💧 / ⚡`). Settings könnten User die Default-Metrik wählen lassen.

---

## Scope-Vorschlag für MVP

Falls nach Agent-Usage-Test der Eigenbau-Entscheid fällt:

**v1 (Pfad 4 only — analog Swift-Plan):**
- Menu-Bar-Command: heutiger CO₂-Wert + Tooltip mit Wasser/Energie/Tokens.
- Detail-Command „Today": Cards wie im Web-Dashboard (CO₂, Wasser, Energie, Equivalences) + Modell-Breakdown.
- Detail-Command „Timeline": Tages-Verlauf (letzte 7 Tage), Chart in Raycast-Detail-Markdown oder SVG.
- Liest `~/.claude/stats-cache.json` und JSONL-Dateien direkt.
- Coefficients aus geteiltem JS/JSON-Modul.

**Out-of-scope für v1:**
- Pfad 1 (OAuth /usage-Endpoint) — kommt später, falls Anthropic stabil bleibt.
- Settings-UI für Coefficient-Overrides (Raycast-Preferences ist ausreichend für 2-3 Knöpfe; volle Slider-UI nicht nötig).
- Per-Project-Breakdown (kann v2 sein).

---

## Verhältnis zu anderen Plänen

- **`docs/plans/2026-04-24-menu-bar-app.md`** (native Swift Menu-Bar-App): konzeptionell überlappend. Beide brauchen `data/coefficients.json` als single source of truth. **Offene Frage:** Raycast ersetzt die Swift-App, oder beide existieren parallel? Raycast ist schneller umgesetzt (TS statt Swift, kein Codesigning-Theater), erfordert aber Raycast-Installation. Swift-App ist Standalone, dafür aufwendiger.
- **Web-Dashboard** (Status quo): bleibt für Deep-Dive-Analyse und Settings-UI. Raycast ist „Always-on-Glance", Web ist „Sit-down-Session".

---

## Nächste Schritte (wenn off-hold)

1. User-Feedback zu Agent Usage einholen — was fehlt? Reicht es?
2. Falls Eigenbau: Brainstorming-Skill (`superpowers:brainstorming`) starten, Scope finalisieren.
3. Vor Code: Coefficient-Extraktion zu `data/coefficients.json` (Phase 0 aus Swift-Plan vorziehen — nützt beiden Apps).
4. Detail-Plan analog Swift-Plan schreiben (TDD-Phasen, exakte Dateipfade).
