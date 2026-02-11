// Chart.js configuration and helpers

const CHART_COLORS = {
  green: '#4ade80',
  greenBg: 'rgba(74, 222, 128, 0.15)',
  blue: '#60a5fa',
  blueBg: 'rgba(96, 165, 250, 0.15)',
  textDim: '#8b8fa3',
  border: '#2a2e3d',
};

// Shared Chart.js defaults
Chart.defaults.color = CHART_COLORS.textDim;
Chart.defaults.borderColor = CHART_COLORS.border;
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size = 11;

let timelineChart = null;

function createTimelineChart(ctx) {
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'CO2 (gCO2e)',
          data: [],
          borderColor: CHART_COLORS.green,
          backgroundColor: CHART_COLORS.greenBg,
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Water (mL)',
          data: [],
          borderColor: CHART_COLORS.blue,
          backgroundColor: CHART_COLORS.blueBg,
          fill: true,
          tension: 0.3,
          yAxisID: 'y1',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              return `${ctx.dataset.label}: ${val.toFixed(2)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          position: 'left',
          title: { display: true, text: 'gCO2e', color: CHART_COLORS.green },
          grid: { color: 'rgba(74, 222, 128, 0.08)' },
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'mL water', color: CHART_COLORS.blue },
          grid: { display: false },
        },
      },
    },
  });
  return timelineChart;
}

function updateTimelineChart(data, days) {
  if (!timelineChart) return;
  let labels;
  if (days <= 1) {
    // Hourly data — use the hour field directly
    labels = data.map(d => d.hour);
  } else {
    labels = data.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      if (days <= 7) {
        return dt.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric' });
      }
      if (days <= 30) {
        return dt.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
      }
      return dt.toLocaleDateString('de-AT', { month: 'short', year: '2-digit' });
    });
  }
  timelineChart.data.labels = labels;
  timelineChart.data.datasets[0].data = data.map(d => d.co2_g);
  timelineChart.data.datasets[1].data = data.map(d => d.water_total_ml);
  timelineChart.update();
}
