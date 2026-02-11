const { getModelEnergy, DEFAULTS, EQUIVALENCES, UNCERTAINTY } = require('./coefficients');

// Calculate energy, CO2, and water for a set of tokens
function calculate(tokens, config = {}) {
  const pue = config.pue || DEFAULTS.pue;
  const gridCO2 = config.gridCO2_gPerKwh || DEFAULTS.gridCO2_gPerKwh;
  const wueOnsite = config.wueOnsite_LPerKwh || DEFAULTS.wueOnsite_LPerKwh;
  const wueOffsite = config.wueOffsite_LPerKwh || DEFAULTS.wueOffsite_LPerKwh;
  const cacheFactor = config.cacheReadFactor ?? DEFAULTS.cacheReadFactor;

  const energy = getModelEnergy(tokens.model);

  // Energy calculation (Wh)
  const inputEnergy = (tokens.input_tokens / 1000) * energy.whPer1kInput;
  const outputEnergy = (tokens.output_tokens / 1000) * energy.whPer1kOutput;
  const cacheReadEnergy = (tokens.cache_read / 1000) * energy.whPer1kInput * cacheFactor;
  const cacheCreationEnergy = (tokens.cache_creation / 1000) * energy.whPer1kInput * 1.0;

  const itEnergy_wh = inputEnergy + outputEnergy + cacheReadEnergy + cacheCreationEnergy;
  const totalEnergy_wh = itEnergy_wh * pue;

  // CO2 calculation (g)
  const co2_g = totalEnergy_wh * gridCO2 / 1000;

  // Water calculation (mL) — two components
  const itEnergy_kwh = itEnergy_wh / 1000;
  const totalEnergy_kwh = totalEnergy_wh / 1000;

  const waterOnsite_ml = itEnergy_kwh * wueOnsite * 1000;
  const waterOffsite_ml = totalEnergy_kwh * wueOffsite * 1000;
  const waterTotal_ml = waterOnsite_ml + waterOffsite_ml;

  return {
    energy_wh: totalEnergy_wh,
    it_energy_wh: itEnergy_wh,
    co2_g,
    water_onsite_ml: waterOnsite_ml,
    water_offsite_ml: waterOffsite_ml,
    water_total_ml: waterTotal_ml,
  };
}

// Calculate for a single model's cumulative usage from stats-cache
function calculateForModel(model, usage, config = {}) {
  return calculate({
    model,
    input_tokens: usage.inputTokens || 0,
    output_tokens: usage.outputTokens || 0,
    cache_read: usage.cacheReadInputTokens || 0,
    cache_creation: usage.cacheCreationInputTokens || 0,
  }, config);
}

// Calculate totals across all models
function calculateTotals(modelUsage, config = {}) {
  const perModel = {};
  let totalEnergy = 0, totalCO2 = 0;
  let totalWaterOnsite = 0, totalWaterOffsite = 0, totalWaterTotal = 0;
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;

  for (const [model, usage] of Object.entries(modelUsage)) {
    const result = calculateForModel(model, usage, config);
    perModel[model] = {
      ...result,
      tokens: {
        input: usage.inputTokens || 0,
        output: usage.outputTokens || 0,
        cache_read: usage.cacheReadInputTokens || 0,
        cache_creation: usage.cacheCreationInputTokens || 0,
      },
    };
    totalEnergy += result.energy_wh;
    totalCO2 += result.co2_g;
    totalWaterOnsite += result.water_onsite_ml;
    totalWaterOffsite += result.water_offsite_ml;
    totalWaterTotal += result.water_total_ml;
    totalInput += (usage.inputTokens || 0);
    totalOutput += (usage.outputTokens || 0);
    totalCacheRead += (usage.cacheReadInputTokens || 0);
    totalCacheCreation += (usage.cacheCreationInputTokens || 0);
  }

  return {
    totals: {
      energy_wh: totalEnergy,
      co2_g: totalCO2,
      water_onsite_ml: totalWaterOnsite,
      water_offsite_ml: totalWaterOffsite,
      water_total_ml: totalWaterTotal,
      tokens: {
        input: totalInput,
        output: totalOutput,
        cache_read: totalCacheRead,
        cache_creation: totalCacheCreation,
        total: totalInput + totalOutput + totalCacheRead + totalCacheCreation,
      },
    },
    perModel,
  };
}

// Calculate with uncertainty ranges
function withUncertainty(result) {
  return {
    ...result,
    ranges: {
      energy_wh: {
        low: result.energy_wh * UNCERTAINTY.energy.low,
        central: result.energy_wh,
        high: result.energy_wh * UNCERTAINTY.energy.high,
      },
      co2_g: {
        low: result.co2_g * UNCERTAINTY.co2.low,
        central: result.co2_g,
        high: result.co2_g * UNCERTAINTY.co2.high,
      },
      water_total_ml: {
        low: result.water_total_ml * UNCERTAINTY.water.low,
        central: result.water_total_ml,
        high: result.water_total_ml * UNCERTAINTY.water.high,
      },
    },
  };
}

// Compute human-relatable equivalences
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

module.exports = { calculate, calculateForModel, calculateTotals, withUncertainty, getEquivalences };
