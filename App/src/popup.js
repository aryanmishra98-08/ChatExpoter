/**
 * Claude Usage Tracker - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadUsageData();
  attachEventListeners();
});

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
  } catch (err) {
    console.error('[Claude Usage] Error loading data:', err);
  }
}

function renderCard(prefix, limitData) {
  const pct = limitData?.utilization ?? 0;
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
