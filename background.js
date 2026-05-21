const injectedTabs = new Set();
let activeTabId = null;

// ── Extension icon click → inject / toggle toolbar ────────────────────────

chrome.action.onClicked.addListener((tab) => {
  handleToggle(tab.id);
});

// ── Keyboard shortcut (Alt+Shift+W) ──────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) handleToggle(tabs[0].id);
    });
  }
});

// ── Tab lifecycle ─────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId);
    if (tabId === activeTabId) {
      activeTabId = null;
      chrome.storage.local.set({ captureActive: false });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  if (tabId === activeTabId) {
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false });
  }
});

// ── Message routing ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'CAPTURE_RESULT') {
    chrome.storage.local.set({
      captureResult: msg.data,
      captureActive: false,
      contextLabel: msg.contextLabel
    }, () => {
      activeTabId = null;
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

// ── Toggle: inject fresh or send message to existing script ──────────────

function handleToggle(tabId) {
  if (!tabId) return;

  if (injectedTabs.has(tabId)) {
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_TOOLBAR' }, () => {
      void chrome.runtime.lastError;
    });
  } else {
    handleActivate(tabId);
  }
}

// ── Inject scripts and show toolbar ──────────────────────────────────────

function handleActivate(tabId) {
  if (!tabId) return;
  activeTabId = tabId;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['promptBuilder.js'],
  }).then(() => {
    return chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  }).then(() => {
    injectedTabs.add(tabId);
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_CAPTURE' }, () => {
        void chrome.runtime.lastError;
      });
    }, 50);
  }).catch(() => {
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false });
  });
}
