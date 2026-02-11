# LLM CO2 Emissions & Energy Use: Research Report

**Date:** 2026-02-10
**Purpose:** Foundation for building a web app that calculates CO2 emissions from LLM token usage

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Inference Energy Per Token](#2-inference-energy-per-token)
3. [Training Energy & Emissions](#3-training-energy--emissions)
4. [Infrastructure Parameters](#4-infrastructure-parameters)
5. [Existing GitHub Tools](#5-existing-github-tools)
6. [Claude Code Data Format](#6-claude-code-data-format)
7. [Calculator Methodology Recommendations](#7-calculator-methodology-recommendations)
8. [Sources & References](#8-sources--references)

---

## 1. Executive Summary

### The Core Numbers

For a **standard short text query** (~100 input, ~300 output tokens) to a frontier LLM:

| Metric | Low | Central | High | Unit |
|--------|-----|---------|------|------|
| Energy per query | 0.2 | 0.4 | 1.0 | Wh |
| Energy per output token | 0.001 | 0.003 | 0.01 | Wh |
| CO2 per query (clean grid, e.g. France) | 0.01 | 0.03 | 0.10 | gCO2e |
| CO2 per query (avg US grid) | 0.07 | 0.15 | 0.40 | gCO2e |
| CO2 per query (dirty grid, e.g. China) | 0.12 | 0.35 | 1.50 | gCO2e |

### The Key Formula

```
CO2 (gCO2e) = Energy_per_query (Wh) × PUE × Grid_Intensity (gCO2/kWh) / 1000
```

**Default parameters:** PUE = 1.12 (hyperscale cloud), US grid = 369 gCO2/kWh

### Key Uncertainties

- No LLM provider discloses complete per-query energy data with methodology
- All external estimates involve assumptions about hardware, utilization, and batch sizes
- The field moves fast: data from 12 months ago may be 10-30x off from current production
- Reasoning models (o3, DeepSeek-R1) cost 10-50x more than standard models
- Input token energy is often neglected in existing tools (significant for Claude Code's large contexts)

---

## 2. Inference Energy Per Token

### 2.1 Per-Query Estimates (Short Prompts: ~100 input, ~300 output tokens)

| Model | Energy (Wh/query) | Source | Notes |
|-------|-------------------|--------|-------|
| GPT-4o | 0.30-0.42 | Epoch AI (2025); Ren et al. (2025) | Altman confirmed ~0.34 Wh |
| GPT-4o mini | 0.42 ± 0.08 | Ren et al. (2025) | Similar to GPT-4o |
| GPT-4.1 nano | 0.10 ± 0.04 | Ren et al. (2025) | Smallest OpenAI model |
| Claude 3.7 Sonnet | 0.84 ± 0.10 | Ren et al. (2025) | Higher due to AWS infrastructure |
| DeepSeek-R1 | 23.8 ± 2.2 | Ren et al. (2025) | Reasoning model, China grid |
| o3 | 7.0 ± 3.7 | Ren et al. (2025) | Reasoning model, high variance |
| Google Gemini (median) | 0.24 | Google (2025) | Self-reported, TPU infrastructure |
| Mistral Le Chat | ~0.4 (est.) | Mistral (2025) | Inferred from 1.14 gCO2e/query |

### 2.2 Long-Prompt Estimates (~10,000 input, ~1,500 output tokens)

| Model | Energy (Wh/query) | Source |
|-------|-------------------|--------|
| GPT-4o | 1.79 ± 0.36 | Ren et al. (2025) |
| Claude 3.7 Sonnet | 5.52 ± 0.75 | Ren et al. (2025) |
| DeepSeek-R1 | 33.6 ± 3.8 | Ren et al. (2025) |
| o3 | 39.2 ± 20.3 | Ren et al. (2025) |

**Important for Claude Code:** Long prompts (10k+ input tokens) multiply energy by **4-5x** vs. short prompts. Claude Code sessions routinely have very large input contexts (cache_read_input_tokens often >20k per request).

### 2.3 Per-Token Energy Estimates

| Model / Size | Energy per Token | Hardware | Source |
|-------------|-----------------|----------|--------|
| Llama-3 70B (unoptimized) | ~100 J/token | A100 | Samsi et al. (2023) |
| Llama-3.3 70B (optimized) | ~0.39 J/token | H100, FP8, batch=128 | Lin (2025) |
| Llama-3.1 405B (batched) | ~0.2 J/token | 16x H100 | Samsi et al. (2025) |
| Llama-3.1 405B (single) | ~12 J/token | 16x H100 | Samsi et al. (2025) |

**Batching is critical:** Processing 100 prompts on Llama 405B consumed 0.604 Wh/prompt (batched) vs. 21.7 Wh/prompt (single) -- a **36x improvement** (Samsi et al., 2025).

### 2.4 Per-Query Carbon Emissions

| Model/Provider | gCO2e/query | Grid Carbon Intensity | Source |
|---------------|-------------|----------------------|--------|
| Google Gemini (text) | 0.03 | Google's mix (very low) | Google (2025) |
| ChatGPT (GPT-4o, short) | ~0.12 | Azure US (~352 gCO2/kWh) | Derived |
| Claude 3.7 Sonnet (short) | ~0.32 | AWS US (~385 gCO2/kWh) | Derived |
| Mistral Le Chat (~400 tokens) | 1.14 | EU mix | Mistral (2025) |
| DeepSeek-R1 (short) | ~14.3 | China (~581 gCO2/kWh) | Derived |

### 2.5 Scaling Multipliers

| Factor | Multiplier |
|--------|-----------|
| Per additional 1,000 input tokens | +0.1-0.3 Wh |
| Per additional 1,000 output tokens | +0.5-2.0 Wh |
| Image generation (per image) | 0.3-3.0 Wh |
| Video generation (per second) | ~200 Wh |
| Reasoning/chain-of-thought models | 10-50x vs. standard |

---

## 3. Training Energy & Emissions

### 3.1 Training Costs by Model

| Model | Parameters | Training Energy (MWh) | CO2 (tCO2e) | Hardware | Year | Source |
|-------|-----------|----------------------|-------------|----------|------|--------|
| BERT-base | 110M | ~0.4 | ~0.012 | V100 | 2018 | Strubell et al. (2019) |
| GPT-3 | 175B | 1,287 | 552 | V100 | 2020 | Patterson et al. (2021) |
| OPT-175B | 175B | ~324 | 75 | A100 | 2022 | Zhang et al. (2022) |
| BLOOM-176B | 176B | 433 | 24.7-50.5 | A100 | 2022 | Luccioni et al. (2023) |
| GPT-4 | ~1.8T (est.) | 51,800-62,300 | 1,035-14,994 | A100/H100 | 2023 | Ludvigsen (2023) |
| Llama 2 70B | 70B | ~1,700 | ~539 | A100 | 2023 | Meta (2023) |
| Llama 3.1 405B | 405B | 27,500 | 240 (loc.) | H100 | 2024 | Meta (2024) |
| Mistral Large 2 | -- | -- | 20,400 (lifecycle) | -- | 2024 | Mistral (2025) |

**Location matters enormously:** BLOOM (France, 57 gCO2/kWh) = 24.7 tCO2e vs. GPT-3 (US, 429 gCO2/kWh) = 552 tCO2e for similar-scale models. **5-20x CO2 reduction** from grid choice alone.

### 3.2 BLOOM Lifecycle Breakdown (Most Detailed LCA Available)

| Phase | CO2e (tonnes) |
|-------|--------------|
| Dynamic (compute only) | 24.7 |
| + Idle energy | 30.3 |
| + Equipment manufacturing (embodied) | 20.2 |
| **Total lifecycle** | **50.5** |

Source: Luccioni et al. (2023) -- only study with full lifecycle analysis

### 3.3 Training Amortization

- **Inference dominates:** AWS reports inference = **>90%** of total LLM operational energy
- **GPT-4o annual inference:** ~391,500-463,300 MWh/year for ~772 billion queries (Ren et al., 2025)
- That's **~7-8x the training cost** in a single year of operation
- Per-query amortization at production scale: ~0.00015 Wh/query -- **negligible**
- **Recommendation for calculator:** Add **0.1-1.0% overhead** to inference energy for amortized training

---

## 4. Infrastructure Parameters

### 4.1 PUE (Power Usage Effectiveness) by Provider

| Provider | PUE | Source |
|----------|-----|--------|
| Google Cloud (Anthropic, Gemini) | 1.10 | Google (2024) |
| Microsoft Azure (OpenAI) | 1.12 | Ren et al. (2025) |
| AWS (Anthropic, Meta) | 1.14 | Ren et al. (2025) |
| DeepSeek (China) | 1.27 | Ren et al. (2025) |
| Industry average | 1.58 | Uptime Institute (2023) |
| Best-in-class hyperscale | 1.08-1.12 | Patterson et al. (2022) |

### 4.2 Grid Carbon Intensity (gCO2/kWh) - 2024 Data

| Region | gCO2/kWh | Source |
|--------|----------|--------|
| France | 21.7 | RTE (2024) |
| Sweden / Norway | 10-30 | IEA (2025) |
| EU average | 334 | EEA (2024) |
| US average | 369 | IEA (2025) |
| US - Azure regions (weighted) | 352.8 | Ren et al. (2025) |
| US - AWS regions (weighted) | 385.0 | Ren et al. (2025) |
| US - Virginia | ~281 gCO2/kWh (~620 lbs/MWh) | EPA eGRID |
| US - Oregon (NWPP) | ~288 gCO2/kWh (~635 lbs/MWh) | EPA eGRID |
| US - Iowa (MROW) | ~417 gCO2/kWh (~920 lbs/MWh) | EPA eGRID |
| US - Texas | ~399 gCO2/kWh (~880 lbs/MWh) | EPA eGRID |
| Germany | 371 | EEA (2023) |
| China | 581 | IEA (2025) |
| Global average | 445-480 | IEA (2025) |

### 4.3 GPU Power Specifications

| GPU | TDP (W) | Typical Draw (W) | Notes |
|-----|---------|------------------|-------|
| NVIDIA V100 | 300 | 180-240 | Legacy, used for GPT-3 |
| NVIDIA A100 40GB | 250 | 150-200 | Used for BLOOM, OPT |
| NVIDIA A100 80GB | 300 | 180-240 | Used for Llama 2 |
| NVIDIA H100 SXM | 700 | 400-560 | Current frontier |
| NVIDIA H200 | 700 | 400-560 | Enhanced memory |
| Google TPU v5e | ~200 | ~120-160 | 2-3x more efficient than H100 |
| Google TPU v5p | ~250 | ~150-200 | Higher performance |

### 4.4 Provider-Specific Notes

- **Anthropic/Claude:** Runs on AWS (GCP previously). AWS PUE ~1.14, weighted grid intensity ~385 gCO2/kWh. No public sustainability report specific to Claude models.
- **OpenAI/ChatGPT:** Runs on Microsoft Azure. PUE ~1.12. Altman disclosed 0.34 Wh/query for ChatGPT (June 2025).
- **Google/Gemini:** Runs on own infrastructure (TPUs). PUE ~1.10. Claims 90% carbon-free energy. Self-reported 0.24 Wh/query.
- **Meta/Llama:** Publishes GPU hours in model cards. Claims market-based emissions = 0 via RECs (controversial).
- **Mistral:** First comprehensive ISO 14040/44 lifecycle analysis of an LLM. 1.14 gCO2e per Le Chat query (400 tokens).

---

## 5. Existing GitHub Tools

### 5.1 Most Relevant for API-Based LLM Tracking

| Tool | Stars | API Support | Reads Claude Code Logs? | Measures Carbon? |
|------|-------|-------------|------------------------|-----------------|
| **[EcoLogits](https://github.com/mlco2/ecologits)** | ~252 | Anthropic, OpenAI, Cohere, Google, Mistral, HF | No | Yes (modeled) |
| **[ccusage](https://github.com/ryoppippi/ccusage)** | ~10,500 | Claude Code, Codex CLI, OpenCode | Yes (JSONL parsing) | **No** (cost only) |
| **[Claude Carbon](https://weeatrobots.substack.com/p/claude-carbon-ai-footprint)** | Low | Claude Code (macOS) | Yes (token logs) | Energy equivalents only |
| **[AI Wattch](https://github.com/AIWattch/browser-extension)** | ~16 | ChatGPT, Claude (browser) | No | Yes (estimated) |

### 5.2 The Clear Gap

**No existing tool reads Claude Code JSONL logs AND estimates carbon.**

- `ccusage` parses the JSONL files perfectly but only tracks cost/tokens
- `Claude Carbon` reads tokens but converts to metaphorical "phone charges"
- `EcoLogits` has the best carbon modeling methodology but wraps SDK calls, doesn't read logs

**Your app fills this gap:** Combine ccusage-style JSONL parsing with EcoLogits-style per-token carbon modeling.

### 5.3 EcoLogits Methodology (Best Open-Source Approach)

- Fits linear regression from ML.ENERGY Leaderboard dataset
- Models energy per output token as function of active parameters
- Reports both "Usage" (runtime) and "Embodied" (manufacturing) impacts
- Key limitation: treats input token energy as negligible (bad for Claude Code)
- Supported providers: Anthropic, OpenAI, Cohere, Google, Mistral, HuggingFace

### 5.4 Other Tools Surveyed

| Tool | Category | Stars | Relevance |
|------|----------|-------|-----------|
| [CodeCarbon](https://github.com/mlco2/codecarbon) | Hardware-level | ~1,700 | Local compute only, not for API |
| [Eco2AI](https://github.com/sb-ai-lab/Eco2AI) | Hardware-level | ~269 | Local compute only |
| [CarbonTracker](https://github.com/saintslab/carbontracker) | DL training | ~463 | Epoch-based training only |
| [LLMCarbon/MLCarbon](https://github.com/SotaroKaneda/MLCarbon) | Modeling | ~52 | Architecture projections, ICLR 2024 |
| [Cloud Carbon Footprint](https://github.com/cloud-carbon-footprint/cloud-carbon-footprint) | Cloud infra | ~1,000 | General AWS/GCP/Azure, not LLM-specific |
| [ML CO2 Impact](https://mlco2.github.io/impact/) | Calculator | -- | Manual input, academic reporting |
| [awesome-green-ai](https://github.com/samuelrince/awesome-green-ai) | Resource list | ~102 | Curated links to all tools |
| [ChatGPT CO2 Tracker](https://github.com/utkarshdalal/chatgpt-co2-tracker) | Browser ext. | 3.8K ratings | ChatGPT only |
| [OffsetAI](https://www.offsetai.earth/) | Browser ext. | -- | Not open source |
| GreenChat | Browser ext. | Low | ChatGPT/Copilot only |

### 5.5 Research Tools & Leaderboards

- **[ML.ENERGY Leaderboard](https://ml.energy/leaderboard/)** -- Benchmarks time and energy for 40+ model architectures. Data source for EcoLogits.
- **[FLOPs to Footprints](https://huggingface.co/spaces/sophia-falk/flops-2-footprints)** -- Interactive HuggingFace tool for AI training footprint (Falk et al., 2025)
- **[Antarctica.io One-Token Model](https://antarctica.io/research/one-token-model)** -- Proprietary per-token energy methodology (commercial)

---

## 6. Claude Code Data Format

### 6.1 Key Files for Token Extraction

| File | Purpose | Token Data? |
|------|---------|------------|
| `~/.claude/stats-cache.json` | Aggregated usage statistics | Yes -- cumulative per-model totals |
| `~/.claude/projects/<path>/<session>.jsonl` | Per-session conversation logs | Yes -- per-API-call usage blocks |
| `~/.claude/projects/<path>/<session>/subagents/agent-*.jsonl` | Subagent conversations | Yes -- separate usage blocks |
| `~/.claude/telemetry/1p_failed_events.*.json` | Failed telemetry (partial) | Yes -- per-call costUSD, session totals |

### 6.2 stats-cache.json (Quick Aggregate)

```json
{
  "version": 2,
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 100147,
      "outputTokens": 55515,
      "cacheReadInputTokens": 187940827,
      "cacheCreationInputTokens": 9861674,
      "costUSD": 0
    }
  },
  "dailyModelTokens": [
    {"date": "2026-02-06", "tokensByModel": {"claude-opus-4-6": 44486}}
  ],
  "totalSessions": 173,
  "totalMessages": 41432
}
```

**Note:** `costUSD` is always 0 for Pro subscriptions. `dailyModelTokens.tokensByModel` values appear to be **output tokens only**.

### 6.3 Session JSONL -- Assistant Messages (Primary Token Source)

Each `type: "assistant"` record contains a `usage` block:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_01T56MsMB8i8EdXovRFsi5GW",
    "usage": {
      "input_tokens": 3,
      "output_tokens": 11,
      "cache_creation_input_tokens": 4010,
      "cache_read_input_tokens": 22041,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 4010
      },
      "service_tier": "standard"
    }
  },
  "requestId": "req_011CXyoU7LgYtwpLQt3H6BjS",
  "timestamp": "2026-02-10T05:02:24.058Z"
}
```

### 6.4 Critical Implementation Details

1. **Deduplication required:** Streaming causes multiple assistant records per `requestId` with **identical** usage blocks. Group by `requestId`, count once.
2. **Total input tokens** = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`
3. **Cache tokens dominate:** `cache_read_input_tokens` is often 100-1000x larger than `input_tokens` (e.g., 3 vs. 22,041)
4. **Subagent tokens are separate:** Files in `<session>/subagents/` must be aggregated separately
5. **Model IDs** observed: `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-sonnet-4-5-20250929`

### 6.5 Telemetry Data (Bonus: Per-Call Cost)

`tengu_api_success` events contain `costUSD` per API call:

```json
{
  "model": "claude-opus-4-5-20251101",
  "inputTokens": 3,
  "outputTokens": 188,
  "cachedInputTokens": 52520,
  "costUSD": 0.036475,
  "durationMs": 4123
}
```

`tengu_exit` events contain session-level aggregates:

```json
{
  "last_session_cost": 3.98,
  "last_session_total_input_tokens": 859266,
  "last_session_total_output_tokens": 25443,
  "last_session_total_cache_read_input_tokens": 3314876
}
```

**Caveat:** These are only in `1p_failed_events` files (events that failed to transmit). The data is **incomplete**.

---

## 7. Calculator Methodology Recommendations

### 7.1 Recommended Approach: Token-Based Estimation

Given the data available from Claude Code JSONL files, the recommended calculation flow is:

```
1. Parse JSONL files → extract per-request token counts (deduplicated by requestId)
2. Classify model (Opus, Sonnet, Haiku) → map to energy-per-token estimate
3. Calculate: Energy = (input_tokens × Wh_per_input_token) + (output_tokens × Wh_per_output_token)
4. Apply PUE multiplier
5. Convert to CO2: Energy × Grid_Carbon_Intensity
```

### 7.2 Proposed Energy-Per-Token Values for Claude Models

Based on cross-referencing Ren et al. (2025) data for Claude 3.7 Sonnet with model size scaling:

| Model Class | Est. Parameters | Wh per 1K Input Tokens | Wh per 1K Output Tokens | Confidence |
|------------|----------------|----------------------|------------------------|------------|
| Claude Haiku (small) | ~8-20B | 0.003 | 0.03 | Medium |
| Claude Sonnet (medium) | ~70-100B | 0.01 | 0.10 | Medium-High |
| Claude Opus (large) | ~200B+ | 0.03 | 0.30 | Low-Medium |

**Derivation for Sonnet:** Ren et al. report 0.84 Wh for a short query (~100 input + ~300 output tokens). If output tokens dominate energy: 0.84 Wh / 0.3K output tokens ≈ 2.8 Wh/K output tokens. But this includes input processing. A more conservative split: ~0.14 Wh for input (100 tokens × 0.01 Wh/K × 1.4) + ~0.70 Wh for output (300 tokens × 2.3 Wh/K). Adjusted down for production batching vs. API latency measurement.

**Important:** These are estimates with significant uncertainty. Consider showing confidence ranges in the UI.

### 7.3 Handling Cache Tokens

Cache tokens present a methodological question: does reading from cache consume as much energy as processing new tokens?

**Recommended approach:**
- `cache_read_input_tokens`: Apply **10-30% of the base input token energy** (cache hits require less compute)
- `cache_creation_input_tokens`: Apply **100% of base input token energy** (full processing)
- `input_tokens` (uncached): Apply **100% of base input token energy**

### 7.4 Provider-Specific Defaults

| Provider | Default PUE | Default Grid (gCO2/kWh) | Notes |
|----------|------------|------------------------|-------|
| Anthropic (Claude) | 1.14 | 385 | AWS US regions weighted |
| OpenAI (GPT) | 1.12 | 353 | Azure US regions weighted |
| Google (Gemini) | 1.10 | ~100 (est.) | High carbon-free energy % |
| Self-hosted (Llama etc.) | 1.58 | User's local grid | Industry avg PUE |

### 7.5 Simplified Tier System for UI

**Tier 1: Quick Estimate** (for users who just want a number)
```
CO2 = total_tokens × 0.0000035 Wh/token × 1.12 × 400 / 1000
    ≈ total_tokens × 0.00000157 gCO2e
    ≈ 1.57 mgCO2e per 1000 tokens
```

**Tier 2: Model-Aware** (separate input/output, model-specific multipliers)

**Tier 3: Full Configuration** (custom PUE, grid intensity, cache discount, etc.)

### 7.6 Contextual Comparisons for UX

| Activity | Energy (Wh) | CO2 Equivalent |
|----------|-------------|----------------|
| Google search | 0.3 | ~0.11 gCO2e |
| ChatGPT short query | 0.34 | ~0.12 gCO2e |
| LED lightbulb (1 minute) | ~0.17 | ~0.06 gCO2e |
| Watching TV (9 seconds) | ~0.24 | ~0.09 gCO2e |
| Boiling water for tea | ~100 | ~37 gCO2e |
| Driving 1km (EV) | ~150 | ~55 gCO2e |
| Driving 1km (gasoline car) | ~900 | ~230 gCO2e |
| US household daily electricity | ~28,000 | ~10,332 gCO2e |

### 7.7 What Your App Should Do Differently

1. **Account for input tokens properly** -- EcoLogits and most tools ignore input token energy. For Claude Code (massive context windows), this matters.
2. **Handle cache tokens** -- No existing tool addresses cache_read vs. cache_creation energy differences.
3. **Parse subagent data** -- Claude Code spawns subagents with separate JSONL files. Include these.
4. **Show uncertainty** -- Display confidence ranges, not just point estimates. The underlying data has 2-5x uncertainty.
5. **Allow user configuration** -- Let users set their own grid intensity (electricityMap API is a good source), PUE, and model assumptions.
6. **Track over time** -- Daily/weekly/monthly trends using `stats-cache.json` or aggregated JSONL data.

---

## 8. Sources & References

### Peer-Reviewed Papers

- Strubell, E., Ganesh, A., & McCallum, A. (2019). Energy and policy considerations for deep learning in NLP. *Proceedings of the 57th ACL*, 3645-3650. https://doi.org/10.18653/v1/P19-1355
- Patterson, D., et al. (2021). Carbon emissions and large neural network training. *arXiv:2104.10350*. https://arxiv.org/abs/2104.10350
- Patterson, D., et al. (2022). The carbon footprint of machine learning training will plateau, then shrink. *Computer, 55*(7), 18-28. https://doi.org/10.1109/MC.2022.3148714
- Luccioni, A. S., Viguier, S., & Ligozat, A.-L. (2023). Estimating the carbon footprint of BLOOM, a 176B parameter language model. *JMLR, 24*(253), 1-15. https://jmlr.org/papers/v24/23-0069.html
- Luccioni, A. S., Jernite, Y., & Strubell, E. (2024). Power hungry processing: Watts driving the cost of AI deployment? *FAccT '24*, 85-99. https://doi.org/10.1145/3630106.3658542
- De Vries, A. (2023). The growing energy footprint of artificial intelligence. *Joule, 7*(10), 2191-2194. https://doi.org/10.1016/j.joule.2023.09.004

### Preprints (2025)

- Ren, S., et al. (2025). How hungry is AI? Benchmarking energy, water, and carbon footprint of LLM inference. *arXiv:2505.09598*. https://arxiv.org/abs/2505.09598
- Siddiqui, S. A., et al. (2025). TokenPowerBench: Benchmarking the power consumption of LLM inference. *arXiv:2512.03024*. https://arxiv.org/abs/2512.03024
- Samsi, S., et al. (2025). From prompts to power: Measuring the energy footprint of LLM inference. *arXiv:2511.05597*. https://arxiv.org/abs/2511.05597
- Patel, D., et al. (2025). Energy considerations of large language model inference and efficiency optimizations. *arXiv:2504.17674*. https://arxiv.org/abs/2504.17674

### Corporate & Institutional Sources

- Altman, S. (2025, June 10). *The Gentle Singularity*. https://blog.samaltman.com/the-gentle-singularity
- Google. (2025). Measuring the environmental impact of AI inference. https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference
- Google. (2024). *Google 2024 Environmental Report*. https://sustainability.google/reports/google-2024-environmental-report/
- Mistral AI. (2025). Our contribution to a global environmental standard for AI. https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai
- Meta. (2024). Llama 3.1/3.3 Model Cards. https://github.com/meta-llama/llama-models
- IEA. (2025). *Energy and AI*. https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai
- Epoch AI. (2025). How much energy does ChatGPT use? https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- Ritchie, H. (2025). What's the carbon footprint of using ChatGPT or Gemini? https://hannahritchie.substack.com/p/ai-footprint-august-2025

### Data Sources for App Integration

- **[electricityMap](https://app.electricitymaps.com/)** -- Real-time grid carbon intensity API (free tier available)
- **[EPA eGRID](https://www.epa.gov/egrid)** -- US regional emission factors
- **[IEA Emissions Factors](https://www.iea.org/data-and-statistics/data-product/emissions-factors-2025)** -- Global country-level factors
- **[EEA Emission Intensity](https://www.eea.europa.eu/en/analysis/indicators/greenhouse-gas-emission-intensity-of-1)** -- European country-level data
