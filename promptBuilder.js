const KNOWN_GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'DM Sans',
  'Plus Jakarta Sans', 'Nunito', 'Raleway', 'Montserrat',
  'Source Sans Pro', 'IBM Plex Sans',
];

const VALID_FORMATS = ['html', 'react', 'vibe'];

function buildPrompt(capturedJSON, format, contextLabel = 'Component') {
  if (!capturedJSON || typeof capturedJSON !== 'object') return '';
  format = VALID_FORMATS.includes(format) ? format : 'html';

  const tokens = collectTokens(capturedJSON);
  const assets = collectAssets(capturedJSON);
  const overview = buildOverview(capturedJSON, format, contextLabel);
  const layoutTree = buildLayoutTree(capturedJSON, 0);
  const tokenTable = buildTokenTable(tokens);
  const specs = buildElementSpecs(capturedJSON, 0);
  const typo = buildTypography(tokens);
  const hover = buildHoverStates(capturedJSON);
  const responsive = buildResponsive(format);
  const rules = buildRules(format);

  return [
    `## Component Overview\n${overview}`,
    assets.length > 0 ? `## Assets / Resources\n${assets.map(a => `- ${a}`).join('\n')}` : null,
    `## Layout Structure\n${layoutTree}`,
    `## Design Tokens\n${tokenTable}`,
    `## Element Specifications\n${specs}`,
    `## Typography\n${typo}`,
    `## Hover States\n${hover}`,
    `## Responsive Behavior\n${responsive}`,
    `## Strict Rules\n${rules}`,
  ].filter(Boolean).join('\n\n---\n\n');
}

// ── Token collection ─────────────────────────────────────────────────────────

function collectTokens(node) {
  const colors = new Set();
  const fonts = new Set();
  const sizes = new Set();
  const radii = new Set();
  const shadows = new Set();
  const spacing = new Set();

  function walk(n) {
    if (!n) return;
    const s = n.styles || {};

    if (s.backgroundColorHex) colors.add(s.backgroundColorHex);
    if (s.colorHex) colors.add(s.colorHex);
    if (s.borderColorHex && s.borderStyle !== 'none') colors.add(s.borderColorHex);

    if (s.fontFamily) fonts.add(s.fontFamily);
    if (s.fontSizePx) sizes.add(s.fontSizePx + 'px');
    if (s.borderRadius && s.borderRadius !== '0px') radii.add(s.borderRadius);
    if (s.boxShadow) shadows.add(s.boxShadow);
    if (s.paddingTop && s.paddingTop !== '0px') spacing.add(s.paddingTop);
    if (s.paddingRight && s.paddingRight !== '0px') spacing.add(s.paddingRight);
    if (s.paddingBottom && s.paddingBottom !== '0px') spacing.add(s.paddingBottom);
    if (s.paddingLeft && s.paddingLeft !== '0px') spacing.add(s.paddingLeft);
    if (s.gap && s.gap !== 'normal') spacing.add(s.gap);

    (n.children || []).forEach(walk);
  }

  walk(node);
  return { colors, fonts, sizes, radii, shadows, spacing };
}

function collectAssets(node) {
  const assets = [];
  const seen = new Set();

  function walk(n) {
    if (!n) return;
    if (n.type === 'IMAGE' && n.src && !seen.has(n.src)) {
      seen.add(n.src);
      assets.push(`Image: ${n.src}${n.alt ? ` (alt: "${n.alt}")` : ''}`);
    }
    if (n.type === 'LINK' && n.href) {
      const url = n.href.startsWith('data:') ? null : n.href;
      if (url && !seen.has(url)) {
        seen.add(url);
        assets.push(`Link: ${url}`);
      }
    }
    if (n.type === 'FRAME' && n.styles?.backgroundImage && n.styles.backgroundImage.startsWith('url(')) {
      const match = n.styles.backgroundImage.match(/url\("([^"]+)"\)/);
      if (match) {
        const url = match[1];
        if (!seen.has(url)) {
          seen.add(url);
          assets.push(`Background image: ${url}`);
        }
      }
    }
    (n.children || []).forEach(walk);
  }

  walk(node);
  return assets;
}

function buildTokenTable(tokens) {
  const lines = ['| Token | Value |', '|-------|-------|'];

  [...tokens.colors].forEach(c => lines.push(`| Color | \`${c}\` |`));
  [...tokens.fonts].forEach(f => lines.push(`| Font family | \`${f}\` |`));
  [...tokens.sizes].forEach(s => lines.push(`| Font size | \`${s}\` |`));
  [...tokens.radii].forEach(r => lines.push(`| Border radius | \`${r}\` |`));
  [...tokens.shadows].forEach(s => lines.push(`| Box shadow | \`${s}\` |`));
  [...tokens.spacing].forEach(s => lines.push(`| Spacing | \`${s}\` |`));

  return lines.join('\n');
}

// ── Overview ─────────────────────────────────────────────────────────────────

