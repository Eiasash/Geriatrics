/* §3(2)(c) — only-implementation search.
 *
 * "Before a mutation counts as a valid witness, grep for other code paths enforcing the same
 * behaviour." A mutation that deletes a CSS declaration is not proof the app loses that
 * protection if some OTHER rule in the file enforces the identical declaration on a selector
 * that already covers the element being mutated — the guard still reds (the deleted text is
 * gone, so a text-presence regex fails), but the real-world consequence the mutation's label
 * describes does not happen. mutants.mjs:524-527 is the known instance: it deletes
 * `.jumprow{transition:none}` under `@media(prefers-reduced-motion:reduce)`, but
 * `*{transition:none!important}` under the same media query (universal selector, !important)
 * already covers .jumprow, and a second copy of that rule exists further down the file. The
 * guard reds; the app is unaffected.
 *
 * SCOPE, stated rather than silently assumed: this pass only judges mutations whose `from` text
 * is CSS (a `selector{prop:value...}` block, or a bare declaration list). "Other code path
 * enforcing the same behaviour" for a JS-logic mutation is not mechanically checkable without
 * understanding what the code DOES — pretending otherwise would be exactly the false-confidence
 * failure mode this effort exists to close. Every non-CSS mutation is reported as
 * "out of scope for this pass", not silently skipped and not credited as reviewed.
 *
 * For each CSS mutation: extract every `prop:value` declaration in the text being removed or
 * changed, then search the ORIGINAL index.html — excluding the mutation's own matched span —
 * for another rule that (a) declares the identical prop:value pair AND (b) whose selector is
 * either identical, a superset (a universal `*` or an ancestor/shared-class selector), or
 * appears under the same @media condition. A hit is reported as a REDUNDANT WITNESS candidate
 * needing a human's confirmation that the broader rule really does cover the same element —
 * this script proves overlap of TEXT, not of CSS cascade semantics, and says so rather than
 * pretending to be a browser.
 *
 * Usage: node only-implementation-search.mjs [path-to-index.html]
 *
 * This is a one-off audit tool, run by hand, NOT wired into CI — same category as
 * harness-selftest.mjs, and for the same kind of reason: it needs `acorn` (present here as a
 * transitive dependency at the repo root, resolved via Node's normal upward node_modules walk
 * from this file's directory) which stage-a/build's own CI install (`npm i --no-save jsdom@24`)
 * does not provide, and adding a dependency footprint for a discretionary analysis script is
 * not worth widening that install. A hand-rolled string/comment tokenizer was tried first and
 * dropped: it silently desynced on an ordinary single-quoted label containing unescaped double
 * quotes deep in the mutation list, parsing 259 real entries into a garbled ~1080-line blob
 * with no syntax error near the actual fault — a wrong-but-plausible parse is worse than a
 * missing one, which is exactly why a real parser is used here instead of a second hand-rolled
 * attempt at the trick that failed once already in this same effort (2b's tokenizer mistake).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || '../index.html';

/* find `const M = [...]` as a real AST node and eval exactly the source span acorn says it
   occupies — never a hand-counted guess at where the array ends */
const mutantsSrc = fs.readFileSync(path.join(HERE, 'mutants.mjs'), 'utf8');
const ast = acorn.parse(mutantsSrc, { ecmaVersion: 2022, sourceType: 'module' });
let mSpan = null;
for(const node of ast.body){
  if(node.type !== 'VariableDeclaration') continue;
  for(const d of node.declarations) if(d.id && d.id.name === 'M') mSpan = d.init;
}
if(!mSpan) throw new Error('could not find "const M = [...]" as a top-level declaration in mutants.mjs');
const M = new Function('return ' + mutantsSrc.slice(mSpan.start, mSpan.end))();
console.log('loaded ' + M.length + ' mutations from mutants.mjs (parsed with acorn, not hand-tokenized)');

const html = fs.readFileSync(SRC, 'utf8');

