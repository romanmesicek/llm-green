# Water Footprint of Large Language Model Inference: Research Report

**Date:** 2026-02-10
**Purpose:** Inform development of a water usage calculator for LLM token consumption
**Scope:** All major providers (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek), direct + indirect water

---

## Executive Summary

This report compiles current research on the water consumption of LLM inference, providing specific coefficients usable in a calculator application. The key finding is that **per-query water consumption spans roughly three orders of magnitude** (0.05 mL to 45 mL) depending on model size, provider infrastructure, regional grid mix, and scope boundaries (on-site only vs. full lifecycle).

For a practical calculator, the formula is:

```
water_mL = (tokens / 1000) * energy_per_1000_tokens_Wh * water_factor_mL_per_Wh
```

Off-site (indirect) water from electricity generation typically dominates the total footprint by **10-20x** over on-site cooling water.

---

## Table of Contents

1. [The Landmark Paper: Li et al. (2023)](#1-the-landmark-paper-li-et-al-2023)
2. [Updated Per-Query Energy and Water Figures (2025)](#2-updated-per-query-energy-and-water-figures-2025)
3. [Direct vs. Indirect Water Consumption](#3-direct-vs-indirect-water-consumption)
4. [Cloud Provider WUE and PUE Metrics](#4-cloud-provider-wue-and-pue-metrics)
5. [Regional Variations](#5-regional-variations)
6. [Training vs. Inference Water Costs](#6-training-vs-inference-water-costs)
7. [Calculator Coefficients](#7-calculator-coefficients)
8. [Methodology: Converting Energy to Water](#8-methodology-converting-energy-to-water)
9. [Existing Tools and GitHub Projects](#9-existing-tools-and-github-projects)
10. [Claude Code Local Data Structure](#10-claude-code-local-data-structure)
11. [Uncertainties and Limitations](#11-uncertainties-and-limitations)
12. [References](#12-references)

---

## 1. The Landmark Paper: Li et al. (2023)

Li, Yang, Islam, and Ren (2023) published the first systematic analysis of the water footprint of AI models. Originally an arXiv preprint (2304.03271), later published in *Communications of the ACM* (2025).

**Training footprint (GPT-3, 175B params):**
- On-site (scope-1): ~**700,000 liters** of freshwater evaporated
- Total (incl. off-site electricity): ~**5.4 million liters**
- Methodology: Microsoft's WUE of 0.55 L/kWh * training energy of ~1,287 MWh

**Inference footprint (GPT-3):**
- A 500 mL bottle of water for roughly **20-50 medium-length responses**
- Translates to ~**10-25 mL per response**
- Based on ~0.004 kWh per page of content

**Projection:** Global AI demand projected to require **4.2-6.6 billion m^3** of water withdrawal by 2027.

**Critical caveat:** Mytton (2023) demonstrated the paper's methodology used Microsoft's own 0.55 L/kWh WUE figure, not the general 3.8-5.2 L/kWh range sometimes cited. The authors acknowledged estimates "serve as approximate reference rather than accurate calculation."

---

## 2. Updated Per-Query Energy and Water Figures (2025)

### 2.1 Jegham et al. (2025) -- "How Hungry is AI?"

The most comprehensive independent benchmark, covering 30 models across commercial infrastructure (arXiv: 2505.09598).

**Energy Consumption Per Query (Wh):**

| Model | Short (100in/300out) | Medium (1kin/1kout) | Long (10kin/1.5kout) |
|---|---|---|---|
| GPT-4.1 | 0.871 | 3.161 | 4.833 |
| GPT-4.1 nano | 0.207 | 0.575 | 0.827 |
| GPT-4o (Mar 2025) | 0.423 | 1.215 | 2.875 |
| GPT-4o mini | 0.577 | 1.897 | 3.098 |
| GPT-4 Turbo | 1.699 | 5.940 | 9.877 |
| o3 | 1.177 | 5.153 | 12.222 |
| o3-mini (high) | 3.012 | 6.865 | 5.389 |
| Claude-3.7 Sonnet | 0.950 | 2.989 | 5.671 |
| Claude-3.5 Sonnet | 0.973 | 3.638 | 7.772 |
| Claude-3.5 Haiku | 0.975 | 4.464 | 8.010 |
| LLaMA-3.1-8B | 0.052 | 0.172 | 0.443 |
| LLaMA-3.1-70B | 1.271 | 4.525 | 19.183 |
| LLaMA-3.1-405B | 2.226 | 9.042 | 25.202 |
| LLaMA-3.3-70B | 0.237 | 0.760 | 1.447 |
| DeepSeek-R1 (native) | 19.251 | 24.596 | 29.078 |
| DeepSeek-R1 (Azure) | 2.353 | 4.331 | 7.410 |

**Infrastructure Multipliers Used:**

| Provider | PUE | WUE On-site (L/kWh) | WUE Off-site (L/kWh) | CIF (kgCO2e/kWh) |
|---|---|---|---|---|
| Microsoft Azure (OpenAI) | 1.12 | 0.30 | 4.35 | 0.35 |
| AWS (Anthropic/Meta) | 1.14 | 0.18 | 5.11 | 0.287 |
| DeepSeek (China) | 1.27 | 1.20 | 6.016 | 0.60 |

### 2.2 Google -- Elsworth et al. (2025)

Google published the first corporate-authored peer-reviewed paper on AI inference environmental impact (arXiv: 2508.15734).

**Median Gemini Apps text prompt (May 2025):**
- Energy: **0.24 Wh** total (TPUs: 0.14 Wh, CPU/DRAM: 0.06 Wh, idle: 0.02 Wh, PUE: 0.02 Wh)
- Water: **0.26 mL** (~five drops)
- Carbon: **0.03 gCO2e**
- Fleet-wide PUE: **1.09**, WUE: **1.15 L/kWh**

**Efficiency gains (May 2024 to May 2025):** 33x energy reduction, 44x emissions reduction per prompt.

### 2.3 OpenAI -- Altman Disclosure (June 2025)

Sam Altman stated the average ChatGPT query uses:
- Energy: **0.34 Wh**
- Water: **~0.32 mL** (0.000085 gallons)

**Caveats:** Not peer-reviewed, covers only on-site cooling water, "average query" undefined. [UNVERIFIED]

### 2.4 Epoch AI Analysis (2025)

Independent analysis of ChatGPT energy:
- GPT-4o: ~200B total params, ~100B active (MoE)
- ~0.3 Wh per typical query (500 output tokens)
- 10k-input-token query: ~2.5 Wh; 100k-input-token query: ~40 Wh

### 2.5 Mistral -- Full Lifecycle Analysis (2025)

First complete LCA of an LLM (Mistral Large 2, 123B params), following ISO 14040/44 and AFNOR Frugal AI methodology.

**Per-query (400-token response):**
- Water: **45 mL** (includes full lifecycle: manufacturing, training amortization, off-site electricity)
- Carbon: **1.14 gCO2e**

**Training:** Water: **281,000 m^3** (281 million liters). Training + inference = 91% of total water.

**Key finding:** Impacts roughly proportional to model size.

---

## 3. Direct vs. Indirect Water Consumption

**On-site (direct):** Water evaporated at datacenter for cooling. Measured by WUE (L/kWh). Range: 0.03-1.20 L/kWh.

**Off-site (indirect):** Water consumed during electricity generation. Often the dominant component.

**US data (2023):** Datacenters consumed 17 billion gallons directly and 211 billion gallons indirectly -- indirect is ~**12x** the direct footprint (EESI, 2025).

**Off-site water intensity by energy source:**

| Energy Source | Water Consumption (L/kWh) |
|---|---|
| Nuclear | ~2.1 |
| Coal | ~2.0 |
| Natural gas (CCGT) | ~1.2 |
| Solar PV | ~0 (negligible) |
| Wind | ~0 (negligible) |
| US grid average (consumption) | ~1.8 |
| US grid average (withdrawal) | ~7.6 |

---

## 4. Cloud Provider WUE and PUE Metrics

### Microsoft Azure

| Region | WUE FY24 (L/kWh) | WUE FY25 (L/kWh) | PUE FY24 | PUE FY25 |
|---|---|---|---|---|
| Global | 0.30 | 0.27 | 1.16 | 1.17 |
| Americas | 0.38 | 0.34 | 1.16 | 1.16 |
| Asia Pacific | 0.03 | 0.25 | 1.25 | 1.28 |
| EMEA | 0.03 | 0.03 | 1.16 | 1.16 |

Total water consumed (FY2023): ~6.4 million m^3 (1.69B gallons), +34% YoY.
**Zero-water initiative:** Starting Aug 2024, all new datacenters use chip-level cooling with zero evaporative water.

### Google Cloud

| Metric | Value | Year |
|---|---|---|
| PUE (fleet) | 1.09 | 2024 |
| WUE (fleet) | 1.15 L/kWh | 2023-2024 |
| Total water consumed | ~8.1 billion gallons | 2024 |
| YoY water increase | 28% | 2023-2024 |

### AWS

| Metric | Value | Year |
|---|---|---|
| PUE (global) | 1.15 | 2024 |
| WUE (global) | 0.15 L/kWh | 2024 |
| WUE improvement | 17% YoY, 40% since 2021 | 2024 |

AWS's 0.15 L/kWh is the lowest publicly reported WUE among hyperscalers.

### Meta

| Metric | Value | Year |
|---|---|---|
| WUE (reported) | 0.26 L/kWh | 2023 |
| Total water consumed | 3.1 billion L (813M gallons) | 2023 |
| Datacenter share | 95% of total | 2023 |

---

## 5. Regional Variations

Water consumption varies by:

1. **Cooling method:** Evaporative (water-intensive) vs. air/liquid cooling (minimal water)
2. **Grid energy mix:** Renewables = near-zero off-site water; coal/nuclear = 1.8-2.1 L/kWh
3. **Seasonal/climate:** Arizona summer = ~3x Iceland winter

**Regional off-site WUE factors (Jegham et al., 2025):**
- Azure US: 4.35 L/kWh
- AWS US: 5.11 L/kWh
- DeepSeek China: 6.016 L/kWh (coal-heavy grid)
- EMEA on-site: 0.03 L/kWh (cooler climate)

---

## 6. Training vs. Inference Water Costs

| Model | Training Water | Inference Water (per query) |
|---|---|---|
| GPT-3 (175B) | ~700K L on-site; ~5.4M L total | ~10-25 mL |
| GPT-4 (est.) | ~7-50M L (estimated 10x+ GPT-3) | ~0.3-2 mL short query |
| Mistral Large 2 (123B) | 281M L | 45 mL per 400 tokens (full LCA) |

**For inference-focused calculator:** At scale (billions of queries), amortized training water per query is typically <0.01 mL -- negligible vs. inference water.

---

## 7. Calculator Coefficients

### 7.1 Energy per 1000 Tokens (Wh)

Based on short prompt data (400 tokens = 100 input + 300 output) from Jegham et al. (2025):

| Model | Wh / 1000 tokens |
|---|---|
| GPT-4o | 1.06 |
| GPT-4.1 | 2.18 |
| GPT-4.1 nano | 0.52 |
| GPT-4 Turbo | 4.25 |
| Claude-3.7 Sonnet | 2.38 |
| Claude-3.5 Sonnet | 2.43 |
| Claude-3.5 Haiku | 2.44 |
| Gemini (median text) | ~0.60 |
| LLaMA-3.1-8B | 0.13 |
| LLaMA-3.1-70B | 3.18 |
| LLaMA-3.3-70B | 0.59 |
| LLaMA-3.1-405B | 5.57 |
| DeepSeek-R1 (Azure) | 5.88 |
| Mistral Large 2 | ~2.5 (est. from lifecycle) |

### 7.2 Water Conversion Factors (mL per Wh)

Using formula: `Water_factor = WUE_onsite/PUE + WUE_offsite`

| Provider | On-site (mL/Wh) | Off-site (mL/Wh) | Total (mL/Wh) |
|---|---|---|---|
| Azure (OpenAI) | 0.268 | 4.35 | 4.618 |
| AWS (Anthropic/Meta) | 0.158 | 5.11 | 5.268 |
| GCP (Google) | 1.15 (combined) | -- | 1.15 |
| DeepSeek (China) | 0.945 | 6.016 | 6.961 |

### 7.3 Combined Water per 1000 Tokens (mL)

| Model | Provider | Energy/1k tok (Wh) | Water/1k tok (mL) |
|---|---|---|---|
| GPT-4o | Azure | 1.06 | 4.90 |
| GPT-4.1 | Azure | 2.18 | 10.07 |
| GPT-4.1 nano | Azure | 0.52 | 2.40 |
| Claude-3.7 Sonnet | AWS | 2.38 | 12.54 |
| Claude-3.5 Haiku | AWS | 2.44 | 12.85 |
| Gemini (median) | GCP | 0.60 | ~0.69 |
| LLaMA-3.1-8B | AWS | 0.13 | 0.68 |
| LLaMA-3.1-70B | AWS | 3.18 | 16.75 |
| LLaMA-3.3-70B | AWS | 0.59 | 3.11 |

### 7.4 Simplified Tier System

**On-site water only:**
- Low: 0.03 mL/Wh (EMEA, modern liquid cooling)
- Medium: 0.27 mL/Wh (Azure global FY25)
- High: 1.20 mL/Wh (China/hot climate)

**Off-site water:**
- Low: 0 mL/Wh (100% renewable)
- Medium: 1.8 mL/Wh (US grid average)
- High: 6.0 mL/Wh (coal-heavy grid)

**Total combined:**
- Best case: ~0.03 mL/Wh (Nordic, 100% renewable)
- Typical US: ~2.1 mL/Wh (0.30 on-site + 1.8 off-site)
- Worst case: ~7.2 mL/Wh (hot climate + coal grid)

---

## 8. Methodology: Converting Energy to Water

### Standard Approach

1. **Measure per-query energy** (Wh): from API latency * GPU power * utilization, or published benchmarks. Include PUE: `E_total = E_IT * PUE`

2. **Apply on-site WUE** for direct cooling water:
   ```
   Water_onsite (L) = E_IT (kWh) * WUE_onsite (L/kWh)
   ```

3. **Apply off-site water intensity** for indirect water:
   ```
   Water_offsite (L) = E_total (kWh) * WI_grid (L/kWh)
   ```

4. **Sum:**
   ```
   Water_total = Water_onsite + Water_offsite
   ```

### Key Metrics

- **PUE (Power Usage Effectiveness):** Total facility energy / IT equipment energy. Ideal = 1.0. Industry avg ~1.56. Hyperscalers: 1.09-1.17.
- **WUE (Water Usage Effectiveness):** Annual liters of water / total annual kWh for IT. Units: L/kWh.

### Worked Example -- Claude-3.7 Sonnet, 1000 tokens

```
energy = 2.38 Wh = 0.00238 kWh
on_site_water = (0.00238 / 1.14) * 0.18 = 0.000376 L = 0.376 mL
off_site_water = 0.00238 * 5.11 = 0.01216 L = 12.16 mL
total_water = 0.376 + 12.16 = 12.54 mL per 1000 tokens
```

---

## 9. Existing Tools and GitHub Projects

### 9.1 Python Libraries (API-Level Tracking)

#### EcoLogits -- BEST-IN-CLASS for water + carbon + energy

- **Repository:** [genai-impact/ecologits](https://github.com/genai-impact/ecologits)
- **Stars:** 252 | **Last active:** 2026-01-24 (actively maintained)
- **What it measures:** Energy (kWh), GHG emissions (kgCO2e), water usage (L), ADPe (mineral depletion)
- **How it works:** Bottom-up LCA methodology. Single-line `EcoLogits.init()` wraps existing API client calls. Intercepts token counts and applies provider/model-specific coefficients including PUE and WUE.
- **Supported providers:** OpenAI, Anthropic, Mistral, Google GenAI, Cohere, HuggingFace Hub
- **Key limitation:** WUE/PUE values are defaults based on provider averages, not real-time datacenter-specific. Embodied water from hardware manufacturing not yet computed. Cannot distinguish which datacenter handled request.
- **Also available as:** [ecologits.js](https://github.com/mlco2/ecologits.js) (JavaScript/TypeScript, 11 stars, updated Feb 2026)
- **Published paper:** "EcoLogits: Evaluating the Environmental Impacts of Generative AI" in JOSS
- **Organization:** GenAI Impact, a non-profit (https://genai-impact.org/)

#### CodeCarbon

- **Repository:** [mlco2/codecarbon](https://github.com/mlco2/codecarbon)
- **Stars:** 1,698 (most popular tool in this space) | **Last active:** 2026-02-08
- **What it measures:** Energy consumption (CPU, GPU, RAM) and CO2eq emissions
- **How it works:** Directly measures hardware power consumption via RAPL (Intel), NVML (NVIDIA GPUs). Looks up regional carbon intensity.
- **Limitation:** Does **not** track water. Designed for local compute, not API calls. PUE not included by default.

#### eco2AI

- **Repository:** [sb-ai-lab/Eco2AI](https://github.com/sb-ai-lab/Eco2AI)
- **Stars:** 269 | **Last active:** 2025-03-10
- **What it measures:** Power consumption (CPU + GPU), CO2eq
- **Limitation:** No water tracking. Local compute only.

#### CarbonTracker

- **Repository:** [saintslab/carbontracker](https://github.com/saintslab/carbontracker)
- **Stars:** 473 | **Last active:** 2026-01-16
- **What it measures:** Energy and carbon footprint of DL training
- **Limitation:** No water. Training-focused, not inference/API.

#### Experiment Impact Tracker

- **Repository:** [Breakend/experiment-impact-tracker](https://github.com/Breakend/experiment-impact-tracker)
- **Stars:** 290 | **Last active:** 2024-01-30 (unmaintained)
- **Limitation:** No water. Not maintained.

### 9.2 Browser Extensions

#### AI Wattch -- MOST SOPHISTICATED extension

- **Repository:** [AIWattch/AI-Wattch](https://github.com/AIWattch/AI-Wattch)
- **Stars:** 16 | **Last active:** 2026-01-22 | **Chrome + Firefox**
- **What it measures:** Energy (Wh), CO2 emissions, **and water consumption** in real-time
- **Supported platforms:** ChatGPT, Claude
- **How it works:** Uses Antarctica's "One Token Model" (OTM) -- hardware-layer analysis estimating GPU power draw based on model architecture, MoE active parameters, geographic energy context, PUE/WUE per region.

#### AI Impact Tracker

- **Repository:** [simonaszilinskas/ai-impact-tracker](https://github.com/simonaszilinskas/ai-impact-tracker)
- **Stars:** 14 | **Last active:** 2025-10-17 | **Chrome only**
- **Measures:** Energy + **water footprint**. ChatGPT only.

#### GreenQuery

- **Chrome Web Store:** [GreenQuery](https://chromewebstore.google.com/detail/greenquery/ncbhfkcfbgmomklbimabfkoppejkibpp)
- **Measures:** CO2 + **water usage**. ChatGPT only. Uses MIT/academic research metrics.

#### LLM Water Tracker

- **Repository:** [abdjiber/llm-water-tracker](https://github.com/abdjiber/llm-water-tracker)
- **Stars:** 1 | **Last active:** 2025-04-08
- **Measures:** **Water consumption only** (exclusively water-focused)
- **Supported:** ChatGPT, Claude, Gemini
- **Based on:** Li et al. "Making AI Less Thirsty" coefficients

#### Ecomind - AI Sustainability Tracker

- **Chrome Web Store:** [Ecomind](https://chromewebstore.google.com/detail/ecomind-ai-sustainability/hllhaieflnkbfenbknbdomgjnmngjcci)
- **Measures:** Energy (kWh with PUE), **water (L)**, carbon (CO2)
- **Supported:** 12+ AI providers including OpenAI, Anthropic, Google, xAI (Grok), Perplexity
- **How it works:** Chrome webRequest API monitors network traffic; applies industry-standard metrics

#### ChatGPT Consumption

- **Chrome Web Store:** [ChatGPT Consumption](https://chromewebstore.google.com/detail/chatgpt-consumption/inlfplkijidejppdffcpehojlpndjigi)
- **Measures:** Token counts + **water consumption estimates**. ChatGPT only.

### 9.3 Academic/Research Repositories

#### Making AI Less Thirsty (Foundational)

- **Repository:** [Ren-Research/Making-AI-Less-Thirsty](https://github.com/Ren-Research/Making-AI-Less-Thirsty)
- **Stars:** 32 | **Last active:** 2023-04-07 (archived, paper companion)
- **Value:** Foundational methodology; coefficients used by many other tools

#### "How Hungry is AI?" (Most Comprehensive Benchmark)

- **Code:** [Nidhal-Jegham/HowHungryIsAI](https://github.com/Nidhal-Jegham/HowHungryIsAI) (1 star)
- **Dashboard:** [Nidhal-Jegham/HowHungryisAIDashboard](https://github.com/Nidhal-Jegham/HowHungryisAIDashboard) (1 star, updated 2026-02-04)
- **Paper:** arXiv:2505.09598
- **Value:** 30+ model benchmark, Power BI dashboard updated daily. Energy data used for this report's coefficients.

#### Water for AI (Forecasting)

- **Repository:** [manuelhf/waterforAI](https://github.com/manuelhf/waterforAI)
- **Stars:** 2 | **Last active:** 2025-07-12
- **Paper:** "Sustainable AI infrastructure: A scenario-based forecast of water footprint under uncertainty" (ScienceDirect, 2025)
- **Value:** Probabilistic forecasts of global AI water demand to 2050; includes operational, electricity-generation, and embodied hardware water.

### 9.4 Web-Based Calculators and Dashboards

| Tool | URL | Measures | Notes |
|---|---|---|---|
| Omni Calculator | [omnicalculator.com/ecology/ai-water-footprint](https://www.omnicalculator.com/ecology/ai-water-footprint) | Water + energy per query | Based on "How Hungry is AI?" data |
| EcoLogits Calculator | [HuggingFace Space](https://huggingface.co/spaces/genai-impact/ecologits-calculator) | Energy, carbon, water | Interactive model comparison |
| Tokenomy | [tokenomy.ai](https://tokenomy.ai/tools/energy-usage-estimator) | Energy, token costs | VS Code extension + CLI; energy secondary |
| LLM Tracker | [llm-tracker.info](https://llm-tracker.info/_TOORG/Power-Usage-and-Energy-Efficiency) | Curated energy data | Reference database, not calculator |
| AI Energy Score | [HuggingFace](https://huggingface.github.io/AIEnergyScore/) | Energy ratings | Open-source models only; no water |
| MELODI | [ejhusom/MELODI](https://github.com/ejhusom/MELODI) | Local LLM energy | On-device only; no water |

### 9.5 Commercial/Freemium Tools

- **OffsetAI** ([offsetai.app](https://www.offsetai.app/)): Chrome extension tracking carbon + water from AI usage, with verified offset purchases. Supports ChatGPT, Claude, Gemini.
- **Antarctica.io** ([antarctica.io](https://antarctica.io/research/one-token-model)): "One Token Model" methodology powering AI Wattch. Hardware-layer energy estimation.

### 9.6 Curated Resource Lists

- **awesome-green-ai** ([samuelrince/awesome-green-ai](https://github.com/samuelrince/awesome-green-ai)): By the EcoLogits lead maintainer. Comprehensive Green AI resource collection.
- **green-ai** ([ejhusom/green-ai](https://github.com/ejhusom/green-ai)): Curated papers, tools, datasets.

### 9.7 Gap Analysis

**What exists well:**
- EcoLogits is the leader for Python API-level tracking with water (6 providers)
- AI Wattch is the most sophisticated browser extension (real-time water + carbon + energy)
- "Making AI Less Thirsty" provides foundational research coefficients

**Major gaps -- no existing tool:**
- Reads Claude Code local JSONL/stats files to calculate water footprint
- Provides CLI-based water tracking (all tools are Python libraries or browser extensions)
- Tracks water for CLI-based AI usage (vs. browser-based or API-call-based)
- Accounts for cache token energy costs (unique to Claude Code's architecture)
- Combines local file parsing with per-token water coefficients

**This represents the unique opportunity for the planned tool.**

---

## 10. Claude Code Local Data Structure

### 10.1 stats-cache.json (`~/.claude/stats-cache.json`)

Aggregated usage data across all sessions:

```json
{
  "version": 2,
  "dailyModelTokens": [
    {
      "date": "2026-02-09",
      "tokensByModel": {
        "claude-opus-4-6": 73071
      }
    }
  ],
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 100147,
      "outputTokens": 55515,
      "cacheReadInputTokens": 187940827,
      "cacheCreationInputTokens": 9861674
    },
    "claude-opus-4-5-20251101": {
      "inputTokens": 1338461,
      "outputTokens": 1255210,
      "cacheReadInputTokens": 1215913409,
      "cacheCreationInputTokens": 78633924
    }
  },
  "totalSessions": 173,
  "totalMessages": 41432
}
```

**Available fields:**
- `dailyActivity[]` -- messages, sessions, tool calls per day
- `dailyModelTokens[]` -- output tokens per model per day
- `modelUsage{}` -- cumulative per-model: inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens
- `totalSessions`, `totalMessages`

### 10.2 Session JSONL Files (`~/.claude/projects/[project-dir]/[session-id].jsonl`)

Per-message granular data. Each assistant message contains:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 4010,
      "cache_read_input_tokens": 22041,
      "output_tokens": 11,
      "service_tier": "standard",
      "inference_geo": "not_available"
    }
  },
  "timestamp": "2026-02-10T05:02:24.058Z"
}
```

### 10.3 Water Calculation for Claude Code

**For the calculator, relevant token types:**
- `inputTokens` + `outputTokens` -- these represent actual inference compute
- `cacheReadInputTokens` -- served from cache, likely much lower energy (but not zero)
- `cacheCreationInputTokens` -- initial processing, full energy cost

**Recommended approach:**
1. Count `inputTokens + outputTokens` as full-cost tokens
2. Count `cacheReadInputTokens` at a reduced factor (suggest 0.1x-0.2x, as cache reads skip most GPU compute)
3. Ignore `cacheCreationInputTokens` as these overlap with `inputTokens` processing
4. Apply model-specific coefficients from Section 7.1

**Model mapping for Claude Code:**
- `claude-opus-4-6` -> Use Claude-3.7 Sonnet coefficients as proxy (no Opus-specific data available)
- `claude-opus-4-5-20251101` -> Same proxy
- `claude-sonnet-4-5-20250929` -> Use Claude-3.5 Sonnet coefficients

**Note:** Anthropic has published no energy/water data. All Claude estimates are proxies based on AWS infrastructure and Jegham et al. external API benchmarks.

---

## 11. Uncertainties and Limitations

### Conflicting Estimates

Per-query water ranges from 0.26 mL (Google, Gemini) to 45 mL (Mistral, full LCA) to 10-25 mL (Li et al., GPT-3). Differences stem from:
- **Scope boundaries:** On-site only vs. full lifecycle
- **Model size:** 8B vs. 400B+ parameter models
- **Provider infrastructure:** Google's 1.15 L/kWh WUE vs. generic 5+ L/kWh off-site

### Unverified Sources

- OpenAI's 0.3 mL claim is unverified, excludes off-site water
- All first-party disclosures (Google, Microsoft, AWS, Mistral) are self-reported

### Rapid Obsolescence

- Google reports 33x improvement in energy per prompt in 12 months
- MoE architectures (GPT-4o, Gemini) activate only 5-10% of parameters
- Microsoft's zero-water datacenter initiative starts 2024, online ~2027
- Any coefficients will degrade in accuracy quickly

### No Anthropic/Claude Disclosure

- Anthropic has not published energy or water per-query data
- All estimates rely on AWS infrastructure proxies and external API benchmarks
- Claude Opus models may have substantially different energy profiles than Sonnet/Haiku

### Cache Token Ambiguity

- No research addresses the energy cost of serving cached tokens
- Cache reads likely use significantly less GPU compute but exact factor unknown
- This is particularly relevant for Claude Code where cache tokens dominate (e.g., 187M cache read vs. 100K input tokens)

### Off-site WUE Uncertainty

- Depends on specific grid mix serving each datacenter (varies hourly)
- The Jegham et al. figures (4.35 L/kWh Azure, 5.11 L/kWh AWS) are estimates
- Renewable energy procurement by hyperscalers may not match actual grid delivery

---

## 12. References

Amazon Web Services. (2024). *AWS cloud sustainability*. https://sustainability.aboutamazon.com/products-services/aws-cloud

Elsworth, S., Huang, J., et al. (2025). Measuring the environmental impact of delivering AI at Google Scale. *arXiv preprint*, 2508.15734. https://arxiv.org/abs/2508.15734

Energy Information Administration. (2023). U.S. electric power sector continues water efficiency gains. https://www.eia.gov/todayinenergy/detail.php?id=56820

Environmental and Energy Study Institute. (2025). Data centers and water consumption. https://www.eesi.org/articles/view/data-centers-and-water-consumption

Epoch AI. (2025). How much energy does ChatGPT use? https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use

Goedecke, S. (2025). Talking to ChatGPT costs 5ml of water, not 500ml. https://www.seangoedecke.com/water-impact-of-ai/

Google. (2024). *Google's 2024 environmental report*. https://blog.google/company-news/outreach-and-initiatives/sustainability/2024-environmental-report/

Jegham, N., et al. (2025). How Hungry is AI? Benchmarking energy, water, and carbon footprint of LLM inference. *arXiv preprint*, 2505.09598. https://arxiv.org/abs/2505.09598

Li, P., Yang, J., Islam, M. A., & Ren, S. (2023). Making AI less "thirsty": Uncovering and addressing the secret water footprint of AI models. *arXiv preprint*, 2304.03271. https://arxiv.org/abs/2304.03271

Li, P., Yang, J., Islam, M. A., & Ren, S. (2025). Making AI less 'thirsty.' *Communications of the ACM, 68*(3). https://dl.acm.org/doi/10.1145/3724499

Meta. (2024). *Meta 2024 sustainability report*. https://sustainability.atmeta.com/wp-content/uploads/2024/08/Meta-2024-Sustainability-Report.pdf

Microsoft. (2024). *2024 environmental sustainability report*. https://blogs.microsoft.com/on-the-issues/2024/05/15/microsoft-environmental-sustainability-report-2024/

Microsoft. (2024). Sustainable by design: Next-generation datacenters. https://www.microsoft.com/en-us/microsoft-cloud/blog/2024/12/09/sustainable-by-design-next-generation-datacenters-consume-zero-water-for-cooling/

Microsoft. (2025). Measuring energy and water efficiency for Microsoft datacenters. https://datacenters.microsoft.com/sustainability/efficiency/

Mistral AI. (2025). Our contribution to a global environmental standard for AI. https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai

Mytton, D. (2023). Overestimating AI's water footprint. https://www.devsustainability.com/p/overestimating-ais-water-footprint

National Renewable Energy Laboratory. (2003). *Consumptive water use for U.S. power production* (NREL/TP-550-33905). https://docs.nrel.gov/docs/fy04osti/33905.pdf

Sam Altman. (2025, June 12). ChatGPT energy and water claims. As reported in *Datacenterdynamics*. https://www.datacenterdynamics.com/en/news/sam-altman-chatgpt-queries-consume-034-watt-hours-of-electricity-and-0000085-gallons-of-water/
