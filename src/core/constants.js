/**
 * Application constants — single source of truth.
 * These MUST stay in sync with the monolith until full migration.
 */

export const APP_VERSION = '9.45';

export const LS_KEY = 'samega';
export const LS_KEY_EX = 'samega_ex';
export const LS_KEY_APIKEY = 'samega_apikey';
export const LS_KEY_PENDING = 'samega_pending_qs';
export const LS_KEY_CUSTOM = 'samega_custom_qs';
export const LS_KEY_DEVID = 'samega_devid';
export const LS_KEY_WEEKLY = 'samega_weekly';
export const LS_KEY_SD_LB = 'sd_lb';

export const IDB_NAME = 'shlav_mega_db';
export const IDB_VER = 1;
export const IDB_STORE = 'state';

export const STATE_VERSION = 1;

/** 40 topics indexed 0–39, matches data/topics.json ordering */
export const TOPIC_NAMES = [
  'Biology of Aging', 'Demography', 'CGA', 'Frailty',
  'Falls', 'Delirium', 'Dementia', 'Depression',
  'Polypharmacy/Beers', 'Nutrition', 'Pressure Injuries', 'Urinary Incontinence',
  'Constipation', 'Sleep', 'Pain', 'Osteoporosis',
  'OA', 'CVD', 'HF', 'HTN',
  'Stroke', 'COPD', 'DM', 'Thyroid',
  'CKD', 'Anemia', 'Cancer', 'Infections',
  'Palliative', 'Ethics', 'Elder Abuse', 'Fitness to Drive',
  'Guardianship', 'Patient Rights', 'Advance Directives', 'Community Care',
  'Rehab/FIM', 'Vision/Hearing', 'Perioperative', 'Geriatric Emergency',
];

/** IMA syllabus weights (approximate % from P005-2026) */
export const IMA_WEIGHTS = [
  5, 3, 6, 5, 8, 8, 10, 5, 7, 4, 4, 5, 3, 3, 5, 5,
  4, 6, 5, 4, 5, 4, 5, 3, 4, 3, 4, 5, 6, 5, 4, 3,
  3, 3, 3, 4, 3, 3, 4, 3,
];

/** Historical exam question frequency per topic (used by calcEstScore) */
export const EXAM_FREQ = [
  0, 34, 30, 28, 36, 43, 178, 39, 63, 36, 20, 27, 19, 22, 50, 40,
  22, 94, 70, 78, 18, 80, 43, 21, 46, 27, 29, 52, 10, 11, 7, 0,
  6, 9, 26, 19, 23, 9, 17, 0,
];
