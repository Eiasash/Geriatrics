# Shared Engine Architecture — Shlav A Mega + Pnimit Mega

## The Problem

Two 4000-5000 line single-file PWAs with **92% identical code** (150/163 functions).
Every bug fix, every feature addition, every UI tweak is done twice.
Divergence risk grows with each session.

## The Solution

Extract shared logic into `shared/engine.js` that both apps import.
Each app keeps only app-specific config + domain features.

## Code Split Analysis

### Shared Engine (150 functions → `shared/engine.js`)

**Category 1: FSRS / SRS Core** (~200 lines)
- `fsrsInitNew`, `fsrsUpdate`, `fsrsInterval`, `fsrsR`
- `fsrsMigrateFromSM2`, `getDueQuestions`, `fcRate`
- `srScore`, `calcEstScore`

**Category 2: Quiz State Machine** (~400 lines)
- `buildPool`, `buildRescuePool`, `buildMockExamPool`
- `pick`, `next`, `check`, `startExam`, `endExam`
- `startMockExam`, `endMockExam`, `showMockExamResult`
- `startSuddenDeath`, `sdCheck`, `sdNext`
- `startTopicMiniExam`, `endMiniExam`
- `startTimedQ`, `pauseTimed`, `stopTimedMode`
- `isExamTrap`, `isChronicFail`, `showAnswerHardFail`
- `rateConfidence` (currently geri-only, should be shared)

**Category 3: AI Integration** (~250 lines)
- `callAI`, `getApiKey`, `setApiKey`
- `explainWithAI`, `aiAutopsy`, `gradeTeachBack`
- `sendChat`, `clearChat`, `sendChatStarter`
- `submitAskAI`, `toggleAskAI`
- `speakQuestion`, `startVoiceParser`, `startVoiceTeachBack`
- `aiSummarizeChapter`, `addChapterQsToBank`

**Category 4: Analytics & Tracking** (~300 lines)
- `getTopicStats`, `getTopicTrend`, `getWeakTopics`
- `getStudyStreak`, `updateStreak`, `trackDailyActivity`
- `calcEstScore`, `renderPriorityMatrix`
- `saveSessionSummary`, `renderSessionCard`
- `renderExamTrendCard`, `renderDailyPlan`
- `takeWeeklySnapshot`

**Category 5: Data & Storage** (~200 lines)
- `save`, `idbGet`, `idbSet`, `openIDB`, `migrateToIDB`
- `cloudBackup`, `cloudRestore`, `queueBackgroundSync`
- `importProgress`, `exportProgress`, `exportCheatSheet`
- `getDiagnostics`, `copyDiagnostics`

**Category 6: Social & Feedback** (~150 lines)
- `fetchLeaderboard`, `showLeaderboard`, `submitLeaderboardScore`
- `submitReport`, `saveAnswerReport`
- `submitFeedback` / `submitFeedbackForm` (normalize to one)
- `shareApp`, `shareQ`

**Category 7: UI Rendering** (~800 lines)
- `renderTabs`, `renderQuiz`, `renderTrack`, `renderLibrary`
- `renderStudy`, `renderFlash`, `renderDrugs`
- `renderChat`, `renderSearch`, `renderFeedback`
- `renderCalc`, `renderOnCall`, `renderPomoOverlay`
- `renderStudyPlan`, `renderSyllabus`
- `renderWrongAnswerLog`, `renderExplainBox`
- `toggleDark`, `toggleStudyMode`, `toggleBk`
- `showHelp`, `showUpdateBanner`

**Category 8: Utilities** (~100 lines)
- `sanitize`, `fmtT`, `fmtLine`, `fmtBlock`
- `togOT`, `togOck`, `exitO`
- `requestWakeLock`, `scheduleDailyNotification`
- `uploadQImage`, `removeQImage`, `viewImg`

### App-Specific Code