const HUMAN_INTROS = {
    Hero: "We're designing a bold and visually striking hero section that immediately grabs attention. The hero should feel confident and modern.",
    Section: "This section needs to feel cohesive and well-structured, supporting the content it contains with clean spacing and clear hierarchy.",
    'Call-to-Action': "We're creating a compelling call-to-action section that encourages users to take the next step. It should feel inviting and impossible to ignore.",
    Card: "Each card in this design serves as a self-contained unit — concise, scannable, and visually balanced with the overall layout.",
    'Main Content': "This is the core content area of the page. It should prioritize readability and allow the content to breathe.",
    Header: "The header serves as the top navigation anchor — clean, accessible, and immediately recognizable.",
    Footer: "The footer provides closure and often houses supplementary links. It should feel grounded and organized.",
    Navigation: "This navigation component should guide users effortlessly. Clear hierarchy and intuitive structure are key.",
    Article: "An article layout designed for comfortable reading — generous line lengths, clear headings, and proper spacing.",
    Sidebar: "A supporting sidebar that complements the main content without competing for attention.",
    Modal: "A focused overlay that demands user attention. It should feel lightweight yet impossible to dismiss casually.",
    Container: "This container holds and organizes child elements. It needs to feel spacious and well-balanced.",
    Wrapper: "A wrapper that groups related content together, providing structure without adding visual noise.",
    Banner: "A banner designed to communicate a message quickly. Bold, direct, and visually prominent.",
    Feature: "A feature block that highlights something noteworthy. It should be clear what value it delivers.",
    Component: "This component fits into a larger design system. Keep it clean, reusable, and well-documented.",
  };

  function buildOverview(node, format, contextLabel) {
    const tag = node.tag || 'div';
    const w = node.width || 0;
    const h = node.height || 0;
    const bg = node.styles?.backgroundColorHex || node.styles?.effectiveBg || 'transparent';
    const childCount = countNodes(node) - 1;
    const formatLabel = format === 'react' ? 'React + Tailwind' : format === 'vibe' ? 'v0/Bolt/Lovable natural language' : 'HTML + CSS';
    const intro = HUMAN_INTROS[contextLabel] || HUMAN_INTROS['Component'];

    return `${intro}\n\nA \`<${tag}>\` component measuring **${w}×${h}px** with a background of \`${bg}\`. ` +
      `It contains ${childCount} child element${childCount !== 1 ? 's' : ''}. ` +
      `Output format: **${formatLabel}**.`;
  }

function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((acc, c) => acc + countNodes(c), 0);
}

// ── Layout tree ───────────────────────────────────────────────────────────────

function buildLayoutTree(node, depth) {
  if (!node) return '';
  const indent = '  '.repeat(depth);
  const label = node.tag + (node.text ? ` ("${node.text.slice(0, 30)}")` : '');
  const lines = [`${indent}<${label}>`];
  (node.children || []).forEach(c => lines.push(buildLayoutTree(c, depth + 1)));
  return lines.join('\n');
}

// ── Element specs ─────────────────────────────────────────────────────────────

function buildElementSpecs(node, depth, path = '') {
  if (!node) return '';
  const s = node.styles || {};
  const lines = [];
  const currentPath = path ? `${path} > ${node.tag}` : node.tag;

  lines.push(`### \`${currentPath}\` — ${node.type}`);
  lines.push(`- **Size:** ${node.width}×${node.height}px`);

  if (s.backgroundColorHex) {
    lines.push(`- **Background:** \`${s.backgroundColorHex}\``);
  } else if (s.backgroundImage) {
    lines.push(`- **Background:** \`${s.backgroundImage}\``);
  } else {
    const note = s.effectiveBg ? ` (resolved from parent: \`${s.effectiveBg}\`)` : '';
    lines.push(`- **Background:** transparent${note}`);
  }

  if (s.borderStyle && s.borderStyle !== 'none') {
    lines.push(`- **Border:** \`${s.borderWidth} ${s.borderStyle} ${s.borderColorHex || s.borderColor}\``);
  }
  if (s.borderRadius && s.borderRadius !== '0px') {
    lines.push(`- **Border radius:** \`${s.borderRadius}\``);
  }
  if (s.boxShadow) {
    lines.push(`- **Box shadow:** \`${s.boxShadow}\``);
  }

  const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
  if (pad.some(p => p && p !== '0px')) {
    lines.push(`- **Padding:** \`${s.padding || pad.join(' ')}\``);
  }

  if (s.display) {
    lines.push(`- **Display:** \`${s.display}\``);
    if (s.display.includes('flex')) {
      lines.push(`  - direction: \`${s.flexDirection}\`, align: \`${s.alignItems}\`, justify: \`${s.justifyContent}\``);
      if (s.gap && s.gap !== 'normal') lines.push(`  - gap: \`${s.gap}\``);
    }
    if (s.display.includes('grid')) {
      if (s.gridTemplateColumns) lines.push(`  - columns: \`${s.gridTemplateColumns}\``);
      if (s.gridTemplateRows) lines.push(`  - rows: \`${s.gridTemplateRows}\``);
      if (s.gap && s.gap !== 'normal') lines.push(`  - gap: \`${s.gap}\``);
    }
  }

  if (node.type === 'TEXT' || node.fullText) {
    lines.push(`- **Font:** \`${s.fontFamily}\` ${s.fontSizePx}px / weight \`${s.fontWeight}\``);
    lines.push(`- **Color:** \`${s.colorHex || s.color}\``);
    if (s.lineHeight) lines.push(`- **Line height:** \`${s.lineHeight}\``);
    if (s.letterSpacing && s.letterSpacing !== 'normal') lines.push(`- **Letter spacing:** \`${s.letterSpacing}\``);
    if (node.fullText) lines.push(`- **Text content:** "${node.fullText}"`);
  }

  if (node.type === 'IMAGE') {
    if (node.src) lines.push(`- **src:** \`${node.src}\`${node.alt ? ` (alt: "${node.alt}")` : ''}`);
  }

  if (node.type === 'LINK' && node.href) {
    lines.push(`- **href:** \`${node.href}\``);
  }

  const bgImg = s.backgroundImage;
  if (bgImg && bgImg.startsWith('url(')) {
    const match = bgImg.match(/url\("([^"]+)"\)/);
    if (match) lines.push(`- **Background image:** \`${match[1]}\``);
  }

  if (node.type === 'SVG' && node.svgRaw) {
    const raw = node.svgRaw.length > 5000
      ? node.svgRaw.slice(0, 5000) + '\n<!-- SVG truncated at 5000 chars -->'
      : node.svgRaw;
    lines.push(`- **SVG markup:**\n\`\`\`svg\n${raw}\n\`\`\``);
  }

  (node.children || []).forEach(c => {
    lines.push('');
    lines.push(buildElementSpecs(c, depth + 1, currentPath));
  });

  return lines.join('\n');
}

