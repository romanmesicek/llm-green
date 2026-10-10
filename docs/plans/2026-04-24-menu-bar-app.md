# LLM Green — macOS Menu Bar App (Pfad 4 + Pfad 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native macOS Menu-Bar-App, die lokal gemessenen Claude-Code-Verbrauch als CO₂/Wasser/Energie (aus `~/.claude/projects/**/*.jsonl`, Pfad 4) kombiniert mit echten Rate-Limit-Fenstern aus `api.anthropic.com/api/oauth/usage` (Pfad 1) in der Menüleiste anzeigt.

**Architecture:**
- Neues `macos/`-Verzeichnis mit Xcode-Workspace. Swift Package `LLMGreenCore` für Parser, Calculator, OAuth-Client (alles testbar, zero UI). Separates App-Target `LLMGreenBar` als SwiftUI `MenuBarExtra`-App.
- Koeffizienten (`MODEL_ENERGY`, `DEFAULTS`, `EQUIVALENCES`, `UNCERTAINTY`) werden aus der JS-Datei in eine gemeinsame `data/coefficients.json` im Repo-Root extrahiert. Sowohl Node-Server als auch Swift-App lesen diese Datei → single source of truth, kein Drift.
- OAuth-Token wird aus dem macOS Keychain gelesen (Service wird in Phase 5 ermittelt). Pfad-4-Rechnung funktioniert komplett ohne Netzwerk; Pfad-1-Overlay degradiert graceful, wenn kein Token da ist.

**Tech Stack:** Swift 5.10 · SwiftUI · `MenuBarExtra` (macOS 14+) · Swift Testing · Foundation `URLSession` · Keychain Services API · `DispatchSource` für File-Watching. Kein externes Package erforderlich.

**Target-Platform:** macOS 14 Sonoma oder neuer. Nicht sandboxed (direkter Lesezugriff auf `~/.claude/`).

**Projekt-Charakter:** Persönliches/Open-Source-Projekt, **nicht kommerziell**. Keine App-Store-Distribution, keine bezahlte Notarisierung erforderlich. Lokale Ausführung per `swift build` bzw. Xcode-Run reicht; für Weitergabe an Freunde genügt Ad-hoc-Signing. Developer-ID + Notarisierung sind optional und erst relevant, falls das Binary auf fremden Macs ohne Gatekeeper-Override laufen soll.

---

## Assumptions & Open Questions

Diese Annahmen stehen fest, bis eine Phase sie widerlegt:

1. **macOS 14+** ist OK (für `MenuBarExtra` und Swift Testing). Falls 13-Support nötig, muss UI auf `NSStatusItem` umgestellt werden.
2. **Nicht sandboxed**, weil wir `~/.claude/` lesen. Keine Mac App Store-Distribution. Für lokale Nutzung reicht Ad-hoc-Signing; Developer-ID nur bei externer Weitergabe nötig (nicht Teil dieses Plans).
3. **Koeffizienten zentralisieren**: `src/coefficients.js` wird umgestellt auf `require('../data/coefficients.json')`. Bestehende Web-Tests (keine vorhanden) bzw. Smoke-Test (Server läuft, `/api/summary` liefert plausible Werte) verifizieren, dass der Port nicht kaputt ist.
4. **OAuth-Token-Location**: vermutlich Keychain-Service `Claude Code-credentials` (Standard von Claude Code). Wird in Phase 5 empirisch verifiziert.
5. **Pfad 4 hat Priorität**: nach Phase 4 existiert eine funktionsfähige App. Pfad 1 ist reine Ergänzung; wenn Anthropic den Endpoint ändert, funktioniert Pfad 4 weiter.
6. **Keine Settings-UI** in diesem Plan. Koeffizienten werden aus Bundle gelesen; User-Overrides sind explizit out-of-scope. (Falls gewünscht, eigener Folge-Plan.)

---

## File Structure

### Neue Dateien (nach Plan-Ende)

```
claude-green/
├── data/
│   └── coefficients.json                   # NEU: single source of truth
├── macos/
│   ├── LLMGreen.xcworkspace/               # Workspace (linkt Package + App)
│   ├── LLMGreenCore/                       # Swift Package
│   │   ├── Package.swift
│   │   ├── Sources/LLMGreenCore/
│   │   │   ├── Coefficients.swift          # lädt coefficients.json
│   │   │   ├── Models.swift                # Domain types (Message, Tokens, …)
│   │   │   ├── Parser.swift                # JSONL-Parser + Dedup
│   │   │   ├── Calculator.swift            # Wh/CO₂/Wasser/Equivalences
│   │   │   ├── OAuthClient.swift           # /oauth/usage
│   │   │   ├── KeychainTokenStore.swift    # Token-Lookup
│   │   │   └── FileWatcher.swift           # DispatchSource
│   │   ├── Resources/
│   │   │   └── coefficients.json           # Symlink → ../../../data/coefficients.json
│   │   └── Tests/LLMGreenCoreTests/
│   │       ├── ParserTests.swift
│   │       ├── CalculatorTests.swift
│   │       ├── OAuthClientTests.swift
│   │       ├── KeychainTokenStoreTests.swift
│   │       └── Fixtures/
│   │           ├── sample.jsonl
│   │           └── oauth-usage-response.json
│   └── LLMGreenBar/                        # SwiftUI App-Target
│       ├── LLMGreenBarApp.swift            # @main, MenuBarExtra
│       ├── AppState.swift                  # ObservableObject, koordiniert Core
│       ├── MenuBarLabel.swift              # Leisten-Anzeige
│       ├── PopoverView.swift               # Ausklapp-UI
│       └── Assets.xcassets/
└── src/
    └── coefficients.js                     # GEÄNDERT: liest data/coefficients.json
```

### Konvention

Jede `.swift`-Datei hat genau eine Hauptverantwortung. Tests spiegeln die Dateistruktur 1:1 (`Parser.swift` → `ParserTests.swift`). Fixtures sind echte, aber anonymisierte Snippets.

---

## Zeitübersicht (Phasen)

| Phase | Inhalt | KI | Review |
|---|---|---|---|
| 0 | Foundation (Workspace, Package, coefficients.json) | ~35 min | ~20 min |
| 1 | Pfad 4 — Parser (inkl. ccusage-Quervergleich) | ~60 min | ~35 min |
| 2 | Pfad 4 — Calculator | ~35 min | ~20 min |
| 3 | Pfad 4 — MenuBarExtra MVP | ~40 min | ~25 min |
| 4 | Pfad 4 — Live Updates (File-Watcher) | ~25 min | ~15 min |
| 5 | Pfad 1 — OAuth-Token-Discovery | ~30 min | ~20 min |
| 6 | Pfad 1 — OAuth-Client | ~35 min | ~20 min |
| 7 | Pfad 1 — UI-Integration (Fenster-Anzeige) | ~30 min | ~20 min |
| **Σ** | | **~4,8 h** | **~2,9 h** |

---

## Phase 0 — Foundation

### Task 0.1: Koeffizienten-JSON extrahieren

**Files:**
- Create: `data/coefficients.json`
- Modify: `src/coefficients.js` (komplett ersetzen — Logik bleibt, Werte aus JSON)

- [ ] **Step 1: `data/coefficients.json` anlegen**

```json
{
  "modelEnergy": {
    "claude-opus-4-6":    { "whPer1kInput": 0.03,  "whPer1kOutput": 0.30 },
    "claude-opus-4-5":    { "whPer1kInput": 0.03,  "whPer1kOutput": 0.30 },
    "claude-sonnet-4-5":  { "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    "claude-sonnet-4":    { "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    "claude-3-7-sonnet":  { "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    "claude-3-5-sonnet":  { "whPer1kInput": 0.01,  "whPer1kOutput": 0.10 },
    "claude-haiku":       { "whPer1kInput": 0.003, "whPer1kOutput": 0.03 },
    "claude-3-5-haiku":   { "whPer1kInput": 0.003, "whPer1kOutput": 0.03 }
  },
  "defaultEnergy":  { "whPer1kInput": 0.01, "whPer1kOutput": 0.10 },
  "defaults": {
    "pue": 1.14,
    "gridCO2_gPerKwh": 385,
    "wueOnsite_LPerKwh": 0.18,
    "wueOffsite_LPerKwh": 5.11,
    "cacheReadFactor": 0.15
  },
  "equivalences": {
    "googleSearch_gCO2": 0.11,
    "ledMinute_Wh": 0.17,
    "waterBottle_ml": 500,
    "kmGasoline_gCO2": 230,
    "kmEV_gCO2": 55,
    "phoneCharge_Wh": 17
  },
  "uncertainty": {
    "energy": { "low": 0.5, "high": 2.0 },
    "co2":    { "low": 0.5, "high": 1.8 },
    "water":  { "low": 0.6, "high": 1.5 }
  }
}
```

