/* Structural guard: closes the risk that classifyMutant — the retained, label-keyed
 * classifier in mutants-classify.mjs, kept only for its own extensive coverage and as the
 * one-time "does the red test actually go red on the old path" comparison the review-lane
 * P1 fix asked for — silently becomes a production path again in mutants.mjs.
 *
 * classifyMutant is not deleted: mutants-classify.mjs still exports it, and mutants.mjs's own
 * comments still explain why. That is exactly the exposure. A second, parallel implementation
 * of classification sitting right there, one import away, is precisely the mechanism by which
 * a fixed defect could come back with nothing going red — the id-keyed classifyById is
 * correct, but if a future edit ever calls classifyMutant(...) anywhere mutants.mjs actually
 * acts on the result, every guarantee the P1 fix established is silently gone again, and nothing
 * short of reading the diff by eye would notice.
 *
 * Pure and file-content-based, like everything else in this module family, so it is
 * unit-testable against canned strings (see harness-selftest.mjs) independent of what
 * mutants.mjs currently says — and separately run against the real file on disk, which is
 * what actually enforces it (wired into mutants.mjs's own --static block, the one structural
 * check this repo's CI runs on every push; see that file).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { blankLiterals } from './blank-literals.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* Comments and string/template literals are blanked before the search, not just comments —
 * a superset of what the task asks for ("match with comments stripped") but a safe one: a
 * real classifyMutant( call site is never itself written inside a string or template
 * literal, so blanking those too cannot hide a genuine call, and it additionally stops a
 * line like the ones already in mutants.mjs today ("classifyMutant() requires an exact DONE
 * line") — a comment, but one that happens to spell the name WITH open-close parens right
 * after it — from tripping a naive un-stripped search. */
export function assertNoProductionClassifyMutant(mutantsSrc){
  const blanked = blankLiterals(mutantsSrc);
  const re = /classifyMutant\s*\(/g;
  const hits = [];
  let m;
  while ((m = re.exec(blanked))) hits.push(m.index);
  return hits.length
    ? { ok: false, hits, reason: hits.length + ' call site(s) of classifyMutant( outside any comment or string' }
    : { ok: true, hits: [] };
}

/* The live check: reads the real mutants.mjs (or another file, for the mutation-tested
 * self-check below) from disk and runs the pure assertion above against it. */
export function assertMutantsFileIsClean(file = path.join(HERE, 'mutants.mjs')){
  return assertNoProductionClassifyMutant(fs.readFileSync(file, 'utf8'));
}
