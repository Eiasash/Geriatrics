/**
 * Main entry point for the modular build.
 *
 * This file imports CSS and JS modules, then exposes them as globals
 * so the existing monolith HTML (shlav-a-mega.html) continues to work
 * without changes during the migration period.
 *
 * The monolith still contains all rendering logic and DOM manipulation.
 * This module provides the extracted pure-logic layer alongside it.
 */

// ===== CSS imports (Vite handles these) =====
import './styles/base.css';
import './styles/components.css';
import './styles/quiz.css';
import './styles/theme.css';

// ===== JS module imports =====
import * as constants from './core/constants.js';
import * as state from './core/state.js';
import * as storage from './core/storage.js';
import * as quizFilters from './quiz/quiz-filters.js';
import * as quizScoring from './quiz/quiz-scoring.js';
import * as optionShuffle from './quiz/option-shuffle.js';
import * as spacedRep from './sr/spaced-repetition.js';

// ===== Expose modules as globals for gradual migration =====
// The monolith can start using these instead of its inline versions.
window.SlavModules = {
  constants,
  state,
  storage,
  quizFilters,
  quizScoring,
  optionShuffle,
  spacedRep,
};

// Log module load for debugging
console.log(`[Shlav A] Modules loaded (v${constants.APP_VERSION})`);
