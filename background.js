let activeTabId = null;

// ── Message routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'ACTIVATE_CAPTURE') {
    handleActivate(msg.tabId || (sender.tab && sender.tab.id));
  }

  if (msg.type === 'CAPTURE_RESULT') {
    chrome.storage.local.set({ captureResult: msg.data, captureActive: false, contextLabel: msg.contextLabel }, () => {
      activeTabId = null;
      chrome.runtime.sendMessage({ type: 'CAPTURE_READY' }, () => {
        void chrome.runtime.lastError; // popup may not be open — suppress error
      });
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

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false });
   }
});

// ── Extension action click listener ──────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  handleActivate(tab.id);
});

// ── Activate helper ──────────────────────────────────────────────────────────

function handleActivate(tabId) {
  console.log('[WTP-BG] handleActivate called for tabId:', tabId);
  if (!tabId) return;
  activeTabId = tabId;

  // Try toggling the toolbar first (assuming content.js is already running)
  console.log('[WTP-BG] Sending TOGGLE_TOOLBAR to tab:', tabId);
  chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_TOOLBAR' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[WTP-BG] content.js is not running or connection failed. Injecting scripts...');
      
      // Inject promptBuilder.js and content.js since they aren't running
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['promptBuilder.js', 'content.js'],
      }).then(() => {
        console.log('[WTP-BG] Scripts injected successfully. Sending ACTIVATE_CAPTURE...');
        chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_CAPTURE' }, (resp) => {
          if (chrome.runtime.lastError) {
            console.error('[WTP-BG] Failed to activate after injection:', chrome.runtime.lastError.message);
            handleRestrictionError();
          } else {
            console.log('[WTP-BG] Capture activated successfully after injection. Response:', resp);
          }
        });
      }).catch((err) => {
        console.error('[WTP-BG] executeScript failed:', err);
        handleRestrictionError();
      });
    } else {
      console.log('[WTP-BG] Toggle message handled successfully. Response:', response);
    }
  });

  function handleRestrictionError() {
    activeTabId = null;
    chrome.storage.local.set({ captureActive: false, captureError: 'restricted' });
    chrome.runtime.sendMessage({ type: 'CAPTURE_RESTRICTED' }, () => { void chrome.runtime.lastError; });
  }
}
