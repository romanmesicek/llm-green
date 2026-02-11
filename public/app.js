// Dashboard logic — fetch, render, SSE updates

let currentDays = 30;

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

// Format numbers — always write out full, no abbreviations
function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1) return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (n >= 0.01) return n.toFixed(2).replace('.', ',');
  if (n > 0) return n.toFixed(3).replace('.', ',');
  return '0';
}

function fmtInt(n) {
  if (n == null) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Aggregate daily data into totals + equivalences for a timeframe
function aggregateDaily(daily) {
  let totalCO2 = 0, totalWater = 0, totalEnergy = 0;
  let totalWaterOnsite = 0, totalWaterOffsite = 0;
  let totalInputTokens = 0, totalOutputTokens = 0;
  let totalCacheRead = 0, totalCacheCreation = 0;

  for (const day of daily) {
    totalCO2 += day.co2_g;
    totalWater += day.water_total_ml;
    totalWaterOnsite += (day.water_onsite_ml || 0);
    totalWaterOffsite += (day.water_offsite_ml || 0);
    totalEnergy += day.energy_wh;
    for (const data of Object.values(day.tokensByModel)) {
      totalInputTokens += (data.input || 0);
      totalOutputTokens += (data.output || 0);
      totalCacheRead += (data.cache_read || 0);
      totalCacheCreation += (data.cache_creation || 0);
    }
  }

  const equivalences = {
    googleSearches: totalCO2 / 0.11,
    ledMinutes: totalEnergy / 0.17,
    waterBottles: totalWater / 1000,
    kmDriving: totalCO2 / 230,
    phoneCharges: totalEnergy / 17,
  };

  return {
    co2_g: totalCO2,
    water_total_ml: totalWater,
    water_onsite_ml: totalWaterOnsite,
    water_offsite_ml: totalWaterOffsite,
    energy_wh: totalEnergy,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      cache_read: totalCacheRead,
      cache_creation: totalCacheCreation,
      total: totalInputTokens + totalOutputTokens + totalCacheRead + totalCacheCreation,
    },
    equivalences,
  };
}

// Render summary cards from aggregated data
function renderCards(agg, allTimeSummary) {
  document.getElementById('totalCO2').textContent = fmt(agg.co2_g);
  document.getElementById('totalWater').textContent = fmt(agg.water_total_ml);
  document.getElementById('totalEnergy').textContent = fmt(agg.energy_wh);

  // Tokens: use timeframe-aggregated data
  const t = agg.tokens;
  document.getElementById('totalTokens').textContent = fmtInt(t.total);
  document.getElementById('tokenDetail').textContent =
    `In: ${fmtInt(t.input)} | Out: ${fmtInt(t.output)} | Cache R: ${fmtInt(t.cache_read)} | Cache W: ${fmtInt(t.cache_creation)}`;

  // CO2 range (±50% uncertainty)
  document.getElementById('co2Range').textContent =
    `Range: ${fmt(agg.co2_g * 0.5)} — ${fmt(agg.co2_g * 1.8)} gCO2e`;

  // Water detail
  document.getElementById('waterDetail').textContent =
    `On-site: ${fmt(agg.water_onsite_ml)} mL | Off-site: ${fmt(agg.water_offsite_ml)} mL`;
}

// Render equivalences
function renderEquivalences(eq) {
  const items = [
    { icon: '&#128269;', value: fmt(eq.googleSearches), label: 'Google searches', basis: '0,11 gCO2e per search' },
    { icon: '&#128161;', value: fmt(eq.ledMinutes), label: 'LED-bulb minutes', basis: '10W bulb = 0,17 Wh/min' },
    { icon: '&#128663;', value: fmt(eq.kmDriving), label: 'km driving', basis: '230 gCO2e per km' },
    { icon: '&#128241;', value: fmt(eq.phoneCharges), label: 'phone charges', basis: '17 Wh per full charge' },
    { icon: '&#127861;', value: fmt(eq.waterBottles), label: 'water bottles (1L)', basis: '1.000 mL per bottle' },
  ];

  document.getElementById('equivalences').innerHTML = items.map(i => `
    <div class="equiv-item">
      <div class="equiv-icon">${i.icon}</div>
      <div>
        <div class="equiv-value">${i.value}</div>
        <div class="equiv-label">${i.label}</div>
        <div class="equiv-basis">${i.basis}</div>
      </div>
    </div>
  `).join('');
}