/* `@media (COND){ selector{decls} }` — unwrap one level so the inner rule can be examined the
   same way as an unwrapped one, and so the media condition is available to scope the search:
   a rule that only applies under prefers-reduced-motion is only made redundant by ANOTHER rule
   that also applies under that same condition, not by an identical declaration that happens to
   sit outside any media query and therefore never fires when this one would have. */
function unwrapMedia(text){
  const m = text.trim().match(/^@media\s*(\([^)]*\))\s*\{\s*([\s\S]*)\}\s*$/);
  if(!m) return null;
  return { cond: m[1].replace(/\s+/g, ' '), inner: m[2].trim() };
}

/* a `from` snippet counts as CSS if it looks like a rule (selector{...}) or a bare declaration
   list (prop:value; possibly repeated) — deliberately conservative: JS object literals and
   template strings also contain colons and braces, so this only accepts text whose non-space
   content is ENTIRELY selector/declaration shaped */
function asCssDecls(text){
  const stripped = text.trim();
  if(!stripped) return null;
  const bodyMatch = stripped.match(/\{([^{}]*)\}\s*$/);
  const body = bodyMatch ? bodyMatch[1] : stripped;
  /* must look like ONLY `prop:value;prop:value` — anything with JS-only punctuation
     ( `(`, `=>`, `function`, a stray `'`/`"` outside a value) disqualifies it */
  if(/=>|function\s*\(|;\s*\/\/|`/.test(stripped)) return null;
  const declRe = /([a-z-]+)\s*:\s*([^;{}]+?)\s*(?:;|$)/gi;
  const decls = [];
  let m;
  while((m = declRe.exec(body))) decls.push({ prop: m[1].trim().toLowerCase(), value: m[2].trim() });
  return decls.length ? decls : null;
}

/* every occurrence of `@media COND{ ... }` in text, brace-matched (media blocks nest one rule
   level deep, sometimes more with multiple rules) rather than regex-captured, since a lazy
   `[^}]*` would stop at the FIRST inner rule's closing brace and truncate the block.
   Whitespace-tolerant on the condition itself: `(prefers-reduced-motion: reduce)` and
   `(prefers-reduced-motion:reduce)` are the SAME condition and both occur verbatim in this
   file — comparing them as literal text would miss the second and silently under-report. */
function mediaBlocks(text, cond){
  const out = [];
  const condPattern = cond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?\s+/g, '\\s*');
  const findRe = new RegExp('@media\\s*' + condPattern, 'g');
  let from = 0;
  while(true){
    findRe.lastIndex = from;
    const m = findRe.exec(text);
    if(!m) break;
    const at = m.index;
    const braceAt = text.indexOf('{', at);
    if(braceAt < 0) break;
    let depth = 0, i = braceAt;
    for(; i < text.length; i++){
      if(text[i] === '{') depth++;
      else if(text[i] === '}'){ depth--; if(depth === 0) break; }
    }
    out.push(text.slice(braceAt + 1, i));
    from = i + 1;
  }
  return out;
}

/* CSS cascade, in the one sentence this script is entitled to rely on: a MORE SPECIFIC
   selector normally wins over a broader one regardless of source order, so "the same
   declaration exists somewhere else" is not by itself evidence of redundancy — a `.foo{x}`
   elsewhere does nothing to protect `.bar` losing `x`. The two configurations where a second
   rule reliably still applies, without needing a real cascade engine to prove it:
     (a) a UNIVERSAL `*{...}` rule carrying `!important` — matches every element including the
         mutated one, and !important beats a losing specificity fight
     (b) the mutation's OWN selector text appears a SECOND time elsewhere with the same
         declaration — a literal duplicate rule, unambiguous regardless of specificity
   Every other repeated declaration in a 15,000-line stylesheet (there will be hundreds) is
   noise for this purpose and is not reported — reporting it would trade one false-confidence
   failure mode for another. */
function extractSelector(fromText){
  const m = fromText.match(/^\s*([^{]+?)\s*\{/);
  return m ? m[1].trim() : null;
}

const results = [];
for(const entry of M){
  const [name, from, , needle, runner] = entry;
  if(runner === 'audit') { results.push({ name, verdict: 'out-of-scope', reason: 'audit-runner mutation, not covered by this pass' }); continue; }

  const media = unwrapMedia(from);
  const cssText = media ? media.inner : from;
  const decls = asCssDecls(cssText);
  if(!decls){ results.push({ name, verdict: 'out-of-scope', reason: 'from-text is not CSS' }); continue; }

  const idx = html.indexOf(from);
  if(idx < 0){ results.push({ name, verdict: 'unmatched', reason: 'from-text not found in ' + SRC + ' — stale mutation, not this pass\'s concern' }); continue; }
  const before = html.slice(0, idx);
  const after = html.slice(idx + from.length);
  const wholeRest = before + after; // this mutation's own span removed
  /* scoped to the same @media condition when the mutation is itself media-scoped — an
     unconditional match elsewhere in the file never fires under the condition this rule was
     protecting, so it is not a witness for redundancy no matter what it says */
  const rest = (media ? mediaBlocks(wholeRest, media.cond).join(' ') : wholeRest).replace(/\s+/g, ' ');
  const selector = extractSelector(cssText);

  /* a selector match must be ANCHORED at a real rule/selector-list boundary — start of text,
     `{`, `}`, `;`, or `,` — ignoring intervening whitespace. Without this, a search for
     `#hlBar` matches as a bare substring inside `body.dark #hlBar{...}`, a DIFFERENT, more
     specific, dark-mode-scoped rule that provides no protection at all in the light-mode
     scenario an un-anchored match would have wrongly credited as a second implementation. */
  const boundary = '(^|[{};,])\\s*';

  const hits = [];
  for(const { prop, value } of decls){
    const needleDecl = (prop + ':' + value).replace(/\s+/g, ' ');

    const importantRe = new RegExp(boundary + '\\*\\s*\\{[^}]*' +
      needleDecl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*!important');
    const universalImportant = importantRe.test(rest);

    let duplicateSelector = false;
    if(selector){
      const selRe = new RegExp(boundary + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '\\s*\\{[^}]*' + needleDecl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      duplicateSelector = selRe.test(rest);
    }

    if(universalImportant || duplicateSelector){
      hits.push({ decl: needleDecl, universalImportant, duplicateSelector });
    }
  }
  if(hits.length){
    results.push({ name, verdict: 'REDUNDANT-CANDIDATE', hits, selector });
  } else {
    results.push({ name, verdict: 'single-implementation', declCount: decls.length });
  }
}

const redundant = results.filter(r => r.verdict === 'REDUNDANT-CANDIDATE');
const cssChecked = results.filter(r => r.verdict === 'REDUNDANT-CANDIDATE' || r.verdict === 'single-implementation');
const outOfScope = results.filter(r => r.verdict === 'out-of-scope');
const unmatched = results.filter(r => r.verdict === 'unmatched');

console.log(cssChecked.length + ' CSS-shaped mutations checked, ' + outOfScope.length +
  ' out of scope (not CSS), ' + unmatched.length + ' unmatched (stale)');
console.log('');
if(redundant.length){
  console.log(redundant.length + ' REDUNDANT-IMPLEMENTATION candidate(s) — a CAUGHT verdict here proves the');
  console.log('deleted text is gone, not that the app loses the protection the mutation\'s label claims:');
  for(const r of redundant){
    console.log('  ' + r.name + (r.selector ? '  (selector: ' + r.selector + ')' : ''));
    for(const h of r.hits) console.log('    ' + h.decl +
      (h.universalImportant ? '  [also enforced by *{...!important} elsewhere]' : '') +
      (h.duplicateSelector ? '  [same selector repeats this declaration elsewhere]' : ''));
  }
} else {
  console.log('no redundant-implementation candidates found among the CSS-shaped mutations checked.');
}
process.exit(0); // reporting tool, not a gate — see the PR body for why
