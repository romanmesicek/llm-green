const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const STATS_CACHE = path.join(CLAUDE_DIR, 'stats-cache.json');

function readStatsCache() {
  try {
    const raw = fs.readFileSync(STATS_CACHE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read stats-cache.json:', e.message);
    return null;
  }
}

// Parse cumulative model usage from stats-cache.json
function getModelUsage() {
  const stats = readStatsCache();
  if (!stats || !stats.modelUsage) return {};
  return stats.modelUsage;
}

// Parse daily model tokens from stats-cache.json (output tokens only)
function getDailyModelTokens() {
  const stats = readStatsCache();
  if (!stats || !stats.dailyModelTokens) return [];
  return stats.dailyModelTokens;
}

// Parse daily activity from stats-cache.json
function getDailyActivity() {
  const stats = readStatsCache();
  if (!stats || !stats.dailyActivity) return [];
  return stats.dailyActivity;
}

// Parse JSONL files for per-request granular data with timestamps
async function parseJSONLFiles() {
  const pattern = path.join(CLAUDE_DIR, 'projects', '**', '*.jsonl');
  const files = await glob(pattern);

  const seen = new Set();
  const messages = [];

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      // Only process assistant messages with usage data
      if (entry.type !== 'assistant') continue;
      if (!entry.message || !entry.message.usage) continue;
      if (entry.message.role !== 'assistant') continue;

      // Deduplicate by message.id + requestId — take first occurrence
      const dedupeKey = `${entry.message.id || ''}:${entry.requestId || ''}:${entry.uuid || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Only count entries that have actual token usage (skip streaming deltas with no new tokens)
      const usage = entry.message.usage;
      if (!usage.input_tokens && !usage.output_tokens &&
          !usage.cache_read_input_tokens && !usage.cache_creation_input_tokens) {
        continue;
      }

      messages.push({
        model: entry.message.model || 'unknown',
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read: usage.cache_read_input_tokens || 0,
        cache_creation: usage.cache_creation_input_tokens || 0,
        timestamp: entry.timestamp,
        date: entry.timestamp ? entry.timestamp.slice(0, 10) : null,
        sessionId: entry.sessionId || null,
        requestId: entry.requestId || null,
        messageId: entry.message.id || null,
      });
    }
  }

  return messages;
}

// Aggregate JSONL messages by date for timeline data
function aggregateByDate(messages) {
  const byDate = {};
  for (const msg of messages) {
    if (!msg.date) continue;
    if (!byDate[msg.date]) {
      byDate[msg.date] = {};
    }
    const model = msg.model;
    if (!byDate[msg.date][model]) {
      byDate[msg.date][model] = {
        input_tokens: 0, output_tokens: 0,
        cache_read: 0, cache_creation: 0,
      };
    }
    byDate[msg.date][model].input_tokens += msg.input_tokens;
    byDate[msg.date][model].output_tokens += msg.output_tokens;
    byDate[msg.date][model].cache_read += msg.cache_read;
    byDate[msg.date][model].cache_creation += msg.cache_creation;
  }
  return byDate;
}

// Aggregate JSONL messages by hour for the last 24h
function aggregateByHour(messages) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const byHour = {};
  for (const msg of messages) {
    if (!msg.timestamp) continue;
    const ts = new Date(msg.timestamp);
    if (ts < cutoff) continue;

    const hourKey = msg.timestamp.slice(0, 13); // "2026-02-10T14"
    const model = msg.model;
    if (!byHour[hourKey]) byHour[hourKey] = {};
    if (!byHour[hourKey][model]) {
      byHour[hourKey][model] = {
        input_tokens: 0, output_tokens: 0,
        cache_read: 0, cache_creation: 0,
      };
    }
    byHour[hourKey][model].input_tokens += msg.input_tokens;
    byHour[hourKey][model].output_tokens += msg.output_tokens;
    byHour[hourKey][model].cache_read += msg.cache_read;
    byHour[hourKey][model].cache_creation += msg.cache_creation;
  }
  return byHour;
}

function getStatsCachePath() {
  return STATS_CACHE;
}

module.exports = {
  readStatsCache,
  getModelUsage,
  getDailyModelTokens,
  getDailyActivity,
  parseJSONLFiles,
  aggregateByDate,
  aggregateByHour,
  getStatsCachePath,
};
