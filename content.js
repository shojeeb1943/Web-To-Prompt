(() => {
  if (window.__webToPromptLoaded) return;
  window.__webToPromptLoaded = true;

  let captureMode = false;
  let highlightedEl = null;

  const MEANINGFUL_TAGS = ['section', 'article', 'main', 'header', 'footer', 'nav', 'aside'];
  const MEANINGFUL_CLASSES = ['card', 'hero', 'container', 'wrapper', 'banner', 'feature', 'cta', 'modal'];

  // ── Color helpers ────────────────────────────────────────────────────────

  function parseColor(cssString) {
    if (!cssString || typeof cssString !== 'string') return null;
    
    cssString = cssString.trim();
    
    // Handle hex colors: #FF0000, #F00
    if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(cssString)) {
      let hex = cssString.slice(1);
      if (hex.length === 3) {
        hex = [...hex].map(x => x + x).join('');
      }
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }
    
    // Handle rgb/rgba: rgb(255, 0, 0), rgba(255, 0, 0, 0.5)
    const rgbMatch = cssString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbMatch) {
      return {
        r: +rgbMatch[1],
        g: +rgbMatch[2],
        b: +rgbMatch[3],
        a: rgbMatch[4] !== undefined ? +rgbMatch[4] : 1
      };
    }
    
    // Handle CSS keywords
    const keywords = {
      transparent: { r: 0, g: 0, b: 0, a: 0 },
      white: { r: 255, g: 255, b: 255, a: 1 },
      black: { r: 0, g: 0, b: 0, a: 1 },
      red: { r: 255, g: 0, b: 0, a: 1 },
      green: { r: 0, g: 128, b: 0, a: 1 },
      blue: { r: 0, g: 0, b: 255, a: 1 },
    };
    
    if (cssString.toLowerCase() in keywords) {
      return keywords[cssString.toLowerCase()];
    }
    
    return null;
  }

  function toHex(rgbObj) {
    if (!rgbObj || typeof rgbObj.r !== 'number' || typeof rgbObj.g !== 'number' || typeof rgbObj.b !== 'number') {
      return null;
    }
    const clamp = val => Math.max(0, Math.min(255, Math.round(val)));
    const hex = [rgbObj.r, rgbObj.g, rgbObj.b]
      .map(v => clamp(v).toString(16).padStart(2, '0'))
      .join('');
    return '#' + hex;
  }

  function resolveEffectiveBg(el) {
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const parsed = parseColor(bg);
      if (parsed && parsed.a > 0) return bg;
      node = node.parentElement;
    }
    const rootBg = getComputedStyle(document.documentElement).backgroundColor;
    const rootParsed = parseColor(rootBg);
    return (rootParsed && rootParsed.a > 0) ? rootBg : 'rgba(255, 255, 255, 1)';
  }

  // ── Visibility guard ─────────────────────────────────────────────────────

  function isVisible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function truncateText(text, max = 200) {
    if (!text || text.length <= max) return text;
    const words = text.slice(0, max).split(' ');
    if (words.length > 1) {
      const truncated = words.slice(0, -1).join(' ');
      if (truncated.length > 0) return truncated + '…';
    }
    return text.slice(0, max) + '…';
  }

  function captureSvg(el) {
    try {
      const html = el.outerHTML;
      return html.length > 5000 ? html.slice(0, 5000) + '<!-- SVG truncated -->' : html;
    } catch (_) {
      return '<!-- SVG capture error -->';
    }
  }

  // ── DOM capture ──────────────────────────────────────────────────────────

  function getType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg') return 'SVG';
    if (tag === 'img') return 'IMAGE';
    if (tag === 'a') return 'LINK';
    if (['input', 'textarea', 'select', 'button'].includes(tag)) return 'INPUT';
    const text = (el.innerText || '').trim();
    if (text && el.children.length === 0) return 'TEXT';
    return 'FRAME';
  }

  function captureElement(el, depth = 0, parentEffectiveBg = null) {
    if (depth > 10 || !isVisible(el)) return null;

    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const bgColor = s.backgroundColor;
    const bgParsed = parseColor(bgColor);
    const isTransparent = !bgParsed || bgParsed.a === 0;
    
    const effectiveBg = isTransparent 
      ? (parentEffectiveBg || resolveEffectiveBg(el.parentElement || el)) 
      : bgColor;

    const borderColorParsed = parseColor(s.borderColor);

    const node = {
      tag,
      type: getType(el),
      x: Math.round(rect.left + scrollX),
      y: Math.round(rect.top + scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      text: Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .filter(Boolean)
        .join(' '),
      fullText: truncateText((el.innerText || '').trim()),
      href: tag === 'a' ? el.getAttribute('href') : null,
      src: tag === 'img' ? el.getAttribute('src') : null,
      alt: tag === 'img' ? el.getAttribute('alt') : null,
      svgRaw: tag === 'svg' ? captureSvg(el) : null,
      styles: {
        backgroundColor: bgColor,
        backgroundColorHex: bgParsed && bgParsed.a > 0 ? toHex(bgParsed) : null,
        backgroundImage: s.backgroundImage !== 'none' ? s.backgroundImage : null,
        effectiveBg,

        color: s.color,
        colorHex: (() => { const p = parseColor(s.color); return p ? toHex(p) : null; })(),
        fontSize: s.fontSize,
        fontSizePx: parseFloat(s.fontSize) || 0,
        fontFamily: s.fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textAlign: s.textAlign,
        textDecoration: s.textDecoration,
        textTransform: s.textTransform,

        padding: s.padding,
        paddingTop: s.paddingTop,
        paddingRight: s.paddingRight,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        margin: s.margin,

        borderWidth: s.borderWidth,
        borderStyle: s.borderStyle,
        borderColor: s.borderColor,
        borderColorHex: borderColorParsed ? toHex(borderColorParsed) : null,
        borderRadius: s.borderRadius,
        borderTop: s.borderTop,
        borderRight: s.borderRight,
        borderBottom: s.borderBottom,
        borderLeft: s.borderLeft,
        outline: s.outline !== 'none' ? s.outline : null,

        boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
        opacity: s.opacity,
        transform: s.transform !== 'none' ? s.transform : null,
        filter: s.filter !== 'none' ? s.filter : null,
        backdropFilter: s.backdropFilter !== 'none' ? s.backdropFilter : null,

        display: s.display,
        flexDirection: s.flexDirection,
        alignItems: s.alignItems,
        justifyContent: s.justifyContent,
        flexWrap: s.flexWrap,
        gap: s.gap,
        gridTemplateColumns: s.gridTemplateColumns !== 'none' ? s.gridTemplateColumns : null,
        gridTemplateRows: s.gridTemplateRows !== 'none' ? s.gridTemplateRows : null,
        position: s.position,
        overflow: s.overflow,
        cursor: s.cursor,

        transition: s.transition !== 'all 0s ease 0s' ? s.transition : null,
      },
      children: [],
    };

    if (tag !== 'svg') {
      for (const child of el.children) {
        const captured = captureElement(child, depth + 1, effectiveBg);
        if (captured) node.children.push(captured);
      }
    }

    return node;
  }

  // ── Context / Ancestors ───────────────────────────────────────────────────

  function getComponentContext(el) {
    const TAG_LABELS = {
      section: 'Section', article: 'Article', main: 'Main Content',
      header: 'Header', footer: 'Footer', nav: 'Navigation', aside: 'Sidebar'
    };
    const CLASS_LABELS = {
      hero: 'Hero', card: 'Card', container: 'Container', wrapper: 'Wrapper',
      banner: 'Banner', feature: 'Feature', cta: 'Call-to-Action', modal: 'Modal'
    };
    let node = el;
    for (let i = 0; i < 5; i++) {
      if (!node || node === document.body || node === document.documentElement) break;
      const tag = node.tagName.toLowerCase();
      const cls = (node.className || '').toString().toLowerCase();
      for (const t of MEANINGFUL_TAGS) {
        if (tag === t) return TAG_LABELS[t] || 'Section';
      }
      for (const c of MEANINGFUL_CLASSES) {
        if (cls.includes(c)) return CLASS_LABELS[c] || 'Component';
      }
      node = node.parentElement;
    }
    return 'Component';
  }

  function findMeaningfulAncestor(el) {
    let node = el;
    for (let i = 0; i < 5; i++) {
      if (!node || node === document.body || node === document.documentElement) break;
      const tag = node.tagName.toLowerCase();
      const cls = (node.className || '').toString().toLowerCase();
      if (MEANINGFUL_TAGS.includes(tag)) return node;
      if (MEANINGFUL_CLASSES.some(c => cls.includes(c))) return node;
      node = node.parentElement;
    }
    return el;
  }

  // ── CSS & HTML Injection inside Shadow DOM ────────────────────────────────

  const STYLE_TEXT = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Fira+Code&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
    }
    
    .wtp-host {
      position: fixed;
      z-index: 2147483647;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      display: none;
    }
    
    .wtp-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .wtp-border-wrap {
      padding: 1px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0px 8.42px 8.42px -4.21px rgba(0,0,0,0.04), 0px 16.85px 21.06px -4.21px rgba(14,13,13,0.10);
      pointer-events: auto;
      display: flex;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .wtp-border-wrap.loading-border {
      padding: 2px;
      border-radius: 10px;
      background: linear-gradient(135deg, #4999F4, #A368B5, #F86940, #E8B338, #48C637);
      background-size: 250% 250%;
      animation: rainbow-border 4s linear infinite;
    }
    
    .wtp-toolbar {
      display: flex;
      align-items: center;
      height: 38px;
      border-radius: 8px;
      padding: 0 12px 0 2px;
      gap: 16px;
      background-color: rgba(9, 9, 11, 0.8);
      backdrop-filter: blur(12px);
      border: none;
      width: max-content;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .wtp-border-wrap.loading-border .wtp-toolbar {
      height: 36px;
      background-color: rgba(9, 9, 11, 0.6);
    }
    
    @keyframes rainbow-border {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    
    .wtp-drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 100%;
      cursor: grab;
      user-select: none;
      transition: background 0.2s ease;
      border-radius: 6px 0 0 6px;
    }
    
    .wtp-drag-handle:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .wtp-drag-handle:active {
      cursor: grabbing;
    }
    
    .wtp-logo-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }
    
    .wtp-logo-img {
      border-radius: 4px;
      object-fit: contain;
    }
    
    .wtp-state-content {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 100%;
    }
    
    .wtp-toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      padding: 0 12px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .wtp-btn-new {
      background-color: rgba(39, 39, 42, 0.7);
      border: 1px solid rgba(63, 63, 70, 0.4);
      color: #F3F4F6;
    }
    
    .wtp-btn-new:hover {
      background-color: rgba(63, 63, 70, 0.9);
      border-color: rgba(113, 113, 122, 0.6);
    }
    
    .wtp-btn-new:active {
      transform: scale(0.97);
    }
    
    .wtp-btn-cancel {
      background-color: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #EF4444;
    }
    
    .wtp-btn-cancel:hover {
      background-color: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.6);
    }
    
    .wtp-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: #9CA3AF;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .wtp-icon-btn:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: #F3F4F6;
    }
    
    .wtp-icon-btn:active {
      transform: scale(0.95);
    }
    
    .wtp-icon-btn.active {
      background-color: rgba(255, 255, 255, 0.12);
      color: #4999F4;
    }
    
    .wtp-icon-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }
    
    .wtp-divider {
      width: 1px;
      height: 16px;
      background-color: rgba(255, 255, 255, 0.15);
    }
    
    .wtp-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .wtp-close-btn:hover {
      background-color: rgba(239, 68, 68, 0.15);
      color: #EF4444;
    }
    
    .wtp-loading-text {
      color: #E5E7EB;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    
    .wtp-success-wrapper {
      display: flex;
      align-items: center;
    }
    
    .wtp-success-text {
      color: #10B981;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
    }
    
    .wtp-viewer {
      position: absolute;
      bottom: calc(100% + 12px);
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      width: 360px;
      background-color: rgba(9, 9, 11, 0.95);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      box-shadow: 0px 20px 25px -5px rgba(0, 0, 0, 0.3), 0px 10px 10px -5px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .wtp-viewer.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    
    .wtp-viewer-header {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .wtp-viewer-title {
      font-size: 14px;
      font-weight: 600;
      color: #F3F4F6;
    }
    
    .wtp-viewer-tabs {
      display: flex;
      background-color: rgba(255, 255, 255, 0.05);
      padding: 2px;
      border-radius: 6px;
      width: 100%;
    }
    
    .wtp-tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      color: #9CA3AF;
      font-size: 11px;
      font-weight: 500;
      padding: 6px 0;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .wtp-tab-btn:hover {
      color: #F3F4F6;
    }
    
    .wtp-tab-btn.active {
      background-color: rgba(255, 255, 255, 0.1);
      color: #F3F4F6;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    
    .wtp-viewer-body {
      padding: 12px 16px;
      flex: 1;
    }
    
    .wtp-viewer-textarea {
      width: 100%;
      height: 180px;
      background-color: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 10px;
      color: #E5E7EB;
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.5;
      resize: none;
      outline: none;
    }
    
    .wtp-viewer-textarea::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    .wtp-viewer-textarea::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .wtp-viewer-textarea::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    
    .wtp-viewer-textarea::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .wtp-viewer-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background-color: rgba(255, 255, 255, 0.01);
    }
    
    .wtp-viewer-btn {
      border: none;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .wtp-btn-secondary {
      background-color: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #9CA3AF;
    }
    
    .wtp-btn-secondary:hover {
      background-color: rgba(255, 255, 255, 0.05);
      color: #F3F4F6;
    }
    
    .wtp-btn-primary {
      background-color: #4999F4;
      color: #FFFFFF;
    }
    
    .wtp-btn-primary:hover {
      background-color: #357AE8;
    }
    
    .wtp-btn-primary:active {
      transform: scale(0.97);
    }
  `;

  let hostEl = null;
  let shadowRoot = null;
  let activeFormat = 'react';
  let lastCapturedData = null;
  let lastContextLabel = 'Component';
  let loadingInterval = null;

  function initUI() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'web-to-prompt-host';
    hostEl.className = 'wtp-host';
    
    shadowRoot = hostEl.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = STYLE_TEXT;
    shadowRoot.appendChild(style);

    const container = document.createElement('div');
    container.className = 'wtp-container';
    container.innerHTML = `
      <div class="wtp-viewer" id="wtp-viewer">
        <div class="wtp-viewer-header">
          <span class="wtp-viewer-title">Captured Prompt</span>
          <div class="wtp-viewer-tabs">
            <button class="wtp-tab-btn" data-format="react">React</button>
            <button class="wtp-tab-btn" data-format="html">HTML/CSS</button>
            <button class="wtp-tab-btn" data-format="vibe">Vibe</button>
          </div>
        </div>
        <div class="wtp-viewer-body">
          <textarea readonly class="wtp-viewer-textarea" id="wtp-prompt-text" placeholder="No prompt captured yet. Click '+ New' to start."></textarea>
        </div>
        <div class="wtp-viewer-footer">
          <button class="wtp-viewer-btn wtp-btn-secondary" id="wtp-viewer-close">Close</button>
          <button class="wtp-viewer-btn wtp-btn-primary" id="wtp-viewer-copy">Copy Prompt</button>
        </div>
      </div>

      <div class="wtp-border-wrap" id="wtp-border-wrap">
        <div class="wtp-toolbar" id="wtp-toolbar">
          <div class="wtp-drag-handle" id="wtp-drag-handle">
            <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
              <circle cx="3" cy="4" r="1.5" fill="#6B7280"/>
              <circle cx="3" cy="10" r="1.5" fill="#6B7280"/>
              <circle cx="3" cy="16" r="1.5" fill="#6B7280"/>
              <circle cx="9" cy="4" r="1.5" fill="#6B7280"/>
              <circle cx="9" cy="10" r="1.5" fill="#6B7280"/>
              <circle cx="9" cy="16" r="1.5" fill="#6B7280"/>
            </svg>
          </div>

          <div class="wtp-logo-wrapper" id="wtp-logo-wrapper">
            <!-- Logo injected via JS -->
          </div>

          <div class="wtp-state-content" id="wtp-default-content">
            <button class="wtp-toolbar-btn wtp-btn-new" id="wtp-btn-new">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 6px;">
                <path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              New
            </button>

            <div class="wtp-divider"></div>

            <button class="wtp-icon-btn" id="wtp-btn-clipboard" title="View captured prompt" disabled>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            
            <button class="wtp-icon-btn" id="wtp-btn-account" title="Account settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button>
          </div>

          <div class="wtp-state-content" id="wtp-loading-content" style="display: none;">
            <span class="wtp-loading-text" id="wtp-loading-text">+ Thinking...</span>
          </div>

          <div class="wtp-state-content" id="wtp-success-content" style="display: none;">
            <div class="wtp-success-wrapper">
              <svg class="wtp-success-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span class="wtp-success-text">Copied to clipboard</span>
            </div>
          </div>

          <div class="wtp-divider"></div>
          <button class="wtp-close-btn" id="wtp-btn-close" title="Close toolbar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    shadowRoot.appendChild(container);
    document.body.appendChild(hostEl);

    // Setup inline SVG logo (avoid external URL issues)
    const logoWrapper = shadowRoot.getElementById('wtp-logo-wrapper');
    const logoUrl = chrome.runtime.getURL('icons/web2prompt-Icon.svg');
    const logoImg = document.createElement('img');
    logoImg.width = 22;
    logoImg.height = 22;
    logoImg.style.cssText = 'border-radius:5px;display:block;';
    logoImg.src = logoUrl;
    logoImg.onerror = () => {
      logoWrapper.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#4D77FF"/><text x="12" y="16" font-family="system-ui,sans-serif" font-weight="700" font-size="8" fill="white" text-anchor="middle">W2P</text></svg>`;
    };
    logoWrapper.appendChild(logoImg);


    // Retrieve storage format preferences
    chrome.storage.local.get(['wtp_format'], (res) => {
      if (res.wtp_format) {
        activeFormat = res.wtp_format;
      }
      updatePromptViewer();
    });

    setupDragging();
    setupListeners();
  }

  function setupDragging() {
    const dragHandle = shadowRoot.getElementById('wtp-drag-handle');
    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;

    chrome.storage.local.get(['w2p_toolbar_pos'], (res) => {
      if (res.w2p_toolbar_pos) {
        hostEl.style.left = res.w2p_toolbar_pos.x + 'px';
        hostEl.style.top = res.w2p_toolbar_pos.y + 'px';
        hostEl.style.bottom = 'auto';
        hostEl.style.transform = 'none';
      }
    });

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = hostEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      hostEl.style.bottom = 'auto';
      hostEl.style.transform = 'none';
      hostEl.style.left = startLeft + 'px';
      hostEl.style.top = startTop + 'px';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      hostEl.style.left = (startLeft + dx) + 'px';
      hostEl.style.top = (startTop + dy) + 'px';
    }

    function onMouseUp() {
      isDragging = false;
      const rect = hostEl.getBoundingClientRect();
      chrome.storage.local.set({ w2p_toolbar_pos: { x: rect.left, y: rect.top } });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  function setupListeners() {
    const btnNew = shadowRoot.getElementById('wtp-btn-new');
    const btnClose = shadowRoot.getElementById('wtp-btn-close');
    const btnClipboard = shadowRoot.getElementById('wtp-btn-clipboard');
    const btnAccount = shadowRoot.getElementById('wtp-btn-account');
    const viewer = shadowRoot.getElementById('wtp-viewer');
    const viewerClose = shadowRoot.getElementById('wtp-viewer-close');
    const viewerCopy = shadowRoot.getElementById('wtp-viewer-copy');
    const textarea = shadowRoot.getElementById('wtp-prompt-text');

    btnNew.addEventListener('click', () => {
      if (captureMode) {
        deactivateInspection();
      } else {
        activateInspection();
      }
    });

    btnClose.addEventListener('click', () => {
      hideToolbar();
      deactivateInspection();
    });

    btnAccount.addEventListener('click', () => {
      window.open('https://web2prompt.com/account', '_blank');
    });

    btnClipboard.addEventListener('click', () => {
      viewer.classList.toggle('open');
      if (viewer.classList.contains('open')) {
        updatePromptViewer();
      }
    });

    viewerClose.addEventListener('click', () => {
      viewer.classList.remove('open');
    });

    viewerCopy.addEventListener('click', () => {
      const text = textarea.value;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          viewerCopy.textContent = 'Copied!';
          setTimeout(() => { viewerCopy.textContent = 'Copy Prompt'; }, 1500);
        });
      }
    });

    const tabBtns = shadowRoot.querySelectorAll('.wtp-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFormat = btn.getAttribute('data-format');
        chrome.storage.local.set({ wtp_format: activeFormat });
        updatePromptViewer();
      });
    });
  }

  function updatePromptViewer() {
    const textarea = shadowRoot.getElementById('wtp-prompt-text');
    if (!lastCapturedData) {
      textarea.value = "No prompt captured yet. Click '+ New' to start.";
      return;
    }

    if (typeof buildPrompt === 'function') {
      textarea.value = buildPrompt(lastCapturedData, activeFormat, lastContextLabel);
    } else {
      textarea.value = "Error: promptBuilder library not loaded.";
    }

    const tabBtns = shadowRoot.querySelectorAll('.wtp-tab-btn');
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-format') === activeFormat) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ── Highlight & Inspection Handlers ────────────────────────────────────────

  function setHighlight(el) {
    if (highlightedEl === el) return;
    clearHighlight();
    if (!el || el === document.body || el === document.documentElement) return;
    
    // Position highlight outline using blue accent color
    el.style.setProperty('outline', '2px solid #4999F4', 'important');
    el.style.setProperty('outline-offset', '1px', 'important');
    highlightedEl = el;
  }

  function clearHighlight() {
    if (highlightedEl) {
      highlightedEl.style.removeProperty('outline');
      highlightedEl.style.removeProperty('outline-offset');
      highlightedEl = null;
    }
  }

  function onMouseover(e) {
    const el = e.target;
    if (hostEl && hostEl.contains(el)) return;
    if (el === document.body || el === document.documentElement) return;
    setHighlight(el);
  }

  function onMouseout() {
    clearHighlight();
  }

  function onClick(e) {
    if (!captureMode) return;
    const el = e.target;
    
    if (hostEl && hostEl.contains(el)) return;

    if (el === document.body || el === document.documentElement) {
      const btnNew = shadowRoot.getElementById('wtp-btn-new');
      const prevHtml = btnNew.innerHTML;
      btnNew.textContent = 'Click element!';
      setTimeout(() => {
        if (captureMode) btnNew.innerHTML = prevHtml;
      }, 1500);
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    try {
      const target = findMeaningfulAncestor(el);
      const contextLabel = getComponentContext(el);
      const data = captureElement(target);

      deactivateInspection();

      if (!data || (data.width === 0 && data.height === 0)) {
        const btnNew = shadowRoot.getElementById('wtp-btn-new');
        btnNew.textContent = 'Try another!';
        setTimeout(() => {
          if (!captureMode) {
            btnNew.className = 'wtp-toolbar-btn wtp-btn-new';
            btnNew.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 6px;">
                <path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              New
            `;
          }
        }, 1500);
        return;
      }

      startLoading(data, contextLabel);
    } catch (err) {
      console.error('[WTP-CONTENT] Click handling failed:', err);
      deactivateInspection();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') deactivateInspection();
  }

  function activateInspection() {
    if (captureMode) return;
    captureMode = true;

    const btnNew = shadowRoot.getElementById('wtp-btn-new');
    btnNew.className = 'wtp-toolbar-btn wtp-btn-cancel';
    btnNew.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right: 6px;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      Cancel
    `;

    document.addEventListener('mouseover', onMouseover, true);
    document.addEventListener('mouseout', onMouseout, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    chrome.runtime.sendMessage({ type: 'CAPTURE_MODE_ACTIVE' });
  }

  function deactivateInspection() {
    if (!captureMode) return;
    captureMode = false;
    clearHighlight();

    const btnNew = shadowRoot.getElementById('wtp-btn-new');
    btnNew.className = 'wtp-toolbar-btn wtp-btn-new';
    btnNew.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right: 6px;">
        <path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      New
    `;

    document.removeEventListener('mouseover', onMouseover, true);
    document.removeEventListener('mouseout', onMouseout, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    chrome.runtime.sendMessage({ type: 'CAPTURE_MODE_INACTIVE' });
  }

  // ── States Animations ──────────────────────────────────────────────────────

  function startLoading(data, contextLabel) {
    const borderWrap = shadowRoot.getElementById('wtp-border-wrap');
    const defaultContent = shadowRoot.getElementById('wtp-default-content');
    const loadingContent = shadowRoot.getElementById('wtp-loading-content');
    const successContent = shadowRoot.getElementById('wtp-success-content');
    const loadingText = shadowRoot.getElementById('wtp-loading-text');

    borderWrap.classList.add('loading-border');
    defaultContent.style.display = 'none';
    successContent.style.display = 'none';
    loadingContent.style.display = 'flex';

    const btnClipboard = shadowRoot.getElementById('wtp-btn-clipboard');
    btnClipboard.disabled = true;

    const messages = [
      '+ Thinking...',
      '+ Analyzing DOM...',
      '+ Thinking Again...',
      '+ More Thinking...',
      '+ Thinking Done!'
    ];

    let currentMsgIdx = 0;
    loadingText.textContent = messages[currentMsgIdx];

    if (loadingInterval) clearInterval(loadingInterval);

    loadingInterval = setInterval(() => {
      currentMsgIdx++;
      if (currentMsgIdx < messages.length) {
        loadingText.textContent = messages[currentMsgIdx];
      } else {
        clearInterval(loadingInterval);
        
        lastCapturedData = data;
        lastContextLabel = contextLabel;
        
        let generatedPrompt = '';
        if (typeof buildPrompt === 'function') {
          generatedPrompt = buildPrompt(data, activeFormat, contextLabel);
        }

        navigator.clipboard.writeText(generatedPrompt).then(() => {
          showSuccess();
        }).catch((err) => {
          console.error('[WTP-CONTENT] Clipboard write failed:', err);
          showSuccess();
        });
      }
    }, 1200);
  }

  function showSuccess() {
    const borderWrap = shadowRoot.getElementById('wtp-border-wrap');
    const loadingContent = shadowRoot.getElementById('wtp-loading-content');
    const successContent = shadowRoot.getElementById('wtp-success-content');
    const btnClipboard = shadowRoot.getElementById('wtp-btn-clipboard');

    borderWrap.classList.remove('loading-border');
    loadingContent.style.display = 'none';
    successContent.style.display = 'flex';

    btnClipboard.disabled = false;

    chrome.runtime.sendMessage({ type: 'CAPTURE_RESULT', data: lastCapturedData, contextLabel: lastContextLabel });

    setTimeout(() => {
      if (successContent.style.display === 'flex') {
        revertToDefault();
      }
    }, 3000);
  }

  function revertToDefault() {
    const defaultContent = shadowRoot.getElementById('wtp-default-content');
    const loadingContent = shadowRoot.getElementById('wtp-loading-content');
    const successContent = shadowRoot.getElementById('wtp-success-content');

    successContent.style.display = 'none';
    loadingContent.style.display = 'none';
    defaultContent.style.display = 'flex';
  }

  function showToolbar() {
    initUI();
    hostEl.style.display = 'block';
  }

  function hideToolbar() {
    if (hostEl) {
      hostEl.style.display = 'none';
      const viewer = shadowRoot.getElementById('wtp-viewer');
      if (viewer) viewer.classList.remove('open');
    }
  }

  function toggleToolbar() {
    if (!hostEl) {
      showToolbar();
      return;
    }
    // Check inline style OR computed display (CSS class sets display:none initially)
    const computedDisplay = window.getComputedStyle(hostEl).display;
    const inlineDisplay = hostEl.style.display;
    const isHidden = inlineDisplay === 'none' || (inlineDisplay === '' && computedDisplay === 'none');
    if (isHidden) {
      showToolbar();
    } else {
      hideToolbar();
    }
  }

  // ── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[WTP-CONTENT] Message received:', msg.type);
    if (msg.type === 'ACTIVATE_CAPTURE') {
      showToolbar();
      sendResponse({ status: 'activated' });
    }
    if (msg.type === 'TOGGLE_TOOLBAR') {
      toggleToolbar();
      sendResponse({ status: 'toggled' });
    }
    if (msg.type === 'DEACTIVATE_CAPTURE') {
      hideToolbar();
      deactivateInspection();
      sendResponse({ status: 'deactivated' });
    }
    return true;
  });
})();
