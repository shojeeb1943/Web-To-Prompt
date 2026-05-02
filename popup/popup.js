(() => {
  let captureData = null;
  let currentFormat = 'html';

  const elInfoBar = document.getElementById('infoBar');
  const elLiveDot = document.getElementById('liveDot');
  const elLiveLabel = document.getElementById('liveLabel');
  const elEmptyState = document.getElementById('emptyState');
  const elTextarea = document.getElementById('promptTextarea');
  const elFooter = document.getElementById('footer');
  const elCopyBtn = document.getElementById('copyBtn');
  const elCopyFeedback = document.getElementById('copyFeedback');
  const elActivateBtn = document.getElementById('activateBtn');
  const elTabs = document.getElementById('tabs');

  const REQUIRED_ELS = { elInfoBar, elLiveDot, elLiveLabel, elEmptyState, elTextarea, elFooter, elCopyBtn, elCopyFeedback, elActivateBtn, elTabs };
  for (const [name, el] of Object.entries(REQUIRED_ELS)) {
    if (!el) throw new Error(`[Web To Prompt] Missing DOM element: ${name}`);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    chrome.storage.local.get(['captureResult', 'captureActive'], (result) => {
      if (result.captureActive) setLiveState(true);
      if (result.captureResult) {
        captureData = result.captureResult;
        showPrompt();
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'CAPTURE_READY') {
        chrome.storage.local.get('captureResult', (r) => {
          if (r.captureResult) {
            captureData = r.captureResult;
            showPrompt();
          }
        });
      }
      if (msg.type === 'CAPTURE_MODE_ACTIVE') setLiveState(true);
      if (msg.type === 'CAPTURE_MODE_INACTIVE') setLiveState(false);
      if (msg.type === 'CAPTURE_RESTRICTED') {
        setLiveState(false);
        elInfoBar.textContent = 'This page cannot be captured by extensions';
      }
    });
  }

  // ── Live indicator ─────────────────────────────────────────────────────────

  function setLiveState(active) {
    if (active) {
      elLiveDot.classList.add('live-dot--active');
      elLiveLabel.textContent = 'Live';
    } else {
      elLiveDot.classList.remove('live-dot--active');
      elLiveLabel.textContent = 'Ready';
    }
  }

  // ── Show prompt ────────────────────────────────────────────────────────────

  function showPrompt() {
    if (!captureData) return;

    elEmptyState.style.display = 'none';
    elTextarea.style.display = 'block';
    elFooter.style.display = 'flex';

    updateInfoBar(captureData);
    renderPrompt();
  }

  function renderPrompt() {
    elTextarea.value = buildPrompt(captureData, currentFormat);
  }

  function updateInfoBar(data) {
    const tag = data.tag || 'element';
    const w = data.width || 0;
    const h = data.height || 0;
    elInfoBar.textContent = `Captured: ${tag} · ${w}×${h}px`;
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  elTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const format = btn.dataset.format;
    if (!['html', 'react', 'vibe'].includes(format) || format === currentFormat) return;

    currentFormat = format;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
    btn.classList.add('tab--active');

    if (captureData) renderPrompt();
  });

  // ── Activate button ────────────────────────────────────────────────────────

  elActivateBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.runtime.sendMessage({ type: 'ACTIVATE_CAPTURE', tabId: tabs[0].id });
      window.close();
    });
  });

  // ── Copy button ────────────────────────────────────────────────────────────

  elCopyBtn.addEventListener('click', () => {
    const text = elTextarea.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      elCopyFeedback.textContent = '✓ Copied!';
      elCopyFeedback.classList.add('copy-feedback--visible');
      setTimeout(() => {
        elCopyFeedback.classList.remove('copy-feedback--visible');
      }, 2000);
    });
  });

  init();
})();