- [ ] **Step 2: `src/coefficients.js` umstellen, JSON laden**

```javascript
const path = require('path');
const raw = require(path.join(__dirname, '..', 'data', 'coefficients.json'));

const MODEL_ENERGY   = raw.modelEnergy;
const DEFAULT_ENERGY = raw.defaultEnergy;
const DEFAULTS       = raw.defaults;
const EQUIVALENCES   = raw.equivalences;
const UNCERTAINTY    = raw.uncertainty;

function getModelEnergy(modelId) {
  if (MODEL_ENERGY[modelId]) return MODEL_ENERGY[modelId];
  for (const prefix of Object.keys(MODEL_ENERGY)) {
    if (modelId.startsWith(prefix)) return MODEL_ENERGY[prefix];
  }
  return DEFAULT_ENERGY;
}

module.exports = { MODEL_ENERGY, DEFAULT_ENERGY, DEFAULTS, EQUIVALENCES, UNCERTAINTY, getModelEnergy };
```

- [ ] **Step 3: Smoke-Test — Node-Server läuft**

Run: `npm start` und parallel `curl -s http://localhost:3456/api/summary | head -c 500`
Expected: JSON mit `totals.co2_g` usw., Werte nicht `NaN`. Identisch zu vorher.

- [ ] **Step 4: Commit**

```bash
git add data/coefficients.json src/coefficients.js
git commit -m "refactor: extract coefficients to data/coefficients.json for Swift reuse"
```

### Task 0.2: Xcode-Workspace + Swift Package

**Files:**
- Create: `macos/LLMGreenCore/Package.swift`
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/LLMGreenCore.swift` (Dummy-Symbol)
- Create: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/SmokeTest.swift`

- [ ] **Step 1: Package.swift anlegen**

```swift
// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LLMGreenCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "LLMGreenCore", targets: ["LLMGreenCore"]),
    ],
    targets: [
        .target(
            name: "LLMGreenCore",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "LLMGreenCoreTests",
            dependencies: ["LLMGreenCore"],
            resources: [.process("Fixtures")]
        ),
    ]
)
```

- [ ] **Step 2: Dummy-Source-Datei**

```swift
// LLMGreenCore.swift
public enum LLMGreenCore {
    public static let version = "0.1.0"
}
```

- [ ] **Step 3: Smoke-Test**

```swift
// SmokeTest.swift
import Testing
@testable import LLMGreenCore

@Test func versionIsReadable() {
    #expect(LLMGreenCore.version == "0.1.0")
}
```

- [ ] **Step 4: Package kompilieren und testen**

Run: `cd macos/LLMGreenCore && swift test`
Expected: `Test Suite 'All tests' passed` mit 1 Test.

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "scaffold: LLMGreenCore Swift package with macOS 14+ target"
```

### Task 0.3: Koeffizienten-JSON ins Bundle

**Files:**
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/Resources/coefficients.json` (Symlink)
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/Coefficients.swift`
- Create: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/CoefficientsTests.swift`

- [ ] **Step 1: Symlink zur gemeinsamen JSON**

Run:
```bash
cd "macos/LLMGreenCore/Sources/LLMGreenCore/Resources"
ln -s ../../../../../data/coefficients.json coefficients.json
```
Expected: `ls -l` zeigt `coefficients.json -> ../../../../../data/coefficients.json`.

- [ ] **Step 2: Failing Test schreiben**

```swift
// CoefficientsTests.swift
import Testing
@testable import LLMGreenCore

@Test func loadsModelEnergyForOpus() throws {
    let coeffs = try Coefficients.load()
    let opus = coeffs.modelEnergy(for: "claude-opus-4-6-20261201")  // prefix match
    #expect(opus.whPer1kInput == 0.03)
    #expect(opus.whPer1kOutput == 0.30)
}

@Test func fallsBackToDefaultEnergyForUnknownModel() throws {
    let coeffs = try Coefficients.load()
    let unknown = coeffs.modelEnergy(for: "gpt-4")
    #expect(unknown == coeffs.defaultEnergy)
}

@Test func defaultsMatchSchema() throws {
    let coeffs = try Coefficients.load()
    #expect(coeffs.defaults.pue == 1.14)
    #expect(coeffs.defaults.gridCO2_gPerKwh == 385)
}
```

- [ ] **Step 3: Verify: Test schlägt fehl**

Run: `swift test --filter CoefficientsTests`
Expected: Build-Fehler „cannot find 'Coefficients' in scope".

- [ ] **Step 4: `Coefficients.swift` implementieren**

```swift
import Foundation

public struct Coefficients: Sendable {
    public struct ModelEnergy: Codable, Sendable, Equatable {
        public let whPer1kInput: Double
        public let whPer1kOutput: Double
    }
    public struct Defaults: Codable, Sendable {
        public let pue: Double
        public let gridCO2_gPerKwh: Double
        public let wueOnsite_LPerKwh: Double
        public let wueOffsite_LPerKwh: Double
        public let cacheReadFactor: Double
    }
    public struct Equivalences: Codable, Sendable {
        public let googleSearch_gCO2: Double
        public let ledMinute_Wh: Double
        public let waterBottle_ml: Double
        public let kmGasoline_gCO2: Double
        public let kmEV_gCO2: Double
        public let phoneCharge_Wh: Double
    }
    public struct UncertaintyRange: Codable, Sendable {
        public let low: Double
        public let high: Double
    }
    public struct Uncertainty: Codable, Sendable {
        public let energy: UncertaintyRange
        public let co2: UncertaintyRange
        public let water: UncertaintyRange
    }

    public let modelEnergy: [String: ModelEnergy]
    public let defaultEnergy: ModelEnergy
    public let defaults: Defaults
    public let equivalences: Equivalences
    public let uncertainty: Uncertainty

    private struct Raw: Codable {
        let modelEnergy: [String: ModelEnergy]
        let defaultEnergy: ModelEnergy
        let defaults: Defaults
        let equivalences: Equivalences
        let uncertainty: Uncertainty
    }

    public static func load(bundle: Bundle = .module) throws -> Coefficients {
        guard let url = bundle.url(forResource: "coefficients", withExtension: "json") else {
            throw NSError(domain: "LLMGreenCore", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "coefficients.json not in bundle"])
        }
        let data = try Data(contentsOf: url)
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        return Coefficients(
            modelEnergy: raw.modelEnergy,
            defaultEnergy: raw.defaultEnergy,
            defaults: raw.defaults,
            equivalences: raw.equivalences,
            uncertainty: raw.uncertainty
        )
    }

    public func modelEnergy(for modelId: String) -> ModelEnergy {
        if let exact = modelEnergy[modelId] { return exact }
        for (prefix, value) in modelEnergy where modelId.hasPrefix(prefix) {
            return value
        }
        return defaultEnergy
    }
}
```

- [ ] **Step 5: Tests grün**

Run: `swift test --filter CoefficientsTests`
Expected: 3/3 Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "feat(core): load coefficients.json into LLMGreenCore"
```

---

## Phase 1 — Pfad 4: Parser

Port von `src/parser.js` nach Swift. Verantwortungen: JSONL-Zeilen lesen, auf `assistant`-Messages mit `usage` filtern, per `messageId:requestId:uuid` deduplizieren, Null-Token-Zeilen verwerfen, typisierte `Message` zurückgeben.

Bevor wir implementieren, lernen wir von `ccusage` — dem am weitesten verbreiteten JSONL-Parser für Claude Code. Edge-Cases, die wir dort finden, fließen als Fixtures in unsere Tests ein. Unsere Dedup-Strategie (`messageId:requestId:uuid`) bleibt erhalten, weil sie strikter ist als ccusage' eigener Key.

### Task 1.0: ccusage-Parser-Quervergleich

**Files:**
- Modify: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/sample.jsonl` (Edge-Cases ergänzen, in Task 1.2 angelegt)
- Create: `docs/plans/2026-04-24-menu-bar-app.md` → Abschnitt „ccusage-Findings" am Plan-Ende (siehe Step 3)