**Geriatrics-only (13 functions):**
- `openHazzardChapter`, `getHazPdf` — Hazzard chapter reader
- `renderEOLTree`, `setEol`, `getEolResult` — End of Life decision tree
- `renderLabOverlay` — Geriatric lab reference with frailty slider
- `renderMedBasket`, `toggleMedBasket`, `calcACBTotal` — Polypharmacy checker
- `renderAgingSheet` — Aging sheet
- `generateQuestionsFromChapter`, `approveGeneratedQ` — In-app question gen
- `getSTOPPWarnings` — STOPP/START warnings (could be shared if pnimit adds)

**Pnimit-only (1 function):**
- `submitFeedbackForm` (rename to `submitFeedback` for parity)

### App-Specific Config

Each app provides a config object:

```javascript
// geriatrics-config.js
export default {
  APP_NAME: 'Shlav A Mega',
  APP_VERSION: '9.30',
  SW_CACHE: 'shlav-a-v9.30',
  LS_KEY: 'samega',
  
  TOPICS: [...],          // 40 topics
  EXAM_FREQ: [...],       // 40 weights
  TOPIC_REF: {...},       // chapter refs
  HAZ_CHAPTERS: {...},    // Hazzard chapter mapping
  STUDY_PLAN: [...],      // study plan tiers
  
  SUPABASE_URL: '...',
  SUPABASE_KEY: '...',
  BACKUP_TABLE: 'samega_backups',
  FEEDBACK_TABLE: 'shlav_feedback',
  LEADERBOARD_TABLE: 'shlav_leaderboard',
  
  AI_PROXY: 'https://toranot.netlify.app/api/claude',
  AI_SECRET: 'shlav-a-mega-1f97f311d307-2026',
  
  FEATURES: {
    hazzardReader: true,
    eolTree: true,
    labReference: true,
    medBasket: true,
    agingSheet: true,
    harrisonReader: true,
    pastExams: false,
    examDateCountdown: true,
    studyPlan: true,
  },
  
  DATA_FILES: [
    'data/questions.json',
    'data/notes.json',
    'data/drugs.json',
    'data/flashcards.json',
    'data/topics.json',
    'data/tabs.json',
    'data/hazzard_chapters.json',
    'harrison_chapters.json',
  ],
};
```

## Migration Strategy

### Phase 1: Extract FSRS (lowest risk, highest test coverage)
- Move FSRS functions to `shared/fsrs.js`
- Import in both apps
- Run existing tests against shared module
- ~200 lines, zero UI coupling

### Phase 2: Extract Data Layer
- `shared/storage.js` (save/load/idb/supabase)
- Parameterize by LS_KEY, table names
- ~200 lines

### Phase 3: Extract AI Client
- `shared/ai.js` (callAI, proxy routing, rate limiting)
- Parameterize by proxy URL/secret
- ~250 lines

### Phase 4: Extract Quiz Engine
- `shared/quiz.js` (state machine, pool building, scoring)
- This is the big one — ~400 lines with most of the logic
- Requires config injection for TOPICS, EXAM_FREQ

### Phase 5: Extract UI Rendering
- `shared/ui.js` (render functions)
- Hardest because of inline event handlers and DOM coupling
- May need to adopt a minimal component pattern

### Risk Mitigation
- Each phase: extract → test → deploy one app → verify → deploy other
- Keep both monolith files working until shared engine is proven
- `shared/` directory at repo root, imported via `<script type="module">`
- Rollback: revert to monolith import if shared engine breaks

## Estimated Effort

| Phase | Lines | Risk | Sessions |
|-------|-------|------|----------|
| FSRS | ~200 | Low | 1 |
| Data Layer | ~200 | Low | 1 |
| AI Client | ~250 | Medium | 1 |
| Quiz Engine | ~400 | Medium | 2 |
| UI Rendering | ~800 | High | 3-4 |
| **Total** | **~1850** | | **8-10** |

After extraction, each app's unique code shrinks to ~500-800 lines
(config + domain features + app-specific renderers).
