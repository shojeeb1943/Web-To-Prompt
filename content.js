(() => {
  if (window.__webToPromptLoaded) return;
  window.__webToPromptLoaded = true;

  let captureMode = false;
  let highlightedEl = null;
  let toast = null;

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
    
    // Optimize: resolve effective background from parentEffectiveBg or fall back to DOM climbing if not provided
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
        // Pass parent's effectiveBg to children to avoid O(N*D) getComputedStyle lookups
        const captured = captureElement(child, depth + 1, effectiveBg);
        if (captured) node.children.push(captured);
      }
    }

    return node;
  }

  // ── Ancestor finder ──────────────────────────────────────────────────────

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

    try {
      const target = findMeaningfulAncestor(el);
      const contextLabel = getComponentContext(el);
      const data = captureElement(target);

      if (!data || (data.width === 0 && data.height === 0)) {
        showToast('No content captured — try clicking a parent element');
        return;
      }

      chrome.runtime.sendMessage({ type: 'CAPTURE_RESULT', data, contextLabel });
      deactivate();
    } catch (err) {
      console.error('[WTP-CONTENT] Click handling failed:', err);
      showToast('An error occurred while capturing. Exiting.');
      deactivate();
    }
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
    if (!captureMode) return;
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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[WTP-CONTENT] Message received:', msg.type);
    if (msg.type === 'ACTIVATE_CAPTURE') {
      activate();
      sendResponse({ status: 'activated' });
    }
    if (msg.type === 'DEACTIVATE_CAPTURE') {
      deactivate();
      sendResponse({ status: 'deactivated' });
    }
    return true;
  });
})();