// All-time summary (for token breakdown in cards)
let allTimeSummary = null;

// Render everything for current timeframe
function renderAll(daily) {
  const agg = aggregateDaily(daily);
  renderCards(agg, allTimeSummary);
  renderEquivalences(agg.equivalences);
  updateTimelineChart(daily, currentDays);
}

// Fetch data for current timeframe
async function fetchTimeframeData() {
  if (currentDays === 1) {
    return fetch('/api/hourly').then(r => r.json());
  }
  return fetch(`/api/daily?days=${currentDays}`).then(r => r.json());
}

// Fetch and render
async function loadDashboard() {
  showLoading(true);
  try {
    const [summaryRes, data] = await Promise.all([
      fetch('/api/summary'),
      fetchTimeframeData(),
    ]);
    allTimeSummary = await summaryRes.json();

    renderAll(data);

    // Load config into sliders
    if (allTimeSummary.config) {
      setSlider('gridCO2', allTimeSummary.config.gridCO2_gPerKwh);
      setSlider('pue', allTimeSummary.config.pue);
      setSlider('wueOnsite', allTimeSummary.config.wueOnsite_LPerKwh);
      setSlider('wueOffsite', allTimeSummary.config.wueOffsite_LPerKwh);
      setSlider('cacheFactor', allTimeSummary.config.cacheReadFactor);
    }
  } catch (e) {
    console.error('Failed to load dashboard:', e);
  } finally {
    showLoading(false);
  }
}

function setSlider(id, value) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(id + 'Val');
  if (el && value != null) {
    el.value = value;
    if (valEl) valEl.textContent = value;
  }
}

// Settings sliders
function setupSettings() {
  const sliders = ['gridCO2', 'pue', 'wueOnsite', 'wueOffsite', 'cacheFactor'];
  const paramMap = {
    gridCO2: 'gridCO2_gPerKwh',
    pue: 'pue',
    wueOnsite: 'wueOnsite_LPerKwh',
    wueOffsite: 'wueOffsite_LPerKwh',
    cacheFactor: 'cacheReadFactor',
  };

  let debounce = null;

  for (const id of sliders) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + 'Val');
    if (!el) continue;

    el.addEventListener('input', () => {
      valEl.textContent = el.value;
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const body = {};
        for (const sid of sliders) {
          body[paramMap[sid]] = parseFloat(document.getElementById(sid).value);
        }
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        loadDashboard();
      }, 300);
    });
  }

  // Settings toggle
  const toggle = document.getElementById('settingsToggle');
  const panel = document.getElementById('settingsPanel');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    panel.classList.toggle('hidden');
  });
}

// Timeframe toggle
function setupTimeframeToggle() {
  const buttons = document.querySelectorAll('.timeframe-toggle .toggle-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDays = parseInt(btn.dataset.days);
      showLoading(true);
      const data = await fetchTimeframeData();
      renderAll(data);
      showLoading(false);
    });
  });
}

// SSE live updates
function connectSSE() {
  const es = new EventSource('/api/stream');
  const dot = document.getElementById('liveDot');
  const label = document.getElementById('liveLabel');

  es.onopen = () => {
    dot.classList.add('connected');
    label.textContent = 'Live';
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'update') {
        allTimeSummary = data;
        fetch(`/api/daily?days=${currentDays}`).then(r => r.json()).then(renderAll);
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    dot.classList.remove('connected');
    label.textContent = 'Reconnecting...';
  };
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const timelineCtx = document.getElementById('timelineChart');
  createTimelineChart(timelineCtx);

  setupTimeframeToggle();
  setupSettings();
  loadDashboard();
  connectSSE();
});