- [ ] **Step 1: ccusage-Parser lesen**

Run:
```bash
cd /tmp && git clone --depth 1 https://github.com/ryoppippi/ccusage.git ccusage-ref
find ccusage-ref/src -name "*.ts" | xargs grep -l "jsonl\|usage\|assistant" | head
```
Expected: Dateien wie `src/data-loader.ts`, `src/_token-utils.ts`, `src/_session-blocks.ts`. Die Parser-Kernlogik steckt üblicherweise in `data-loader.ts`.

Inhalt studieren und beantworten:
1. Welcher Dedup-Key wird benutzt? (erwartet: `messageId` oder Kombination)
2. Wie wird mit `type: "assistant"` vs. anderen Typen umgegangen?
3. Werden synthetische Messages (Tool-Use, Compaction, Summarization) gefiltert?
4. Gibt es Null-Token-Checks?
5. Wie wird mit malformierten JSONL-Zeilen umgegangen (crash vs. skip)?
6. Werden ältere Schema-Varianten unterstützt (z. B. Felder ohne `requestId`)?

- [ ] **Step 2: Diff zu unserer Implementierung notieren**

In eine temporäre Notiz (`/tmp/ccusage-findings.md`) schreiben, was ccusage anders/zusätzlich macht. Erwartete Kategorien:
- **Übernehmen:** Edge-Cases, die wir nicht abdecken (z. B. bestimmte synthetische-Message-Filter).
- **Behalten:** unsere stärkere Dedup-Key-Kombination (`messageId:requestId:uuid`).
- **Ignorieren:** ccusage-Features, die nicht zu LLM Green passen (z. B. Pricing-Tabellen — wir rechnen kein $, sondern gCO₂).

- [ ] **Step 3: Findings im Plan dokumentieren**

Am Ende dieser Datei (`docs/plans/2026-04-24-menu-bar-app.md`) nach „Related Projects" einen Abschnitt anhängen:

```markdown
## ccusage-Findings (aus Task 1.0)

### Übernommen als zusätzliche Fixture-Zeilen in Task 1.2
- [konkreter Edge-Case 1, z. B. "synthetic assistant message with empty content"]
- [konkreter Edge-Case 2]

### Bewusst nicht übernommen
- [Feature X] — Begründung.

### Bestätigt identisch
- [was bei beiden gleich ist]
```

Erwartung: 2–5 Edge-Cases, die unser Parser zusätzlich abdecken sollte.

- [ ] **Step 4: Aufräumen**

Run: `rm -rf /tmp/ccusage-ref /tmp/ccusage-findings.md`
Expected: keine Referenzkopie im System.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-04-24-menu-bar-app.md
git commit -m "docs(plan): record ccusage parser findings for Swift port"
```

**Zeitaufwand:** ~20 min KI, ~15 min Review.

### Task 1.1: Domain-Types

**Files:**
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/Models.swift`

- [ ] **Step 1: Types definieren**

```swift
import Foundation

public struct TokenUsage: Sendable, Equatable {
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheRead: Int
    public var cacheCreation: Int

    public init(inputTokens: Int = 0, outputTokens: Int = 0,
                cacheRead: Int = 0, cacheCreation: Int = 0) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheRead = cacheRead
        self.cacheCreation = cacheCreation
    }

    public var total: Int { inputTokens + outputTokens + cacheRead + cacheCreation }

    public static func + (a: TokenUsage, b: TokenUsage) -> TokenUsage {
        TokenUsage(
            inputTokens: a.inputTokens + b.inputTokens,
            outputTokens: a.outputTokens + b.outputTokens,
            cacheRead: a.cacheRead + b.cacheRead,
            cacheCreation: a.cacheCreation + b.cacheCreation
        )
    }
}

public struct AssistantMessage: Sendable, Equatable {
    public let model: String
    public let usage: TokenUsage
    public let timestamp: Date?
    public let sessionId: String?
    public let requestId: String?
    public let messageId: String?
}
```

- [ ] **Step 2: Commit**

```bash
git add macos/LLMGreenCore/Sources/LLMGreenCore/Models.swift
git commit -m "feat(core): domain types TokenUsage + AssistantMessage"
```

### Task 1.2: JSONL-Fixture

