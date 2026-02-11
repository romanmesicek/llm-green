const fs = require('fs');
const express = require('express');
const { getModelUsage, getDailyModelTokens, getDailyActivity, parseJSONLFiles, aggregateByDate, aggregateByHour, getStatsCachePath } = require('./parser');
const { calculateTotals, withUncertainty, getEquivalences, calculate } = require('./calculator');
const { DEFAULTS, getModelEnergy } = require('./coefficients');

const router = express.Router();

// In-memory config overrides (persisted to disk)
const CONFIG_PATH = require('path').join(__dirname, '..', 'config.json');
let configOverrides = {};
try {
  configOverrides = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch { /* use defaults */ }

function getConfig() {
  return { ...DEFAULTS, ...configOverrides };
}

// GET /api/summary — Total CO2, water, energy, tokens by type, per-model
router.get('/summary', (req, res) => {
  const modelUsage = getModelUsage();
  const config = getConfig();
  const result = calculateTotals(modelUsage, config);
  const totalsWithRange = withUncertainty(result.totals);
  const equivalences = getEquivalences(
    result.totals.co2_g,
    result.totals.water_total_ml,
    result.totals.energy_wh
  );

  res.json({
    ...totalsWithRange,
    equivalences,
    perModel: result.perModel,
    config,
  });
});

// GET /api/daily?days=30 — Daily breakdown
router.get('/daily', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const config = getConfig();

  // Use stats-cache daily data for fast response
  const dailyTokens = getDailyModelTokens();
  const dailyActivity = getDailyActivity();

  // Build activity lookup
  const activityMap = {};
  for (const a of dailyActivity) {
    activityMap[a.date] = a;
  }

  // Calculate footprint per day
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const daily = [];
  for (const day of dailyTokens) {
    if (day.date < cutoffStr) continue;

    let dayCO2 = 0, dayWater = 0, dayEnergy = 0;
    let dayWaterOnsite = 0, dayWaterOffsite = 0;
    const dayTokensByModel = {};

    for (const [model, outputTokens] of Object.entries(day.tokensByModel)) {
      // stats-cache only has output tokens per day per model
      // Estimate input tokens based on model usage ratios
      const modelUsage = getModelUsage()[model];
      let inputRatio = 1.0;
      let cacheReadRatio = 0;
      let cacheCreationRatio = 0;

      if (modelUsage && modelUsage.outputTokens > 0) {
        inputRatio = modelUsage.inputTokens / modelUsage.outputTokens;
        cacheReadRatio = modelUsage.cacheReadInputTokens / modelUsage.outputTokens;
        cacheCreationRatio = modelUsage.cacheCreationInputTokens / modelUsage.outputTokens;
      }

      const est = {
        model,
        input_tokens: Math.round(outputTokens * inputRatio),
        output_tokens: outputTokens,
        cache_read: Math.round(outputTokens * cacheReadRatio),
        cache_creation: Math.round(outputTokens * cacheCreationRatio),
      };

      const result = calculate(est, config);
      dayCO2 += result.co2_g;
      dayWater += result.water_total_ml;
      dayWaterOnsite += result.water_onsite_ml;
      dayWaterOffsite += result.water_offsite_ml;
      dayEnergy += result.energy_wh;
      dayTokensByModel[model] = {
        input: est.input_tokens,
        output: outputTokens,
        cache_read: est.cache_read,
        cache_creation: est.cache_creation,
        co2_g: result.co2_g,
        water_total_ml: result.water_total_ml,
        water_onsite_ml: result.water_onsite_ml,
        water_offsite_ml: result.water_offsite_ml,
        energy_wh: result.energy_wh,
      };
    }

    const activity = activityMap[day.date] || {};
    daily.push({
      date: day.date,
      co2_g: dayCO2,
      water_total_ml: dayWater,
      water_onsite_ml: dayWaterOnsite,
      water_offsite_ml: dayWaterOffsite,
      energy_wh: dayEnergy,
      tokensByModel: dayTokensByModel,
      messages: activity.messageCount || 0,
      sessions: activity.sessionCount || 0,
    });
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  res.json(daily);
});

// GET /api/hourly — Last 24h broken down by hour (from JSONL files)
router.get('/hourly', async (req, res) => {
  const config = getConfig();
  const messages = await parseJSONLFiles();
  const byHour = aggregateByHour(messages);

  // Build all 24 hours
  const now = new Date();
  const hourly = [];
  for (let i = 23; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourKey = dt.toISOString().slice(0, 13);
    const hour = dt.getHours();

    let hCO2 = 0, hWater = 0, hEnergy = 0;
    let hWaterOnsite = 0, hWaterOffsite = 0;
    const hTokensByModel = {};

    const models = byHour[hourKey] || {};
    for (const [model, tokens] of Object.entries(models)) {
      const est = {
        model,
        input_tokens: tokens.input_tokens,
        output_tokens: tokens.output_tokens,
        cache_read: tokens.cache_read,
        cache_creation: tokens.cache_creation,
      };
      const result = calculate(est, config);
      hCO2 += result.co2_g;
      hWater += result.water_total_ml;
      hWaterOnsite += result.water_onsite_ml;
      hWaterOffsite += result.water_offsite_ml;
      hEnergy += result.energy_wh;
      hTokensByModel[model] = {
        input: tokens.input_tokens,
        output: tokens.output_tokens,
        cache_read: tokens.cache_read,
        cache_creation: tokens.cache_creation,
        co2_g: result.co2_g,
        water_total_ml: result.water_total_ml,
        water_onsite_ml: result.water_onsite_ml,
        water_offsite_ml: result.water_offsite_ml,
        energy_wh: result.energy_wh,
      };
    }

    hourly.push({
      hour: `${hour}:00`,
      co2_g: hCO2,
      water_total_ml: hWater,
      water_onsite_ml: hWaterOnsite,
      water_offsite_ml: hWaterOffsite,
      energy_wh: hEnergy,
      tokensByModel: hTokensByModel,
    });
  }

  res.json(hourly);
});

// GET /api/models — Per-model breakdown
router.get('/models', (req, res) => {
  const modelUsage = getModelUsage();
  const config = getConfig();
  const result = calculateTotals(modelUsage, config);
  res.json(result.perModel);
});

// GET /api/config — Current coefficients
router.get('/config', (req, res) => {
  res.json(getConfig());
});

// POST /api/config — Override coefficients
router.post('/config', express.json(), (req, res) => {
  const allowed = ['pue', 'gridCO2_gPerKwh', 'wueOnsite_LPerKwh', 'wueOffsite_LPerKwh', 'cacheReadFactor'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      configOverrides[key] = parseFloat(req.body[key]);
    }
  }
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configOverrides, null, 2));
  } catch { /* non-critical */ }
  res.json(getConfig());
});

// SSE endpoint — push updates when stats-cache.json changes
const sseClients = new Set();

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcastUpdate() {
  const modelUsage = getModelUsage();
  const config = getConfig();
  const result = calculateTotals(modelUsage, config);
  const totalsWithRange = withUncertainty(result.totals);
  const equivalences = getEquivalences(
    result.totals.co2_g,
    result.totals.water_total_ml,
    result.totals.energy_wh
  );

  const data = JSON.stringify({
    type: 'update',
    ...totalsWithRange,
    equivalences,
    perModel: result.perModel,
  });

  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

// Watch stats-cache.json for changes
let watchDebounce = null;
function startWatching() {
  const statsPath = getStatsCachePath();
  try {
    fs.watch(statsPath, () => {
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(broadcastUpdate, 500);
    });
    console.log('Watching stats-cache.json for changes');
  } catch (e) {
    console.warn('Could not watch stats-cache.json:', e.message);
  }
}

module.exports = { router, startWatching };
