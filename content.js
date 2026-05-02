(() => {
  if (window.__webToPromptLoaded) return;
  window.__webToPromptLoaded = true;

  let captureMode = false;
  let highlightedEl = null;
  let toast = null;

  // ── Color helpers ────────────────────────────────────────────────────────

  function parseColor(cssString) {
    if (!cssString || typeof cssString !== 'string') return null;
    // rgb/rgba — most common from getComputedStyle
    const m = cssString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    // hex #rrggbb / #rgb
    const hex = cssString.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
    }
    if (cssString === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  }

  function toHex({ r, g, b }) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
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
    if (text.length <= max) return text;
    return text.slice(0, max).split(' ').slice(0, -1).join(' ') + '…';
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

  function captureElement(el, depth = 0) {
    if (depth > 10 || !isVisible(el)) return null;

    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const bgColor = s.backgroundColor;
    const bgParsed = parseColor(bgColor);
    const isTransparent = !bgParsed || bgParsed.a === 0;
    const effectiveBg = isTransparent ? resolveEffectiveBg(el.parentElement || el) : bgColor;

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
        const captured = captureElement(child, depth + 1);
        if (captured) node.children.push(captured);
      }
    }

    return node;
  }

  // ── Ancestor finder ──────────────────────────────────────────────────────

  function findMeaningfulAncestor(el) {
    const MEANINGFUL_TAGS = ['section', 'article', 'main', 'header', 'footer', 'nav', 'aside'];
    const MEANINGFUL_CLASSES = ['card', 'hero', 'container', 'wrapper', 'banner', 'feature', 'cta', 'modal'];
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

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg) {
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.id = '__wtp-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
      background: '#4F46E5', color: '#fff', padding: '8px 18px',
      borderRadius: '999px', fontSize: '13px', fontFamily: 'system-ui',
      zIndex: '2147483647', pointerEvents: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
    });
    document.documentElement.appendChild(toast);
  }

  function removeToast() {
    if (toast) { toast.remove(); toast = null; }
  }

  // ── Highlight ────────────────────────────────────────────────────────────

  function setHighlight(el) {
    if (highlightedEl === el) return;
    clearHighlight();
    if (!el || el === document.body || el === document.documentElement) return;
    el.style.setProperty('outline', '2px solid #4F46E5', 'important');
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

  // ── Event handlers ───────────────────────────────────────────────────────

  function onMouseover(e) {
    const el = e.target;
    if (el === document.body || el === document.documentElement) return;
    setHighlight(el);
  }

  function onMouseout() {
    clearHighlight();
  }

  function onClick(e) {
    if (!captureMode) return;
    const el = e.target;
    if (el === document.body || el === document.documentElement) {
      showToast('Please click a specific section or component');
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const target = findMeaningfulAncestor(el);
    const data = captureElement(target);

    if (!data || (data.width === 0 && data.height === 0)) {
      showToast('No content captured — try clicking a parent element');
      return;
    }

    chrome.runtime.sendMessage({ type: 'CAPTURE_RESULT', data });
    deactivate();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') deactivate();
  }

  // ── Activate / deactivate ────────────────────────────────────────────────

  function activate() {
    if (captureMode) return;
    captureMode = true;
    showToast('Web To Prompt — click any element');
    document.addEventListener('mouseover', onMouseover, true);
    document.addEventListener('mouseout', onMouseout, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    chrome.runtime.sendMessage({ type: 'CAPTURE_MODE_ACTIVE' });
  }

  function deactivate() {
    captureMode = false;
    clearHighlight();
    removeToast();
    document.removeEventListener('mouseover', onMouseover, true);
    document.removeEventListener('mouseout', onMouseout, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    chrome.runtime.sendMessage({ type: 'CAPTURE_MODE_INACTIVE' });
  }

  // ── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ACTIVATE_CAPTURE') activate();
    if (msg.type === 'DEACTIVATE_CAPTURE') deactivate();
  });
})();