**Files:**
- Create: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/sample.jsonl`

**Hinweis:** Zusätzlich zu den hier aufgeführten 4 Basiszeilen die in **Task 1.0 Step 3** dokumentierten Edge-Cases als weitere Zeilen ergänzen. Jeder Edge-Case bekommt einen zugehörigen Test in Task 1.3.

- [ ] **Step 1: Repräsentative Fixture anlegen**

4 Zeilen: (a) `user`-Message (soll ignoriert werden), (b) valide `assistant`-Message mit Tokens, (c) Duplikat von (b) via identischer `message.id + requestId + uuid` (soll ignoriert werden), (d) `assistant` mit 0 Tokens (soll ignoriert werden).

```json
{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-04-24T10:00:00Z","uuid":"u1"}
{"type":"assistant","requestId":"r1","uuid":"u2","timestamp":"2026-04-24T10:00:01Z","sessionId":"s1","message":{"id":"msg_1","role":"assistant","model":"claude-sonnet-4-5-20260101","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":50,"cache_creation_input_tokens":10}}}
{"type":"assistant","requestId":"r1","uuid":"u2","timestamp":"2026-04-24T10:00:01Z","sessionId":"s1","message":{"id":"msg_1","role":"assistant","model":"claude-sonnet-4-5-20260101","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":50,"cache_creation_input_tokens":10}}}
{"type":"assistant","requestId":"r2","uuid":"u3","timestamp":"2026-04-24T10:00:02Z","sessionId":"s1","message":{"id":"msg_2","role":"assistant","model":"claude-opus-4-6","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
```

- [ ] **Step 2: Commit**

```bash
git add macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/sample.jsonl
git commit -m "test(core): sample JSONL fixture"
```

### Task 1.3: Parser — happy path + dedup + zero-token filter

**Files:**
- Test: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/ParserTests.swift`
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/Parser.swift`

- [ ] **Step 1: Failing Tests schreiben**

```swift
import Testing
import Foundation
@testable import LLMGreenCore

@Test func parserExtractsOneAssistantMessageFromSample() throws {
    let url = Bundle.module.url(forResource: "sample", withExtension: "jsonl")!
    let messages = try Parser.parse(jsonlFile: url)

    #expect(messages.count == 1)
    let m = messages[0]
    #expect(m.model == "claude-sonnet-4-5-20260101")
    #expect(m.usage.inputTokens == 100)
    #expect(m.usage.outputTokens == 200)
    #expect(m.usage.cacheRead == 50)
    #expect(m.usage.cacheCreation == 10)
    #expect(m.messageId == "msg_1")
    #expect(m.requestId == "r1")
}

@Test func parserSkipsDuplicatesByMessageRequestUuidKey() throws {
    let url = Bundle.module.url(forResource: "sample", withExtension: "jsonl")!
    let messages = try Parser.parse(jsonlFile: url)
    // Fixture has 2 identical assistant entries — only 1 survives
    #expect(messages.filter { $0.messageId == "msg_1" }.count == 1)
}

@Test func parserSkipsZeroTokenAssistantEntries() throws {
    let url = Bundle.module.url(forResource: "sample", withExtension: "jsonl")!
    let messages = try Parser.parse(jsonlFile: url)
    #expect(messages.contains(where: { $0.messageId == "msg_2" }) == false)
}

@Test func parserHandlesMalformedLinesGracefully() throws {
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("bad.jsonl")
    try "not json\n{\"type\":\"assistant\"}\n".write(to: tmp, atomically: true, encoding: .utf8)
    let messages = try Parser.parse(jsonlFile: tmp)
    #expect(messages.isEmpty)
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter ParserTests`
Expected: Build-Fehler „cannot find 'Parser' in scope".

- [ ] **Step 3: Parser implementieren**

```swift
import Foundation

public enum Parser {
    public static func parse(jsonlFile url: URL) throws -> [AssistantMessage] {
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { return [] }

        var seen = Set<String>()
        var out: [AssistantMessage] = []

        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            guard let lineData = line.data(using: .utf8) else { continue }
            guard let obj = (try? JSONSerialization.jsonObject(with: lineData)) as? [String: Any] else { continue }
            guard (obj["type"] as? String) == "assistant" else { continue }
            guard let msg = obj["message"] as? [String: Any] else { continue }
            guard (msg["role"] as? String) == "assistant" else { continue }
            guard let usageRaw = msg["usage"] as? [String: Any] else { continue }

            let messageId = msg["id"] as? String ?? ""
            let requestId = obj["requestId"] as? String ?? ""
            let uuid = obj["uuid"] as? String ?? ""
            let dedupKey = "\(messageId):\(requestId):\(uuid)"
            if seen.contains(dedupKey) { continue }
            seen.insert(dedupKey)

            let usage = TokenUsage(
                inputTokens:   (usageRaw["input_tokens"] as? Int) ?? 0,
                outputTokens:  (usageRaw["output_tokens"] as? Int) ?? 0,
                cacheRead:     (usageRaw["cache_read_input_tokens"] as? Int) ?? 0,
                cacheCreation: (usageRaw["cache_creation_input_tokens"] as? Int) ?? 0
            )
            if usage.total == 0 { continue }

            let ts: Date? = {
                guard let tsString = obj["timestamp"] as? String else { return nil }
                return ISO8601DateFormatter().date(from: tsString)
            }()

            out.append(AssistantMessage(
                model: (msg["model"] as? String) ?? "unknown",
                usage: usage,
                timestamp: ts,
                sessionId: obj["sessionId"] as? String,
                requestId: requestId.isEmpty ? nil : requestId,
                messageId: messageId.isEmpty ? nil : messageId
            ))
        }

        return out
    }
}
```

- [ ] **Step 4: Verify green**

Run: `swift test --filter ParserTests`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreenCore/Sources/LLMGreenCore/Parser.swift \
        macos/LLMGreenCore/Tests/LLMGreenCoreTests/ParserTests.swift
git commit -m "feat(core): JSONL parser with dedup + zero-token filter"
```

### Task 1.4: Parser — directory scan

**Files:**
- Modify: `macos/LLMGreenCore/Sources/LLMGreenCore/Parser.swift`
- Modify: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/ParserTests.swift`

- [ ] **Step 1: Failing Test**

```swift
@Test func parserScansDirectoryRecursively() throws {
    let tmp = FileManager.default.temporaryDirectory
        .appendingPathComponent("llmgreen-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmp.appendingPathComponent("proj-a"),
                                            withIntermediateDirectories: true)
    let fixture = Bundle.module.url(forResource: "sample", withExtension: "jsonl")!
    try FileManager.default.copyItem(
        at: fixture, to: tmp.appendingPathComponent("proj-a/chat.jsonl"))

    let messages = try Parser.parseDirectory(tmp)
    #expect(messages.count == 1)
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter parserScansDirectoryRecursively`
Expected: „cannot find 'parseDirectory'".

- [ ] **Step 3: `parseDirectory` implementieren**

In `Parser.swift` ergänzen:

```swift
public static func parseDirectory(_ dir: URL) throws -> [AssistantMessage] {
    let fm = FileManager.default
    guard let enumerator = fm.enumerator(at: dir, includingPropertiesForKeys: nil) else {
        return []
    }
    var out: [AssistantMessage] = []
    var seen = Set<String>()

    for case let fileURL as URL in enumerator where fileURL.pathExtension == "jsonl" {
        let messages = (try? parse(jsonlFile: fileURL)) ?? []
        for m in messages {
            let key = "\(m.messageId ?? ""):\(m.requestId ?? ""):"
            if seen.contains(key) { continue }
            seen.insert(key)
            out.append(m)
        }
    }
    return out
}
```

- [ ] **Step 4: Verify green**

Run: `swift test`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "feat(core): recursive directory scan with cross-file dedup"
```

---

## Phase 2 — Pfad 4: Calculator

Port von `src/calculator.js`. Formeln (1:1 aus `calculator.js:13–30`):

```
inputEnergy         = input_tokens     / 1000 * whPer1kInput
outputEnergy        = output_tokens    / 1000 * whPer1kOutput
cacheReadEnergy     = cache_read       / 1000 * whPer1kInput * cacheReadFactor
cacheCreationEnergy = cache_creation   / 1000 * whPer1kInput        // Faktor 1.0
itEnergy_wh         = Σ oben
totalEnergy_wh      = itEnergy_wh * pue
co2_g               = totalEnergy_wh * gridCO2_gPerKwh / 1000
waterOnsite_ml      = itEnergy_kwh  * wueOnsite_LPerKwh  * 1000
waterOffsite_ml     = totalEnergy_kwh * wueOffsite_LPerKwh * 1000
```

### Task 2.1: Calculator — Einzelrechnung

**Files:**
- Test: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/CalculatorTests.swift`
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/Calculator.swift`

- [ ] **Step 1: Failing Test (mit Referenzwerten aus JS-Implementierung)**

```swift
import Testing
@testable import LLMGreenCore

@Test func calculatorMatchesJsReference_sonnet() throws {
    let coeffs = try Coefficients.load()
    let calc = Calculator(coefficients: coeffs)
    let usage = TokenUsage(inputTokens: 100_000, outputTokens: 10_000,
                           cacheRead: 50_000, cacheCreation: 5_000)
    let result = calc.calculate(model: "claude-sonnet-4-5", usage: usage)

    // Hand-gerechnet gegen JS:
    // input   = 100 * 0.01 = 1.0 Wh
    // output  =  10 * 0.10 = 1.0 Wh
    // read    =  50 * 0.01 * 0.15 = 0.075 Wh
    // create  =   5 * 0.01 * 1.0  = 0.05 Wh
    // it      = 2.125 Wh  →  total = 2.125 * 1.14 = 2.4225 Wh
    // co2     = 2.4225 * 385 / 1000 = 0.9327 g
    #expect(abs(result.itEnergy_wh - 2.125) < 1e-9)
    #expect(abs(result.totalEnergy_wh - 2.4225) < 1e-9)
    #expect(abs(result.co2_g - 0.9326625) < 1e-6)
}

@Test func calculatorSumsAcrossMessages() throws {
    let coeffs = try Coefficients.load()
    let calc = Calculator(coefficients: coeffs)
    let messages = [
        AssistantMessage(model: "claude-sonnet-4-5",
                         usage: TokenUsage(inputTokens: 1_000),
                         timestamp: nil, sessionId: nil,
                         requestId: nil, messageId: nil),
        AssistantMessage(model: "claude-sonnet-4-5",
                         usage: TokenUsage(outputTokens: 1_000),
                         timestamp: nil, sessionId: nil,
                         requestId: nil, messageId: nil),
    ]
    let totals = calc.total(for: messages)
    // 1 Wh input + 1 Wh output = 2 * 1.14 = 2.28 Wh total
    #expect(abs(totals.totalEnergy_wh - (0.01 + 0.10) * 1.14) < 1e-9)
}

@Test func equivalencesComputeCorrectly() throws {
    let coeffs = try Coefficients.load()
    let eq = Equivalences.compute(co2_g: 1.1, water_ml: 500, energy_wh: 1.7,
                                  coefficients: coeffs)
    #expect(abs(eq.googleSearches - 10) < 1e-9)  // 1.1 / 0.11
    #expect(abs(eq.waterBottles  - 1)  < 1e-9)  // 500 / 500
    #expect(abs(eq.ledMinutes    - 10) < 1e-9)  // 1.7 / 0.17
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter CalculatorTests`
Expected: Build-Fehler.

- [ ] **Step 3: `Calculator.swift` implementieren**

```swift
import Foundation

public struct CalculationResult: Sendable, Equatable {
    public let itEnergy_wh: Double
    public let totalEnergy_wh: Double
    public let co2_g: Double
    public let waterOnsite_ml: Double
    public let waterOffsite_ml: Double
    public var waterTotal_ml: Double { waterOnsite_ml + waterOffsite_ml }
}

public struct Equivalences: Sendable, Equatable {
    public let googleSearches: Double
    public let ledMinutes: Double
    public let waterBottles: Double
    public let kmDrivingGasoline: Double
    public let kmDrivingEV: Double
    public let phoneCharges: Double

    public static func compute(co2_g: Double, water_ml: Double, energy_wh: Double,
                               coefficients c: Coefficients) -> Equivalences {
        Equivalences(
            googleSearches:    co2_g    / c.equivalences.googleSearch_gCO2,
            ledMinutes:        energy_wh / c.equivalences.ledMinute_Wh,
            waterBottles:      water_ml  / c.equivalences.waterBottle_ml,
            kmDrivingGasoline: co2_g    / c.equivalences.kmGasoline_gCO2,
            kmDrivingEV:       co2_g    / c.equivalences.kmEV_gCO2,
            phoneCharges:      energy_wh / c.equivalences.phoneCharge_Wh
        )
    }
}

public struct Calculator: Sendable {
    public let coefficients: Coefficients
    public init(coefficients: Coefficients) { self.coefficients = coefficients }

    public func calculate(model: String, usage: TokenUsage) -> CalculationResult {
        let e = coefficients.modelEnergy(for: model)
        let d = coefficients.defaults

        let input  = Double(usage.inputTokens)   / 1000 * e.whPer1kInput
        let output = Double(usage.outputTokens)  / 1000 * e.whPer1kOutput
        let read   = Double(usage.cacheRead)     / 1000 * e.whPer1kInput * d.cacheReadFactor
        let create = Double(usage.cacheCreation) / 1000 * e.whPer1kInput * 1.0

        let it = input + output + read + create
        let total_wh = it * d.pue
        let co2 = total_wh * d.gridCO2_gPerKwh / 1000.0
        let onsite  = it        / 1000.0 * d.wueOnsite_LPerKwh  * 1000.0
        let offsite = total_wh / 1000.0 * d.wueOffsite_LPerKwh * 1000.0

        return CalculationResult(
            itEnergy_wh: it,
            totalEnergy_wh: total_wh,
            co2_g: co2,
            waterOnsite_ml: onsite,
            waterOffsite_ml: offsite
        )
    }

    public func total(for messages: [AssistantMessage]) -> CalculationResult {
        var it = 0.0, tot = 0.0, co2 = 0.0, on = 0.0, off = 0.0
        for m in messages {
            let r = calculate(model: m.model, usage: m.usage)
            it += r.itEnergy_wh; tot += r.totalEnergy_wh; co2 += r.co2_g
            on += r.waterOnsite_ml; off += r.waterOffsite_ml
        }
        return CalculationResult(itEnergy_wh: it, totalEnergy_wh: tot,
                                 co2_g: co2, waterOnsite_ml: on, waterOffsite_ml: off)
    }
}
```

- [ ] **Step 4: Verify green**

Run: `swift test --filter CalculatorTests`
Expected: 3/3 PASS.

- [ ] **Step 5: Cross-check gegen Node-Implementierung**

Run (in Projekt-Root, zweiter Terminal):
```bash
node -e "
const c = require('./src/calculator');
console.log(c.calculate({
  model:'claude-sonnet-4-5',
  input_tokens:100000, output_tokens:10000,
  cache_read:50000, cache_creation:5000
}));"
```
Expected: `co2_g: 0.9326625`, `energy_wh: 2.4225`. Identisch zu Swift-Test.

- [ ] **Step 6: Commit**

```bash
git add macos/LLMGreenCore/Sources/LLMGreenCore/Calculator.swift \
        macos/LLMGreenCore/Tests/LLMGreenCoreTests/CalculatorTests.swift
git commit -m "feat(core): calculator + equivalences matching Node reference"
```

---

## Phase 3 — Pfad 4: MenuBarExtra MVP

Ziel: klickbares App-Target, das in der Menüleiste CO₂-Wert + Tokens zeigt. Noch kein File-Watcher — Laden nur beim Start.

### Task 3.1: App-Target im Xcode erstellen

**Manuelle Schritte (Xcode-UI, keine Datei-Edits):**

- [ ] **Step 1: Xcode-Projekt anlegen**
  - Xcode → File → New → Project → macOS App
  - Product Name: `LLMGreenBar`
  - Interface: SwiftUI, Language: Swift, Storage: None
  - Speichern unter: `macos/LLMGreenBar`
  - In General → Deployment Target: macOS 14.0
  - Signing: Development Team = eigenes, App Category: Developer Tools

- [ ] **Step 2: Package als lokale Dependency linken**
  - File → Add Package Dependencies → Add Local… → `macos/LLMGreenCore`
  - Target `LLMGreenBar` → Frameworks and Libraries → `LLMGreenCore` hinzufügen

- [ ] **Step 3: Info.plist für Menu-Bar-only**
  - Target `LLMGreenBar` → Info → Custom macOS Application Target Properties
  - Key `Application is agent (UIElement)` = `YES` (versteckt Dock-Icon)

- [ ] **Step 4: Workspace speichern**
  - Workspace unter `macos/LLMGreen.xcworkspace` speichern, beide Projekte enthalten

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreen.xcworkspace macos/LLMGreenBar
git commit -m "scaffold: LLMGreenBar macOS app target (menu-bar only)"
```

### Task 3.2: AppState + Laden beim Start

**Files:**
- Create: `macos/LLMGreenBar/LLMGreenBar/AppState.swift`

- [ ] **Step 1: `AppState` implementieren**

```swift
import Foundation
import LLMGreenCore
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var totalCO2g: Double = 0
    @Published var totalTokens: Int = 0
    @Published var equivalences: Equivalences?
    @Published var lastError: String?

    private let coefficients: Coefficients
    private let calculator: Calculator

    init() {
        do {
            let coeffs = try Coefficients.load(bundle: .llmGreenCore)
            self.coefficients = coeffs
            self.calculator = Calculator(coefficients: coeffs)
        } catch {
            fatalError("Failed to load coefficients: \(error)")
        }
    }

    func reload() async {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let projectsDir = home.appendingPathComponent(".claude/projects")

        do {
            let messages = try Parser.parseDirectory(projectsDir)
            let totals = calculator.total(for: messages)
            let tokens = messages.reduce(0) { $0 + $1.usage.total }
            let eq = Equivalences.compute(
                co2_g: totals.co2_g,
                water_ml: totals.waterTotal_ml,
                energy_wh: totals.totalEnergy_wh,
                coefficients: coefficients)

            self.totalCO2g = totals.co2_g
            self.totalTokens = tokens
            self.equivalences = eq
            self.lastError = nil
        } catch {
            self.lastError = String(describing: error)
        }
    }
}

// Helper: SwiftPM bundle access from app target
extension Bundle {
    static var llmGreenCore: Bundle { .module }
}
```

Hinweis: `Bundle.module` funktioniert nur innerhalb des Package-Codes. Da die App-Zielbasis `LLMGreenCore` linkt, muss der Aufruf von `.load()` durch eine exportierte Helper-Funktion ersetzt werden.

- [ ] **Step 2: In `LLMGreenCore` Helper ergänzen**

Bearbeiten: `macos/LLMGreenCore/Sources/LLMGreenCore/Coefficients.swift` — ergänze `.loadFromPackageBundle()`:

```swift
public static func loadFromPackageBundle() throws -> Coefficients {
    try load(bundle: .module)
}
```

Und in `AppState.swift` den init-Zweig anpassen:

```swift
let coeffs = try Coefficients.loadFromPackageBundle()
```

- [ ] **Step 3: Build im Xcode (Cmd+B)**

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add macos/LLMGreenBar macos/LLMGreenCore/Sources/LLMGreenCore/Coefficients.swift
git commit -m "feat(bar): AppState loads coefficients + reload from ~/.claude/projects"
```

### Task 3.3: MenuBarExtra + Popover

**Files:**
- Modify: `macos/LLMGreenBar/LLMGreenBar/LLMGreenBarApp.swift`
- Create: `macos/LLMGreenBar/LLMGreenBar/PopoverView.swift`

- [ ] **Step 1: `LLMGreenBarApp.swift` schreiben**

```swift
import SwiftUI

@main
struct LLMGreenBarApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        MenuBarExtra {
            PopoverView()
                .environmentObject(state)
                .task { await state.reload() }
        } label: {
            Text(formatLabel(state.totalCO2g))
        }
        .menuBarExtraStyle(.window)
    }

    private func formatLabel(_ g: Double) -> String {
        if g >= 1000 { return String(format: "🌱 %.1f kg", g / 1000) }
        return String(format: "🌱 %.0f g", g)
    }
}
```

- [ ] **Step 2: `PopoverView.swift` schreiben**

```swift
import SwiftUI
import LLMGreenCore

struct PopoverView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("LLM Green").font(.headline)

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                GridRow { Text("Tokens").foregroundStyle(.secondary)
                          Text(state.totalTokens.formatted()) }
                GridRow { Text("CO₂").foregroundStyle(.secondary)
                          Text(String(format: "%.1f g", state.totalCO2g)) }
            }

            if let eq = state.equivalences {
                Divider()
                Text("Entspricht etwa…").font(.caption).foregroundStyle(.secondary)
                Text(String(format: "• %.0f Google-Suchen", eq.googleSearches))
                Text(String(format: "• %.1f Telefon-Ladungen", eq.phoneCharges))
                Text(String(format: "• %.1f km EV-Fahrt", eq.kmDrivingEV))
            }

            if let err = state.lastError {
                Divider()
                Text(err).font(.caption).foregroundStyle(.red).lineLimit(3)
            }

            Divider()
            HStack {
                Button("Aktualisieren") { Task { await state.reload() } }
                Spacer()
                Button("Beenden") { NSApp.terminate(nil) }
            }
        }
        .padding(14)
        .frame(width: 280)
    }
}
```

- [ ] **Step 3: Manueller Test**

Run: Product → Run (Cmd+R).
Expected: Menüleiste zeigt `🌱 X g`. Klick öffnet Popover mit Tokens + Äquivalenzen. „Beenden" beendet App. Keine Dock-Icon-Sichtbarkeit.

- [ ] **Step 4: Commit**

```bash
git add macos/LLMGreenBar
git commit -m "feat(bar): MenuBarExtra MVP with CO2/tokens popover (Pfad 4)"
```

---

## Phase 4 — Pfad 4: Live Updates

File-Watcher via `DispatchSource.makeFileSystemObjectSource` auf `~/.claude/stats-cache.json` (markiert, wenn Claude Code neue Daten schreibt), debounced auf 500 ms wie im Node-Server (siehe `CLAUDE.md` Konvention).

### Task 4.1: `FileWatcher.swift`

**Files:**
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/FileWatcher.swift`
- Test: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/FileWatcherTests.swift`

- [ ] **Step 1: Failing Test**

```swift
import Testing
import Foundation
@testable import LLMGreenCore

@Test func fileWatcherFiresOnWrite() async throws {
    let tmp = FileManager.default.temporaryDirectory
        .appendingPathComponent("watch-\(UUID().uuidString).txt")
    try "hello".write(to: tmp, atomically: true, encoding: .utf8)

    let stream = AsyncStream<Void> { continuation in
        let watcher = FileWatcher(url: tmp, debounce: .milliseconds(100)) {
            continuation.yield()
        }
        watcher.start()
        continuation.onTermination = { _ in watcher.stop() }
    }

    // Trigger write after small delay
    Task.detached {
        try? await Task.sleep(for: .milliseconds(200))
        try? "changed".write(to: tmp, atomically: true, encoding: .utf8)
    }

    // Wait for first callback (with timeout)
    var iterator = stream.makeAsyncIterator()
    let got = try await withThrowingTaskGroup(of: Bool.self) { group in
        group.addTask { _ = await iterator.next(); return true }
        group.addTask {
            try await Task.sleep(for: .seconds(2))
            return false
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }

    #expect(got == true)
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter FileWatcherTests`
Expected: „cannot find 'FileWatcher'".

- [ ] **Step 3: Implementierung**

```swift
import Foundation

public final class FileWatcher: @unchecked Sendable {
    private let url: URL
    private let debounce: DispatchTimeInterval
    private let onChange: () -> Void
    private var source: DispatchSourceFileSystemObject?
    private var debounceItem: DispatchWorkItem?
    private let queue = DispatchQueue(label: "llmgreen.filewatcher")

    public init(url: URL, debounce: DispatchTimeInterval = .milliseconds(500),
                onChange: @escaping () -> Void) {
        self.url = url
        self.debounce = debounce
        self.onChange = onChange
    }

    public func start() {
        let fd = open(url.path, O_EVTONLY)
        guard fd >= 0 else { return }
        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .extend, .rename, .delete],
            queue: queue)
        src.setEventHandler { [weak self] in self?.scheduleCallback() }
        src.setCancelHandler { close(fd) }
        src.resume()
        source = src
    }

    public func stop() {
        source?.cancel()
        source = nil
        debounceItem?.cancel()
    }

    private func scheduleCallback() {
        debounceItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.onChange() }
        debounceItem = item
        queue.asyncAfter(deadline: .now() + debounce, execute: item)
    }

    deinit { stop() }
}
```

- [ ] **Step 4: Verify green**

Run: `swift test --filter FileWatcherTests`
Expected: PASS innerhalb von 2 Sek.

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "feat(core): DispatchSource-based FileWatcher with debounce"
```

### Task 4.2: AppState abonniert File-Changes

**Files:**
- Modify: `macos/LLMGreenBar/LLMGreenBar/AppState.swift`

- [ ] **Step 1: Watcher einhängen**

```swift
private var watcher: FileWatcher?

func startWatching() {
    let home = FileManager.default.homeDirectoryForCurrentUser
    let statsCache = home.appendingPathComponent(".claude/stats-cache.json")
    watcher = FileWatcher(url: statsCache) { [weak self] in
        Task { @MainActor in await self?.reload() }
    }
    watcher?.start()
}
```

In `LLMGreenBarApp.swift` den `.task`-Block ergänzen:

```swift
.task {
    await state.reload()
    state.startWatching()
}
```

- [ ] **Step 2: Manueller Test**

Run: App starten, Terminal parallel:
```bash
touch ~/.claude/stats-cache.json
```
Expected: Popover-Werte aktualisieren sich, oder Menüleisten-Label ändert sich, wenn gleichzeitig neue JSONL-Daten vorliegen. Log-Ausgabe „reload" im Xcode-Debugger (ggf. `print`-Zeile temporär ergänzen).

- [ ] **Step 3: Commit**

```bash
git add macos/LLMGreenBar
git commit -m "feat(bar): live reload via FileWatcher on stats-cache.json"
```

---

## Phase 5 — Pfad 1: OAuth-Token-Discovery

CodexBar liest den Claude-Code-OAuth-Token aus dem macOS Keychain. Der exakte Service-Name ist nicht offiziell dokumentiert; wir verifizieren ihn empirisch.

### Task 5.1: Token-Location ermitteln (Research-Task)

**Files:** keine

- [ ] **Step 1: Keychain-Dump nach Anthropic-bezogenen Einträgen durchsuchen**

Run: `security dump-keychain -d ~/Library/Keychains/login.keychain-db 2>/dev/null | grep -A1 -iE 'claude|anthropic'`
Expected: ein oder mehrere Einträge mit `svce` wie `"Claude Code-credentials"` oder `"claude.ai"`. Service-Namen notieren.

- [ ] **Step 2: Token-Format prüfen (nicht speichern)**

Run: `security find-generic-password -s "<service-name>" -w | head -c 20 && echo "..."` (falls interaktiv: passwortbestätigen im System-Dialog)
Expected: String beginnt mit `sk-ant-oat…` (OAuth-Access-Token).

- [ ] **Step 3: Ergebnisse im Plan dokumentieren**

In diesem File (`docs/plans/2026-04-24-menu-bar-app.md`) im Abschnitt „Open Questions" ergänzen:

```
- Keychain service: "<tatsächlicher Name>"
- Keychain account: "<account>" (falls relevant)
- Token-Präfix: "sk-ant-oat"
```

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-04-24-menu-bar-app.md
git commit -m "docs(plan): record discovered Keychain location for OAuth token"
```

### Task 5.2: `KeychainTokenStore`

**Files:**
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/KeychainTokenStore.swift`
- Test: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/KeychainTokenStoreTests.swift`

- [ ] **Step 1: Test gegen ad-hoc angelegten Keychain-Eintrag**

```swift
import Testing
import Foundation
@testable import LLMGreenCore

@Test func keychainStoreReadsExistingToken() throws {
    let store = KeychainTokenStore(service: "llmgreen-test-\(UUID().uuidString)")
    try store.store(token: "sk-ant-oat-fake")
    defer { try? store.delete() }

    let read = try store.fetch()
    #expect(read == "sk-ant-oat-fake")
}

@Test func keychainStoreReturnsNilWhenAbsent() throws {
    let store = KeychainTokenStore(service: "llmgreen-absent-\(UUID().uuidString)")
    #expect((try? store.fetch()) == nil)
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter KeychainTokenStoreTests`
Expected: Build-Fehler.

- [ ] **Step 3: Implementierung**

```swift
import Foundation
import Security

public struct KeychainTokenStore {
    public let service: String
    public let account: String
    public init(service: String, account: String = "default") {
        self.service = service
        self.account = account
    }

    public func fetch() throws -> String? {
        var query: [String: Any] = [
            kSecClass as String:           kSecClassGenericPassword,
            kSecAttrService as String:     service,
            kSecAttrAccount as String:     account,
            kSecReturnData as String:      true,
            kSecMatchLimit as String:      kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let s = String(data: data, encoding: .utf8) else {
                return nil
            }
            return s
        case errSecItemNotFound:
            return nil
        default:
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    public func store(token: String) throws {
        try? delete()
        let attr: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String:   Data(token.utf8),
        ]
        let status = SecItemAdd(attr as CFDictionary, nil)
        if status != errSecSuccess {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    public func delete() throws {
        let q: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(q as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }
}
```

- [ ] **Step 4: Verify green**

Run: `swift test --filter KeychainTokenStoreTests`
Expected: 2/2 PASS. Evtl. bittet macOS initial um Keychain-Zugriff-Bestätigung.

- [ ] **Step 5: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "feat(core): KeychainTokenStore (Security framework wrapper)"
```

---

## Phase 6 — Pfad 1: OAuth-Client

Endpoint laut CodexBar-Doku: `GET https://api.anthropic.com/api/oauth/usage`. Antwort enthält Usage-Fenster (`five_hour`, `seven_day`), Modell-Splits, Plan-Tier.

**Warnung:** Exakter Response-Schema ist **nicht öffentlich dokumentiert**. Wir nutzen defensives Decoding (alle Felder optional, lenient bei fehlenden Keys) und eine aus einem echten Aufruf generierte Fixture. Bei Schema-Änderung fällt die Anzeige aus, die App bleibt funktionsfähig.

### Task 6.1: Endpoint-Probe + Fixture

**Files:**
- Create: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/oauth-usage-response.json`

- [ ] **Step 1: Echte Antwort holen**

Run (mit echtem Token aus Keychain):
```bash
TOKEN=$(security find-generic-password -s "<service-from-phase-5>" -w)
curl -s -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     https://api.anthropic.com/api/oauth/usage \
  | jq . > /tmp/oauth-usage.json
cat /tmp/oauth-usage.json
```
Expected: JSON mit Keys wie `five_hour_limit`, `seven_day_limit` und zugehörigen `used`-Werten oder Prozenten. Beobachteten Schema dokumentieren.

- [ ] **Step 2: Anonymisierte Fixture speichern**

Werte durch Platzhalter ersetzen (kein Realtoken, keine PII), unter `macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/oauth-usage-response.json` ablegen.

- [ ] **Step 3: Commit (nur Fixture)**

```bash
git add macos/LLMGreenCore/Tests/LLMGreenCoreTests/Fixtures/oauth-usage-response.json
git commit -m "test(core): oauth usage response fixture (anonymized)"
```

### Task 6.2: `OAuthClient.swift`

**Files:**
- Create: `macos/LLMGreenCore/Sources/LLMGreenCore/OAuthClient.swift`
- Test: `macos/LLMGreenCore/Tests/LLMGreenCoreTests/OAuthClientTests.swift`

- [ ] **Step 1: Tests mit Mock-`URLProtocol`**

```swift
import Testing
import Foundation
@testable import LLMGreenCore

final class MockProtocol: URLProtocol {
    nonisolated(unsafe) static var responseData: Data = Data()
    nonisolated(unsafe) static var statusCode: Int = 200

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let resp = HTTPURLResponse(url: request.url!, statusCode: Self.statusCode,
                                   httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Test func oauthClientParsesFixture() async throws {
    let url = Bundle.module.url(forResource: "oauth-usage-response", withExtension: "json")!
    MockProtocol.responseData = try Data(contentsOf: url)
    MockProtocol.statusCode = 200

    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockProtocol.self]
    let session = URLSession(configuration: config)
    let client = OAuthClient(session: session, tokenProvider: { "sk-ant-oat-fake" })

    let usage = try await client.fetchUsage()

    #expect(usage.fiveHour != nil)
    #expect(usage.sevenDay != nil)
    // fiveHour.percentUsed liegt zwischen 0 und 100
    if let p = usage.fiveHour?.percentUsed {
        #expect(p >= 0 && p <= 100)
    }
}

@Test func oauthClientThrowsOn401() async throws {
    MockProtocol.responseData = Data("unauthorized".utf8)
    MockProtocol.statusCode = 401

    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockProtocol.self]
    let session = URLSession(configuration: config)
    let client = OAuthClient(session: session, tokenProvider: { "expired" })

    await #expect(throws: OAuthClient.Error.self) {
        _ = try await client.fetchUsage()
    }
}
```

- [ ] **Step 2: Verify red**

Run: `swift test --filter OAuthClientTests`
Expected: Build-Fehler.

- [ ] **Step 3: Implementierung (defensives Decoding)**

```swift
import Foundation

public struct UsageWindow: Sendable, Equatable {
    public let percentUsed: Double?    // 0-100
    public let resetAt: Date?
    public let used: Int?
    public let limit: Int?
}

public struct OAuthUsage: Sendable, Equatable {
    public let fiveHour: UsageWindow?
    public let sevenDay: UsageWindow?
    public let planTier: String?
    public let rawJSON: Data   // aufbewahren für Debugging & künftige Felder
}

public struct OAuthClient: Sendable {
    public enum Error: Swift.Error { case unauthorized, http(Int), missingToken, decode }

    private let session: URLSession
    private let tokenProvider: @Sendable () -> String?
    private let endpoint = URL(string: "https://api.anthropic.com/api/oauth/usage")!

    public init(session: URLSession = .shared,
                tokenProvider: @Sendable @escaping () -> String?) {
        self.session = session
        self.tokenProvider = tokenProvider
    }

    public func fetchUsage() async throws -> OAuthUsage {
        guard let token = tokenProvider(), !token.isEmpty else { throw Error.missingToken }
        var req = URLRequest(url: endpoint)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw Error.decode }
        switch http.statusCode {
        case 200: break
        case 401: throw Error.unauthorized
        default: throw Error.http(http.statusCode)
        }
        return try parse(data: data)
    }

    func parse(data: Data) throws -> OAuthUsage {
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return OAuthUsage(
            fiveHour: extractWindow(obj, keys: ["five_hour", "fiveHour", "five_hour_window"]),
            sevenDay: extractWindow(obj, keys: ["seven_day", "sevenDay", "seven_day_window"]),
            planTier: obj["plan_tier"] as? String ?? obj["planTier"] as? String,
            rawJSON: data
        )
    }

    private func extractWindow(_ root: [String: Any], keys: [String]) -> UsageWindow? {
        for k in keys {
            if let sub = root[k] as? [String: Any] {
                let percent = (sub["percent_used"] as? Double)
                    ?? (sub["percentUsed"] as? Double)
                    ?? (sub["used_percent"] as? Double)
                let used  = sub["used"]  as? Int ?? sub["tokens_used"] as? Int
                let limit = sub["limit"] as? Int ?? sub["tokens_limit"] as? Int
                let reset: Date? = {
                    guard let s = sub["reset_at"] as? String ?? sub["resetAt"] as? String
                        else { return nil }
                    return ISO8601DateFormatter().date(from: s)
                }()
                return UsageWindow(percentUsed: percent, resetAt: reset, used: used, limit: limit)
            }
            // top-level keys like "five_hour_limit" / "five_hour_used"
            if let lim = root["\(k)_limit"] as? Int {
                let used = root["\(k)_used"] as? Int
                let percent: Double? = {
                    guard let u = used else { return nil }
                    return lim == 0 ? nil : Double(u) / Double(lim) * 100.0
                }()
                return UsageWindow(percentUsed: percent, resetAt: nil, used: used, limit: lim)
            }
        }
        return nil
    }
}
```

- [ ] **Step 4: Verify green**

Run: `swift test --filter OAuthClientTests`
Expected: 2/2 PASS. (Falls Fixture-Schema anders als antizipiert, `extractWindow`-Keys anpassen.)

- [ ] **Step 5: Echt-Test gegen Production-Endpoint (manuell)**

Run in einem Swift-Skript (oder kurz in App-Code stecken):
```swift
let store = KeychainTokenStore(service: "<from-phase-5>")
let client = OAuthClient(tokenProvider: { try? store.fetch() })
let usage = try await client.fetchUsage()
print(usage)
```
Expected: nicht-leere Werte für `fiveHour.percentUsed` und `sevenDay.percentUsed`.

- [ ] **Step 6: Commit**

```bash
git add macos/LLMGreenCore
git commit -m "feat(core): OAuthClient for /api/oauth/usage with defensive decoding"
```

---

## Phase 7 — Pfad 1: UI-Integration

Fenster-Anzeige im Popover unter der CO₂-Sektion, Refresh im gleichen Rhythmus wie Pfad 4 + zusätzlich periodisch (alle 5 min, damit sich die 5-h-Bar auch ohne File-Event bewegt).

### Task 7.1: AppState erweitert um OAuth

**Files:**
- Modify: `macos/LLMGreenBar/LLMGreenBar/AppState.swift`

- [ ] **Step 1: Felder + Methode ergänzen**

```swift
@Published var fiveHourPercent: Double?
@Published var sevenDayPercent: Double?
@Published var oauthError: String?