// ── Typography ────────────────────────────────────────────────────────────────

function buildTypography(tokens) {
  const lines = [];
  [...tokens.fonts].forEach(font => {
    if (KNOWN_GOOGLE_FONTS.includes(font)) {
      const slug = font.replace(/ /g, '+');
      lines.push(`- **${font}** — Google Font`);
      lines.push(`  \`@import url('https://fonts.googleapis.com/css2?family=${slug}:wght@400;500;600;700&display=swap');\``);
    } else {
      lines.push(`- **${font}** — ⚠ Private/custom font. Use \`DM Sans\` as fallback.`);
      lines.push(`  \`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');\``);
    }
  });
  return lines.length ? lines.join('\n') : 'No font data captured.';
}

// ── Hover states ──────────────────────────────────────────────────────────────

function buildHoverStates(node) {
  const states = [];

  function walk(n) {
    if (!n) return;
    const tag = n.tag;
    if (tag === 'button' || (tag === 'a' && n.styles?.cursor === 'pointer')) {
      states.push(`- \`<${tag}>\`: translateY(-1px), box-shadow deepens by 4px, opacity 0.9`);
    } else if (tag === 'a') {
      states.push(`- \`<a>\`: text-decoration underline, color lightens 10%`);
    } else if (n.styles?.cursor === 'pointer') {
      states.push(`- \`<${tag}>\` (clickable): translateY(-2px), box-shadow +4px`);
    }
    (n.children || []).forEach(walk);
  }

  walk(node);
  return states.length
    ? states.join('\n')
    : '- No interactive elements detected. Add hover states as needed.';
}

// ── Responsive ────────────────────────────────────────────────────────────────

function buildResponsive(format) {
  if (format === 'vibe') {
    return [
      '- On tablet (≤1024px): reduce horizontal padding by 50%, allow wrapping',
      '- On mobile (≤768px): switch flex row to column, full width',
      '- On small mobile (≤480px): reduce font sizes by 10–15%, increase tap targets',
    ].join('\n');
  }
  return [
    '```css',
    '@media (max-width: 1024px) { /* tablet: reduce padding, allow flex wrap */ }',
    '@media (max-width: 768px)  { /* mobile: flex-direction: column, width: 100% */ }',
    '@media (max-width: 480px)  { /* small mobile: adjust font sizes, tap targets */ }',
    '```',
  ].join('\n');
}

// ── Strict rules ──────────────────────────────────────────────────────────────

function buildRules(format) {
  const base = [
    '- Do **not** change any px value, hex color, or font weight from the specs above',
    '- Do **not** add decorative elements not present in the original',
    '- Do **not** use placeholder text — use the exact text content provided',
    '- Match spacing (padding/gap/margin) exactly as specified',
  ];

  if (format === 'html') {
    base.push('- Use pure HTML + CSS only, no JavaScript frameworks');
    base.push('- Use BEM class naming convention');
  } else if (format === 'react') {
    base.push('- Use React functional component with Tailwind CSS arbitrary values (e.g. `w-[254px]`)');
    base.push('- No inline styles except for values that cannot be expressed in Tailwind');
  } else if (format === 'vibe') {
    base.push('- Output in natural language describing each element visually and structurally');
    base.push('- Suitable for pasting directly into v0, Bolt, or Lovable');
  }

  return base.join('\n');
}
