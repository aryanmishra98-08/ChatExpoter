/**
 * Claude Usage Tracker - Background Service Worker
 */

// Tab update listener — notifies content script of SPA navigations
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('claude.ai')) {
    chrome.tabs.sendMessage(tabId, { type: 'URL_CHANGED', url: tab.url }).catch(() => {});
  }
});

console.log('[Claude Track] Background service worker initialized');