private let tokenStore = KeychainTokenStore(service: "<service-from-phase-5>")
private lazy var oauth = OAuthClient(
    tokenProvider: { [weak self] in try? self?.tokenStore.fetch() }
)
private var oauthTimer: Timer?

func reloadOAuth() async {
    do {
        let u = try await oauth.fetchUsage()
        self.fiveHourPercent = u.fiveHour?.percentUsed
        self.sevenDayPercent = u.sevenDay?.percentUsed
        self.oauthError = nil
    } catch OAuthClient.Error.missingToken {
        self.oauthError = "Kein OAuth-Token gefunden"
    } catch {
        self.oauthError = String(describing: error)
    }
}

func startOAuthPolling() {
    oauthTimer?.invalidate()
    oauthTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { _ in
        Task { @MainActor in await self.reloadOAuth() }
    }
}
```

- [ ] **Step 2: In `LLMGreenBarApp.swift` Hook ergänzen**

```swift
.task {
    await state.reload()
    state.startWatching()
    await state.reloadOAuth()
    state.startOAuthPolling()
}
```

- [ ] **Step 3: Build + manueller Test**

Run: Product → Run.
Expected: App startet, kein Crash, `oauthError` entweder `nil` oder informativ gesetzt (je nach Token-Verfügbarkeit).

- [ ] **Step 4: Commit**

```bash
git add macos/LLMGreenBar
git commit -m "feat(bar): wire OAuthClient into AppState with 5-min polling"
```

### Task 7.2: UI-Blöcke für Rate-Limits

**Files:**
- Modify: `macos/LLMGreenBar/LLMGreenBar/PopoverView.swift`
- Modify: `macos/LLMGreenBar/LLMGreenBar/LLMGreenBarApp.swift`

- [ ] **Step 1: ProgressView-Sektion ins Popover einbauen**

Oberhalb von „Entspricht etwa…" einfügen:

```swift
if state.fiveHourPercent != nil || state.sevenDayPercent != nil {
    Divider()
    Text("Rate-Limits").font(.caption).foregroundStyle(.secondary)
    if let p = state.fiveHourPercent {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("5-Stunden-Fenster").font(.caption)
                Spacer()
                Text(String(format: "%.0f %%", p)).font(.caption.monospacedDigit())
            }
            ProgressView(value: p / 100.0)
        }
    }
    if let p = state.sevenDayPercent {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("7-Tage-Fenster").font(.caption)
                Spacer()
                Text(String(format: "%.0f %%", p)).font(.caption.monospacedDigit())
            }
            ProgressView(value: p / 100.0)
        }
    }
} else if let err = state.oauthError {
    Divider()
    Text("Rate-Limits: \(err)").font(.caption).foregroundStyle(.secondary)
}
```

- [ ] **Step 2: Menüleisten-Label erweitern (CO₂ + 5-h-Prozent)**

In `LLMGreenBarApp.swift` `formatLabel`:

```swift
private func formatLabel(_ state: AppState) -> String {
    let co2 = state.totalCO2g
    let co2Str = co2 >= 1000
        ? String(format: "%.1f kg", co2 / 1000)
        : String(format: "%.0f g", co2)
    if let p = state.fiveHourPercent {
        return "🌱 \(co2Str) · \(Int(p))%"
    }
    return "🌱 \(co2Str)"
}
```

Label-Call entsprechend anpassen: `Text(formatLabel(state))`.

- [ ] **Step 3: Manueller Test**

Expected: Menüleiste zeigt z. B. `🌱 42 g · 67 %`. Popover zeigt beide Progress-Bars. Bei abgelaufenem Token: Hinweistext statt Bars.

- [ ] **Step 4: Commit**

```bash
git add macos/LLMGreenBar
git commit -m "feat(bar): rate-limit progress bars + combined menu bar label"
```

---

## Self-Review

**Spec coverage:**
- Pfad 4 (Local JSONL) → Phase 1–4 ✓
- Pfad 1 (OAuth) → Phase 5–7 ✓
- CO₂/Wasser/Energie-Anzeige → Phase 2 (Calculator) + Phase 3 (Popover) ✓
- Äquivalenzen → Phase 2 ✓
- Live-Updates → Phase 4 ✓
- Token-Anzeige (wie in Userfrage: „wieviele tokens schon verbraucht") → Phase 3 Task 3.3 Popover ✓
- ccusage-Quervergleich für Parser-Robustheit → Task 1.0 ✓

**Placeholder-Scan:**
- Task 5.1 + 6.1 enthalten Research-Schritte mit unbekannten konkreten Werten — das ist **kein** Placeholder, sondern explizit als Discovery-Task deklariert mit klaren Verify-Kommandos. Jede spätere Task referenziert `<service-from-phase-5>` — das ist ein klar auflösbarer Verweis, kein TBD.

**Type consistency:**
- `TokenUsage.total` wird in Phase 3 Task 3.2 genutzt — definiert in Phase 1.1 ✓
- `Coefficients.loadFromPackageBundle()` wird in Phase 3 Task 3.2 genutzt — ergänzt in gleicher Task ✓
- `Equivalences.compute` wird in Phase 3 Task 3.2 genutzt — definiert in Phase 2.1 ✓
- `OAuthClient.Error.missingToken` wird in Phase 7 Task 7.1 genutzt — definiert in Phase 6.2 ✓
- `KeychainTokenStore(service:)` wird in Phase 7 Task 7.1 mit Platzhalter genutzt — Wert kommt aus Phase 5.1 ✓

Plan ist konsistent.

---

## Verwandte Projekte (Referenz)

Nur zur Einordnung — keine Abhängigkeiten. `ccusage` dient als Cross-Reference für den Parser (siehe Task 1.0).

| Projekt | Pfad | Relevanz |
|---|---|---|
| [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) | 4 | Battle-getesteter JSONL-Parser in TS. Cross-Reference für Task 1.0. |
| [steipete/CodexBar](https://github.com/steipete/CodexBar) | 1+2+3+4 | Multi-Pfad-Menu-Bar, Vorbild für Architektur-Entscheidungen. |
| [mm7894215/TokenTracker](https://github.com/mm7894215/TokenTracker) | 4 | Menu-Bar + Dashboard + Widgets, architektonisch am nächsten. |
| [nateherkai/token-dashboard](https://github.com/nateherkai/token-dashboard) | 4 | Web-Dashboard-Zwilling von LLM Green. |
| [eddmann/ClaudeMeter](https://github.com/eddmann/ClaudeMeter) | 2 | SwiftUI-Menu-Bar, Cookie-Scraping (nicht unser Pfad), gute Icon-Inspiration. |

**Alleinstellung von LLM Green:** Keines dieser Projekte zeigt CO₂/Wasser/Energie. Dieser Plan kombiniert Pfad 4 (Impact) mit Pfad 1 (Rate-Limits) — das gibt es sonst nicht.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-24-menu-bar-app.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Welchen Ansatz willst du? Oder willst du den Plan erst noch anpassen?
