// Energy per 1000 tokens (Wh) — derived from Jegham et al. 2025 + Ren et al. 2025
const MODEL_ENERGY = {
  // Opus models — scaled from Sonnet benchmark (larger model ~3x)
  'claude-opus-4-6': { whPer1kInput: 0.03, whPer1kOutput: 0.30 },
  'claude-opus-4-5': { whPer1kInput: 0.03, whPer1kOutput: 0.30 },
  // Sonnet — derived from Ren et al. Claude 3.7 Sonnet: 0.84Wh/short query
  'claude-sonnet-4-5': { whPer1kInput: 0.01, whPer1kOutput: 0.10 },
  'claude-sonnet-4': { whPer1kInput: 0.01, whPer1kOutput: 0.10 },
  'claude-3-7-sonnet': { whPer1kInput: 0.01, whPer1kOutput: 0.10 },
  'claude-3-5-sonnet': { whPer1kInput: 0.01, whPer1kOutput: 0.10 },
  // Haiku — scaled down (smaller model)
  'claude-haiku': { whPer1kInput: 0.003, whPer1kOutput: 0.03 },
  'claude-3-5-haiku': { whPer1kInput: 0.003, whPer1kOutput: 0.03 },
};

// Default fallback for unknown models (use Sonnet-class estimate)
const DEFAULT_ENERGY = { whPer1kInput: 0.01, whPer1kOutput: 0.10 };

// Infrastructure factors — from provider sustainability reports
const DEFAULTS = {
  pue: 1.14,                   // AWS PUE (Ren et al. 2025)
  gridCO2_gPerKwh: 385,        // AWS US weighted average (Ren et al. 2025)
  wueOnsite_LPerKwh: 0.18,     // AWS 2024 sustainability (conservative)
  wueOffsite_LPerKwh: 5.11,    // Jegham et al. 2025
  cacheReadFactor: 0.15,        // Conservative estimate (configurable)
};

// Equivalence factors
const EQUIVALENCES = {
  googleSearch_gCO2: 0.11,      // gCO2e per Google search
  ledMinute_Wh: 0.17,           // 10W LED = 0.17 Wh/min
  waterBottle_ml: 500,           // Standard bottle
  kmGasoline_gCO2: 230,         // gCO2e per km driving gasoline
  kmEV_gCO2: 55,                // gCO2e per km driving EV
  phoneCharge_Wh: 17,           // ~17 Wh for full phone charge
};

// Uncertainty multipliers (low / high relative to central estimate)
const UNCERTAINTY = {
  energy: { low: 0.5, high: 2.0 },
  co2: { low: 0.5, high: 1.8 },
  water: { low: 0.6, high: 1.5 },
};

function getModelEnergy(modelId) {
  // Try exact match first
  if (MODEL_ENERGY[modelId]) return MODEL_ENERGY[modelId];
  // Try prefix match (e.g. "claude-opus-4-5-20251101" → "claude-opus-4-5")
  for (const prefix of Object.keys(MODEL_ENERGY)) {
    if (modelId.startsWith(prefix)) return MODEL_ENERGY[prefix];
  }
  return DEFAULT_ENERGY;
}

module.exports = { MODEL_ENERGY, DEFAULT_ENERGY, DEFAULTS, EQUIVALENCES, UNCERTAINTY, getModelEnergy };
