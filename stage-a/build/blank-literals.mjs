/* The exact tokenizer from test.mjs's own tautology scanner (line ~4278), copied byte for
 * byte rather than reconstructed from memory — a from-memory rewrite of this dropped the two
 * comment-stripping branches on the first attempt and silently mis-blanked over half the
 * file's ok() calls into invisibility. Never hand-retype this.
 *
 * Extracted to its own module (rather than left inline in allocate-guard-ids.mjs, where it
 * first lived) so a second consumer can import the function without also importing that
 * file's top-level side effects — allocate-guard-ids.mjs reads/parses/(with --write)
 * rewrites test.mjs and guard-ids.json as soon as it is loaded, including a bare
 * `process.exit(0)` on its own dry-run branch, none of which anything importing just the
 * tokenizer wants to trigger.
 */
export function blankLiterals(src){
  const out = src.split('');
  const blank = (a, b) => { for(let i = a; i < b && i < out.length; i++) if(out[i] !== '\n') out[i] = ' '; };
  const KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;
  let i = 0;
  while(i < src.length){
    const c = src[i], c2 = src[i + 1];
    if(c === '/' && c2 === '/'){ let j = src.indexOf('\n', i); if(j < 0) j = src.length; blank(i, j); i = j; continue; }
    if(c === '/' && c2 === '*'){ let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; blank(i, j); i = j; continue; }
    if(c === "'" || c === '"'){
      let j = i + 1; while(j < src.length && src[j] !== c){ if(src[j] === '\\') j++; j++; }
      blank(i, j + 1); i = j + 1; continue;
    }
    if(c === '`'){
      let j = i + 1, depth = 0;
      while(j < src.length){
        if(src[j] === '\\'){ j += 2; continue; }
        if(src[j] === '$' && src[j + 1] === '{'){ depth++; j += 2; continue; }
        if(depth > 0 && src[j] === '}'){ depth--; j++; continue; }
        if(depth === 0 && src[j] === '`') break;
        j++;
      }
      blank(i, j + 1); i = j + 1; continue;
    }
    if(c === '/'){
      const before = out.slice(Math.max(0, i - 16), i).join('').replace(/\s+$/, '');
      if(before === '' || /[(,=:[!&|?{};+\-*%~^]$/.test(before) || KW.test(before)){
        let j = i + 1, inClass = false;
        while(j < src.length && src[j] !== '\n'){
          if(src[j] === '\\'){ j += 2; continue; }
          if(src[j] === '[') inClass = true;
          else if(src[j] === ']') inClass = false;
          else if(src[j] === '/' && !inClass) break;
          j++;
        }
        blank(i, j + 1); i = j + 1; continue;
      }
    }
    i++;
  }
  return out.join('');
}
