/**
 * Claude Usage Tracker - Content Script
 * Adaptive collapsible UI that syncs with sidebar state
 */

(function() {
  'use strict';

  const CONFIG = {
    REFRESH_INTERVAL: 30000,
    PANEL_ID: 'claude-track-export-panel',
    STORAGE_KEY: 'claude_track_export_data'
  };

  const state = {
    usageData: null,
    orgId: null,
    isSidebarCollapsed: false,
    refreshTimer: null,
    lastRefresh: null,
    observers: {
      sidebar: null,
      urlChanges: null
    },
    listeners: {
      resize: null
    }
  };

  // ============================================
  // Utility Functions
  // ============================================
  function getProgressColor(percentage) {
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 70) return '#f59e0b';
    if (percentage >= 50) return '#eab308';
    return '#22c55e';
  }

  function formatTimeRemaining(resetTimestamp) {
    if (!resetTimestamp) return '';
    const diffMs = new Date(resetTimestamp).getTime() - Date.now();
    if (diffMs <= 0) return 'Resetting...';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours >= 24) return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    if (diffMins > 0) return `${diffMins}m`;
    return 'soon';
  }

  // ============================================
  // API Functions
  // ============================================
  async function fetchWithAuth(url, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error(`[Claude Track] Fetch error (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    return null;
  }

  async function getOrganizationId() {
    if (state.orgId) return state.orgId;
    const data = await fetchWithAuth('https://claude.ai/api/organizations');
    if (data && Array.isArray(data) && data.length > 0) {
      state.orgId = data[0].uuid;
      return state.orgId;
    }
    return null;
  }

  async function fetchUsageData() {
    const orgId = await getOrganizationId();
    if (!orgId) return null;

    const usageResponse = await fetchWithAuth(`https://claude.ai/api/organizations/${orgId}/usage`);
    if (!usageResponse) return null;

    const usageData = {
      sessionLimit: {
        label: '5-Hour Session',
        shortLabel: '5H',
        utilization: usageResponse.five_hour?.utilization ?? 0,
        resetTime: usageResponse.five_hour?.resets_at ?? null
      },
      weeklyLimit: {
        label: 'Weekly Limit',
        shortLabel: '7D',
        utilization: usageResponse.seven_day?.utilization ?? 0,
        resetTime: usageResponse.seven_day?.resets_at ?? null
      }
    };

    state.usageData = usageData;
    state.lastRefresh = new Date();

    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: usageData }).catch(() => {});
      }
    } catch (e) {
      // Extension context invalidated synchronously — ignore silently
    }

    return usageData;
  }

  // ============================================
  // UI Components
  // ============================================
  function createUsageBar(data, id) {
    const percentage = Math.min(100, Math.max(0, data.utilization));
    const color = getProgressColor(percentage);
    const resetInfo = data.resetTime ? formatTimeRemaining(data.resetTime) : '';

    return `
      <div class="cte-usage-item" id="${id}">
        <div class="cte-usage-header">
          <span class="cte-usage-label">${data.label}</span>
          <span class="cte-usage-value">${percentage}%</span>
        </div>
        <div class="cte-progress-bar">
          <div class="cte-progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
        </div>
        <div class="cte-usage-detail">${percentage}% used${resetInfo ? ` • ${resetInfo}` : ''}</div>
      </div>
    `;
  }

  function getPanelHTML() {
    const data = state.usageData || {
      sessionLimit: { label: '5-Hour Session', shortLabel: '5H', utilization: 0, resetTime: null },
      weeklyLimit: { label: 'Weekly Limit', shortLabel: '7D', utilization: 0, resetTime: null }
    };

    const sessionColor = getProgressColor(data.sessionLimit.utilization);
    const weeklyColor = getProgressColor(data.weeklyLimit.utilization);

    return `
      <!-- Collapsed View: Icon Only -->
      <div class="cte-collapsed-view">
        <div class="cte-icon-btn" title="Claude Usage">
          <svg class="cte-main-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20V10"/>
            <path d="M18 20V4"/>
            <path d="M6 20v-4"/>
          </svg>
          <div class="cte-mini-indicators">
            <span class="cte-mini-dot" style="background-color: ${sessionColor};" title="5H: ${data.sessionLimit.utilization}%"></span>
            <span class="cte-mini-dot" style="background-color: ${weeklyColor};" title="7D: ${data.weeklyLimit.utilization}%"></span>
          </div>
        </div>
      </div>

      <!-- Expanded View: Full Content -->
      <div class="cte-expanded-view">
        <div class="cte-panel-header">
          <div class="cte-title">
            <svg class="cte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20V10"/>
              <path d="M18 20V4"/>
              <path d="M6 20v-4"/>
            </svg>
            <span>Usage</span>
          </div>
        </div>

        <div class="cte-panel-content">
          <div class="cte-section">
            <div class="cte-usage-bars" id="cte-usage-bars">
              ${createUsageBar(data.sessionLimit, 'cte-session')}
              ${createUsageBar(data.weeklyLimit, 'cte-weekly')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = CONFIG.PANEL_ID;
    panel.className = 'cte-panel';
    panel.innerHTML = getPanelHTML();
    return panel;
  }

  function updatePanelUI() {
    const data = state.usageData;
    if (!data) return;

    updateUsageItem('cte-session', data.sessionLimit);
    updateUsageItem('cte-weekly', data.weeklyLimit);

    const miniDots = document.querySelectorAll('.cte-mini-dot');
    if (miniDots.length >= 2) {
      miniDots[0].style.backgroundColor = getProgressColor(data.sessionLimit.utilization);
      miniDots[0].title = `5H: ${data.sessionLimit.utilization}%`;
      miniDots[1].style.backgroundColor = getProgressColor(data.weeklyLimit.utilization);
      miniDots[1].title = `7D: ${data.weeklyLimit.utilization}%`;
    }

  }

  function updateUsageItem(id, data) {
    const item = document.getElementById(id);
    if (!item) return;

    const percentage = Math.min(100, Math.max(0, data.utilization));
    const color = getProgressColor(percentage);
    const resetInfo = data.resetTime ? formatTimeRemaining(data.resetTime) : '';

    const valueSpan = item.querySelector('.cte-usage-value');
    const progressFill = item.querySelector('.cte-progress-fill');
    const detailDiv = item.querySelector('.cte-usage-detail');

    if (valueSpan) valueSpan.textContent = `${percentage}%`;
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
      progressFill.style.backgroundColor = color;
    }
    if (detailDiv) detailDiv.textContent = `${percentage}% used${resetInfo ? ` • ${resetInfo}` : ''}`;
  }

  // ============================================
  // Sidebar State Detection & Sync
  // ============================================
  function findSidebarContainer() {
    const selectors = [
      '[data-testid="sidebar"]',
      'nav[class*="sidebar"]',
      'nav[class*="Sidebar"]',
      'aside[class*="sidebar"]',
      '[class*="NavigationSidebar"]',
      'nav'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function detectSidebarState() {
    const sidebar = findSidebarContainer();
    if (!sidebar) return false;
    const classes = sidebar.className.toLowerCase();
    const hasCollapsedIndicator =
      classes.includes('collapsed') || classes.includes('closed') ||
      classes.includes('mini') || classes.includes('narrow') || classes.includes('hidden');
    return sidebar.offsetWidth < 120 || hasCollapsedIndicator;
  }

  function syncPanelWithSidebar() {
    const panel = document.getElementById(CONFIG.PANEL_ID);
    if (!panel) return;
    const isCollapsed = detectSidebarState();
    if (isCollapsed !== state.isSidebarCollapsed) {
      state.isSidebarCollapsed = isCollapsed;
      panel.classList.toggle('cte-sidebar-collapsed', isCollapsed);
      panel.classList.toggle('cte-sidebar-expanded', !isCollapsed);
    }
  }

  function observeSidebarChanges() {
    const sidebar = findSidebarContainer();
    if (!sidebar) return;

    syncPanelWithSidebar();

    if (state.observers.sidebar) state.observers.sidebar.disconnect();

    const observer = new MutationObserver(() => requestAnimationFrame(syncPanelWithSidebar));
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });

    if (sidebar.parentElement && sidebar.parentElement !== document.body) {
      observer.observe(sidebar.parentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    state.observers.sidebar = observer;

    if (state.listeners.resize) window.removeEventListener('resize', state.listeners.resize);

    let resizeTimeout;
    const resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(syncPanelWithSidebar, 100);
    };
    window.addEventListener('resize', resizeHandler);
    state.listeners.resize = resizeHandler;
  }

  // ============================================
  // Panel Injection & Events
  // ============================================
  function injectPanel() {
    if (document.getElementById(CONFIG.PANEL_ID)) return;

    const sidebar = findSidebarContainer();
    const panel = createPanel();

    if (sidebar) {
      sidebar.appendChild(panel);
    } else {
      panel.classList.add('cte-panel-floating');
      document.body.appendChild(panel);
    }

    observeSidebarChanges();
  }

  function removePanel() {
    const panel = document.getElementById(CONFIG.PANEL_ID);
    if (panel) panel.remove();
    stopRefreshTimer();
    if (state.observers.sidebar) {
      state.observers.sidebar.disconnect();
      state.observers.sidebar = null;
    }
    if (state.listeners.resize) {
      window.removeEventListener('resize', state.listeners.resize);
      state.listeners.resize = null;
    }
  }

  function startRefreshTimer() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(async () => {
      if (document.hidden) return;
      await fetchUsageData();
      updatePanelUI();
    }, CONFIG.REFRESH_INTERVAL);
  }

  function stopRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function isOnChatPage() {
    const path = window.location.pathname;
    return (
      path.startsWith('/chat') ||
      path === '/new' ||
      path.startsWith('/recents') ||
      path.startsWith('/projects') ||
      path.startsWith('/project/') ||
      path.startsWith('/customize') ||
      path.startsWith('/artifacts/my')
    );
  }

  function observeUrlChanges() {
    if (state.observers.urlChanges) state.observers.urlChanges.disconnect();

    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;

      setTimeout(() => {
        if (isOnChatPage()) {
          if (!document.getElementById(CONFIG.PANEL_ID)) {
            injectPanel();
            startRefreshTimer();
          }
        } else {
          removePanel();
        }
      }, 1000);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.urlChanges = observer;
  }

  // ============================================
  // Initialization
  // ============================================
  async function initialize() {
    if (!isOnChatPage()) {
      console.log('[Claude Track] Unsupported page — skipping');
      return;
    }

    console.log('[Claude Track] Initializing...');

    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }

    let attempts = 0;
    while (attempts < 20 && !document.querySelector('nav')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    await fetchUsageData();
    injectPanel();
    startRefreshTimer();
    observeUrlChanges();

    console.log('[Claude Track] Ready');
  }

  initialize();
})();
