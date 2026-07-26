/**
 * Claude Usage Tracker - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadUsageData();
  attachEventListeners();
});

const STALE_AFTER_MS = 10 * 60 * 1000;

function normalizePct(value) {
  return Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
}

function getProgressColor(pct) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
}

function formatTimeRemaining(resetTimestamp) {
  if (!resetTimestamp) return '';
  const diffMs = new Date(resetTimestamp).getTime() - Date.now();
  if (diffMs <= 0) return 'Resetting soon';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h >= 24) return `Resets in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `Resets in ${h}h ${m}m`;
  if (m > 0) return `Resets in ${m}m`;
  return 'Resetting soon';
}

async function loadUsageData() {
  try {
    const result = await chrome.storage.local.get('claude_track_export_data');
    const data = result.claude_track_export_data;

    if (!data) {
      document.getElementById('usage-section').innerHTML =
        '<div class="no-data">Open a Claude.ai chat to load usage data</div>';
      return;
    }

    renderCard('session', data.sessionLimit);
    renderCard('weekly', data.weeklyLimit);
    renderLastUpdated(data.lastUpdated);
  } catch (err) {
    console.error('[Claude Usage] Error loading data:', err);
  }
}

function formatAge(ageMs) {
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// The popup only reads a stored snapshot — without this it would present
// day-old numbers as if they were current.
function renderLastUpdated(timestamp) {
  const el = document.getElementById('last-updated');
  if (!el) return;

  if (!timestamp) {
    el.textContent = 'Open Claude.ai to refresh';
    el.classList.add('is-stale');
    return;
  }

  const ageMs = Math.max(0, Date.now() - timestamp);
  const isStale = ageMs > STALE_AFTER_MS;
  el.textContent = isStale
    ? `Updated ${formatAge(ageMs)} — open Claude.ai to refresh`
    : `Updated ${formatAge(ageMs)}`;
  el.classList.toggle('is-stale', isStale);
}

function renderCard(prefix, limitData) {
  const pct = normalizePct(limitData?.utilization);
  const color = getProgressColor(pct);

  const pctEl = document.getElementById(`${prefix}-pct`);
  const fillEl = document.getElementById(`${prefix}-fill`);
  const resetEl = document.getElementById(`${prefix}-reset`);

  if (pctEl) { pctEl.textContent = `${pct}%`; pctEl.style.color = color; }
  if (fillEl) { fillEl.style.width = `${pct}%`; fillEl.style.backgroundColor = color; }
  if (resetEl) resetEl.textContent = limitData?.resetTime ? formatTimeRemaining(limitData.resetTime) : '';
}

function attachEventListeners() {
  document.getElementById('btn-open-claude')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes('claude.ai')) {
        window.close();
      } else {
        chrome.tabs.create({ url: 'https://claude.ai/new' });
      }
    } catch (err) {
      chrome.tabs.create({ url: 'https://claude.ai/new' });
    }
  });
}
