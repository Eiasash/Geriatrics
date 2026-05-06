/**
 * Tests for multi-axis filter system shipped across v10.64.51 → v10.64.57.
 *
 * v10.64.51 — multi-select topic pills (selectedTopics Set + toggleTopic + buildPool branch)
 * v10.64.51 — multi-year mock picker (startMockExamByTags helper for pooling across years)
 * v10.64.55 — clinical-category TOPIC_GROUPS + toggleTopicGroup + year preset pills
 *             (setExamYearsPreset for 'basic' / 'subspec' / 'latest')
 * v10.64.56 — year × topic intersection (toggle helpers preserve the other selection;
 *             buildPool branches AND with the cross-axis filter)
 * v10.64.57 — faceted pill counts (_topicCounts narrows with selectedExamYears,
 *             _yearCounts narrows with selectedTopics)
 *
 * These tests pin the current shipped bytes so a refactor that breaks the
 * intersection semantics or the faceted counts fails CI before deploy.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const questions = JSON.parse(readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'));

// Pull literals out of the source so tests stay current as code changes.
// Use new Function() since the source uses single quotes (valid JS, not JSON).
const TOPICS_LINE = html.match(/^const TOPICS=\[(.+?)\];/m);
const TOPICS = TOPICS_LINE ? new Function('return [' + TOPICS_LINE[1] + ']')() : null;
const EXAM_YEARS_LINE = html.match(/^const EXAM_YEARS=\[(.+?)\];/m);
const EXAM_YEARS = EXAM_YEARS_LINE ? new Function('return [' + EXAM_YEARS_LINE[1] + ']')() : null;

describe('v10.64.51-57 — multi-axis filter system', () => {

  describe('TOPICS + EXAM_YEARS literals are well-formed', () => {
    it('TOPICS array extracts to 46 entries', () => {
      expect(TOPICS).toBeTruthy();
      expect(TOPICS.length).toBe(46);
    });

    it('EXAM_YEARS array extracts to 13 entries', () => {
      expect(EXAM_YEARS).toBeTruthy();
      expect(EXAM_YEARS.length).toBe(13);
    });

    it('every EXAM_YEARS tag exists in actual question data', () => {
      const realTags = new Set(questions.map(q => q.t));
      const missing = EXAM_YEARS.filter(y => !realTags.has(y));
      expect(missing, `EXAM_YEARS contains stale tags: ${missing.join(', ')}`).toEqual([]);
    });
  });

  describe('TOPIC_GROUPS (v10.64.55) clinical-category structure', () => {
    let groups;
    it('TOPIC_GROUPS literal is parseable + has 12 categories', () => {
      const m = html.match(/^const TOPIC_GROUPS=\[([\s\S]+?)\];/m);
      expect(m, 'TOPIC_GROUPS const not found').toBeTruthy();
      // Eval as JS literal — safe since we're reading our own source bytes.
      groups = new Function('return [' + m[1] + ']')();
      expect(groups.length).toBe(12);
    });

    it('every group has title + emoji + tis array', () => {
      const m = html.match(/^const TOPIC_GROUPS=\[([\s\S]+?)\];/m);
      groups = new Function('return [' + m[1] + ']')();
      groups.forEach((g, i) => {
        expect(typeof g.title).toBe('string');
        expect(typeof g.emoji).toBe('string');
        expect(Array.isArray(g.tis)).toBe(true);
        expect(g.tis.length, `group ${i} (${g.title}) has empty tis`).toBeGreaterThan(0);
      });
    });

    it('every TOPICS index 0-45 appears in exactly one group', () => {
      const m = html.match(/^const TOPIC_GROUPS=\[([\s\S]+?)\];/m);
      groups = new Function('return [' + m[1] + ']')();
      const seen = new Map();
      groups.forEach((g, gi) => {
        g.tis.forEach(ti => {
          if (seen.has(ti)) {
            throw new Error(`ti=${ti} (${TOPICS[ti]}) appears in groups ${seen.get(ti)} and ${gi}`);
          }
          seen.set(ti, gi);
        });
      });
      // Every ti 0-45 should be in some group
      for (let ti = 0; ti < TOPICS.length; ti++) {
        expect(seen.has(ti), `ti=${ti} (${TOPICS[ti]}) missing from all groups`).toBe(true);
      }
    });

    it('every group ti is within TOPICS bounds (0..length-1)', () => {
      const m = html.match(/^const TOPIC_GROUPS=\[([\s\S]+?)\];/m);
      groups = new Function('return [' + m[1] + ']')();
      groups.forEach(g => {
        g.tis.forEach(ti => {
          expect(ti).toBeGreaterThanOrEqual(0);
          expect(ti).toBeLessThan(TOPICS.length);
        });
      });
    });
  });

  describe('selectedTopics + selectedExamYears state + persistence (v10.64.51, v10.64.56)', () => {
    it('selectedTopics is initialized as a Set hydrated from samega_topic_filter', () => {
      expect(html).toContain("localStorage.getItem('samega_topic_filter')");
      expect(html).toMatch(/let selectedTopics\s*=\s*\(function\(\)/);
    });

    it('selectedExamYears uses samega_exam_filter localStorage key', () => {
      expect(html).toContain("localStorage.getItem('samega_exam_filter')");
      expect(html).toMatch(/let selectedExamYears\s*=\s*\(function\(\)/);
    });

    it('saveTopicFilter + saveExamYears persist to localStorage', () => {
      expect(html).toContain('saveTopicFilter');
      expect(html).toContain('saveExamYears');
      expect(html).toMatch(/localStorage\.setItem\('samega_topic_filter',/);
      expect(html).toMatch(/localStorage\.setItem\('samega_exam_filter',/);
    });
  });

  describe('toggle helpers preserve the other selection (v10.64.56 intersection fix)', () => {
    // The chaos-tested mutual-exclusion bug — toggleTopic used to clear
    // selectedExamYears (and vice versa). v10.64.56 removed those clears so
    // year × topic intersect.
    it('toggleTopic does NOT call selectedExamYears.clear()', () => {
      const fn = html.match(/function toggleTopic\(ti\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'toggleTopic not found').toBeTruthy();
      expect(fn[0]).not.toContain('selectedExamYears.clear()');
    });

    it('toggleTopicGroup does NOT call selectedExamYears.clear()', () => {
      const fn = html.match(/function toggleTopicGroup\([\s\S]+?\n\}/);
      expect(fn, 'toggleTopicGroup not found').toBeTruthy();
      expect(fn[0]).not.toContain('selectedExamYears.clear()');
    });

    it('toggleExamYear does NOT call selectedTopics.clear()', () => {
      const fn = html.match(/function toggleExamYear\(year\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'toggleExamYear not found').toBeTruthy();
      expect(fn[0]).not.toContain('selectedTopics.clear()');
    });

    it('setExamYearsPreset does NOT call selectedTopics.clear()', () => {
      const fn = html.match(/function setExamYearsPreset\(preset\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'setExamYearsPreset not found').toBeTruthy();
      expect(fn[0]).not.toContain('selectedTopics.clear()');
    });
  });

  describe('buildPool branches intersect year × topic (v10.64.56)', () => {
    // The actual intersection logic — ensure each branch checks the
    // cross-axis filter when active.
    it("filt='topics' branch intersects with selectedExamYears", () => {
      const branch = html.match(/else\s+if\(filt==='topics'&&selectedTopics\.size\)\{[\s\S]+?\n\s*\}/);
      expect(branch, "filt='topics' branch not found").toBeTruthy();
      expect(branch[0]).toContain('selectedExamYears.size');
      expect(branch[0]).toContain('selectedExamYears.has(q.t)');
    });

    it("filt='topic' (single) branch intersects with selectedExamYears", () => {
      const branch = html.match(/else\s+if\(filt==='topic'&&topicFilt>=0\)\{[\s\S]+?\n\s*\}/);
      expect(branch, "filt='topic' branch not found").toBeTruthy();
      expect(branch[0]).toContain('selectedExamYears.size');
      expect(branch[0]).toContain('selectedExamYears.has(q.t)');
    });

    it("filt='years' branch intersects with selectedTopics", () => {
      const branch = html.match(/else\s+if\(filt==='years'&&selectedExamYears\.size\)\{[\s\S]+?\n\s*\}/);
      expect(branch, "filt='years' branch not found").toBeTruthy();
      expect(branch[0]).toContain('selectedTopics.size');
    });
  });

  describe('faceted pill counts (v10.64.57)', () => {
    it('_topicCounts respects selectedExamYears (year filter narrows topic counts)', () => {
      // Block: const _topicCounts={}; QZ.forEach(...selectedExamYears...)
      expect(html).toMatch(/_topicCounts\s*=\s*\{\s*\}\s*;\s*QZ\.forEach\([\s\S]{0,400}selectedExamYears\.has\(q\.t\)/);
    });

    it('_yearCounts respects selectedTopics (topic filter narrows year counts)', () => {
      expect(html).toMatch(/_yearCounts\s*=\s*\{\s*\}\s*;\s*QZ\.forEach\([\s\S]{0,500}selectedTopics\.has/);
    });

    it('_topicCounts respects _topicSrcMatch (source filter)', () => {
      expect(html).toMatch(/_topicCounts\s*=\s*\{\s*\}\s*;\s*QZ\.forEach\([\s\S]{0,300}_topicSrcMatch\(q\)/);
    });

    it('_yearCounts respects _topicSrcMatch (source filter)', () => {
      expect(html).toMatch(/_yearCounts\s*=\s*\{\s*\}\s*;\s*QZ\.forEach\([\s\S]{0,500}_topicSrcMatch\(q\)/);
    });
  });

  describe('year preset pills (v10.64.55)', () => {
    it('Basic preset pill is wired to setExamYearsPreset(\'basic\')', () => {
      expect(html).toContain("setExamYearsPreset('basic')");
    });

    it('Subspec preset pill is wired to setExamYearsPreset(\'subspec\')', () => {
      expect(html).toContain("setExamYearsPreset('subspec')");
    });

    it('Latest preset pill is wired to setExamYearsPreset(\'latest\')', () => {
      expect(html).toContain("setExamYearsPreset('latest')");
    });

    it('setExamYearsPreset auto-detects max year from EXAM_YEARS', () => {
      const fn = html.match(/function setExamYearsPreset[\s\S]+?\n\}/);
      expect(fn[0]).toMatch(/Math\.max\(\.\.\.EXAM_YEARS\.map\(y=>parseInt\(y,10\)\)/);
    });
  });

  describe('multi-year mock picker (v10.64.51)', () => {
    it('startMockExamByTags helper exists and pools across multiple years', () => {
      const fn = html.match(/function startMockExamByTags\(tags\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'startMockExamByTags not found').toBeTruthy();
      expect(fn[0]).toContain('new Set(tags)');
      expect(fn[0]).toContain('set.has(q.t)');
    });

    it('startMockExamByTags falls through to single-tag for length===1', () => {
      const fn = html.match(/function startMockExamByTags\(tags\)\s*\{[\s\S]+?\n\}/);
      expect(fn[0]).toContain('startMockExamByTag(tags[0])');
    });

    it('showMockExamPicker uses dynamic EXAM_YEARS not a stale local list', () => {
      const fn = html.match(/function showMockExamPicker\(\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'showMockExamPicker not found').toBeTruthy();
      expect(fn[0]).toContain('EXAM_YEARS.includes(q.t)');
      expect(fn[0]).toContain('EXAM_YEARS.filter');
      // Should NOT have a stale hardcoded list inside (that was the v10.64.51 bug)
      expect(fn[0]).not.toMatch(/EXAM_TAGS\s*=\s*\[/);
    });
  });

  describe('api-key cloud sync (v10.64.48 + v10.64.50)', () => {
    it('cloudBackup payload bundle includes _apikey field', () => {
      const fn = html.match(/async function cloudBackup\(\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'cloudBackup not found').toBeTruthy();
      expect(fn[0]).toContain('_apikey');
      expect(fn[0]).toContain('getApiKey()');
    });

    it('applyRestorePayload restores _apikey via setApiKey', () => {
      const fn = html.match(/function applyRestorePayload\(rowData\)\s*\{[\s\S]+?\n\}/);
      expect(fn, 'applyRestorePayload not found').toBeTruthy();
      expect(fn[0]).toContain('rowData._apikey');
      expect(fn[0]).toContain('setApiKey');
    });

    it("_doLogin reads api_key from auth_login_user response (v10.64.50)", () => {
      // The response is named `r` and we call setApiKey(r.api_key) on success.
      // Slice from `_doLogin` to the next function declaration to capture the
      // whole body (the non-greedy `.+?\n\s*\}` would stop at the first `}`
      // which is inside an if-block, not the function end).
      const start = html.indexOf('async function _doLogin()');
      expect(start, '_doLogin not found').toBeGreaterThan(-1);
      const next = html.indexOf('function _doRegister', start);
      const body = html.slice(start, next);
      expect(body).toContain('r.api_key');
      expect(body).toContain('setApiKey');
    });
  });

  describe('UI integrity — group rendering iterates TOPIC_GROUPS', () => {
    it('topic pill render block uses TOPIC_GROUPS.forEach', () => {
      // The grouped pill rendering replaced the flat TOPICS.forEach.
      expect(html).toMatch(/TOPIC_GROUPS\.forEach\(grp=>\{/);
    });

    it('group header has clickable toggleTopicGroup wiring', () => {
      expect(html).toContain('toggleTopicGroup(${grp.tis.join(\',\')})');
    });

    it('group hides when no member has Qs in current source filter', () => {
      // Defensive empty-group hide: `if(!_hasAny)return;`
      expect(html).toMatch(/_hasAny=grp\.tis\.some/);
      expect(html).toMatch(/if\(!_hasAny\)return;/);
    });
  });
});
