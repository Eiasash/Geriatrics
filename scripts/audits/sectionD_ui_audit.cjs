#!/usr/bin/env node
/**
 * Section D UI/CSS audit on shlav-a-mega.html. ZERO mutations.
 * Surfaces real numbers before button-system / color-system / spacing PRs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT, 'shlav-a-mega.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const lines = html.split('\n');

// === Inline style audit ===
const inlineStyleRx = /style\s*=\s*["'][^"']*["']/g;
const inlineStyles = html.match(inlineStyleRx) || [];

// Inline <button> tags with style=
const buttonInlineStyleRx = /<button[^>]*\bstyle\s*=\s*["'][^"']*["'][^>]*>/g;
const buttonInline = html.match(buttonInlineStyleRx) || [];

// onclick handlers
const onclickRx = /\bonclick\s*=\s*["'][^"']*["']/g;
const onclicks = html.match(onclickRx) || [];

// === Color hex audit ===
const hexColorRx = /#[0-9a-fA-F]{3,8}\b/g;
const hexColors = html.match(hexColorRx) || [];
const hexColorCounts = {};
hexColors.forEach(c => { hexColorCounts[c.toLowerCase()] = (hexColorCounts[c.toLowerCase()] || 0) + 1; });
const topColors = Object.entries(hexColorCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

// === Semantic-token usage ===
const semTokens = ['--danger', '--good', '--info', '--err', '--ok', '--success', '--warn', '--app-primary', '--app-accent', '--red-fg', '--red-bg', '--green-fg', '--green-bg', '--yellow-fg', '--yellow-bg', '--blue-fg', '--blue-bg'];
const semUsage = {};
semTokens.forEach(t => {
  const matches = html.match(new RegExp(`var\\(${t}\\)`, 'g')) || [];
  semUsage[t] = matches.length;
});

// --tap-min usage
const tapMinDef = (html.match(/--tap-min\s*:\s*\d+px/g) || []).length;
const tapMinRef = (html.match(/var\(--tap-min\)/g) || []).length;

// === Padding ad-hoc values ===
const paddingRx = /padding\s*:\s*([^;"]+)/g;
const padValues = {};
let m;
while ((m = paddingRx.exec(html)) !== null) {
  const v = m[1].trim();
  padValues[v] = (padValues[v] || 0) + 1;
}
const topPaddings = Object.entries(padValues).sort((a, b) => b[1] - a[1]).slice(0, 15);

// === Font-size audit (small fonts) ===
const fontSizeRx = /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/g;
const sizes = {};
let f;
while ((f = fontSizeRx.exec(html)) !== null) {
  const px = f[2] === 'px' ? parseFloat(f[1]) : (f[2] === 'rem' ? parseFloat(f[1]) * 16 : parseFloat(f[1]) * 16);
  const key = `${f[1]}${f[2]}`;
  sizes[key] = sizes[key] || { count: 0, px };
  sizes[key].count++;
}
const smallFonts = Object.entries(sizes).filter(([_, v]) => v.px < 12).sort((a, b) => b[1].count - a[1].count);

// === btn class system check ===
const hasBtnClass = (html.match(/\.btn(?:-[a-z]+)?\s*\{/g) || []).length;
const usesBtnClass = (html.match(/class\s*=\s*["'][^"']*\bbtn(?:-[a-z]+)?\b[^"']*["']/g) || []).length;

// === Touch-target audit: buttons with explicit min-height ===
const minHeightInButtons = (html.match(/<button[^>]*min-height/g) || []).length;

// === confirm() / alert() calls ===
const confirmCalls = (html.match(/\bconfirm\s*\(/g) || []).length;
const alertCalls = (html.match(/\balert\s*\(/g) || []).length;

// === Inter / Heebo font usage ===
const interImport = html.includes('Inter') ? 'loaded' : 'NOT loaded';
const heeboImport = html.includes('Heebo') ? 'loaded' : 'NOT loaded';
const langAttrUsage = (html.match(/lang\s*=\s*["'](en|he)["']/g) || []).length;

const out = {
  generated_at: new Date().toISOString(),
  file: 'shlav-a-mega.html',
  file_size_bytes: Buffer.byteLength(html, 'utf8'),
  line_count: lines.length,

  inline_styles_total: inlineStyles.length,
  inline_styled_buttons: buttonInline.length,
  onclick_handlers: onclicks.length,

  hex_color_usage: {
    total_hex_literals: hexColors.length,
    unique_colors: Object.keys(hexColorCounts).length,
    top_20: topColors.map(([c, n]) => ({ color: c, count: n })),
  },
  semantic_token_usage: {
    by_token: semUsage,
    total: Object.values(semUsage).reduce((a, b) => a + b, 0),
    note: 'Compare semantic-token usage vs raw hex usage — ratio reflects migration debt',
  },
  tap_target: {
    tap_min_definitions: tapMinDef,
    tap_min_var_references: tapMinRef,
    buttons_with_min_height: minHeightInButtons,
    note: '--tap-min token exists but is largely unreferenced inside <button> tags',
  },
  button_class_system: {
    btn_class_definitions: hasBtnClass,
    btn_class_usages: usesBtnClass,
    inline_styled_buttons: buttonInline.length,
    migration_pct_if_class_exists: hasBtnClass > 0 ? ((usesBtnClass / (usesBtnClass + buttonInline.length)) * 100).toFixed(1) + '%' : 'N/A — no .btn class defined',
  },
  padding_distribution: {
    unique_padding_values: Object.keys(padValues).length,
    top_15: topPaddings.map(([v, n]) => ({ value: v, count: n })),
  },
  font_size_below_12px: {
    distinct: smallFonts.length,
    breakdown: smallFonts.slice(0, 10).map(([k, v]) => ({ size: k, count: v.count })),
  },
  destructive_native_dialogs: {
    confirm_calls: confirmCalls,
    alert_calls: alertCalls,
  },
  fonts: { inter: interImport, heebo: heeboImport, lang_attribute_usages: langAttrUsage },
};

const reportPath = path.join(ROOT, 'scripts/audits/sectionD_ui_report.json');
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log('UI report written:', reportPath);
console.log('\n=== UI HEADLINES ===');
console.log('File size:', (out.file_size_bytes / 1024).toFixed(1), 'KB,', out.line_count, 'lines');
console.log('Inline-styled <button> tags:', out.inline_styled_buttons);
console.log('Total inline style= attrs:', out.inline_styles_total);
console.log('onclick handlers:', out.onclick_handlers);
console.log('Unique hex colors:', out.hex_color_usage.unique_colors, '/ total occurrences:', out.hex_color_usage.total_hex_literals);
console.log('Top 5 colors:', out.hex_color_usage.top_20.slice(0, 5).map(c => `${c.color}=${c.count}`).join(' '));
console.log('Semantic token usages total:', out.semantic_token_usage.total);
console.log('--tap-min defined:', out.tap_target.tap_min_definitions, '/ var() references:', out.tap_target.tap_min_var_references);
console.log('.btn class system:', hasBtnClass > 0 ? `${hasBtnClass} defs / ${usesBtnClass} usages` : 'NOT DEFINED');
console.log('Unique padding values:', out.padding_distribution.unique_padding_values);
console.log('Distinct font sizes <12px:', out.font_size_below_12px.distinct);
console.log('Native confirm():', out.destructive_native_dialogs.confirm_calls, 'alert():', out.destructive_native_dialogs.alert_calls);
