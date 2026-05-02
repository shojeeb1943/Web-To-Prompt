let activeTabId = null;

// ── Message routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'ACTIVATE_CAPTURE') {
    handleActivate(msg.tabId || (sender.tab && sender.tab.id));
  }

  if (msg.type === 'CAPTURE_RESULT') {
    chrome.storage.local.set({ captureResult: msg.data, captureActive: false }, () => {
      activeTabId = null;
      chrome.runtime.sendMessage({ type: 'CAPTURE_READY' }).catch(() => {});
    });
  }

  if (msg.type === 'CAPTURE_MODE_ACTIVE') {
    chrome.storage.local.set({ captureActive: true });
  }

  if (msg.type === 'CAPTURE_MODE_INACTIVE') {
    chrome.storage.local.set({ captureActive: false });
    activeTabId = null;
  }
});

// ── Keyboard shortcut ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) handleActivate(tabs[0].id);
    });
  }
});

// ── Tab navigation deactivates capture ───────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'loading') {
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false });
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (activeTabId && tabId !== activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: 'DEACTIVATE_CAPTURE' }).catch(() => {});
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false });
  }
});

// ── Activate helper ──────────────────────────────────────────────────────────

function handleActivate(tabId) {
  if (!tabId) return;
  activeTabId = tabId;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  }).then(() => {
    chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_CAPTURE' });
  }).catch(() => {
    chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_CAPTURE' });
  });
}
