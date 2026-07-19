// Dopamodoro Mobile — main app controller
// Adapts the extension code for a Capacitor Android shell.
// • No service worker — timer runs in-app + local notifications for completion.
// • chrome.storage.local → Capacitor Preferences (with localStorage dev fallback).
// • chrome.notifications → Capacitor LocalNotifications.

// ==================== CAPACITOR PLUGIN ACCESS ====================
// In the WebView, plugins are on window.Capacitor.Plugins.
// In a plain browser (dev), they're undefined — we fall back to localStorage.
const cap = (typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null;
const Plugins = cap?.Plugins || {};
const Preferences = Plugins.Preferences;
const LocalNotifications = Plugins.LocalNotifications;
const Haptics = Plugins.Haptics;
const StatusBar = Plugins.StatusBar;
const App = Plugins.App;

const isNative = !!cap?.isNativePlatform?.();

// ==================== STORAGE WRAPPER ====================
const STORAGE_KEY = 'dopamodoroState';

async function storageGet() {
  if (Preferences) {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return value ? JSON.parse(value) : null;
  }
  // Browser dev fallback
  const v = localStorage.getItem(STORAGE_KEY);
  return v ? JSON.parse(v) : null;
}

async function storageSet(state) {
  if (Preferences) {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(state) });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

// billing.js (Google Play Billing) flips Pro through this event — keep the
// in-memory state + UI in sync the moment a purchase or restore completes.
document.addEventListener('dopamodoro-pro-changed', (e) => {
  if (typeof state === 'undefined' || !state) return;
  state.isPremium = !!(e.detail && e.detail.isPro);
  storageSet(state);
  try { renderAll(); } catch {}
});

// ==================== BESPOKE ICON SET ====================
// Original line-glyphs (currentColor, 1em) — no stock emoji anywhere in the UI.
// icon(name) returns inline SVG markup; hydrateIcons() fills [data-ic] in the HTML.
const IC_P = {
  tomato:   '<path d="M12 8c-3.2 0-6 2.4-6 6.2C6 18 8.7 21 12 21s6-3 6-6.8C18 10.4 15.2 8 12 8Z" fill="currentColor" stroke="none"/><path d="M12 8c0-2 .8-3.6 3-4.2M12 8c-1.2-1.4-3-1.6-4.5-1" fill="none"/>',
  timer:    '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9.5 3h5M18.5 6.5l1.5-1.5"/>',
  check2:   '<path d="M20 6 9 17l-5-5"/>',
  book:     '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v15H6a2 2 0 0 0-2 2Z"/><path d="M4 5.5V19"/>',
  spark:    '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3Z" fill="currentColor" stroke="none"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor" stroke="none"/>',
  gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  target:   '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  flame:    '<path d="M12 3c1.2 3-2.8 4.3-2.8 8a2.8 2.8 0 0 0 5.6 0c0-.9-.5-1.6-.5-2.5 1.8 1.2 3.7 3.8 3.7 6.5a6 6 0 1 1-12 0C6 9.5 9.2 8.2 12 3Z"/>',
  star:     '<path d="M12 3l2.5 5.8 6.3.6-4.8 4.2 1.5 6.2L12 16.9 6.5 20l1.5-6.2L3.2 9.4l6.3-.6Z"/>',
  pin:      '<path d="M9 3h6l-1 5 3 3v2h-5v6l-1 2-1-2v-6H4v-2l3-3Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  home:     '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
  palette:  '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.4-1.2.5-2.1 1.7-2.1H17a4 4 0 0 0 4-4c0-5-4-8-9-8Z"/><circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10.5" r="1" fill="currentColor" stroke="none"/>',
  pulse:    '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  rocket:   '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 13l-2 2M15 9c3-3 5-3 6-3 0 1 0 3-3 6-2 2-5 3-7 3l-2-2c0-2 1-5 3-7Z"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/>',
  seedling: '<path d="M12 21v-8M12 13c0-3-2-5-5-5 0 3 2 5 5 5ZM12 12c0-3 2-4 5-4 0 3-2 4-5 4Z"/>',
  bolt:     '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  crown:    '<path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 11h-13Z"/>',
  trophy:   '<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6"/>',
  grid:     '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  folder:   '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  moon:     '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  sunrise:  '<path d="M4 16h16M7 16a5 5 0 0 1 10 0M12 3v3M4.5 8.5 6 10M19.5 8.5 18 10M2 20h20"/>',
  bell:     '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/>',
  share:    '<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><path d="M8.2 10.9 14.8 7.1M8.2 13.1l6.6 3.8"/>',
  pencil:   '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="M13.5 6.5l3 3"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  trash:    '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13h10l1-13"/>',
  chat:     '<path d="M4 5h16v11H8l-4 4Z"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  leaf:     '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14ZM5 19c3-5 7-8 11-9"/>',
  coffee:   '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M6 3v2M10 3v2M14 3v2"/>',
  warning:  '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
  faceSad:  '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 16c1-1.5 2-2 3.5-2s2.5.5 3.5 2"/>',
  faceMeh:  '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 15h7"/>',
  faceGood: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 14c1 1.5 2 2 3.5 2s2.5-.5 3.5-2"/>',
  faceGreat:'<circle cx="12" cy="12" r="9"/><path d="M8.5 9.5h.01M15.5 9.5h.01M7.5 13a4.5 4.5 0 0 0 9 0Z"/>'
};
function icon(name, cls) {
  const p = IC_P[name];
  if (!p) return '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// Fill static HTML placeholders: <span class="ic-slot" data-ic="name"></span>
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-ic]').forEach(el => {
    const name = el.dataset.ic;
    if (el.dataset.icDone === name) return;   // idempotent
    el.innerHTML = icon(name);
    el.dataset.icDone = name;
  });
}

// ==================== DEFAULT STATE ====================
const DEFAULT_GOALS = [
  { id: 'focus',    name: 'Stay Focused',     icon: 'target' },
  { id: 'learning', name: 'Learn & Grow',     icon: 'book' },
  { id: 'creative', name: 'Creative Work',    icon: 'palette' },
  { id: 'fitness',  name: 'Health & Fitness', icon: 'pulse' },
  { id: 'side',     name: 'Side Project',     icon: 'rocket' },
  { id: 'career',   name: 'Career Growth',    icon: 'briefcase' },
  { id: 'admin',    name: 'Admin & Chores',   icon: 'grid' }
];

let state = {
  mode: 'work',
  isRunning: false,
  isPaused: false,
  sessionStartTime: null,
  sessionDuration: 25 * 60,
  pausedTimeLeft: null,
  sessionCount: 0,
  todayCount: 0,
  totalTomatoes: 0,
  focusHours: {},           // histogram hour(0-23) → sessions, powers the daily nudge
  lastSessionDate: null,
  level: 1,
  experience: 0,
  streak: 0,
  longestStreak: 0,
  tomatoCoins: 0,
  settings: {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartWork: false,
    notificationsEnabled: true,
    hapticsEnabled: true
  },
  achievements: {},
  goals: DEFAULT_GOALS.slice(),
  activeGoal: null,
  currentTasks: [],
  clients: [],
  sessionHistory: [],
  todayBreaks: 0,
  recentTasks: [],
  todos: [],
  todoGroups: [],
  reminders: [],
  northStarGoal: null,
  dayReflections: {},
  dailySummaries: {},
  onboardingDone: false,
  isPremium: false
};

// ==================== LEVEL TITLES ====================
const LEVEL_TITLES = [
  { min: 1,  name: 'Sprout',             icon: 'seedling' },
  { min: 2,  name: 'Spark',              icon: 'spark' },
  { min: 3,  name: 'Tomato Picker',      icon: 'tomato' },
  { min: 5,  name: 'Focus Forager',      icon: 'flame' },
  { min: 8,  name: 'Deep Worker',        icon: 'bolt' },
  { min: 12, name: 'Momentum Maker',     icon: 'rocket' },
  { min: 17, name: 'Hyperfocus Knight',  icon: 'target' },
  { min: 23, name: 'Focus Sage',         icon: 'trophy' },
  { min: 35, name: 'Deep Work Master',   icon: 'crown' },
  { min: 50, name: 'Dopamodoro Legend',  icon: 'star' }
];
function levelTitle(lvl) {
  let cur = LEVEL_TITLES[0];
  LEVEL_TITLES.forEach(t => { if (t.min <= lvl) cur = t; });
  return cur;
}

// ==================== ACHIEVEMENTS ====================
const ACHIEVEMENTS = [
  { id: 'first',    title: 'First Tomato',   desc: 'Finish your first session',  icon: 'tomato', max: 1,   get: s => Math.min(s.totalTomatoes, 1) },
  { id: 'level10',  title: 'Level 10',        desc: 'Reach level 10',             icon: 'star', max: 10,  get: s => Math.min(s.level, 10) },
  { id: 'century',  title: 'Century Club',    desc: 'Complete 100 sessions',      icon: 'trophy', max: 100, get: s => Math.min(s.totalTomatoes, 100) },
  { id: 'level20',  title: 'Level 20',        desc: 'Reach level 20',             icon: 'bolt', max: 20,  get: s => Math.min(s.level, 20) },
  { id: 'week7',    title: 'Week Warrior',    desc: '7-day focus streak',         icon: 'flame', max: 7,   get: s => Math.min(s.streak, 7) },
  { id: 'legend250',title: 'Focus Legend',    desc: 'Complete 250 sessions',      icon: 'crown', max: 250, get: s => Math.min(s.totalTomatoes, 250) },
  { id: 'streak30', title: 'Month of Fire',   desc: '30-day streak',              icon: 'rocket', max: 30,  get: s => Math.min(s.streak, 30) },
  { id: 'toms500',  title: 'Harvest Master',  desc: '500 sessions completed',     icon: 'star', max: 500, get: s => Math.min(s.totalTomatoes, 500) },
];

// ==================== STATE LOAD + SAVE ====================
async function loadState() {
  const saved = await storageGet();
  if (saved) {
    state = { ...state, ...saved };
    // Migrate
    if (!Array.isArray(state.goals) || !state.goals.length) state.goals = DEFAULT_GOALS.slice();
    if (!Array.isArray(state.currentTasks)) state.currentTasks = [];
    // Today's Focus entries are { name, groupId, clientId }
    state.currentTasks = state.currentTasks
      .map(t => typeof t === 'string'
        ? { name: t, groupId: null, clientId: null }
        : { name: t.name || '', groupId: t.groupId || null, clientId: t.clientId || null })
      .filter(t => t.name);
    if (!Array.isArray(state.clients)) state.clients = [];
    if (!Array.isArray(state.sessionHistory)) state.sessionHistory = [];
    if (!Array.isArray(state.todos)) state.todos = [];
    if (!Array.isArray(state.todoGroups)) state.todoGroups = [];
    state.todos.forEach(t => {
      if (typeof t.priority !== 'number') t.priority = 3;
      if (!Array.isArray(t.notes)) t.notes = [];
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      if (t.dueDate === undefined) t.dueDate = null;
      if (t.groupId === undefined) t.groupId = null;
    });
    if (!state.dayReflections || typeof state.dayReflections !== 'object') state.dayReflections = {};
    if (!state.dailySummaries || typeof state.dailySummaries !== 'object') state.dailySummaries = {};
    if (!Array.isArray(state.reminders)) state.reminders = [];
  }

  // If a timer was running when app last closed, recompute time-left
  if (state.isRunning && state.sessionStartTime) {
    const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const timeLeft = state.sessionDuration - elapsed;
    if (timeLeft <= 0) {
      // Session completed while app was closed
      await handleTimerComplete();
    }
  }
}

let saveTimer = null;
function saveStateDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storageSet(state), 200);
}

// ==================== TIMER LOGIC ====================
function computeTimeLeft() {
  if (!state.isRunning) {
    if (state.isPaused && state.pausedTimeLeft != null) return state.pausedTimeLeft;
    return state.sessionDuration;
  }
  const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
  return Math.max(0, state.sessionDuration - elapsed);
}

function getTotalForMode(mode) {
  switch (mode) {
    case 'work':       return state.settings.workDuration * 60;
    case 'shortBreak': return state.settings.shortBreakDuration * 60;
    case 'longBreak':  return state.settings.longBreakDuration * 60;
    default:           return 25 * 60;
  }
}

async function startTimer(overrideSeconds) {
  const seconds = overrideSeconds != null
    ? overrideSeconds
    : (state.isPaused && state.pausedTimeLeft != null
        ? state.pausedTimeLeft
        : getTotalForMode(state.mode));

  state.isRunning = true;
  state.isPaused = false;
  state.sessionStartTime = Date.now();
  state.sessionDuration = seconds;
  state.pausedTimeLeft = null;

  await scheduleCompletionNotification(seconds);
  showOngoingNotification();
  saveStateDebounced();
  renderAll();
  haptic('light');
}

// "Just start": the ADHD task-initiation escape hatch. One tap → a 2-minute work
// session, no duration to pick, no task required. A short guaranteed win beats a
// perfect plan you never begin. It still counts as a full focus session (tomato +
// streak), so the reward loop fires and momentum carries into more.
async function justStart() {
  if (state.isRunning) return;
  state.mode = 'work';
  state.isPaused = false;
  state.pausedTimeLeft = null;
  await startTimer(2 * 60);
  haptic('medium');
  toast('2 minutes. Just begin — that’s the whole job.');
}

async function pauseTimer() {
  if (!state.isRunning) return;
  state.pausedTimeLeft = computeTimeLeft();
  state.isRunning = false;
  state.isPaused = true;
  state.sessionStartTime = null;
  await cancelCompletionNotification();
  showOngoingNotification();
  saveStateDebounced();
  renderAll();
  haptic('light');
}

async function resetTimer() {
  state.isRunning = false;
  state.isPaused = false;
  state.sessionStartTime = null;
  state.pausedTimeLeft = null;
  state.sessionDuration = getTotalForMode(state.mode);
  await cancelCompletionNotification();
  await cancelOngoingNotification();
  saveStateDebounced();
  renderAll();
  haptic('medium');
}

async function switchMode(mode) {
  if (state.isRunning || state.isPaused) {
    toast('End or reset the timer first');
    return;
  }
  state.mode = mode;
  state.sessionDuration = getTotalForMode(mode);
  saveStateDebounced();
  renderAll();
}

async function handleTimerComplete() {
  state.isRunning = false;
  state.isPaused = false;
  state.sessionStartTime = null;
  state.pausedTimeLeft = null;
  await cancelCompletionNotification();
  await cancelOngoingNotification();

  if (state.mode === 'work') {
    state.sessionCount++;
    state.todayCount++;
    state.totalTomatoes++;
    // Learn when they actually focus, so the daily nudge is personal (not a 9am blast).
    const _fh = new Date().getHours();
    state.focusHours = state.focusHours || {};
    state.focusHours[_fh] = (state.focusHours[_fh] || 0) + 1;
    state.tomatoCoins += 10;
    state.experience += 25;
    if (state.experience >= state.level * 100) {
      state.experience -= state.level * 100;
      state.level++;
    }
    // Streak
    const today = new Date().toDateString();
    if (state.lastSessionDate !== today) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (state.lastSessionDate === yesterday.toDateString()) state.streak++;
      else if (!state.lastSessionDate) state.streak = 1;
      else state.streak = 1;
      state.lastSessionDate = today;
      if (state.streak > state.longestStreak) state.longestStreak = state.streak;
    }
    // Log session
    const goal = state.goals.find(g => g.id === state.activeGoal);
    state.sessionHistory.push({
      id: Date.now().toString(),
      ts: new Date().toISOString(),
      date: new Date().toDateString(),
      task: state.currentTasks.map(ctName).join(' · '),
      tasks: state.currentTasks.map(ctName),
      taskMeta: state.currentTasks.map(t => ({ name: ctName(t), groupId: ctGroup(t), clientId: (t && t.clientId) || null })),
      goalId: state.activeGoal,
      goalName: goal?.name || '',
      goalIcon: goal?.icon || '',
      durationMin: state.settings.workDuration,
      type: 'work'
    });
    if (state.sessionHistory.length > 2000) state.sessionHistory = state.sessionHistory.slice(-2000);

    // Next mode
    if (state.sessionCount % state.settings.longBreakInterval === 0) state.mode = 'longBreak';
    else state.mode = 'shortBreak';
    state.sessionDuration = getTotalForMode(state.mode);

    // Queue a "what did you finish?" review of the tasks you were focusing on
    if (state.currentTasks.length) state.pendingReviewTasks = state.currentTasks.map(ctName);

    toast(`Session complete — +10 tomatoes`);
    haptic('heavy');
    fireCompletionNotification('Focus session complete!', `Take a ${state.mode === 'longBreak' ? 'long' : 'short'} break.`);

    // Soft, once-only Pro moments — after the value is felt, never before.
    // If no paywall fired, consider inviting a Play Store rating.
    if (!maybePaywallMoment()) setTimeout(maybeRatePrompt, 1200);

    if (state.settings.autoStartBreaks) {
      setTimeout(startTimer, 800);
    }
  } else {
    // Break complete
    state.todayBreaks = (state.todayBreaks || 0) + 1;
    state.sessionHistory.push({
      id: Date.now().toString(),
      ts: new Date().toISOString(),
      date: new Date().toDateString(),
      task: '',
      durationMin: state.mode === 'longBreak' ? state.settings.longBreakDuration : state.settings.shortBreakDuration,
      type: state.mode
    });
    state.mode = 'work';
    state.sessionDuration = getTotalForMode('work');
    toast('Break over — ready to focus?');
    haptic('medium');
    fireCompletionNotification('Break over', 'Time to focus again.');
    if (state.settings.autoStartWork) {
      setTimeout(startTimer, 800);
    }
  }

  saveStateDebounced();
  renderAll();
  syncStreakReminder();   // today is now safe → cancels tonight's nudge
  syncDailyStartNudge();  // re-learn their focus hour, re-arm the daily cue
  maybeOpenTaskReview();
}

// ==================== PRO MOMENTS (contextual, once-only) ====================
// The paywall only appears AFTER the user has felt the value — never upfront.
function maybePaywallMoment() {
  if (!window.Billing || window.Billing.isPro()) return false;
  state._paywallSeen = state._paywallSeen || {};
  // After the 3rd focus session — the loop has clicked.
  if (state.sessionCount >= 3 && !state._paywallSeen.session3) {
    state._paywallSeen.session3 = true;
    saveStateDebounced();
    setTimeout(() => window.Billing.openPaywall('session3'), 1200);
    return true;
  }
  // A 5-day streak worth protecting with a Streak Freeze.
  if ((state.streak || 0) >= 5 && !state._paywallSeen.streak5) {
    state._paywallSeen.streak5 = true;
    saveStateDebounced();
    setTimeout(() => window.Billing.openPaywall('streak5'), 1200);
    return true;
  }
  return false;
}

// After the app has clearly earned it, invite a Play Store rating. Uses the
// native in-app review API if the plugin is present, else opens the listing.
const PLAY_ID = 'app.dopamodoro.android';
function maybeRatePrompt() {
  state._ratePrompted = state._ratePrompted || false;
  if (state._ratePrompted) return;
  if ((state.totalTomatoes || 0) < 5) return;      // only ask happy, engaged users
  if (document.querySelector('.pw-overlay.open')) return;  // don't collide with paywall
  state._ratePrompted = true;
  saveStateDebounced();

  const ov = document.createElement('div');
  ov.className = 'rate-overlay';
  ov.innerHTML = `
    <div class="rate-card">
      <div class="rate-title">Enjoying Dopamodoro?</div>
      <div class="rate-sub">You've finished ${state.totalTomatoes} focus sessions. A quick rating helps other ADHD brains find it.</div>
      <button class="rate-yes">Rate on Google Play</button>
      <button class="rate-no">Not now</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));
  const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 250); };
  ov.querySelector('.rate-no').addEventListener('click', close);
  ov.querySelector('.rate-yes').addEventListener('click', async () => {
    close();
    try {
      // Native in-app review (if @capacitor-community/in-app-review is installed)
      const InAppReview = window.Capacitor?.Plugins?.InAppReview;
      if (InAppReview?.requestReview) { await InAppReview.requestReview(); return; }
    } catch (e) { /* fall through to store listing */ }
    const url = isNative ? `market://details?id=${PLAY_ID}` : `https://play.google.com/store/apps/details?id=${PLAY_ID}`;
    try { window.open(url, '_system'); } catch { window.location.href = url; }
  });
}

// ==================== LOCAL TICK ====================
let tickInterval = null;
function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  let n = 0;
  tickInterval = setInterval(() => {
    if (state.isRunning) {
      const timeLeft = computeTimeLeft();
      if (timeLeft <= 0) {
        handleTimerComplete();
      } else {
        updateTimerOnly();
        // Refresh the sticky notification roughly every 30s (silent channel)
        if (timeLeft % 30 === 0) showOngoingNotification();
      }
    }
    // Keep the meeting-reminder countdown fresh even when idle
    if (++n % 20 === 0) renderReminderPill();
  }, 1000);
}

// ==================== NOTIFICATIONS ====================
const NOTIF_ID = 1001;          // completion alert
const ONGOING_ID = 1002;        // live, ongoing timer-progress notification
const STREAK_NOTIF_ID = 1500;   // evening streak-at-risk nudge
const DAILY_NUDGE_ID = 1501;    // personalized daily "your usual focus time" cue
const CH_ALERTS = 'timer_alerts';      // high importance: sound + heads-up
const CH_PROGRESS = 'timer_progress';  // low importance: silent, sticky
const DEADLINE_ID_BASE = 20000;        // task deadline reminders: 20000..28999

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Custom value-framed pre-permission screen. We NEVER fire the raw OS dialog
// cold — the user sees this first (after a real value moment), and the system
// prompt only follows if they tap "Turn on nudges". De-duped so the ambient
// 30s notification refresh can't pop it repeatedly.
let notifPrimePromise = null;
let notifDeclinedThisSession = false;
function showNotifPrime() {
  if (notifPrimePromise) return notifPrimePromise;
  const sheet = document.getElementById('notifPrimeSheet');
  if (!sheet) return Promise.resolve(false);
  notifPrimePromise = new Promise(resolve => {
    const finish = (val) => {
      sheet.classList.add('hidden');
      notifPrimePromise = null;
      if (!val) notifDeclinedThisSession = true;
      resolve(val);
    };
    sheet.querySelector('#notifPrimeEnable').onclick = () => finish(true);
    sheet.querySelector('#notifPrimeLater').onclick = () => finish(false);
    sheet.querySelector('.sheet-backdrop').onclick = () => finish(false);
    sheet.classList.remove('hidden');
  });
  return notifPrimePromise;
}

async function ensureNotificationPermission() {
  if (!LocalNotifications) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'granted') return true;
    if (perm.display === 'denied') return false;   // OS-level denied — don't nag
    if (notifDeclinedThisSession) return false;     // said "not now" this session
    const wants = await showNotifPrime();           // our screen BEFORE the OS dialog
    if (!wants) return false;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch (e) { console.warn('Notif perm:', e); return false; }
}

// Silent check — true only if the OS has already granted. Used by background
// schedulers (streak/deadline/reminders) so they never trigger a prompt on their own.
async function hasNotificationPermission() {
  if (!LocalNotifications) return false;
  try { return (await LocalNotifications.checkPermissions()).display === 'granted'; }
  catch (e) { return false; }
}

// Two channels: loud alerts for completions/deadlines, a silent one for the
// sticky "in progress" notification so re-posting it never buzzes.
async function createChannels() {
  if (!LocalNotifications?.createChannel) return;
  try {
    await LocalNotifications.createChannel({
      id: CH_ALERTS, name: 'Timer & reminders',
      description: 'Session complete, breaks, and task deadlines',
      importance: 5, visibility: 1, sound: 'default', vibration: true
    });
    await LocalNotifications.createChannel({
      id: CH_PROGRESS, name: 'Focus in progress',
      description: 'The ongoing timer countdown',
      importance: 2, visibility: 1, vibration: false
    });
  } catch (e) { console.warn('createChannel:', e); }
}

async function scheduleCompletionNotification(seconds) {
  if (!state.settings.notificationsEnabled || !LocalNotifications) return;
  const ok = await hasNotificationPermission();  // silent: prime happens at session completion
  if (!ok) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID,
        title: state.mode === 'work' ? 'Focus session complete' : 'Break over',
        body: state.mode === 'work' ? 'Nice work — tap to start your break' : 'Time to focus again',
        channelId: CH_ALERTS,
        smallIcon: 'ic_stat_dopamodoro',
        schedule: { at: new Date(Date.now() + seconds * 1000) },
        sound: 'default'
      }]
    });
  } catch (e) { console.warn('Schedule notif:', e); }
}

async function cancelCompletionNotification() {
  if (!LocalNotifications) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }); } catch (e) {}
}

// Sticky countdown notification. Posted on start, refreshed on the minute (and
// on pause/resume) while the app is alive. Shows time-left + exact end time so
// it stays useful even when the app is backgrounded and JS is suspended.
async function showOngoingNotification() {
  if (!state.settings.notificationsEnabled || !LocalNotifications) return;
  if (!state.isRunning && !state.isPaused) return cancelOngoingNotification();
  const ok = await hasNotificationPermission();  // silent: never prompt from the ambient refresh
  if (!ok) return;
  const tl = computeTimeLeft();
  const endTime = new Date(Date.now() + tl * 1000)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const task = state.currentTasks[0] ? ` · ${ctName(state.currentTasks[0])}` : '';
  const modeLabel = state.mode === 'work' ? 'Focusing'
    : state.mode === 'longBreak' ? 'Long break' : 'Short break';
  let title, body;
  if (state.isPaused) {
    title = `⏸ Paused${task}`;
    body = `${fmtClock(tl)} left — tap to resume`;
  } else {
    title = `${modeLabel}${task}`;
    const mins = Math.max(1, Math.ceil(tl / 60));
    body = `${mins} min left · ends ${endTime}`;
  }
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: ONGOING_ID, title, body,
        channelId: CH_PROGRESS,
        smallIcon: 'ic_stat_dopamodoro',
        ongoing: !state.isPaused,   // sticky while running, dismissable when paused
        autoCancel: false,
        schedule: { at: new Date(Date.now() + 40) }
      }]
    });
  } catch (e) { console.warn('Ongoing notif:', e); }
}

async function cancelOngoingNotification() {
  if (!LocalNotifications) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: ONGOING_ID }] }); } catch (e) {}
}

async function fireCompletionNotification(title, body) {
  if (!state.settings.notificationsEnabled || !LocalNotifications) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID + Math.floor(Math.random() * 1000),
        title, body,
        channelId: CH_ALERTS,
        smallIcon: 'ic_stat_dopamodoro',
        schedule: { at: new Date(Date.now() + 100) }
      }]
    });
  } catch (e) { console.warn('Fire notif:', e); }
}

// ==================== STREAK-AT-RISK NUDGE ====================
// Loss aversion: if the user has a live streak but hasn't focused today, schedule
// one gentle 8pm reminder to protect it. Piggybacks on an already-granted
// permission (never prompts on its own) and re-syncs after every session + on
// launch, so it cancels itself the moment today's streak is safe.
async function syncStreakReminder() {
  if (!LocalNotifications) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: STREAK_NOTIF_ID }] }); } catch (e) {}
  if (!state.settings.notificationsEnabled) return;
  if ((state.streak || 0) < 2) return;                       // nothing worth protecting yet
  if (state.lastSessionDate === new Date().toDateString()) return; // already safe today
  if (!(await hasNotificationPermission())) return;          // silent — no cold prompt
  const at = new Date(); at.setHours(20, 0, 0, 0);           // default: tonight, 8pm
  const now = Date.now();
  if (at.getTime() <= now + 60000) {
    // Opened after 8pm and the streak is still at risk — don't lose the nudge.
    // Fire ~25 min out, unless that would land past 11pm (too close to midnight).
    const lateCutoff = new Date(); lateCutoff.setHours(23, 0, 0, 0);
    if (now + 25 * 60000 > lateCutoff.getTime()) return;
    at.setTime(now + 25 * 60000);
  }
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: STREAK_NOTIF_ID,
        title: `Keep your ${state.streak}-day streak alive`,
        body: 'One quick session before bed protects it. You’ve got this.',
        channelId: CH_ALERTS,
        smallIcon: 'ic_stat_dopamodoro',
        schedule: { at }
      }]
    });
  } catch (e) { console.warn('Streak notif:', e); }
}

// ==================== PERSONALIZED DAILY START NUDGE ====================
// A gentle daily cue at the hour the user usually focuses — learned from their own
// history, never a generic blast. Waits for a real pattern before firing, and
// re-syncs on launch + after each session so it tracks their rhythm as it shifts.
function usualFocusHour() {
  const h = state.focusHours || {};
  let best = null, bestN = 0, total = 0;
  for (const k in h) { total += h[k]; if (h[k] > bestN) { bestN = h[k]; best = +k; } }
  return total >= 5 ? best : null;   // hold off until there's a genuine pattern
}
async function syncDailyStartNudge() {
  if (!LocalNotifications) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: DAILY_NUDGE_ID }] }); } catch (e) {}
  if (!state.settings.notificationsEnabled) return;
  const hour = usualFocusHour();
  if (hour == null) return;
  if (!(await hasNotificationPermission())) return;   // silent — never cold-prompts
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: DAILY_NUDGE_ID,
        title: 'Your usual focus time',
        body: 'A small session now keeps the momentum going. Start when you’re ready.',
        channelId: CH_ALERTS,
        smallIcon: 'ic_stat_dopamodoro',
        schedule: { on: { hour, minute: 0 }, allowWhileIdle: true }   // repeats daily
      }]
    });
  } catch (e) { console.warn('Daily nudge:', e); }
}

// ==================== DEADLINE REMINDERS ====================
// Stable numeric id per todo (string id → 20000..28999) so we can reschedule.
function todoNotifId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DEADLINE_ID_BASE + (h % 9000);
}

// Cancel old deadline notifications and (re)schedule for every pending todo that
// has a future due date. Fires at 9am on the due day.
async function syncDeadlineNotifications() {
  if (!LocalNotifications) return;
  const prevIds = Array.isArray(state._deadlineNotifIds) ? state._deadlineNotifIds : [];
  if (prevIds.length) {
    try { await LocalNotifications.cancel({ notifications: prevIds.map(id => ({ id })) }); } catch (e) {}
  }
  state._deadlineNotifIds = [];
  if (!state.settings.notificationsEnabled) return;
  const ok = await hasNotificationPermission();  // silent: runs on launch, must not prompt
  if (!ok) return;
  const now = Date.now();
  const toSchedule = [];
  const newIds = [];
  (state.todos || []).filter(t => !t.done && t.dueDate).forEach(t => {
    const at = new Date(t.dueDate + 'T09:00:00');
    if (at.getTime() <= now + 60000) return; // skip past / imminent
    const nid = todoNotifId(t.id);
    toSchedule.push({
      id: nid, title: 'Task due today',
      body: (t.text || '').slice(0, 90),
      channelId: CH_ALERTS, smallIcon: 'ic_stat_dopamodoro',
      schedule: { at }
    });
    newIds.push(nid);
  });
  state._deadlineNotifIds = newIds;
  if (toSchedule.length) {
    try { await LocalNotifications.schedule({ notifications: toSchedule }); } catch (e) { console.warn('Deadline notif:', e); }
  }
}

// ==================== HAPTICS ====================
function haptic(style) {
  if (!state.settings.hapticsEnabled || !Haptics) return;
  try { Haptics.impact({ style }); } catch (e) {}
}

// ==================== TOAST ====================
let toastTimeout = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2500);
}

// ==================== TODOS ====================
function addTodo(text) {
  text = (text || '').trim().slice(0, 200);
  if (!text) return;
  const tg = document.getElementById('todoTargetGroup');
  const groupId = (tg && tg.value && (state.todoGroups || []).some(g => g.id === tg.value)) ? tg.value : null;
  state.todos.unshift({
    id: 'td' + Date.now() + Math.random().toString(36).slice(2, 6),
    text, done: false, priority: 3, notes: [], subtasks: [],
    goalId: null, dueDate: null, groupId, createdAt: new Date().toISOString(), completedAt: null
  });
  saveStateDebounced();
  renderTodos();
}
function toggleTodo(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? new Date().toISOString() : null;
  saveStateDebounced();
  syncDeadlineNotifications();
  renderTodos();
  renderDeadlineStrip();
  haptic(t.done ? 'medium' : 'light');
}
function deleteTodo(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  saveStateDebounced();
  syncDeadlineNotifications();
  renderTodos();
  renderDeadlineStrip();
}
function setTodoPriority(id, pri) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  t.priority = pri;
  saveStateDebounced();
  renderTodos();
}
function togglePinTodo(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  const i = state.currentTasks.findIndex(x => ctName(x) === t.text);
  if (i >= 0) {
    state.currentTasks.splice(i, 1);
    toast(`Unpinned`);
  } else {
    if (state.currentTasks.length >= 8) { toast('Max 8 for today'); return; }
    state.currentTasks.push({ name: t.text, groupId: t.groupId || null, clientId: null });
    toast(`Added to Today's Focus`);
  }
  saveStateDebounced();
  renderAll();
}

// ==================== CURRENT TASKS ====================
// ----- Today's Focus helpers -----
const GROUP_COLORS = ['#EC4899', '#8B5CF6', '#2DD4BF', '#FB923C', '#60A5FA', '#22C55E', '#FACC15', '#F43F5E'];
function ctName(t) { return typeof t === 'string' ? t : (t && t.name) || ''; }
function ctGroup(t) { return typeof t === 'string' ? null : (t && t.groupId) || null; }
function groupById(id) { return (state.todoGroups || []).find(g => g.id === id) || null; }
function groupColor(id) {
  const idx = (state.todoGroups || []).findIndex(g => g.id === id);
  return idx < 0 ? 'var(--text-3)' : GROUP_COLORS[idx % GROUP_COLORS.length];
}

// ----- Clients / personal-projects (compact who-is-this-for tag) -----
const CLIENT_COLORS = ['#2DD4BF', '#FB923C', '#A855F7', '#60A5FA', '#F43F5E', '#22C55E', '#FACC15', '#EC4899'];
function clientById(id) { return (state.clients || []).find(c => c.id === id) || null; }
function ctClient(t) { return typeof t === 'string' ? null : (t && t.clientId) || null; }
function addClient(name, type) {
  name = (name || '').trim().slice(0, 40);
  if (!name) { toast('Name it first'); return null; }
  state.clients = state.clients || [];
  let c = state.clients.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!c) {
    c = { id: 'cl' + Date.now() + Math.random().toString(36).slice(2, 5), name, type: type === 'client' ? 'client' : 'personal', color: CLIENT_COLORS[state.clients.length % CLIENT_COLORS.length], createdAt: new Date().toISOString() };
    state.clients.push(c);
    saveStateDebounced();
  }
  return c;
}

function addCurrentTask(text, groupId) {
  text = (text || '').trim();
  if (!text) return;
  if (state.currentTasks.some(x => ctName(x).toLowerCase() === text.toLowerCase())) { toast('Already added'); return; }
  if (state.currentTasks.length >= 8) { toast('Max 8 for today'); return; }
  state.currentTasks.push({ name: text, groupId: groupId || null, clientId: null });
  state._tfCollapsed = false;
  saveStateDebounced();
  renderAll();
}
function removeCurrentTask(idx) {
  state.currentTasks.splice(idx, 1);
  saveStateDebounced();
  renderAll();
}
// Add a Today's-Focus item straight from an existing Task-Manager todo (carries its folder).
function addTaskFromTodo(id) {
  const t = (state.todos || []).find(x => x.id === id);
  if (!t) return;
  addCurrentTask(t.text, t.groupId || null);
  hideSheet('focusPickSheet');
}

// ==================== MANUAL ENTRY ====================
function addManualSession(dateStr, durationMin, task) {
  if (!dateStr || !durationMin || durationMin < 1) { toast('Fill all required fields'); return; }
  const d = new Date(dateStr + 'T12:00');
  const goal = state.goals.find(g => g.id === state.activeGoal);
  state.sessionHistory.push({
    id: 'man' + Date.now() + Math.random().toString(36).slice(2, 6),
    ts: d.toISOString(),
    date: d.toDateString(),
    task: task || '',
    tasks: task ? [task] : [],
    goalId: state.activeGoal || null,
    goalName: goal?.name || '',
    goalIcon: goal?.icon || '',
    durationMin: parseInt(durationMin, 10),
    type: 'workManual'
  });
  state.sessionHistory.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  state.totalTomatoes++;
  state.tomatoCoins += 10;
  state.experience += 25;
  if (state.experience >= state.level * 100) { state.experience -= state.level * 100; state.level++; }
  if (d.toDateString() === new Date().toDateString()) state.todayCount++;
  saveStateDebounced();
  renderAll();
  renderHistory();
  toast(`+${durationMin}m logged · +10 tomatoes`);
}

// ==================== RENDER ====================
function renderAll() {
  updateTimerOnly();
  updateStats();
  updateLevelChip();
  updateModeButtons();
  renderTaskPills();
  renderNorthStar();
  renderDurationChips();
  updateMotivLine();
  updateGoalSelectorBtn();
  renderHomeSummary();
  renderReminderPill();
  renderDeadlineStrip();
  renderCoachNudge();
  renderTomorrowLaunchpad();
  renderWrapTrigger();
  renderTodos();
  renderHistory();
  hydrateIcons();
}

function updateTimerOnly() {
  const tl = computeTimeLeft();
  const m = Math.floor(tl / 60);
  const s = tl % 60;
  document.getElementById('timerTime').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const sub = document.getElementById('timerSub');
  const primary = state.currentTasks[0] ? ctName(state.currentTasks[0]) : '';
  const taskLabel = primary ? (primary.length > 22 ? primary.slice(0, 21) + '…' : primary) : '';
  if (state.isRunning) {
    sub.textContent = state.mode === 'work'
      ? (taskLabel ? `Focusing on ${taskLabel}` : 'Focusing...')
      : 'Taking a break...';
  } else if (state.isPaused) {
    sub.textContent = 'Paused';
  } else {
    sub.textContent = state.mode === 'work'
      ? (taskLabel ? `Ready: ${taskLabel}` : 'Ready to focus')
      : 'Ready for break';
  }

  // Ring progress
  const total = state.sessionDuration || getTotalForMode(state.mode);
  const pct = total > 0 ? 1 - (tl / total) : 0;
  const r = 100;
  const c = 2 * Math.PI * r;
  ['timerRing', 'timerRingGlow', 'timerRingLava'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.strokeDasharray = c;
    el.style.strokeDashoffset = c * (1 - pct);
  });

  // Task name below the ring — full name, wraps to 2 lines
  const taskLine = document.getElementById('timerTaskLine');
  if (taskLine) {
    const full = state.currentTasks[0] ? ctName(state.currentTasks[0]) : '';
    taskLine.textContent = full;
    taskLine.classList.toggle('is-hidden', !full);
  }

  // Glowing thumb that rides the progress edge
  const wrap = document.querySelector('.timer-ring-wrap');
  const thumb = document.getElementById('timerThumb');
  if (wrap) wrap.classList.toggle('is-running', state.isRunning);
  if (thumb) {
    const active = (state.isRunning || state.isPaused) && pct > 0.001;
    thumb.classList.toggle('is-hidden', !active);
    if (active) {
      const rad = (-90 + pct * 360) * Math.PI / 180;
      thumb.style.left = (110 + r * Math.cos(rad)) + 'px';
      thumb.style.top = (110 + r * Math.sin(rad)) + 'px';
    }
  }

  // Start button label/icon
  const startBtn = document.getElementById('startBtn');
  const icon = document.getElementById('startIcon');
  const label = document.getElementById('startLabel');
  if (state.isRunning) {
    startBtn.classList.add('running');
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    label.textContent = 'Pause';
  } else {
    startBtn.classList.remove('running');
    icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    label.textContent = state.isPaused ? 'Resume' : (state.mode === 'work' ? 'Start Focus' : 'Start Break');
  }

  // Session dots
  const dots = document.getElementById('sessionDots');
  const interval = state.settings.longBreakInterval;
  const completed = state.sessionCount % interval;
  let html = '';
  for (let i = 0; i < interval; i++) html += `<span class="dot${i < completed ? ' filled' : ''}"></span>`;
  dots.innerHTML = html;
}

function updateStats() {
  document.getElementById('statToday').textContent = state.todayCount;
  document.getElementById('statStreak').textContent = state.streak;
  document.getElementById('statTotal').textContent = state.totalTomatoes;
  document.getElementById('statTomatoes').textContent = (state.tomatoCoins || 0).toLocaleString();
}

function updateLevelChip() {
  const t = levelTitle(state.level);
  document.getElementById('levelChipText').innerHTML = `${icon(t.icon)} ${escapeHtml(t.name)}`;
}

function updateModeButtons() {
  document.querySelectorAll('.mode-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

function renderDurationChips() {
  const wrap = document.getElementById('durationChips');
  if (!wrap) return;
  const visible = state.mode === 'work' && !state.isRunning && !state.isPaused;
  wrap.classList.toggle('hidden', !visible);
  // The "Just start · 2 min" escape hatch shares the same idle-work visibility.
  document.getElementById('justStartBtn')?.classList.toggle('hidden', !visible);
  const current = state.settings.workDuration;
  wrap.querySelectorAll('.dur-chip').forEach(b => {
    const m = b.dataset.min;
    if (m === 'custom') b.classList.toggle('is-active', ![15, 20, 25].includes(current));
    else b.classList.toggle('is-active', Number(m) === current);
  });
}

/* Two words max, NO emoji — a quiet ember cue riding above the countdown.
   Idle returns '' so the mark stays hidden until a session is live. */
const MOTIV = {
  p1: ['Lock in', 'Phone down', 'Begin now'],
  p2: ['Momentum', 'Full flow', 'Stay here'],
  p3: ['Halfway', 'Past hard', 'Keep going'],
  p4: ['Almost there', 'Hold on', 'Nearly done'],
  p5: ['Final push', 'Last stretch', 'Finish strong'],
  paused: ['Come back', 'Resume soon'],
  break: ['Eyes off', 'Breathe', 'Recharge']
};
function pickMotivPhase() {
  if (state.isPaused) return 'paused';
  if (!state.isRunning) return '';           // idle — hide the mark
  if (state.mode !== 'work') return 'break';
  const dur = state.sessionDuration || getTotalForMode(state.mode);
  const pct = dur > 0 ? (dur - computeTimeLeft()) / dur : 0;
  if (pct < 0.2) return 'p1';
  if (pct < 0.5) return 'p2';
  if (pct < 0.75) return 'p3';
  if (pct < 0.92) return 'p4';
  return 'p5';
}
function updateMotivLine() {
  const el = document.getElementById('timerMotiv');
  if (!el) return;
  const txt = el.querySelector('.timer-motiv-txt');
  const phase = pickMotivPhase();
  if (!phase) { el.classList.add('is-hidden'); return; }
  const pool = MOTIV[phase] || [];
  if (!pool.length) { el.classList.add('is-hidden'); return; }
  const seed = (state.sessionStartTime || 0) + phase.charCodeAt(0);
  if (txt) txt.textContent = pool[Math.abs(seed) % pool.length];
  el.classList.remove('is-hidden');
}

function renderTaskPills() {
  const wrap = document.getElementById('taskPills');
  if (!wrap) return;
  const tasks = state.currentTasks || [];

  const countEl = document.getElementById('tfCount');
  if (countEl) countEl.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
  const collapsed = !!state._tfCollapsed;
  const body = document.getElementById('tfBody');
  if (body) body.classList.toggle('hidden', collapsed);
  const caret = document.getElementById('tfCollapse');
  if (caret) caret.textContent = collapsed ? '▸' : '▾';

  wrap.innerHTML = '';
  if (!tasks.length) {
    wrap.innerHTML = `<div class="tf-empty">No tasks yet — add one below or pick from your Task Manager.</div>`;
  } else {
    tasks.forEach((t, i) => {
      const gid = ctGroup(t);
      const g = groupById(gid);
      const el = document.createElement('div');
      el.className = 'tf-item';
      const tag = g
        ? `<button class="tf-tag" style="--gc:${groupColor(gid)}">${escapeHtml(g.name)}</button>`
        : `<button class="tf-tag tf-tag-none">+ folder</button>`;
      const cl = clientById(ctClient(t));
      const clientChip = cl
        ? `<button class="tf-client" style="--cc:${cl.color}" title="${escapeHtml(cl.name)}">${icon(cl.type === 'client' ? 'briefcase' : 'home')}</button>`
        : `<button class="tf-client tf-client-none" title="Tag client / personal">${icon('briefcase')}</button>`;
      el.innerHTML = `<span class="tf-dot">${icon('pin')}</span><span class="tf-name">${escapeHtml(ctName(t))}</span>${clientChip}${tag}<button class="tf-x" title="Remove">×</button>`;
      el.querySelector('.tf-tag').addEventListener('click', e => { e.stopPropagation(); openFolderPicker(i); });
      el.querySelector('.tf-client').addEventListener('click', e => { e.stopPropagation(); openClientPicker(i); });
      el.querySelector('.tf-x').addEventListener('click', () => removeCurrentTask(i));
      wrap.appendChild(el);
    });
  }
}

// Inline folder <select> on the add row.
function renderFolderSelect() {
  const sel = document.getElementById('currentTaskGroup');
  if (!sel) return;
  const groups = state.todoGroups || [];
  const prev = sel.value;
  sel.innerHTML = `<option value="">No folder</option>` +
    groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  if (groups.some(g => g.id === prev)) sel.value = prev;
}

// Per-task folder picker sheet.
let folderPickIdx = null;
function openFolderPicker(idx) {
  folderPickIdx = idx;
  const body = document.getElementById('folderPickBody');
  const groups = state.todoGroups || [];
  const cur = ctGroup(state.currentTasks[idx]);
  let html = `<button class="fp-item ${!cur ? 'active' : ''}" data-gid=""><span class="fp-dot" style="background:var(--text-3)"></span><span class="fp-name">No folder</span>${!cur ? '<span class="fp-check">✓</span>' : ''}</button>`;
  html += groups.map(g => `<button class="fp-item ${g.id === cur ? 'active' : ''}" data-gid="${g.id}"><span class="fp-dot" style="background:${groupColor(g.id)}"></span><span class="fp-name">${escapeHtml(g.name)}</span>${g.id === cur ? '<span class="fp-check">✓</span>' : ''}</button>`).join('');
  html += `<div class="fp-new"><input type="text" id="fpNewName" maxlength="40" placeholder="New folder name"><button id="fpAdd">+ Folder</button></div>`;
  body.innerHTML = html;
  body.querySelectorAll('.fp-item').forEach(b => b.addEventListener('click', () => setTaskFolder(b.dataset.gid || null)));
  document.getElementById('fpAdd').addEventListener('click', () => {
    addTodoGroupSilent(document.getElementById('fpNewName').value, gid => setTaskFolder(gid));
  });
  showSheet('folderPickSheet');
}
function setTaskFolder(gid) {
  if (state.currentTasks[folderPickIdx]) state.currentTasks[folderPickIdx].groupId = gid;
  saveStateDebounced();
  hideSheet('folderPickSheet');
  renderTaskPills();
  haptic('light');
}

// Generic client / personal picker — calls onPick(clientId|null).
let _clientPickCb = null;
function openClientPickerCore(currentId, onPick) {
  _clientPickCb = onPick;
  const body = document.getElementById('clientPickBody');
  const clients = state.clients || [];
  const clientsC = clients.filter(c => c.type === 'client');
  const personalC = clients.filter(c => c.type === 'personal');
  const row = c => `<button class="fp-item ${c.id === currentId ? 'active' : ''}" data-cid="${c.id}"><span class="fp-dot" style="background:${c.color}"></span><span class="fp-name">${icon(c.type === 'client' ? 'briefcase' : 'home')} ${escapeHtml(c.name)}</span>${c.id === currentId ? '<span class="fp-check">✓</span>' : ''}</button>`;
  let html = `<button class="fp-item ${!currentId ? 'active' : ''}" data-cid=""><span class="fp-dot" style="background:var(--text-3)"></span><span class="fp-name">None</span>${!currentId ? '<span class="fp-check">✓</span>' : ''}</button>`;
  if (clientsC.length) html += `<div class="fk-group">${icon('briefcase')} Clients</div>` + clientsC.map(row).join('');
  if (personalC.length) html += `<div class="fk-group">${icon('home')} Personal</div>` + personalC.map(row).join('');
  html += `<div class="fp-new"><input type="text" id="clNewName" maxlength="40" placeholder="New client / project name"></div>
    <div class="cl-new-actions"><button class="cl-add" data-type="client">+ Client</button><button class="cl-add" data-type="personal">+ Personal</button></div>`;
  body.innerHTML = html;
  const choose = cid => { hideSheet('clientPickSheet'); if (_clientPickCb) _clientPickCb(cid); haptic('light'); };
  body.querySelectorAll('.fp-item').forEach(b => b.addEventListener('click', () => choose(b.dataset.cid || null)));
  body.querySelectorAll('.cl-add').forEach(b => b.addEventListener('click', () => {
    const c = addClient(document.getElementById('clNewName').value, b.dataset.type);
    if (c) choose(c.id);
  }));
  showSheet('clientPickSheet');
}
function openClientPicker(idx) {
  openClientPickerCore(ctClient(state.currentTasks[idx]), cid => {
    if (state.currentTasks[idx]) state.currentTasks[idx].clientId = cid;
    saveStateDebounced();
    renderTaskPills();
  });
}

// Pick an existing task from the Task Manager (grouped by folder).
function openFocusPick() {
  const body = document.getElementById('focusPickBody');
  const groups = state.todoGroups || [];
  const open = (state.todos || []).filter(t => !t.done);
  const inFocus = name => state.currentTasks.some(x => ctName(x).toLowerCase() === name.toLowerCase());
  if (!open.length) {
    body.innerHTML = `<div class="todo-empty-sub" style="text-align:center;padding:14px;">No tasks in your Task Manager yet. Add some in the Tasks tab (and put them in folders) first.</div>`;
    showSheet('focusPickSheet');
    return;
  }
  const rowList = arr => arr.map(t => `<button class="fk-item" data-id="${t.id}" ${inFocus(t.text) ? 'disabled' : ''}><span class="fk-name">${escapeHtml(t.text)}</span>${inFocus(t.text) ? '<span class="fk-added">added</span>' : '<span class="fk-plus">+</span>'}</button>`).join('');
  let html = '';
  const ungrouped = open.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));
  groups.forEach(g => {
    const items = open.filter(t => t.groupId === g.id);
    if (items.length) html += `<div class="fk-group"><span class="fp-dot" style="background:${groupColor(g.id)}"></span>${escapeHtml(g.name)}</div>` + rowList(items);
  });
  if (ungrouped.length) html += `<div class="fk-group">No folder</div>` + rowList(ungrouped);
  body.innerHTML = html;
  body.querySelectorAll('.fk-item').forEach(b => b.addEventListener('click', () => { if (!b.disabled) addTaskFromTodo(b.dataset.id); }));
  showSheet('focusPickSheet');
}

// ==================== NORTH STAR — WHY BUILDER (8 life pillars) ====================
// All framing is positive: the ideal life this goal creates, never the fear of
// missing it. Ported 1:1 from the extension.
const NS_PILLARS = [
  { key: 'Wealth', name: 'Wealth & Things',
    icon: '<path d="M20.6 13.4 12 22l-9-9V4h9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    questions: ['What\'s the first thing you buy just because you can?','What upgrade do you enjoy every single day?','What experience do you finally say yes to?','What does "more than enough" look like in numbers?','What do you own that you\'re quietly proud of?','What do you fund with total ease?','What does the money hand back to you — time, choice, calm?','What trip do you book without checking the price?','What do you gift the people you love?','Where does the first celebration budget go?','What number would feel amazing to see?'] },
  { key: 'Freedom', name: 'Freedom & Time',
    icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
    questions: ['What time do you wake up, naturally?','Where are you working from that month?','How do you spend a free Tuesday at 11am?','What does a perfect, open Sunday become?','What do you do just because you love it?','What does your ideal week actually look like?','What\'s the first trip — city, week, who with?','What do you finally get to say yes to?','How much of your day is truly yours?','What hobby gets its evenings back?','What language, instrument, or craft do you start?'] },
  { key: 'Home', name: 'Home & Space',
    icon: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
    questions: ['What does your front door open onto?','What room becomes exactly how you want it?','Where do you live because of this?','What corner becomes fully, happily yours?','What view is outside your window?','What do you upgrade first at home?','What new space do you get to create?','What does home feel like when you walk in?','What\'s the first thing guests notice?','What does your dream workspace look like?'] },
  { key: 'People', name: 'Love & People',
    icon: '<path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/>',
    questions: ['Who do you celebrate this with first?','Who feels proud of you?','What do you get to do with your parents?','What does this let you give the people you love?','Which friendship gets more of your time?','Who do you take with you on the journey?','What dinner do you host to celebrate?','What gets better with your partner?','What trip do you finally take together?','What moment with someone you love does this create?','Who calls you, and what do they say?'] },
  { key: 'Body', name: 'Body & Vitality',
    icon: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    questions: ['How do you feel waking up, fully rested?','What does your body get to enjoy?','How strong and energized do you feel?','What do you get to train for?','What morning movement do you look forward to?','What does an easy, deep night\'s sleep feel like?','What food do you enjoy, slow and present?','How does your body carry you through the day?','What does feeling truly healthy look like?','What does calm in your body feel like?'] },
  { key: 'Craft', name: 'Craft & Mastery',
    icon: '<path d="M14.5 5.5a3.5 3.5 0 0 1-4.6 4.6L4 16v4h4l5.9-5.9a3.5 3.5 0 0 1 4.6-4.6z"/>',
    questions: ['What do you get to build next?','What skill do you get to master?','What work do you get to choose from now?','What does your best, most in-flow session feel like?','Who gets to learn from you?','What are you now known for?','What piece of work are you proudest of?','What does mastery in your craft look like?','What problem do you love solving?','What does your ideal working day create?'] },
  { key: 'Spirit', name: 'Identity & Spirit',
    icon: '<path d="M12 3l2.2 5.5L20 10l-5.8 1.5L12 17l-2.2-5.5L4 10l5.8-1.5z"/>',
    questions: ['Who do you become by reaching this?','What new story do you tell about yourself?','What peace settles in once it\'s real?','What are you deeply grateful for now?','What best part of you gets to shine?','What would young-you be thrilled to see?','What feels calm and clear inside?','What do you feel the morning after?','What identity do you step fully into?','What strength did this reveal in you?'] },
  { key: 'Legacy', name: 'Contribution & Legacy',
    icon: '<path d="M20 12v9H4v-9M2 8h20v4H2zM12 21V8M12 8C10 4 6 5 7.5 7.5 8.6 9.3 12 8 12 8zM12 8c2-4 6-3 4.5-.5C15.4 9.3 12 8 12 8z"/>',
    questions: ['Who do you get to help first?','What do you love funding, even small?','What door do you hold open for others?','What do you want people saying about this in 10 years?','What beautiful tradition does this start?','What do you get to pass on?','Who benefits because you made it?','What cause do you finally back?','What example do you set for someone watching?','What mark do you want to leave?'] }
];
const NS_SENSES = [
  { key: 'see', label: 'See' }, { key: 'hear', label: 'Hear' }, { key: 'touch', label: 'Touch' },
  { key: 'smell', label: 'Smell' }, { key: 'taste', label: 'Taste' }
];
let nsWhyAnswers = [];
let nsWhyCurrentQ = '';
let nsPillarIdx = 0;
let nsVividData = null;
let nsVividUses = 0;
let nsVividMonth = '';
function nsMonthKey(d) { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function nsIsPro() { return !!(window.Billing && window.Billing.isPro()); }

// Shared AI backend — the key lives server-side, users never bring their own.
const AI_BACKEND_URL = () => (state && state.aiBackendUrl) || 'https://dopamodoro-api.vercel.app';
async function callAiBackend(mode, payload) {
  const url = AI_BACKEND_URL();
  if (!url) return null;
  try {
    const res = await fetch(url + '/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, ...payload })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text || null;
  } catch (e) { console.warn('[AI]', e); return null; }
}

function nsRenderWhyPager() {
  const p = NS_PILLARS[nsPillarIdx];
  const nmEl = document.getElementById('nsWhyPillar');
  const ixEl = document.getElementById('nsWhyPillarIx');
  const icEl = document.getElementById('nsWhyPillarIc');
  if (nmEl) nmEl.textContent = p.name;
  if (ixEl) ixEl.textContent = `PILLAR ${nsPillarIdx + 1} / ${NS_PILLARS.length}`;
  if (icEl) icEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.icon}</svg>`;
}
function nsPickWhyQuestion() {
  const p = NS_PILLARS[nsPillarIdx];
  const asked = new Set(nsWhyAnswers.filter(x => x.pillar === p.key).map(x => x.q));
  const fresh = p.questions.filter(q => q !== nsWhyCurrentQ && !asked.has(q));
  const pool = fresh.length ? fresh : p.questions.filter(q => q !== nsWhyCurrentQ);
  nsWhyCurrentQ = pool[Math.floor(Math.random() * pool.length)] || p.questions[0];
  const qEl = document.getElementById('nsWhyQ');
  const aEl = document.getElementById('nsWhyA');
  if (qEl) qEl.textContent = nsWhyCurrentQ;
  if (aEl) aEl.value = '';
}
function nsMovePillar(delta) {
  nsPillarIdx = (nsPillarIdx + delta + NS_PILLARS.length) % NS_PILLARS.length;
  nsWhyCurrentQ = '';
  nsRenderWhyPager();
  nsPickWhyQuestion();
  const aEl = document.getElementById('nsWhyA');
  if (aEl) setTimeout(() => aEl.focus(), 60);
}
function nsRenderWhySaved() {
  const wrap = document.getElementById('nsWhySaved');
  const count = document.getElementById('nsWhyCount');
  if (count) count.textContent = String(nsWhyAnswers.length);
  if (!wrap) return;
  wrap.innerHTML = nsWhyAnswers.map((x, i) => `
    <div class="ns-why-row" data-idx="${i}">
      <div class="ns-why-row-text">
        <div class="ns-why-row-q">${escapeHtml(x.pillarName || x.q)}</div>
        <div class="ns-why-row-a">${escapeHtml(x.a)}</div>
      </div>
      <button class="ns-why-row-x" title="Remove">×</button>
    </div>`).join('');
  wrap.querySelectorAll('.ns-why-row-x').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.closest('.ns-why-row').dataset.idx);
      nsWhyAnswers.splice(idx, 1);
      nsRenderWhySaved();
      nsUpdateVividGate();
      nsPersistWhy();
    });
  });
}
function nsSaveWhyAnswer() {
  const aEl = document.getElementById('nsWhyA');
  const val = (aEl?.value || '').trim();
  if (val) {
    const p = NS_PILLARS[nsPillarIdx];
    nsWhyAnswers.push({ pillar: p.key, pillarName: p.name, q: nsWhyCurrentQ, a: val });
    nsRenderWhySaved();
    nsUpdateVividGate();
    nsPersistWhy();
    haptic('light');
  }
  nsPickWhyQuestion();
}
// Persist live edits only if the goal already exists; new goals commit on Save.
function nsPersistWhy() {
  if (!state.northStarGoal) return;
  state.northStarGoal.whyAnswers = nsWhyAnswers.slice(0, 40);
  state.northStarGoal.vivid = nsVividData;
  state.northStarGoal.vividMonth = nsVividMonth;
  state.northStarGoal.vividUses = nsVividUses;
  saveStateDebounced();
}
function nsResetWhyBuilder(target) {
  if (target && Array.isArray(target.whyAnswers) && target.whyAnswers.length) {
    nsWhyAnswers = target.whyAnswers.map(x => ({ pillar: x.pillar || '', pillarName: x.pillarName || '', q: x.q, a: x.a }));
  } else if (target && target.why) {
    nsWhyAnswers = [{ pillar: '', pillarName: 'Why it matters', q: 'Why it matters', a: target.why }];
  } else {
    nsWhyAnswers = [];
  }
  nsPillarIdx = 0;
  nsWhyCurrentQ = '';
  nsRenderWhyPager();
  nsPickWhyQuestion();
  nsRenderWhySaved();
  nsVividData = (target && target.vivid) ? target.vivid : null;
  nsVividMonth = nsMonthKey();
  nsVividUses = (target && target.vividMonth === nsVividMonth) ? (target.vividUses || 0) : 0;
  nsRenderVividResult();
  nsUpdateVividGate();
}
function nsVividVal(k) {
  if (!nsVividData) return '';
  if (k === 'touch') return nsVividData.touch || nsVividData.feel || '';
  return nsVividData[k] || '';
}
function nsRenderVividResult() {
  const box = document.getElementById('nsVividResult');
  if (!box) return;
  const any = nsVividData && NS_SENSES.some(s => nsVividVal(s.key));
  if (!any) { box.classList.add('is-hidden'); box.innerHTML = ''; return; }
  box.classList.remove('is-hidden');
  box.innerHTML = NS_SENSES.filter(s => nsVividVal(s.key)).map(s =>
    `<div class="ns-vivid-row"><b>${s.label}</b><span>${escapeHtml(nsVividVal(s.key))}</span></div>`).join('');
}
function nsUpdateVividGate() {
  const btn = document.getElementById('nsVividBtn');
  const meta = document.getElementById('nsVividMeta');
  if (!btn || !meta) return;
  meta.classList.remove('is-out');
  meta.style.display = '';
  if (nsWhyAnswers.length < 2) { btn.disabled = true; meta.textContent = 'Save 2 answers first'; return; }
  // Pro: unlimited, and say NOTHING about limits or Pro.
  if (nsIsPro()) { btn.disabled = false; meta.style.display = 'none'; meta.textContent = ''; return; }
  // Free tier: 3 rewrites / month.
  if (nsVividUses >= 3) {
    btn.disabled = true;
    meta.innerHTML = '0 of 3 free this month — <a id="nsVividUpgrade">Go Pro</a> for unlimited';
    meta.classList.add('is-out');
    document.getElementById('nsVividUpgrade')?.addEventListener('click', () => window.Billing && window.Billing.openPaywall('vivid'));
    return;
  }
  btn.disabled = false;
  meta.textContent = `${3 - nsVividUses} of 3 free rewrites left this month`;
}
async function nsAiJson(prompt) {
  const text = await callAiBackend('coach', {
    messages: [{ role: 'user', content: prompt }],
    context: 'Respond with ONLY the requested JSON object. No prose, no code fences.'
  });
  if (!text) return null;
  let s = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}
async function nsGenerateVivid() {
  if (nsWhyAnswers.length < 2) return;
  const btn = document.getElementById('nsVividBtn');
  const label = document.getElementById('nsVividLabel');
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = 'Writing…';
  try {
    const title = document.getElementById('nsInput').value.trim() || 'this goal';
    const prompt = `Someone is chasing this goal: "${title}".

Here's why, in their own words:
${nsWhyAnswers.map(x => `- ${x.q}: ${x.a}`).join('\n')}

Write a short, vivid, second-person image of the moment they hit this goal — use ALL FIVE SENSES, concrete detail, not generic inspiration. Ground it in what they actually said above.

Respond with ONLY a JSON object — no explanation, no markdown:
{"see": "one concrete sight, under 14 words", "hear": "one sound, under 14 words", "touch": "one physical sensation, under 14 words", "smell": "one scent, under 14 words", "taste": "one taste, under 14 words"}`;
    const parsed = await nsAiJson(prompt);
    if (!parsed || !['see','hear','touch','smell','taste','feel'].some(k => parsed[k])) {
      toast('Coach is busy — try again in a sec');
      return;
    }
    nsVividData = {
      see: String(parsed.see || '').slice(0, 140),
      hear: String(parsed.hear || '').slice(0, 140),
      touch: String(parsed.touch || parsed.feel || '').slice(0, 140),
      smell: String(parsed.smell || '').slice(0, 140),
      taste: String(parsed.taste || '').slice(0, 140)
    };
    nsVividUses++;
    nsRenderVividResult();
    nsPersistWhy();
    haptic('medium');
  } catch (e) {
    toast('Could not make it vivid — try again');
  } finally {
    btn.disabled = false;
    label.textContent = original;
    nsUpdateVividGate();
  }
}

function renderNorthStar() {
  const root = document.getElementById('northStar');
  if (!root) return;
  if (state.northStarGoal) {
    root.innerHTML = `<div class="ns-card-set">
      <div class="ns-eyebrow">${icon('star')} North Star</div>
      <div class="ns-title">${escapeHtml(state.northStarGoal.title)}</div>
      ${state.northStarGoal.why ? `<div class="ns-why">“${escapeHtml(state.northStarGoal.why)}”</div>` : ''}
      <div class="ns-sub">${state.northStarGoal.sessionsContributed || 0} sessions invested · tap to edit</div>
    </div>`;
    root.querySelector('.ns-card-set').addEventListener('click', openNorthStarSheet);
  } else {
    root.innerHTML = `<button class="ns-cta" id="nsCtaBtn">${icon('star')} Set your big-picture goal</button>`;
    document.getElementById('nsCtaBtn').addEventListener('click', openNorthStarSheet);
  }
}
function openNorthStarSheet() {
  const inp = document.getElementById('nsInput');
  const clearBtn = document.getElementById('nsClear');
  inp.value = state.northStarGoal?.title || '';
  clearBtn.style.display = state.northStarGoal ? 'block' : 'none';
  nsResetWhyBuilder(state.northStarGoal);
  showSheet('northStarSheet');
  setTimeout(() => inp.focus(), 300);
}
function saveNorthStar() {
  const t = document.getElementById('nsInput').value.trim().slice(0, 60);
  if (!t) { toast('Enter a goal first'); return; }
  if (!state.northStarGoal) state.northStarGoal = { id: 'ns' + Date.now(), sessionsContributed: 0 };
  state.northStarGoal.title = t;
  state.northStarGoal.whyAnswers = nsWhyAnswers.slice(0, 40);
  state.northStarGoal.vivid = nsVividData;
  state.northStarGoal.vividMonth = nsVividMonth;
  state.northStarGoal.vividUses = nsVividUses;
  // Keep a short 'why' string for the North Star card preview.
  state.northStarGoal.why = (nsWhyAnswers[0]?.a || state.northStarGoal.why || '').slice(0, 160);
  saveStateDebounced();
  hideSheet('northStarSheet');
  renderNorthStar();
  toast('North Star set');
  haptic('medium');
}
function clearNorthStar() {
  state.northStarGoal = null;
  saveStateDebounced();
  hideSheet('northStarSheet');
  renderNorthStar();
  toast('Goal cleared');
}

function renderTodos() {
  const list = document.getElementById('todoList');
  if (!list) return;
  renderAddTargetGroup();
  const todos = state.todos || [];
  // Only show the "brain dump" empty state when there are NO tasks AND NO folders.
  // Previously this returned early on empty tasks even when folders existed, so a
  // newly-created (still empty) folder rendered nothing — it looked like folder
  // creation was broken. Falling through lets empty folders show their headers.
  if (todos.length === 0 && !(state.todoGroups || []).length) {
    list.innerHTML = `<div class="todo-empty">
      <div class="todo-empty-icon">${icon('pencil')}</div>
      <div class="todo-empty-title">Brain dump time</div>
      <div class="todo-empty-sub">Add one tiny thing. The hardest part is starting.</div>
    </div>`;
    document.getElementById('todoClearDone').classList.add('hidden');
    return;
  }
  const sortMode = state._todoSort || 'priority';
  const sortList = arr => {
    if (sortMode === 'manual') return arr.slice();   // preserve state.todos order
    return arr.slice().sort((a, b) => {
    if (sortMode === 'priority') { const pa = a.priority || 3, pb = b.priority || 3; return pa - pb; }
    if (sortMode === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortMode === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortMode === 'alpha') return a.text.localeCompare(b.text);
    return 0;
    });
  };
  const groups = state.todoGroups || [];
  const incomplete = todos.filter(t => !t.done);
  const completed = todos.filter(t => t.done && !t.archived).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  let html = '';
  // Ungrouped (or orphaned-group) tasks first
  const ungrouped = sortList(incomplete.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId)));
  ungrouped.forEach(t => html += renderTodoCard(t));

  // Collapsible named groups
  groups.forEach(g => {
    const items = sortList(incomplete.filter(t => t.groupId === g.id));
    html += `<div class="group-head ${g.collapsed ? 'is-collapsed' : ''}" data-gid="${g.id}">
      <span class="group-caret">${g.collapsed ? '▸' : '▾'}</span>
      <span class="group-name">${escapeHtml(g.name)}</span>
      <span class="group-count">${items.length}</span>
      <button class="group-del" data-gid="${g.id}" title="Delete group">×</button>
    </div>`;
    if (!g.collapsed) {
      if (items.length) items.forEach(t => html += renderTodoCard(t));
      else html += `<div class="group-empty">Empty — assign tasks from their detail screen.</div>`;
    }
  });

  if (completed.length) {
    html += `<div class="history-day-head"><span>Done recently</span><span class="history-day-meta">${completed.length}</span></div>`;
    completed.slice(0, 8).forEach(t => html += renderTodoCard(t));
  }
  list.innerHTML = html;

  list.querySelectorAll('.todo-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.todo-check').addEventListener('click', e => { e.stopPropagation(); toggleTodo(id); });
    el.querySelector('.todo-pri-badge')?.addEventListener('click', e => { e.stopPropagation(); cyclePriority(id); });
    el.querySelector('.todo-pin')?.addEventListener('click', e => { e.stopPropagation(); togglePinTodo(id); });
    el.querySelector('.todo-del')?.addEventListener('click', e => { e.stopPropagation(); deleteTodo(id); });
    el.querySelector('.todo-body').addEventListener('click', () => openTaskDetail(id));
    el.querySelector('.todo-drag')?.addEventListener('pointerdown', e => startTodoDrag(e, id));
  });

  list.querySelectorAll('.group-head').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.group-del')) return;
      const g = (state.todoGroups || []).find(x => x.id === el.dataset.gid);
      if (g) { g.collapsed = !g.collapsed; saveStateDebounced(); renderTodos(); haptic('light'); }
    });
  });
  list.querySelectorAll('.group-del').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); deleteTodoGroup(b.dataset.gid);
  }));

  document.getElementById('todoClearDone').classList.toggle('hidden', completed.length === 0);
}

// ==================== TASK GROUPS ====================
function addTodoGroup(name) {
  name = (name || '').trim().slice(0, 40);
  if (!name) return;
  state.todoGroups = state.todoGroups || [];
  // Free tier: up to 3 folders. The 4th opens the paywall.
  const cap = (window.Billing && window.Billing.LIMITS && window.Billing.LIMITS.folders) || 3;
  const isPro = !!(window.Billing && window.Billing.isPro());
  if (!isPro && state.todoGroups.length >= cap) {
    if (window.Billing) window.Billing.openPaywall('folders');
    else toast(`Free plan includes ${cap} folders`);
    return;
  }
  if (state.todoGroups.some(g => g.name.toLowerCase() === name.toLowerCase())) { toast('Group already exists'); return; }
  const g = { id: 'g' + Date.now() + Math.random().toString(36).slice(2, 5), name, collapsed: false, createdAt: new Date().toISOString() };
  state.todoGroups.push(g);
  saveStateDebounced();
  renderTodos();
  haptic('light');
  openGroupAssign(g.id, true);   // offer to pull existing tasks in
}

// Populate the "Add to: [group]" selector on the task add bar.
function renderAddTargetGroup() {
  const row = document.getElementById('todoTargetRow');
  const sel = document.getElementById('todoTargetGroup');
  if (!row || !sel) return;
  const groups = state.todoGroups || [];
  if (!groups.length) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  const prev = sel.value;
  sel.innerHTML = `<option value="">No group</option>` + groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  if (groups.some(g => g.id === prev)) sel.value = prev;
}

// Sheet to add existing ungrouped tasks into a group.
let assignGroupId = null;
function openGroupAssign(gid, isNew) {
  assignGroupId = gid;
  const g = (state.todoGroups || []).find(x => x.id === gid);
  const groups = state.todoGroups || [];
  const ungrouped = (state.todos || []).filter(t => !t.done && (!t.groupId || !groups.some(x => x.id === t.groupId)));
  document.getElementById('gaTitle').textContent = `${isNew ? 'Group added — add tasks to' : 'Add tasks to'} ${g ? g.name : 'group'}`;
  const body = document.getElementById('groupAssignBody');
  if (!ungrouped.length) {
    body.innerHTML = `<div class="todo-empty-sub" style="text-align:center;padding:14px;">No ungrouped tasks to add. New tasks can target this group from the "Add to" selector, or assign any task from its detail screen.</div>`;
  } else {
    body.innerHTML = ungrouped.map(t => `
      <label class="ga-item">
        <input type="checkbox" data-id="${t.id}">
        <span class="ga-check"></span>
        <span class="ga-text">${escapeHtml(t.text)}</span>
      </label>`).join('');
    body.querySelectorAll('.ga-item').forEach(el => el.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') { const cb = el.querySelector('input'); cb.checked = !cb.checked; }
      el.classList.toggle('checked', el.querySelector('input').checked);
    }));
  }
  showSheet('groupAssignSheet');
}
function confirmGroupAssign() {
  const ids = [];
  document.querySelectorAll('#groupAssignBody input:checked').forEach(c => ids.push(c.dataset.id));
  ids.forEach(id => { const t = (state.todos || []).find(x => x.id === id); if (t) t.groupId = assignGroupId; });
  assignGroupId = null;
  saveStateDebounced();
  hideSheet('groupAssignSheet');
  renderTodos();
  if (ids.length) { toast(`Added ${ids.length} task${ids.length > 1 ? 's' : ''}`); haptic('light'); }
}

// ==================== DRAG TO REORDER / MOVE BETWEEN GROUPS ====================
function startTodoDrag(e, id) {
  e.preventDefault();
  const list = document.getElementById('todoList');
  const src = list.querySelector(`.todo-item[data-id="${id}"]`);
  if (!src) return;
  const rect = src.getBoundingClientRect();
  const ghost = src.cloneNode(true);
  ghost.classList.add('todo-ghost');
  ghost.style.width = rect.width + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  src.classList.add('is-dragging');
  haptic('light');
  const offX = e.clientX - rect.left;
  const offY = e.clientY - rect.top;
  let dropInfo = null;
  const clearHints = () => list.querySelectorAll('.drop-into,.drop-before,.drop-after').forEach(el => el.classList.remove('drop-into', 'drop-before', 'drop-after'));

  const move = ev => {
    ghost.style.left = (ev.clientX - offX) + 'px';
    ghost.style.top = (ev.clientY - offY) + 'px';
    clearHints();
    dropInfo = null;
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!under) return;
    const gh = under.closest('.group-head');
    const ti = under.closest('.todo-item');
    if (gh) { gh.classList.add('drop-into'); dropInfo = { type: 'group', gid: gh.dataset.gid }; }
    else if (ti && ti.dataset.id !== id) {
      const r = ti.getBoundingClientRect();
      const before = ev.clientY < r.top + r.height / 2;
      ti.classList.add(before ? 'drop-before' : 'drop-after');
      dropInfo = { type: 'todo', targetId: ti.dataset.id, before };
    }
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove();
    src.classList.remove('is-dragging');
    clearHints();
    if (dropInfo) applyTodoDrop(id, dropInfo);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
function applyTodoDrop(id, info) {
  const t = (state.todos || []).find(x => x.id === id);
  if (!t) return;
  if (info.type === 'group') {
    t.groupId = info.gid;
  } else if (info.type === 'todo') {
    const target = (state.todos || []).find(x => x.id === info.targetId);
    if (!target) return;
    t.groupId = target.groupId || null;       // match the target's group (or ungrouped)
    const arr = state.todos;
    arr.splice(arr.indexOf(t), 1);
    const ti = arr.indexOf(target);
    arr.splice(info.before ? ti : ti + 1, 0, t);
    state._todoSort = 'manual';
    const sel = document.getElementById('todoSort');
    if (sel) sel.value = 'manual';
  }
  saveStateDebounced();
  renderTodos();
  haptic('medium');
}
// Create a folder without opening the assign sheet; returns its id via callback.
function addTodoGroupSilent(name, cb) {
  name = (name || '').trim().slice(0, 40);
  if (!name) { toast('Name the folder'); return; }
  state.todoGroups = state.todoGroups || [];
  let g = state.todoGroups.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!g) {
    g = { id: 'g' + Date.now() + Math.random().toString(36).slice(2, 5), name, collapsed: false, createdAt: new Date().toISOString() };
    state.todoGroups.push(g);
    saveStateDebounced();
  }
  if (cb) cb(g.id);
}
function deleteTodoGroup(id) {
  if (!confirm('Delete this group? Its tasks move back to ungrouped.')) return;
  state.todoGroups = (state.todoGroups || []).filter(g => g.id !== id);
  (state.todos || []).forEach(t => { if (t.groupId === id) t.groupId = null; });
  saveStateDebounced();
  renderTodos();
}

// ==================== COMPLETED HISTORY ====================
function openCompletedHistory() {
  const body = document.getElementById('completedBody');
  const done = (state.todos || []).filter(t => t.done).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  if (!done.length) {
    body.innerHTML = `<div class="todo-empty"><div class="todo-empty-icon">${icon('checkCircle')}</div><div class="todo-empty-title">No completed tasks yet</div><div class="todo-empty-sub">Finish a task and it'll be recorded here by day.</div></div>`;
    showSheet('completedSheet');
    return;
  }
  const byDate = {};
  done.forEach(t => {
    const k = t.completedAt ? new Date(t.completedAt).toDateString() : 'Earlier';
    (byDate[k] = byDate[k] || []).push(t);
  });
  const dates = Object.keys(byDate).sort((a, b) => a === 'Earlier' ? 1 : b === 'Earlier' ? -1 : new Date(b) - new Date(a));
  let html = '';
  dates.forEach(d => {
    html += `<div class="history-day-head"><span class="history-day-date">${d === 'Earlier' ? 'Earlier' : dayLabel(d)}</span><span class="history-day-meta">${byDate[d].length}</span></div>`;
    byDate[d].forEach(t => {
      const stc = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
      const stDone = stc ? t.subtasks.filter(s => s.done).length : 0;
      html += `<div class="completed-item">
        <span class="ci-check">✓</span>
        <div class="ci-body">
          <div class="ci-text">${escapeHtml(t.text)}</div>
          ${stc ? `<div class="he-sub">${icon('checkCircle')} ${stDone}/${stc} subtasks</div>` : ''}
        </div>
        <span class="ci-pri badge-pri-${t.priority || 3}">${t.priority || 3}</span>
      </div>`;
    });
  });
  body.innerHTML = html;
  showSheet('completedSheet');
}

function renderTodoCard(t) {
  const pri = t.priority || 3;
  const pinned = state.currentTasks.some(x => ctName(x) === t.text);
  const stCount = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
  const stDone = stCount ? t.subtasks.filter(s => s.done).length : 0;
  return `<div class="todo-item pri-${pri} ${t.done ? 'is-done' : ''}" data-id="${t.id}">
    <button class="todo-check">${t.done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</button>
    ${!t.done ? `<button class="todo-pri-badge badge-pri-${pri}">${pri}</button>` : ''}
    <div class="todo-body">
      <div class="todo-text">${escapeHtml(t.text)}</div>
      ${(stCount || (!t.done && t.dueDate)) ? `<div class="todo-meta-row">
        ${stCount ? `<span class="he-sub">${icon('checkCircle')} ${stDone}/${stCount}</span>` : ''}
        ${(!t.done && t.dueDate) ? `<span class="todo-due ${dueInfo(t.dueDate).cls}">${dueInfo(t.dueDate).label}</span>` : ''}
      </div>` : ''}
    </div>
    <div class="todo-actions">
      ${!t.done ? `<span class="todo-drag" title="Drag to reorder / move">⠿</span>` : ''}
      ${!t.done ? `<button class="todo-pin ${pinned ? 'is-pinned' : ''}">${icon('pin')}</button>` : ''}
      <button class="todo-del">×</button>
    </div>
  </div>`;
}

function cyclePriority(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  const cur = t.priority || 3;
  const next = cur === 5 ? 1 : cur + 1;
  setTodoPriority(id, next);
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const breaks = state.todayBreaks || 0;
  document.getElementById('historyToday').textContent =
    `Today: ${state.todayCount} session${state.todayCount !== 1 ? 's' : ''} · ${breaks} break${breaks !== 1 ? 's' : ''}`;
  const hist = state.sessionHistory || [];
  if (hist.length === 0) {
    list.innerHTML = `<div class="todo-empty"><div class="todo-empty-icon">${icon('book')}</div><div class="todo-empty-title">Your journal is empty</div><div class="todo-empty-sub">Finish a focus session and it'll show up here.</div></div>`;
    return;
  }
  const byDate = {};
  hist.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  const dates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
  let html = '';
  dates.forEach(date => {
    const entries = byDate[date];
    const works = entries.filter(e => e.type === 'work' || e.type === 'workManual');
    const mins = works.reduce((s, e) => s + (e.durationMin || 0), 0);
    html += `<div class="history-day-head">
      <span class="history-day-date">${dayLabel(date)}</span>
      <span class="history-day-meta">${formatDur(mins)} · ${works.length}x</span>
      <div class="history-day-acts">
        <button class="day-act-btn" data-day="${date}" data-act="reflect" title="Reflect">${icon('pencil')}</button>
        <button class="day-act-btn" data-day="${date}" data-act="share" title="Share">${icon('share')}</button>
      </div>
    </div>`;
    // Reflection preview
    const ref = (state.dayReflections || {})[date];
    if (ref && (ref.text || ref.rating)) {
      const faceName = ['','faceSad','faceMeh','faceGood','faceGreat'][ref.rating || 0] || '';
      const face = faceName ? icon(faceName) : '';
      html += `<div class="day-reflect-preview" data-day="${date}">${face ? `<span class="drp-emoji">${face}</span>` : ''}<span class="drp-text">${escapeHtml((ref.text || '').slice(0, 80))}${(ref.text || '').length > 80 ? '…' : ''}</span></div>`;
    }
    entries.slice().reverse().forEach(e => {
      const time = new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      if (e.type === 'work' || e.type === 'workManual') {
        html += `<div class="history-entry" data-eid="${e.id}">
          <span class="he-icon">${icon(e.goalIcon) || icon('tomato')}</span>
          <div class="he-body">
            <div class="he-task">${escapeHtml(e.task || 'Focus session')}</div>
            <div class="he-sub">${escapeHtml(e.goalName || 'No category')} · ${formatDur(e.durationMin)}</div>
          </div>
          <span class="he-time">${time}</span>
        </div>`;
      } else {
        html += `<div class="history-entry is-break" data-eid="${e.id}">
          <span class="he-icon">${icon('leaf')}</span>
          <div class="he-body"><div class="he-task">${e.type === 'longBreak' ? 'Long break' : 'Short break'}</div><div class="he-sub">${formatDur(e.durationMin)}</div></div>
          <span class="he-time">${time}</span>
        </div>`;
      }
    });
  });
  list.innerHTML = html;
  // Wire interactions
  list.querySelectorAll('.day-act-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.dataset.act === 'reflect' ? openDayReflect(btn.dataset.day) : shareDay(btn.dataset.day);
    });
  });
  list.querySelectorAll('.history-entry').forEach(el => {
    el.addEventListener('click', () => openJournalEntry(el.dataset.eid));
  });
  list.querySelectorAll('.day-reflect-preview').forEach(el => {
    el.addEventListener('click', () => openDayReflect(el.dataset.day));
  });
}

function dayLabel(date) {
  const today = new Date().toDateString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (date === today) return 'Today';
  if (date === y.toDateString()) return 'Yesterday';
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatDur(m) {
  m = Math.max(0, +m || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// ==================== GOAL SELECTOR ====================
function updateGoalSelectorBtn() {
  const btn = document.getElementById('goalSelectorBtn');
  const txt = document.getElementById('goalSelectorText');
  if (!btn || !txt) return;
  const goal = (state.goals || []).find(g => g.id === state.activeGoal);
  txt.innerHTML = goal ? `${icon(goal.icon)} ${escapeHtml(goal.name)}` : `${icon('target')} Set category`;
  btn.classList.toggle('has-goal', !!goal);
}
function openGoalSelector() {
  const list = document.getElementById('goalList');
  const goals = state.goals || DEFAULT_GOALS;
  let html = goals.map(g => `
    <button class="goal-option ${state.activeGoal === g.id ? 'active' : ''}" data-gid="${g.id}">
      <span class="goal-opt-icon">${icon(g.icon)}</span>
      <span class="goal-opt-name">${escapeHtml(g.name)}</span>
      ${state.activeGoal === g.id ? '<span class="goal-opt-check">✓</span>' : ''}
    </button>`).join('');
  html += `<button class="goal-option ${!state.activeGoal ? 'active' : ''}" data-gid="">
    <span class="goal-opt-icon">${icon('target')}</span>
    <span class="goal-opt-name">No category</span>
    ${!state.activeGoal ? '<span class="goal-opt-check">✓</span>' : ''}
  </button>`;
  list.innerHTML = html;
  list.querySelectorAll('.goal-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeGoal = btn.dataset.gid || null;
      saveStateDebounced();
      hideSheet('goalSelectorSheet');
      updateGoalSelectorBtn();
      haptic('light');
    });
  });
  showSheet('goalSelectorSheet');
}

// ==================== HOME SUMMARY ====================
function renderHomeSummary() {
  const el = document.getElementById('homeSummary');
  if (!el) return;
  const today = new Date().toDateString();
  const yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
  const yesterday = yDate.toDateString();
  const hist = state.sessionHistory || [];
  const todayMins = hist.filter(e => e.date === today && (e.type === 'work' || e.type === 'workManual')).reduce((s, e) => s + (e.durationMin || 0), 0);
  const yMins = hist.filter(e => e.date === yesterday && (e.type === 'work' || e.type === 'workManual')).reduce((s, e) => s + (e.durationMin || 0), 0);
  if (todayMins === 0 && yMins === 0) { el.innerHTML = ''; return; }
  const diff = todayMins - yMins;
  const sign = diff > 0 ? '+' : '';
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  el.innerHTML = `<span class="hs-time">${formatDur(todayMins)} focused today</span><span class="hs-diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${arrow} ${sign}${formatDur(Math.abs(diff))} vs yesterday</span>`;
}

// ==================== ACHIEVEMENTS SHEET ====================
function renderAchievementsSheet() {
  const t = levelTitle(state.level);
  const xpNeeded = state.level * 100;
  const xpPct = Math.min(100, Math.round((state.experience / xpNeeded) * 100));
  let html = `<div class="ach-hero">
    <div class="ach-hero-icon">${icon(t.icon)}</div>
    <div class="ach-hero-name">Level ${state.level} — ${t.name}</div>
    <div class="ach-xp-bar-wrap"><div class="ach-xp-bar-fill" data-xp="${xpPct}"></div></div>
    <div class="ach-xp-label">${state.experience} / ${xpNeeded} XP · next level</div>
  </div><div class="ach-grid">`;
  ACHIEVEMENTS.forEach(a => {
    const cur = a.get(state);
    const done = cur >= a.max;
    const pct = Math.round((cur / a.max) * 100);
    html += `<div class="ach-card ${done ? 'done' : ''}">
      <div class="ach-card-icon">${icon(a.icon)}</div>
      <div class="ach-card-body">
        <div class="ach-card-title">${a.title}</div>
        <div class="ach-card-desc">${a.desc}</div>
        <div class="ach-card-bar"><div class="ach-card-bar-fill" data-width="${pct}%"></div></div>
        <div class="ach-card-count">${cur} / ${a.max}</div>
      </div>
    </div>`;
  });
  html += '</div>';
  const body = document.getElementById('achievementsBody');
  body.innerHTML = html;
  setTimeout(() => {
    body.querySelectorAll('.ach-card-bar-fill[data-width]').forEach(el => { el.style.width = el.dataset.width; });
    body.querySelectorAll('.ach-xp-bar-fill[data-xp]').forEach(el => { el.style.width = el.dataset.xp + '%'; });
  }, 60);
}

// ==================== FOCUS HEATMAP ====================
function renderFocusHeatmap() {
  const grid = document.getElementById('fhmGrid');
  if (!grid) return;
  const WEEKS = 10, DAYS = 7;
  const DOW = ['M','T','W','T','F','S','S'];
  const minutesByDate = {};
  (state.sessionHistory || []).forEach(e => {
    if (e.type === 'work' || e.type === 'workManual') minutesByDate[e.date] = (minutesByDate[e.date] || 0) + (e.durationMin || 0);
  });
  const vals = Object.values(minutesByDate).filter(v => v > 0);
  const maxMins = vals.length ? Math.max(...vals) : 60;
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (WEEKS * DAYS) + 1);
  // Build columns
  const columns = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < DAYS; d++) {
      const dt = new Date(startDate);
      dt.setDate(startDate.getDate() + w * DAYS + d);
      col.push(dt);
    }
    columns.push(col);
  }
  let html = '<div class="fhm-wrap-inner"><div class="fhm-dow-col">';
  DOW.forEach(l => html += `<div class="fhm-dow-lbl">${l}</div>`);
  html += '</div><div class="fhm-cols">';
  columns.forEach(col => {
    html += '<div class="fhm-col">';
    col.forEach(date => {
      const future = date > now;
      const dateStr = date.toDateString();
      const mins = minutesByDate[dateStr] || 0;
      let lvl = future ? 'future' : mins === 0 ? 0 : mins < maxMins * 0.25 ? 1 : mins < maxMins * 0.5 ? 2 : mins < maxMins * 0.75 ? 3 : 4;
      html += `<div class="fhm-cell lvl-${lvl}"></div>`;
    });
    html += '</div>';
  });
  html += '</div></div>';
  grid.innerHTML = html;
}

// ==================== JOURNAL ENTRY EDIT ====================
let editingEntryId = null;
function openJournalEntry(id) {
  const entry = (state.sessionHistory || []).find(e => e.id === id);
  if (!entry) return;
  editingEntryId = id;
  const isWork = entry.type === 'work' || entry.type === 'workManual';
  const time = new Date(entry.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  document.getElementById('jeHeader').innerHTML = isWork ? `${icon('tomato')} Focus Session` : `${icon('leaf')} Break`;
  document.getElementById('jeMeta').innerHTML = `<div class="je-meta-row">
    <span>${time} · ${formatDur(entry.durationMin)}</span>
    ${entry.goalName ? `<span class="je-goal-tag">${entry.goalIcon || ''} ${escapeHtml(entry.goalName)}</span>` : ''}
  </div>${entry.task ? `<div class="je-task">${escapeHtml(entry.task)}</div>` : ''}`;
  document.getElementById('jeNotes').value = entry.notes || '';
  renderEntrySplit(entry);
  showSheet('journalEntrySheet');
}

// Per-task time split inside a session (capped to the session length).
function renderEntrySplit(entry) {
  const wrap = document.getElementById('jeSplit');
  if (!wrap) return;
  const isWork = entry.type === 'work' || entry.type === 'workManual' || entry.type === 'workPartial';
  const meta = Array.isArray(entry.taskMeta) && entry.taskMeta.length
    ? entry.taskMeta
    : (Array.isArray(entry.tasks) ? entry.tasks.map(n => ({ name: n, groupId: null, clientId: null })) : []);
  if (!isWork || meta.length < 1) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  const total = entry.durationMin || 0;
  const existing = {};
  (entry.taskSplits || []).forEach(s => { existing[s.name] = s.minutes; });
  const rows = meta.map((m, i) => {
    const split = (entry.taskSplits || []).find(s => s.name === m.name);
    const cid = split && split.clientId != null ? split.clientId : (m.clientId || null);
    const cl = clientById(cid);
    const val = existing[m.name] != null ? existing[m.name] : '';
    const tag = cl
      ? `<button class="jes-client" style="--cc:${cl.color}">${icon(cl.type === 'client' ? 'briefcase' : 'home')} ${escapeHtml(cl.name)}</button>`
      : `<button class="jes-client jes-client-none">+ client</button>`;
    return `<div class="jes-row" data-name="${escapeHtml(m.name)}" data-cid="${cid || ''}">
      <span class="jes-name">${escapeHtml(m.name)}</span>${tag}
      <input type="number" class="jes-min" min="0" max="${total}" value="${val}" inputmode="numeric"><span class="jes-unit">m</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="jes-head">Split ${total}m across tasks <span class="jes-remain" id="jesRemain"></span></div>${rows}<button class="jes-even" id="jesEven">Distribute evenly</button>`;
  // Tap a row's client tag to assign it (feeds the Clients view)
  wrap.querySelectorAll('.jes-client').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.jes-row');
    openClientPickerCore(row.dataset.cid || null, cid => {
      row.dataset.cid = cid || '';
      const cl = clientById(cid);
      btn.className = 'jes-client' + (cl ? '' : ' jes-client-none');
      if (cl) { btn.style.setProperty('--cc', cl.color); btn.innerHTML = `${icon(cl.type === 'client' ? 'briefcase' : 'home')} ${escapeHtml(cl.name)}`; }
      else { btn.style.removeProperty('--cc'); btn.textContent = '+ client'; }
    });
  }));
  const inputs = () => Array.from(wrap.querySelectorAll('.jes-min'));
  const recompute = () => {
    const sum = inputs().reduce((s, el) => s + (parseInt(el.value, 10) || 0), 0);
    const r = document.getElementById('jesRemain');
    r.textContent = `${sum} / ${total} min`;
    r.classList.toggle('over', sum > total);
  };
  inputs().forEach(el => el.addEventListener('input', () => {
    const others = inputs().filter(x => x !== el).reduce((s, x) => s + (parseInt(x.value, 10) || 0), 0);
    let v = parseInt(el.value, 10) || 0;
    if (others + v > total) { v = Math.max(0, total - others); el.value = v; }   // cap to total
    recompute();
  }));
  document.getElementById('jesEven').addEventListener('click', () => {
    const n = inputs().length; if (!n) return;
    const base = Math.floor(total / n), extra = total - base * n;
    inputs().forEach((el, idx) => { el.value = base + (idx < extra ? 1 : 0); });
    recompute();
  });
  recompute();
}

function saveJournalEntry() {
  const entry = (state.sessionHistory || []).find(e => e.id === editingEntryId);
  if (!entry) return;
  entry.notes = document.getElementById('jeNotes').value.trim();
  const wrap = document.getElementById('jeSplit');
  if (wrap && !wrap.classList.contains('hidden')) {
    const splits = [];
    wrap.querySelectorAll('.jes-row').forEach(row => {
      const min = parseInt(row.querySelector('.jes-min').value, 10) || 0;
      if (min > 0) splits.push({ name: row.dataset.name || '', minutes: min, clientId: row.dataset.cid || null });
    });
    entry.taskSplits = splits;
  }
  saveStateDebounced();
  hideSheet('journalEntrySheet');
  renderHistory();
  toast('Saved');
}
function deleteJournalEntry() {
  if (!editingEntryId || !confirm('Delete this session?')) return;
  state.sessionHistory = state.sessionHistory.filter(e => e.id !== editingEntryId);
  saveStateDebounced();
  hideSheet('journalEntrySheet');
  renderHistory();
  toast('Deleted');
}

// ==================== DAY REFLECT ====================
let currentReflectDate = null;
function openDayReflect(dateStr) {
  currentReflectDate = dateStr;
  const ref = (state.dayReflections || {})[dateStr];
  document.getElementById('drHeader').textContent = `Reflect — ${dayLabel(dateStr)}`;
  document.getElementById('drText').value = ref?.text || '';
  document.querySelectorAll('#drRating .rating-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.r) === (ref?.rating || 0));
  });
  showSheet('dayReflectSheet');
  setTimeout(() => document.getElementById('drText').focus(), 300);
}
function saveDayReflect() {
  if (!currentReflectDate) return;
  const text = document.getElementById('drText').value.trim();
  const rb = document.querySelector('#drRating .rating-btn.active');
  const rating = rb ? Number(rb.dataset.r) : 0;
  if (!state.dayReflections) state.dayReflections = {};
  if (text || rating) state.dayReflections[currentReflectDate] = { text, rating, updatedAt: new Date().toISOString() };
  else delete state.dayReflections[currentReflectDate];
  saveStateDebounced();
  hideSheet('dayReflectSheet');
  renderHistory();
  toast('Reflection saved');
  haptic('medium');
}

// ==================== SHARE DAY ====================
function shareDay(dateStr) {
  const entries = (state.sessionHistory || []).filter(e => e.date === dateStr);
  const works = entries.filter(e => e.type === 'work' || e.type === 'workManual');
  const mins = works.reduce((s, e) => s + (e.durationMin || 0), 0);
  const tasks = [...new Set(works.map(e => e.task).filter(Boolean))].slice(0, 5);
  let text = `${dayLabel(dateStr)} focus report\n${formatDur(mins)} · ${works.length} session${works.length !== 1 ? 's' : ''}`;
  if (tasks.length) text += '\n\n' + tasks.map(t => `- ${t}`).join('\n');
  text += `\n\n${state.streak}-day streak · Level ${state.level}\nTracked with Dopamodoro`;
  if (navigator.share) {
    navigator.share({ title: `Dopamodoro — ${dayLabel(dateStr)}`, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => toast('Copied!')).catch(() => toast('Sharing not supported'));
  }
}

// ==================== TASK DETAIL SHEET ====================
let editingTaskId = null;
function openTaskDetail(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  editingTaskId = id;
  document.getElementById('tdText').value = t.text;
  const dueEl = document.getElementById('tdDue');
  if (dueEl) dueEl.value = t.dueDate || '';
  const grpEl = document.getElementById('tdGroup');
  if (grpEl) {
    const groups = state.todoGroups || [];
    grpEl.innerHTML = `<option value="">No group</option>` +
      groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    grpEl.value = t.groupId && groups.some(g => g.id === t.groupId) ? t.groupId : '';
  }
  document.querySelectorAll('#tdPri .pri-btn').forEach(b => b.classList.toggle('is-active', Number(b.dataset.pri) === (t.priority || 3)));
  renderNotesAndSubtasks(t);
  showSheet('taskDetailSheet');
}
function renderNotesAndSubtasks(t) {
  const nl = document.getElementById('tdNotesList');
  const sl = document.getElementById('tdSubtaskList');
  if (!t.notes.length) nl.innerHTML = '<div class="todo-empty-sub" style="text-align:center;padding:8px;">No notes yet</div>';
  else nl.innerHTML = t.notes.map(n => `<div class="note-item" data-nid="${n.id}"><span style="flex:1;">${escapeHtml(n.text).replace(/\n/g, '<br>')}</span><button class="x">×</button></div>`).join('');
  if (!t.subtasks.length) sl.innerHTML = '<div class="todo-empty-sub" style="text-align:center;padding:8px;">No subtasks yet</div>';
  else sl.innerHTML = t.subtasks.map(s => `<div class="subtask-item ${s.done ? 'is-done' : ''}" data-sid="${s.id}"><button class="subtask-check"></button><span style="flex:1;">${escapeHtml(s.text)}</span><button class="x" style="background:none;border:none;color:var(--text-3);font-size:14px;cursor:pointer;">×</button></div>`).join('');
  nl.querySelectorAll('.x').forEach(b => b.addEventListener('click', () => {
    const nid = b.closest('.note-item').dataset.nid;
    t.notes = t.notes.filter(n => n.id !== nid);
    saveStateDebounced();
    renderNotesAndSubtasks(t);
  }));
  sl.querySelectorAll('.subtask-check').forEach(b => b.addEventListener('click', () => {
    const sid = b.closest('.subtask-item').dataset.sid;
    const s = t.subtasks.find(x => x.id === sid);
    if (s) { s.done = !s.done; saveStateDebounced(); renderNotesAndSubtasks(t); renderTodos(); }
  }));
  sl.querySelectorAll('.subtask-item > .x, .subtask-item > button.x').forEach(b => b.addEventListener('click', () => {
    const sid = b.closest('.subtask-item').dataset.sid;
    t.subtasks = t.subtasks.filter(x => x.id !== sid);
    saveStateDebounced();
    renderNotesAndSubtasks(t);
    renderTodos();
  }));
}
function saveTaskDetail() {
  const t = state.todos.find(x => x.id === editingTaskId);
  if (!t) return;
  t.text = document.getElementById('tdText').value.trim() || t.text;
  const activeP = document.querySelector('#tdPri .pri-btn.is-active');
  if (activeP) t.priority = Number(activeP.dataset.pri);
  const dueEl = document.getElementById('tdDue');
  t.dueDate = (dueEl && dueEl.value) ? dueEl.value : null;
  const grpEl = document.getElementById('tdGroup');
  t.groupId = (grpEl && grpEl.value) ? grpEl.value : null;
  saveStateDebounced();
  syncDeadlineNotifications();
  hideSheet('taskDetailSheet');
  renderTodos();
  renderDeadlineStrip();
  toast('Saved');
}
function deleteFromDetail() {
  if (!editingTaskId) return;
  if (!confirm('Delete this task?')) return;
  deleteTodo(editingTaskId);
  hideSheet('taskDetailSheet');
}

// ==================== SHEET HELPERS ====================
function showSheet(id) { document.getElementById(id).classList.remove('hidden'); }
function hideSheet(id) { document.getElementById(id).classList.add('hidden'); }

// ==================== VIEW SWITCHING ====================
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById(`view${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.add('active');
  if (name === 'tasks') renderTodos();
  if (name === 'journal') renderHistory();
  if (name === 'coach') renderCoachDashboard();
  if (name === 'settings') loadSettingsForm();
  haptic('light');
}

// ==================== SETTINGS ====================
function loadSettingsForm() {
  document.getElementById('workDuration').value = state.settings.workDuration;
  document.getElementById('shortBreakDuration').value = state.settings.shortBreakDuration;
  document.getElementById('longBreakDuration').value = state.settings.longBreakDuration;
  document.getElementById('longBreakInterval').value = state.settings.longBreakInterval;
  document.getElementById('autoStartBreaks').checked = !!state.settings.autoStartBreaks;
  document.getElementById('autoStartWork').checked = !!state.settings.autoStartWork;
  document.getElementById('notificationsEnabled').checked = state.settings.notificationsEnabled !== false;
  document.getElementById('hapticsEnabled').checked = state.settings.hapticsEnabled !== false;
}
function saveSettings() {
  state.settings = {
    ...state.settings,
    workDuration: parseInt(document.getElementById('workDuration').value) || 25,
    shortBreakDuration: parseInt(document.getElementById('shortBreakDuration').value) || 5,
    longBreakDuration: parseInt(document.getElementById('longBreakDuration').value) || 15,
    longBreakInterval: parseInt(document.getElementById('longBreakInterval').value) || 4,
    autoStartBreaks: document.getElementById('autoStartBreaks').checked,
    autoStartWork: document.getElementById('autoStartWork').checked,
    notificationsEnabled: document.getElementById('notificationsEnabled').checked,
    hapticsEnabled: document.getElementById('hapticsEnabled').checked
  };
  if (!state.isRunning && !state.isPaused) {
    state.sessionDuration = getTotalForMode(state.mode);
  }
  saveStateDebounced();
  renderAll();
  toast('Settings saved');
  haptic('light');
}

// ==================== UTIL ====================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==================== DEADLINES ====================
// Classify a due date relative to today → { cls, label } for badges/strips.
function dueInfo(dateStr) {
  if (!dateStr) return { cls: 'none', label: '' };
  const due = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dueDay - startToday) / 86400000);
  if (diff < 0)  return { cls: 'overdue', label: `Overdue ${Math.abs(diff)}d` };
  if (diff === 0) return { cls: 'today', label: 'Due today' };
  if (diff === 1) return { cls: 'soon', label: 'Due tomorrow' };
  if (diff <= 3)  return { cls: 'soon', label: `Due in ${diff}d` };
  return { cls: 'later', label: dueDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
}

// Ambient "next deadline" pill on the timer screen.
function renderDeadlineStrip() {
  const el = document.getElementById('deadlineStrip');
  if (!el) return;
  const urgent = (state.todos || [])
    .filter(t => !t.done && t.dueDate)
    .map(t => ({ t, d: dueInfo(t.dueDate) }))
    .filter(o => o.d.cls === 'overdue' || o.d.cls === 'today' || o.d.cls === 'soon')
    .sort((a, b) => new Date(a.t.dueDate) - new Date(b.t.dueDate));
  if (!urgent.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  const top = urgent[0];
  const more = urgent.length - 1;
  el.classList.remove('hidden');
  el.className = `deadline-strip ${top.d.cls}`;
  el.innerHTML = `
    <span class="ds-icon">${top.d.cls === 'overdue' ? icon('warning') : icon('clock')}</span>
    <div class="ds-body">
      <div class="ds-task">${escapeHtml(top.t.text)}</div>
      <div class="ds-meta">${top.d.label}${more > 0 ? ` · +${more} more` : ''}</div>
    </div>
    <span class="ds-go">›</span>`;
  el.onclick = () => switchView('tasks');
}

// ==================== POST-SESSION TASK REVIEW ====================
function maybeOpenTaskReview() {
  const tasks = (state.pendingReviewTasks || []).filter(Boolean);
  if (!tasks.length) { state.pendingReviewTasks = null; return; }
  const body = document.getElementById('taskReviewBody');
  if (!body) { state.pendingReviewTasks = null; return; }
  body.innerHTML = `<p class="sheet-hint">Tap the ones you finished — they'll be checked off your list.</p>` +
    tasks.map((t, i) => `
      <label class="review-item" data-i="${i}">
        <input type="checkbox" data-task="${escapeHtml(t)}">
        <span class="review-check"></span>
        <span class="review-text">${escapeHtml(t)}</span>
      </label>`).join('');
  body.querySelectorAll('.review-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') {
        const cb = el.querySelector('input');
        cb.checked = !cb.checked;
      }
      el.classList.toggle('checked', el.querySelector('input').checked);
      haptic('light');
    });
  });
  showSheet('taskReviewSheet');
  haptic('medium');
}

function resolveTaskReview() {
  const finished = [];
  document.querySelectorAll('#taskReviewBody input[type=checkbox]').forEach(c => {
    if (c.checked) finished.push(c.dataset.task);
  });
  finished.forEach(text => {
    const lower = text.toLowerCase();
    const todo = (state.todos || []).find(td => !td.done && td.text.toLowerCase() === lower);
    if (todo) { todo.done = true; todo.completedAt = new Date().toISOString(); }
    const i = state.currentTasks.findIndex(x => ctName(x) === text);
    if (i >= 0) state.currentTasks.splice(i, 1);
  });
  state.pendingReviewTasks = null;
  saveStateDebounced();
  syncDeadlineNotifications();
  hideSheet('taskReviewSheet');
  renderAll();
  if (finished.length) { toast(`${finished.length} done — nice work!`); haptic('medium'); }
}

function skipTaskReview() {
  state.pendingReviewTasks = null;
  saveStateDebounced();
  hideSheet('taskReviewSheet');
}

// ==================== COACH / INSIGHTS (free, local) ====================
function fmtHour(h) {
  const ap = h < 12 ? 'AM' : 'PM';
  let hr = h % 12; if (hr === 0) hr = 12;
  return `${hr} ${ap}`;
}

// Aggregate session history into the numbers the dashboard + tips need.
function computeInsights() {
  const hist = state.sessionHistory || [];
  const works = hist.filter(e => e.type === 'work' || e.type === 'workManual');
  const now = new Date();
  const today = now.toDateString();

  // Days active in the last 7
  const last7 = [];
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() - i); last7.push(d.toDateString()); }
  const daysActive = last7.filter(ds => works.some(w => w.date === ds)).length;

  // Sessions per day, oldest → today (for the bar chart)
  const weekCounts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const ds = d.toDateString();
    weekCounts.push({
      label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      count: works.filter(w => w.date === ds).length,
      isToday: ds === today
    });
  }
  const thisWeek = weekCounts.reduce((s, d) => s + d.count, 0);
  let lastWeek = 0;
  for (let i = 13; i >= 7; i--) { const d = new Date(now); d.setDate(now.getDate() - i); lastWeek += works.filter(w => w.date === d.toDateString()).length; }

  const todaySessions = works.filter(w => w.date === today).length;
  const todayMins = works.filter(w => w.date === today).reduce((s, w) => s + (w.durationMin || 0), 0);
  const breaksToday = hist.filter(e => e.date === today && (e.type === 'shortBreak' || e.type === 'longBreak')).length;

  // Peak focus hour across all history
  const hourCounts = {};
  works.forEach(w => { const h = new Date(w.ts).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
  let peakHour = null, peakCount = 0;
  Object.entries(hourCounts).forEach(([h, c]) => { if (c > peakCount) { peakCount = c; peakHour = +h; } });

  return { daysActive, weekCounts, thisWeek, lastWeek, todaySessions, todayMins, breaksToday, peakHour, peakCount };
}

// 0–100 score from five weighted sub-scores. All computed locally — no API.
function computeFocusScore(ins) {
  const consistency = Math.round((ins.daysActive / 7) * 30);                 // 0–30
  const streakBonus = Math.round(Math.min(state.streak, 10) / 10 * 20);       // 0–20
  const target = state.settings.longBreakInterval || 4;
  const sessionTarget = Math.round(Math.min(ins.todaySessions / target, 1) * 25); // 0–25
  let breakComp = 0;                                                          // 0–15
  if (ins.todaySessions > 0) breakComp = Math.round(Math.min((ins.breaksToday / ins.todaySessions) / 0.75, 1) * 15);
  let trend;                                                                  // 0–10
  if (ins.lastWeek === 0) trend = ins.thisWeek > 0 ? 10 : 0;
  else trend = Math.round(Math.min(ins.thisWeek / ins.lastWeek, 1.5) / 1.5 * 10);
  const total = Math.min(100, consistency + streakBonus + sessionTarget + breakComp + trend);
  return {
    total,
    parts: [
      { key: 'Consistency (7d)', val: consistency, max: 30 },
      { key: 'Streak', val: streakBonus, max: 20 },
      { key: "Today's target", val: sessionTarget, max: 25 },
      { key: 'Breaks taken', val: breakComp, max: 15 },
      { key: 'Weekly trend', val: trend, max: 10 },
    ]
  };
}

function coachTips(ins) {
  const tips = [];
  const overdue = (state.todos || []).filter(t => !t.done && t.dueDate && dueInfo(t.dueDate).cls === 'overdue');
  if (overdue.length) tips.push({ icon: 'warning', text: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue — start with just 15 minutes on one.` });
  if (ins.todaySessions === 0) tips.push({ icon: 'sunrise', text: "You haven't focused yet today. One short session is enough to start." });
  if (state.streak >= 3 && ins.todaySessions === 0) tips.push({ icon: 'flame', text: `Your ${state.streak}-day streak is at risk — protect it with one session today.` });
  if (ins.peakHour != null && ins.peakCount >= 3) tips.push({ icon: 'clock', text: `You focus best around ${fmtHour(ins.peakHour)}. Block that hour for your hardest task.` });
  if (ins.lastWeek > 0 && ins.thisWeek >= ins.lastWeek) tips.push({ icon: 'trending', text: `Matching or beating last week (${ins.thisWeek} vs ${ins.lastWeek}). Keep the wave going.` });
  if (ins.lastWeek > 0 && ins.thisWeek < ins.lastWeek) tips.push({ icon: 'pulse', text: 'A little behind last week — a couple of sessions today closes the gap.' });
  if (!tips.length) tips.push({ icon: 'spark', text: 'Consistency beats intensity. Show up again tomorrow and the score climbs.' });
  return tips.slice(0, 4);
}

// ==================== "WHAT I NOTICED" — PATTERNS ====================
// Folders vs individual tasks, over 7/30/60 days, from real session history.
let nsPatView = 'folders';
let nsPatRange = 7;
function nsFolderNameOf(e) {
  const meta = Array.isArray(e.taskMeta) ? e.taskMeta.find(m => m && m.groupId) : null;
  if (meta) { const g = groupById(meta.groupId); if (g) return g.name; }
  if (e.goalName) return e.goalName;
  return 'No folder';
}
function computeNsPatterns(days, view) {
  const cutoff = Date.now() - days * 86400000;
  const isWork = e => e.type === 'work' || e.type === 'workPartial' || e.type === 'workManual';
  const sessions = (state.sessionHistory || []).filter(e => isWork(e) && new Date(e.ts) >= cutoff);
  const totalMin = sessions.reduce((s, e) => s + (e.durationMin || 0), 0);
  if (sessions.length < 3) return { total: sessions.length, rows: [], view };

  if (view === 'tasks') {
    const byTask = {};
    sessions.forEach(e => {
      const tasks = (Array.isArray(e.tasks) && e.tasks.filter(Boolean).length) ? e.tasks.filter(Boolean) : (e.task ? [e.task] : []);
      if (!tasks.length) return;
      const per = (e.durationMin || 0) / tasks.length;
      tasks.forEach(t => { if (!byTask[t]) byTask[t] = { min: 0, count: 0 }; byTask[t].min += per; byTask[t].count++; });
    });
    const denom = Object.values(byTask).reduce((s, v) => s + v.min, 0) || 1;
    const rows = Object.entries(byTask)
      .map(([name, v]) => ({ name, count: v.count, min: Math.round(v.min), pct: Math.round(v.min / denom * 100) }))
      .sort((a, b) => b.min - a.min).slice(0, 5);
    return { total: sessions.length, totalMin, rows, view };
  }
  const byFolder = {};
  sessions.forEach(e => {
    const name = nsFolderNameOf(e);
    if (!byFolder[name]) byFolder[name] = { count: 0, min: 0 };
    byFolder[name].count++; byFolder[name].min += (e.durationMin || 0);
  });
  const rows = Object.entries(byFolder)
    .map(([name, v]) => ({ name, count: v.count, min: v.min, pct: Math.round(v.count / sessions.length * 100) }))
    .sort((a, b) => b.count - a.count).slice(0, 4);
  return { total: sessions.length, totalMin, rows, view };
}
function nsFmtMin(m) { return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`; }
function nsRenderPatterns() {
  const body = document.getElementById('nsPatternsBody');
  const sub = document.getElementById('nsPatternsSub');
  if (!body) return;
  const p = computeNsPatterns(nsPatRange, nsPatView);
  const controls = `
    <div class="ns-pat-controls">
      <div class="ns-seg" id="nsPatView">
        <button class="ns-seg-btn${nsPatView === 'folders' ? ' on' : ''}" data-view="folders">Folders</button>
        <button class="ns-seg-btn${nsPatView === 'tasks' ? ' on' : ''}" data-view="tasks">Tasks</button>
      </div>
      <div class="ns-range" id="nsPatRange">
        ${[7, 30, 60].map(d => `<button class="ns-range-btn${nsPatRange === d ? ' on' : ''}" data-days="${d}">${d}d</button>`).join('')}
      </div>
    </div>`;
  if (!p.rows.length) {
    if (sub) sub.textContent = '';
    body.innerHTML = controls + `<div class="ns-pat-empty">Not enough sessions in the last ${nsPatRange} days yet. Run a few focus blocks and the breakdown fills in.</div>`;
    wireNsPatControls();
    return;
  }
  const unit = p.view === 'tasks' ? 'time' : 'sessions';
  if (sub) sub.textContent = `${p.rows[0].pct}% ${unit} on ${p.rows[0].name.length > 16 ? p.rows[0].name.slice(0, 15) + '…' : p.rows[0].name}`;
  body.innerHTML = controls + p.rows.map(r => `
    <div class="ns-pat-row">
      <span class="ns-pat-name">${escapeHtml(r.name)}</span>
      <div class="ns-pat-bar"><span style="width:${r.pct}%"></span></div>
      <span class="ns-pat-cnt">${p.view === 'tasks' ? nsFmtMin(r.min) : r.count} · ${r.pct}%</span>
    </div>`).join('');
  wireNsPatControls();
}
function wireNsPatControls() {
  document.querySelectorAll('#nsPatView .ns-seg-btn').forEach(b =>
    b.addEventListener('click', () => { nsPatView = b.dataset.view; nsRenderPatterns(); }));
  document.querySelectorAll('#nsPatRange .ns-range-btn').forEach(b =>
    b.addEventListener('click', () => { nsPatRange = Number(b.dataset.days); nsRenderPatterns(); }));
}

function renderCoachDashboard() {
  const ins = computeInsights();
  const score = computeFocusScore(ins);

  document.getElementById('csScore').textContent = score.total;
  const ring = document.getElementById('csRing');
  const C = 2 * Math.PI * 78;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C;
  setTimeout(() => { ring.style.strokeDashoffset = C * (1 - score.total / 100); }, 60);

  document.getElementById('csLabel').textContent =
    score.total >= 80 ? 'On fire' :
    score.total >= 60 ? 'Strong rhythm' :
    score.total >= 40 ? 'Building momentum' :
    score.total >= 20 ? 'Getting started' : "Let's begin";

  document.getElementById('csBars').innerHTML = score.parts.map(p => `
    <div class="cs-bar-row">
      <div class="cs-bar-head"><span>${p.key}</span><span>${p.val}/${p.max}</span></div>
      <div class="cs-bar-track"><div class="cs-bar-fill" style="width:${Math.round(p.val / p.max * 100)}%"></div></div>
    </div>`).join('');

  const peak = ins.peakHour != null ? fmtHour(ins.peakHour) : '—';
  document.getElementById('csMetrics').innerHTML = `
    <div class="cs-metric"><div class="cs-metric-val">${ins.todaySessions}</div><div class="cs-metric-lbl">Sessions today</div></div>
    <div class="cs-metric"><div class="cs-metric-val">${formatDur(ins.todayMins)}</div><div class="cs-metric-lbl">Focused today</div></div>
    <div class="cs-metric"><div class="cs-metric-val">${state.streak} ${icon('flame')}</div><div class="cs-metric-lbl">Day streak</div></div>
    <div class="cs-metric"><div class="cs-metric-val">${peak}</div><div class="cs-metric-lbl">Peak focus hour</div></div>`;

  const maxCount = Math.max(1, ...ins.weekCounts.map(d => d.count));
  document.getElementById('csWeek').innerHTML = ins.weekCounts.map(d => `
    <div class="cs-week-col ${d.isToday ? 'today' : ''}">
      <div class="cs-week-bar" style="height:${3 + Math.round(d.count / maxCount * 64)}px"></div>
      <div class="cs-week-cnt">${d.count || ''}</div>
      <div class="cs-week-lbl">${d.label}</div>
    </div>`).join('');

  document.getElementById('csTips').innerHTML = coachTips(ins).map(t => `
    <div class="cs-tip"><span class="cs-tip-icon">${icon(t.icon)}</span><span>${t.text}</span></div>`).join('');

  nsRenderPatterns();
  renderWinVault();
  renderClientHours();
}

// Aggregate focus minutes per client/personal project (from journal time-splits;
// falls back to an even split of session time across its tagged clients).
function aggregateClientHours() {
  const totals = {};
  (state.sessionHistory || []).forEach(e => {
    if (e.type !== 'work' && e.type !== 'workManual' && e.type !== 'workPartial') return;
    if (Array.isArray(e.taskSplits) && e.taskSplits.some(s => s.clientId)) {
      e.taskSplits.forEach(s => { if (s.clientId) totals[s.clientId] = (totals[s.clientId] || 0) + (s.minutes || 0); });
    } else if (Array.isArray(e.taskMeta)) {
      const ids = [...new Set(e.taskMeta.map(m => m.clientId).filter(Boolean))];
      if (ids.length) { const share = (e.durationMin || 0) / ids.length; ids.forEach(id => { totals[id] = (totals[id] || 0) + share; }); }
    }
  });
  return totals;
}
function renderClientHours() {
  const el = document.getElementById('clientHours');
  if (!el) return;
  const totals = aggregateClientHours();
  const entries = Object.entries(totals).map(([id, min]) => ({ c: clientById(id), min })).filter(o => o.c && o.min > 0).sort((a, b) => b.min - a.min);
  if (!entries.length) {
    el.innerHTML = `<div class="todo-empty-sub" style="text-align:center;padding:10px;">Tag tasks with a client or personal label and split session time in the Journal to see hours here.</div>`;
    return;
  }
  const fmtH = m => (m / 60 >= 1 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);
  const clientTotal = entries.filter(o => o.c.type === 'client').reduce((s, o) => s + o.min, 0);
  el.innerHTML = entries.map(o => `<div class="pb-row"><span class="pb-dot" style="background:${o.c.color}"></span><span class="pb-name">${icon(o.c.type === 'client' ? 'briefcase' : 'home')} ${escapeHtml(o.c.name)}</span><span class="pb-time">${fmtH(o.min)}</span></div>`).join('') +
    (clientTotal > 0 ? `<button class="pb-export" id="chExport">${icon('share')} Export client hours (${fmtH(clientTotal)})</button>` : '');
  const ex = document.getElementById('chExport');
  if (ex) ex.addEventListener('click', exportClientCSV);
}
function exportClientCSV() {
  const rows = [['Date', 'Client/Project', 'Type', 'Task', 'Minutes']];
  (state.sessionHistory || []).forEach(e => {
    if (e.type !== 'work' && e.type !== 'workManual' && e.type !== 'workPartial') return;
    if (Array.isArray(e.taskSplits) && e.taskSplits.some(s => s.clientId)) {
      e.taskSplits.filter(s => s.clientId).forEach(s => { const c = clientById(s.clientId); if (c) rows.push([new Date(e.ts).toLocaleDateString(), c.name, c.type, s.name, Math.round(s.minutes || 0)]); });
    }
  });
  if (rows.length === 1) { toast('No client hours yet'); return; }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  if (navigator.share) navigator.share({ title: 'Dopamodoro — client hours', text: csv }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(csv).then(() => toast('CSV copied')).catch(() => toast('Copy not supported'));
}

// ==================== HOME COACH NUDGE ====================
// Progressive, dismissable micro-card on the timer screen.
function pickHomeNudge() {
  const dismissed = state._nudgesDismissed || {};
  const t = state.totalTomatoes || 0;
  const candidates = [];
  if (t >= 1) candidates.push({ key: 'n_journal', icon: 'book', text: 'Your sessions are saved in the Journal — take a look.', view: 'journal' });
  if (t >= 3) candidates.push({ key: 'n_heatmap', icon: 'flame', text: "You're building a habit — check your Focus Map.", view: 'journal', heatmap: true });
  if (t >= 5) candidates.push({ key: 'n_coach', icon: 'spark', text: 'Enough data to spot patterns — meet your Insights.', view: 'coach' });
  // Highest unlocked, not-yet-dismissed milestone wins.
  return candidates.reverse().find(c => !dismissed[c.key]) || null;
}

function renderCoachNudge() {
  const el = document.getElementById('coachNudge');
  if (!el) return;
  if (state.isRunning || state.isPaused) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const n = pickHomeNudge();
  if (!n) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = `<span class="cn-icon">${icon(n.icon)}</span><span class="cn-text">${n.text}</span><button class="cn-x" title="Dismiss">×</button>`;
  el.querySelector('.cn-x').addEventListener('click', e => {
    e.stopPropagation();
    state._nudgesDismissed = state._nudgesDismissed || {};
    state._nudgesDismissed[n.key] = true;
    saveStateDebounced();
    renderCoachNudge();
    haptic('light');
  });
  el.onclick = () => {
    if (!n.view) return;
    switchView(n.view);
    if (n.heatmap) {
      const hm = document.getElementById('focusHeatmap');
      if (hm && hm.classList.contains('hidden')) document.getElementById('heatmapToggleBtn').click();
    }
  };
}

// ==================== DAILY WRAP ====================
function todayKey() { return new Date().toDateString(); }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString(); }

// Morning resurfacing of the focus set during last night's wrap.
function renderTomorrowLaunchpad() {
  const el = document.getElementById('tomorrowLaunchpad');
  if (!el) return;
  const y = (state.dailySummaries || {})[yesterdayKey()];
  if (state.isRunning || !y || !y.tomorrowFocus || y.tomorrowDone || y.tomorrowDismissed) {
    el.classList.add('hidden'); el.innerHTML = ''; return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="lp-eyebrow">${icon('sunrise')} Today's focus — set last night</div>
    <div class="lp-text">${escapeHtml(y.tomorrowFocus)}</div>
    <div class="lp-actions">
      <button class="lp-done">✓ Did it</button>
      <button class="lp-dismiss">Later</button>
    </div>`;
  el.querySelector('.lp-done').addEventListener('click', () => {
    y.tomorrowDone = true; saveStateDebounced(); renderTomorrowLaunchpad();
    toast('Momentum!'); burstConfetti(); haptic('medium');
  });
  el.querySelector('.lp-dismiss').addEventListener('click', () => {
    y.tomorrowDismissed = true; saveStateDebounced(); renderTomorrowLaunchpad();
  });
}

// Evening prompt to close out the day.
function renderWrapTrigger() {
  const el = document.getElementById('wrapTrigger');
  if (!el) return;
  const wrapped = (state.dailySummaries || {})[todayKey()];
  const hour = new Date().getHours();
  const eligible = !state.isRunning && state.todayCount > 0 && (hour >= 17 || state.todayCount >= 2);
  if (!eligible) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  if (wrapped && wrapped.wrappedAt) {
    el.classList.add('is-done');
    el.innerHTML = `<span class="wt-icon">${icon('moon')}</span><span class="wt-text">Day wrapped — tap to review</span>`;
  } else {
    el.classList.remove('is-done');
    el.innerHTML = `<span class="wt-icon">${icon('moon')}</span><span class="wt-text">Wrap up today — log a win &amp; set tomorrow's focus</span><span class="wt-go">›</span>`;
  }
  el.onclick = openWrapPanel;
}

function openWrapPanel() {
  const w = (state.dailySummaries || {})[todayKey()] || {};
  document.getElementById('wrapWin').value = w.win || '';
  document.getElementById('wrapFriction').value = w.friction || '';
  document.getElementById('wrapTomorrow').value = w.tomorrowFocus || '';
  showSheet('wrapSheet');
  setTimeout(() => document.getElementById('wrapWin').focus(), 300);
}

// Fill a wrap field from the day's real data — no AI, just what happened.
function wrapSuggest(kind) {
  const todayStr = new Date().toDateString();
  if (kind === 'win') {
    // Most important thing actually completed today.
    const doneToday = (state.todos || [])
      .filter(t => t.done && t.completedAt && new Date(t.completedAt).toDateString() === todayStr)
      .sort((a, b) => (a.priority || 3) - (b.priority || 3));
    let val = '';
    if (doneToday.length) val = `Finished: ${doneToday[0].text}`;
    else if (state.todayCount > 0) val = `Completed ${state.todayCount} focus session${state.todayCount !== 1 ? 's' : ''}`;
    else val = 'Showed up and started';
    const el = document.getElementById('wrapWin');
    el.value = val; el.focus();
  } else if (kind === 'tomorrow') {
    // The top-priority thing still open.
    const open = (state.todos || [])
      .filter(t => !t.done)
      .sort((a, b) => (a.priority || 3) - (b.priority || 3));
    const el = document.getElementById('wrapTomorrow');
    el.value = open.length ? open[0].text : '';
    if (!open.length) toast('No open tasks to suggest');
    el.focus();
  }
  haptic('light');
}

function saveWrap() {
  const win = document.getElementById('wrapWin').value.trim();
  const friction = document.getElementById('wrapFriction').value.trim();
  const tomorrow = document.getElementById('wrapTomorrow').value.trim();
  if (!win && !friction && !tomorrow) { toast('Add at least one note'); return; }
  if (!state.dailySummaries) state.dailySummaries = {};
  const existing = state.dailySummaries[todayKey()] || {};
  state.dailySummaries[todayKey()] = {
    ...existing, win, friction, tomorrowFocus: tomorrow, wrappedAt: new Date().toISOString()
  };
  saveStateDebounced();
  hideSheet('wrapSheet');
  renderAll();
  burstConfetti();
  toast('Day wrapped!');
  haptic('heavy');
}

// Gold feed of past wins (rendered inside the Coach view).
function renderWinVault() {
  const el = document.getElementById('winVault');
  if (!el) return;
  const wins = Object.entries(state.dailySummaries || {})
    .filter(([, w]) => w && w.win)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .slice(0, 10);
  if (!wins.length) {
    el.innerHTML = `<div class="todo-empty-sub" style="text-align:center;padding:10px;">Wrap up a day to start your win vault</div>`;
    return;
  }
  el.innerHTML = wins.map(([d, w]) =>
    `<div class="win-item"><div class="win-date">${dayLabel(d)}</div><div class="win-text">${icon('trophy')} ${escapeHtml(w.win)}</div></div>`
  ).join('');
}

function burstConfetti() {
  const colors = ['#EC4899', '#F59E0B', '#6366F1', '#8B5CF6', '#22C55E'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

// ==================== MEETING REMINDERS ====================
const REMINDER_ID_BASE = 30000;
function reminderNotifId(id, isPre) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return REMINDER_ID_BASE + (h % 4000) * 2 + (isPre ? 1 : 0);
}

function upcomingReminders() {
  const now = Date.now();
  return (state.reminders || [])
    .filter(r => new Date(r.time).getTime() > now - 60000)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

function cleanupReminders() {
  const now = Date.now();
  const before = (state.reminders || []).length;
  state.reminders = (state.reminders || []).filter(r => new Date(r.time).getTime() > now - 3600000);
  if ((state.reminders || []).length !== before) saveStateDebounced();
}

function addReminder(label, dtVal) {
  label = (label || '').trim().slice(0, 60);
  if (!label) { toast('Add a label'); return; }
  if (!dtVal) { toast('Pick a time'); return; }
  const when = new Date(dtVal);
  if (isNaN(when.getTime())) { toast('Invalid time'); return; }
  if (when.getTime() < Date.now()) { toast('That time has already passed'); return; }
  state.reminders = state.reminders || [];
  state.reminders.push({ id: 'rm' + Date.now() + Math.random().toString(36).slice(2, 5), label, time: when.toISOString() });
  saveStateDebounced();
  renderRemindersList();
  renderReminderPill();
  toast('Reminder set');
  haptic('light');
  // A reminder is useless without notifications — this explicit action is a
  // legitimate, contextual moment to prime + request permission.
  ensureNotificationPermission().then(() => syncReminderNotifications());
}

function deleteReminder(id) {
  state.reminders = (state.reminders || []).filter(r => r.id !== id);
  saveStateDebounced();
  syncReminderNotifications();
  renderRemindersList();
  renderReminderPill();
}

// Ambient pill on the timer screen showing the next meeting; pulses ≤5 min out.
function renderReminderPill() {
  const el = document.getElementById('reminderPill');
  if (!el) return;
  if (state.isRunning) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const up = upcomingReminders();
  if (!up.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const r = up[0];
  const t = new Date(r.time);
  const diffMin = Math.round((t.getTime() - Date.now()) / 60000);
  const soon = diffMin <= 5;
  const rel = diffMin <= 0 ? 'now' : diffMin < 60 ? `in ${diffMin} min` : t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  el.className = `reminder-pill ${soon ? 'is-soon' : ''}`;
  el.classList.remove('hidden');
  el.innerHTML = `<span class="rp-icon">${icon('clock')}</span>
    <div class="rp-body"><div class="rp-label">${escapeHtml(r.label)}</div>
    <div class="rp-time">${rel}${up.length > 1 ? ` · +${up.length - 1} more` : ''}</div></div>
    <span class="rp-go">›</span>`;
  el.onclick = openRemindersSheet;
}

function renderRemindersList() {
  const el = document.getElementById('remList');
  if (!el) return;
  const up = upcomingReminders();
  if (!up.length) { el.innerHTML = `<div class="todo-empty-sub" style="text-align:center;padding:12px;">No upcoming reminders.</div>`; return; }
  el.innerHTML = up.map(r => {
    const t = new Date(r.time);
    const when = t.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `<div class="rem-item"><div class="rem-info"><div class="rem-label">${escapeHtml(r.label)}</div><div class="rem-when">${when}</div></div><button class="rem-del" data-id="${r.id}">×</button></div>`;
  }).join('');
  el.querySelectorAll('.rem-del').forEach(b => b.addEventListener('click', () => deleteReminder(b.dataset.id)));
}

function openRemindersSheet() {
  document.getElementById('remLabel').value = '';
  document.getElementById('remTime').value = '';
  renderRemindersList();
  showSheet('remindersSheet');
}

async function syncReminderNotifications() {
  if (!LocalNotifications) return;
  const prev = Array.isArray(state._reminderNotifIds) ? state._reminderNotifIds : [];
  if (prev.length) { try { await LocalNotifications.cancel({ notifications: prev.map(id => ({ id })) }); } catch (e) {} }
  state._reminderNotifIds = [];
  if (!state.settings.notificationsEnabled) return;
  const ok = await hasNotificationPermission();  // silent: runs on launch, must not prompt
  if (!ok) return;
  const now = Date.now();
  const toSchedule = [];
  const ids = [];
  (state.reminders || []).forEach(r => {
    const at = new Date(r.time).getTime();
    const pre = at - 5 * 60000;
    if (pre > now + 1000) {
      const id = reminderNotifId(r.id, true);
      toSchedule.push({ id, title: 'In 5 minutes', body: r.label, channelId: CH_ALERTS, smallIcon: 'ic_stat_dopamodoro', schedule: { at: new Date(pre) } });
      ids.push(id);
    }
    if (at > now + 1000) {
      const id = reminderNotifId(r.id, false);
      toSchedule.push({ id, title: `${r.label}`, body: 'Happening now', channelId: CH_ALERTS, smallIcon: 'ic_stat_dopamodoro', schedule: { at: new Date(at) } });
      ids.push(id);
    }
  });
  state._reminderNotifIds = ids;
  if (toSchedule.length) { try { await LocalNotifications.schedule({ notifications: toSchedule }); } catch (e) { console.warn('Reminder notif:', e); } }
}

// ==================== ONBOARDING FUNNEL (QUIZ) ====================
// Non-skippable quiz funnel: hook → 7 tap-only questions with personalized
// insight interstitials (pain → cost → failed alternatives → stakes → hope)
// → "analyzing" → personalized Focus Profile report → offer.
// Wording is Play-policy-safe: "focus profile", never diagnosis/medical claims.
let onbIndex = 0;
let onbAnswers = {};        // { pattern, pulls, tried, goal, cost, streak, change }
let onbReplay = false;      // opened from Settings after completion → allow ✕
let onbCountdownTimer = null;

// ---- Quiz content -----------------------------------------------------------
const ONB_ARCHETYPES = {
  scroll:    { name: 'The Scroll-First Starter',  finding: 'Your hardest moment is the first 60 seconds — the phone wins before the task even begins.' },
  drift:     { name: 'The Fast-Fade Focuser',     finding: 'You can start — but your focus fades before the work gets deep enough to count.' },
  choose:    { name: 'The Overloaded Chooser',    finding: 'Too many open loops. Deciding what to do first costs you more energy than doing it.' },
  interrupt: { name: 'The Derailed Deep-Worker',  finding: 'You focus well — until one interruption unravels the rest of your day.' }
};

const ONB_STEPS = [
  // 0 · HOOK — the reason to answer: we build them a personalized focus profile
  { type: 'info', eyebrow: 'Free 60-second focus check', cta: 'Start my focus check',
    h: `Let's map how <em>your</em> brain focuses.`,
    p: `Answer 7 quick taps — no typing. You'll get your personal <strong>Focus Profile</strong>: what breaks your focus, what it's costing you, and a plan built around how you actually work.` },

  // 1 · Q1 — problem admission + segmentation (sets the archetype)
  { type: 'quiz', key: 'pattern', eyebrow: 'Question 1 of 7',
    h: 'When you sit down to do something important, what actually happens?',
    opts: [
      { v: 'scroll',    t: `I pick up my phone before I even start` },
      { v: 'drift',     t: `I start fine, then drift off after a few minutes` },
      { v: 'choose',    t: `I freeze — I can't decide what to do first` },
      { v: 'interrupt', t: `I'm fine until one interruption derails everything` }
    ] },

  // 2 · INSIGHT A — mirror their answer, name the mechanism, drop the 23-min stat
  { type: 'insight', eyebrow: 'That answer says a lot', cta: 'That explains a lot',
    render: a => {
      const line = {
        scroll:    `Reaching for the phone before starting isn't laziness — it's your brain picking the <strong>easiest available start</strong>. The task never stood a chance.`,
        drift:     `Starting isn't your problem — <strong>staying anchored</strong> is. Without a visible container around the work, attention leaks out fast.`,
        choose:    `That freeze is real: every open task quietly competes for your attention, and choosing burns the energy you needed for doing.`,
        interrupt: `Here's the brutal part about interruptions:`
      }[a.pattern] || '';
      return { h: `You're not broken. Your start ritual is.`,
        p: line,
        stat: { n: '23 min', d: `is how long it takes on average to fully refocus after a single interruption <span>(University of California, Irvine research)</span>` } };
    } },

  // 3 · Q2 — quantify the pain (they self-report the cost)
  { type: 'quiz', key: 'pulls', eyebrow: 'Question 2 of 7',
    h: 'Be honest — how often does your phone pull you away mid-task?',
    opts: [
      { v: 'lost',   t: `Honestly? I've lost count` },
      { v: 'ten',    t: `10+ times a day` },
      { v: 'few',    t: `A few times a day` },
      { v: 'rarely', t: `Rarely — my problem is starting, not stopping` }
    ] },

  // 4 · INSIGHT B — do the cost math for them (pain made concrete)
  { type: 'insight', eyebrow: 'The hidden cost', cta: `I want those hours back`,
    render: a => {
      const p = (a.pulls === 'rarely')
        ? `Even so — every false start costs you twice: the time itself, plus the guilt that makes the <strong>next</strong> start harder. That loop is the real thief.`
        : `And every one of those pulls can cost you that 23-minute refocus. That's how a whole afternoon disappears without anything getting done — and why it feels like the day "evaporated".`;
      return { h: `This is where your time is going.`,
        p,
        stat: { n: '96×', d: `a day — how often the average person checks their phone <span>(dscout research)</span>. For distractible brains, it's usually more.` } };
    } },

  // 5 · Q3 — kill the alternatives they already tried
  { type: 'quiz', key: 'tried', eyebrow: 'Question 3 of 7',
    h: `What have you already tried to fix this?`,
    opts: [
      { v: 'lists',     t: `To-do list apps` },
      { v: 'timers',    t: `Regular pomodoro timers` },
      { v: 'willpower', t: `Pure willpower and guilt` },
      { v: 'all',       t: `All of it. Nothing sticks.` }
    ] },

  // 6 · INSIGHT C — why those failed: unique-mechanism pivot
  { type: 'insight', eyebrow: `Why it didn't stick`, cta: `So it wasn't my fault`,
    render: a => {
      const line = {
        lists:     `To-do lists tell you <strong>what</strong> to do. But your bottleneck was never knowing what — it's <strong>starting</strong>. That's why the list keeps growing while nothing moves.`,
        timers:    `A plain timer assumes starting is easy and shame is motivating. For a brain like yours, both assumptions are wrong — so the timer became one more thing you quit.`,
        willpower: `Willpower is a battery, not a strategy. Every "just force yourself" drains it — and the guilt afterward makes tomorrow's start even heavier.`,
        all:       `Of course nothing stuck — every one of those tools assumes starting is the easy part. For your brain, starting IS the hard part. None of them were built for that.`
      }[a.tried] || '';
      return { h: `The tools failed you.<br>Not the other way around.`,
        p: line + ` What works is making the first step so small your brain says yes — then protecting the momentum. That's the entire system you're about to see.` };
    } },

  // 7 · Q4 — stakes: what the focus is FOR (personalizes the offer)
  { type: 'quiz', key: 'goal', eyebrow: 'Question 4 of 7',
    h: `What matters most for you to move forward on right now?`,
    opts: [
      { v: 'work',    t: `My work or business` },
      { v: 'study',   t: `My studies` },
      { v: 'project', t: `A personal project or dream` },
      { v: 'life',    t: `Just getting my life in order` }
    ] },

  // 8 · Q5 — cost of inaction (loss aversion; they say it themselves)
  { type: 'quiz', key: 'cost', eyebrow: 'Question 5 of 7',
    h: `If nothing changes — where does that leave you a year from now?`,
    opts: [
      { v: 'same',   t: `Same place. And that frustrates me.` },
      { v: 'behind', t: `Further behind people around me` },
      { v: 'scared', t: `Honestly? It scares me a little.` },
      { v: 'avoid',  t: `I try not to think about it` }
    ] },

  // 9 · INSIGHT D — the hope pivot: small consistent starts compound
  { type: 'insight', eyebrow: 'Now the good news', cta: `Show me how`,
    render: a => {
      const goalWord = { work: 'your work', study: 'your studies', project: 'that project', life: 'your life' }[a.goal] || 'what matters';
      return { h: `A year from now can look completely different.`,
        p: `You don't need to become a different person. One protected 25-minute block a day, aimed at ${goalWord}, compounds fast — and the only skill it needs is a reliable way to <strong>start</strong>.`,
        stat: { n: '150+ hrs', d: `of real, focused progress a year — from just one 25-minute block a day` } };
    } },

  // 10 · Q6 — streak psychology (sets up the momentum-protection benefit)
  { type: 'quiz', key: 'streak', eyebrow: 'Question 6 of 7',
    h: `When you break a streak in an app, what usually happens?`,
    opts: [
      { v: 'quit',  t: `I quit the whole app within a week` },
      { v: 'guilt', t: `I feel guilty but keep going` },
      { v: 'avoid', t: `Streaks stress me out, so I avoid them` },
      { v: 'never', t: `Never kept one long enough to break it` }
    ] },

  // 11 · Q7 — assumptive close: they state the benefit themselves
  { type: 'quiz', key: 'change', eyebrow: 'Last question',
    h: `Imagine starting was the easy part. How different would your days look?`,
    opts: [
      { v: 'better',     t: `Noticeably better` },
      { v: 'different',  t: `Very different` },
      { v: 'everything', t: `It would change everything` }
    ] },

  // 12 · ANALYZING — labor illusion; builds the perceived value of the report
  { type: 'analyzing', eyebrow: 'Building your Focus Profile',
    lines: ['Reading your 7 answers…', 'Mapping your distraction triggers…', 'Locating where your hours leak…', 'Matching a start ritual to your pattern…', 'Your Focus Profile is ready.'] },

  // 13 · REPORT — the personalized value they came for; pushes app as the fix
  { type: 'report', cta: 'See my plan in action' },

  // 14 · OFFER — direct-response close with real anchor + soft scarcity
  { type: 'offer' }
];

// ---- Engine -----------------------------------------------------------------
function onbEl() { return document.getElementById('onbScreens'); }

function onbOpen(replay) {
  onbReplay = !!replay;
  onbIndex = 0;
  onbAnswers = state.onboardingQuiz || {};
  const prog = document.getElementById('onbProgress');
  if (prog) prog.innerHTML = ONB_STEPS.map(() => '<span class="onb-dot"><span></span></span>').join('');
  document.getElementById('onbExitReplay')?.classList.toggle('hidden', !onbReplay);
  document.getElementById('onbOverlay')?.classList.remove('hidden');
  onbShow(0);
}
function showOnboardingIfNeeded() {
  if (state.onboardingDone) return;
  // Returning users (already have data) skip it
  if ((state.sessionHistory || []).length || (state.todos || []).length || (state.currentTasks || []).length) {
    state.onboardingDone = true; saveStateDebounced(); return;
  }
  onbOpen(false);
}
// Manually re-run the walkthrough from Settings. Bypasses the returning-user
// skip so it always plays, and never touches existing tasks/history/streaks.
function replayOnboarding() {
  switchView('timer');   // the funnel overlays the timer view
  onbOpen(true);
}

function onbShow(i) {
  i = Math.max(0, Math.min(i, ONB_STEPS.length - 1));
  onbIndex = i;
  document.querySelectorAll('#onbProgress .onb-dot').forEach((d, idx) => {
    d.classList.toggle('done', idx < i);
    d.classList.toggle('current', idx === i);
  });
  onbRender(ONB_STEPS[i]);
}
function onbNext() { onbShow(onbIndex + 1); }

function onbRender(step) {
  const host = onbEl(); if (!host) return;
  if (onbCountdownTimer) { clearInterval(onbCountdownTimer); onbCountdownTimer = null; }
  let html = '';
  if (step.type === 'info') {
    html = `<section class="onb-screen active"><div class="onb-body">
      <div class="onb-eyebrow">${step.eyebrow}</div>
      <h2 class="onb-h">${step.h}</h2><p class="onb-p">${step.p}</p>
      </div><div class="onb-foot"><button class="onb-cta" data-next>${step.cta}</button></div></section>`;
  } else if (step.type === 'quiz') {
    html = `<section class="onb-screen active"><div class="onb-body">
      <div class="onb-eyebrow">${step.eyebrow}</div>
      <h2 class="onb-h onb-h-q">${step.h}</h2>
      <div class="onb-opts">${step.opts.map(o =>
        `<button class="onb-opt${onbAnswers[step.key] === o.v ? ' sel' : ''}" data-v="${o.v}">${o.t}</button>`).join('')}
      </div></div></section>`;
  } else if (step.type === 'insight') {
    const r = step.render(onbAnswers);
    html = `<section class="onb-screen active"><div class="onb-body">
      <div class="onb-eyebrow">${step.eyebrow}</div>
      <h2 class="onb-h">${r.h}</h2><p class="onb-p">${r.p}</p>
      ${r.stat ? `<div class="onb-stat"><div class="onb-stat-n">${r.stat.n}</div><div class="onb-stat-d">${r.stat.d}</div></div>` : ''}
      </div><div class="onb-foot"><button class="onb-cta" data-next>${step.cta}</button></div></section>`;
  } else if (step.type === 'analyzing') {
    html = `<section class="onb-screen active"><div class="onb-body onb-body-center">
      <div class="onb-eyebrow">${step.eyebrow}</div>
      <div class="onb-scan-ring"><span></span></div>
      <div class="onb-scan-lines">${step.lines.map(l => `<div class="onb-scan-line"><span class="onb-scan-check">✓</span>${l}</div>`).join('')}</div>
      </div></section>`;
  } else if (step.type === 'report') {
    html = onbReportHtml(step);
  } else if (step.type === 'offer') {
    html = onbOfferHtml();
  }
  host.innerHTML = html;
  onbWireStep(step);
}

function onbWireStep(step) {
  const host = onbEl();
  host.querySelector('[data-next]')?.addEventListener('click', onbNext);
  if (step.type === 'quiz') {
    host.querySelectorAll('.onb-opt').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('.onb-opt').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      onbAnswers[step.key] = b.dataset.v;
      state.onboardingQuiz = onbAnswers; saveStateDebounced();
      haptic('light');
      setTimeout(onbNext, 320);   // brief confirm-flash, then momentum
    }));
  }
  if (step.type === 'analyzing') {
    const lines = [...host.querySelectorAll('.onb-scan-line')];
    lines.forEach((l, i) => setTimeout(() => l.classList.add('on'), 450 + i * 620));
    setTimeout(onbNext, 450 + lines.length * 620 + 700);
  }
  if (step.type === 'offer') {
    host.querySelector('#onbStartTrial')?.addEventListener('click', () => {
      finishOnboarding(false);
      if (window.Billing) {
        window.Billing.personalize?.({ quiz: onbAnswers, deadline: state.onbOfferDeadline });
        window.Billing.openPaywall('onboarding');
      }
    });
    host.querySelector('#onbKeepFree')?.addEventListener('click', () => finishOnboarding(true));
    onbStartCountdown();
  }
}

// ---- Report (the personalized "value" the quiz promised) --------------------
function onbBars() {
  const a = onbAnswers;
  const initiation = a.pattern === 'scroll' ? 22 : a.pattern === 'choose' ? 28 : 46;
  const pull = (a.pulls === 'lost') ? 88 : (a.pulls === 'ten') ? 76 : (a.pulls === 'few') ? 58 : 40;
  const recovery = a.pattern === 'interrupt' ? 24 : 42;
  const momentum = (a.streak === 'quit' || a.streak === 'avoid') ? 25 : (a.streak === 'never') ? 32 : 48;
  return [
    { label: 'Task initiation',            v: initiation, invert: false },
    { label: 'Distraction pull',           v: pull,       invert: true  },
    { label: 'Recovery after interruption', v: recovery,  invert: false },
    { label: 'Momentum protection',        v: momentum,   invert: false }
  ];
}
function onbReportHtml(step) {
  const arc = ONB_ARCHETYPES[onbAnswers.pattern] || ONB_ARCHETYPES.drift;
  const streakLine = {
    quit:  `One broken streak makes you quit — so your plan protects streaks instead of weaponizing them.`,
    guilt: `Guilt keeps you going but drains you — your plan swaps guilt for protected momentum.`,
    avoid: `Streak pressure pushes you away — your plan uses shame-free streaks that survive a missed day.`,
    never: `You've never had a system hold your momentum — this one is built to.`
  }[onbAnswers.streak] || '';
  const bars = onbBars().map(b =>
    `<div class="onb-bar-row"><span class="onb-bar-label">${b.label}</span>
      <div class="onb-bar"><span class="onb-bar-fill${b.invert ? ' bad' : ''}" style="width:${b.v}%"></span></div>
      <span class="onb-bar-note">${b.invert ? (b.v > 65 ? 'high' : 'moderate') : (b.v < 35 ? 'needs support' : 'can grow')}</span></div>`).join('');
  return `<section class="onb-screen active"><div class="onb-body onb-body-report">
    <div class="onb-eyebrow">Your Focus Profile</div>
    <h2 class="onb-h onb-h-report">${arc.name}</h2>
    <div class="onb-bars">${bars}</div>
    <div class="onb-findings">
      <p class="onb-p"><strong>What we found:</strong> ${arc.finding} ${streakLine}</p>
      <p class="onb-p"><strong>Your plan:</strong> a one-tap start ritual sized for your pattern, your goal kept vividly in front of you when motivation dips, and momentum that survives bad days.</p>
    </div>
    </div><div class="onb-foot"><button class="onb-cta" data-next>${step.cta}</button></div></section>`;
}

// ---- Offer (direct-response close) -------------------------------------------
function onbOfferHtml() {
  const arc = ONB_ARCHETYPES[onbAnswers.pattern] || ONB_ARCHETYPES.drift;
  const goalLine = {
    work:    'momentum for your work, starting today',
    study:   'focus that gets your studying done in less time',
    project: 'real weekly progress on the thing you actually care about',
    life:    'a calmer, in-control version of your days'
  }[onbAnswers.goal] || 'starting made easy, every day';
  return `<section class="onb-screen active onb-screen-offer"><div class="onb-body">
    <div class="onb-eyebrow">Your plan is ready</div>
    <h2 class="onb-h">${arc.name} → ${goalLine}.</h2>
    <ul class="onb-stack">
      <li><strong>One-tap start ritual</strong> — beats the ${onbAnswers.pattern === 'scroll' ? 'scroll reflex' : 'start wall'} before it wins</li>
      <li><strong>AI coach + vivid North Star</strong> — your goal, kept alive when motivation dips</li>
      <li><strong>Streak Freeze</strong> — one bad day never becomes quitting</li>
      <li><strong>Deep insights</strong> — see exactly when and where you focus best</li>
    </ul>
    <div class="onb-hold"><span class="onb-hold-dot"></span>Your Focus Profile &amp; intro price are held for <strong id="onbCountdown">15:00</strong></div>
    <p class="onb-trial"><strong>Try everything free for 7 days.</strong> Cancel in 10 seconds in Google Play — you keep your profile and pay nothing.</p>
    </div><div class="onb-foot">
    <button class="onb-cta onb-cta-offer" id="onbStartTrial">Start my 7 free days</button>
    <button class="onb-free" id="onbKeepFree">I'll stay on the limited free version</button>
    <p class="onb-fine">Free includes the basic timer, tasks &amp; journal. Your plan above needs Pro.</p>
    </div></section>`;
}
function onbStartCountdown() {
  // Honest hold: deadline persists across re-opens instead of resetting.
  if (!state.onbOfferDeadline) { state.onbOfferDeadline = Date.now() + 15 * 60 * 1000; saveStateDebounced(); }
  const el = () => document.getElementById('onbCountdown');
  const tick = () => {
    const left = Math.max(0, state.onbOfferDeadline - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    const e = el(); if (e) e.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (left <= 0 && onbCountdownTimer) { clearInterval(onbCountdownTimer); onbCountdownTimer = null; }
  };
  tick();
  onbCountdownTimer = setInterval(tick, 1000);
}

function finishOnboarding(startSession) {
  state.onboardingDone = true;
  state.onboardingQuiz = onbAnswers;
  saveStateDebounced();
  // Keep same-session paywall opens (folder cap, session 3…) personalized too.
  window.Billing?.personalize?.({ quiz: onbAnswers, deadline: state.onbOfferDeadline });
  if (onbCountdownTimer) { clearInterval(onbCountdownTimer); onbCountdownTimer = null; }
  document.getElementById('onbOverlay')?.classList.add('hidden');
  // Land on the timer primed and ready — the ring shows a full focus block, so
  // the only thing left to do is press Start.
  switchView('timer');
  state.mode = 'work';
  state.sessionDuration = getTotalForMode('work');
  renderAll();
  if (startSession) startTimer();
}
function wireOnboarding() {
  // Replay mode only: allow closing without redoing the funnel.
  document.getElementById('onbExitReplay')?.addEventListener('click', () => {
    if (onbCountdownTimer) { clearInterval(onbCountdownTimer); onbCountdownTimer = null; }
    document.getElementById('onbOverlay')?.classList.add('hidden');
  });
}

// ==================== EVENT WIRING ====================
function wire() {
  // Bottom nav
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });
  // Mode buttons
  document.querySelectorAll('.mode-pill').forEach(b => {
    b.addEventListener('click', () => switchMode(b.dataset.mode));
  });
  // Start / pause
  document.getElementById('startBtn').addEventListener('click', () => state.isRunning ? pauseTimer() : startTimer());
  document.getElementById('justStartBtn')?.addEventListener('click', justStart);
  document.getElementById('resetBtn').addEventListener('click', resetTimer);
  document.getElementById('skipBtn').addEventListener('click', async () => {
    if (state.isRunning || state.isPaused) {
      // End early — save partial
      const elapsedMin = Math.floor((state.sessionDuration - computeTimeLeft()) / 60);
      if (elapsedMin >= 1 && state.mode === 'work') {
        state.tomatoCoins += Math.max(1, Math.floor(10 * elapsedMin / state.settings.workDuration));
        state.todayCount++;
        const goal = state.goals.find(g => g.id === state.activeGoal);
        state.sessionHistory.push({
          id: Date.now().toString(), ts: new Date().toISOString(),
          date: new Date().toDateString(),
          task: state.currentTasks.map(ctName).join(' · '),
          tasks: state.currentTasks.map(ctName),
          taskMeta: state.currentTasks.map(t => ({ name: ctName(t), groupId: ctGroup(t), clientId: (t && t.clientId) || null })),
          goalName: goal?.name || '', goalIcon: goal?.icon || '',
          durationMin: elapsedMin, plannedMin: state.settings.workDuration,
          type: 'workManual'
        });
        toast(`Saved ${elapsedMin}m · early end`);
      }
      await resetTimer();
    } else {
      switchMode(state.mode === 'work' ? 'shortBreak' : 'work');
    }
  });
  // Duration chips
  document.querySelectorAll('.dur-chip').forEach(b => {
    b.addEventListener('click', () => {
      const m = b.dataset.min;
      if (m === 'custom') {
        document.getElementById('durationChips').classList.add('hidden');
        document.getElementById('customDurInput').classList.remove('hidden');
        setTimeout(() => document.getElementById('customMinInput').focus(), 30);
      } else {
        state.settings.workDuration = Number(m);
        if (!state.isRunning && !state.isPaused) state.sessionDuration = getTotalForMode(state.mode);
        saveStateDebounced();
        renderAll();
      }
    });
  });
  document.getElementById('customMinStart').addEventListener('click', async () => {
    const n = parseInt(document.getElementById('customMinInput').value, 10);
    if (!n || n < 1 || n > 120) { toast('1 to 120 minutes'); return; }
    document.getElementById('customDurInput').classList.add('hidden');
    state.mode = 'work';
    state.sessionDuration = n * 60;
    await startTimer(n * 60);   // pass the custom length; startTimer would otherwise recompute the default
  });
  document.getElementById('customMinCancel').addEventListener('click', () => {
    document.getElementById('customDurInput').classList.add('hidden');
    document.getElementById('durationChips').classList.remove('hidden');
  });

  // Today's Focus — add task (with optional folder)
  const addFocusTask = () => {
    const inp = document.getElementById('currentTaskInput');
    // Folder is assigned by tapping the "+ folder" tag chip on the pill (no add-time dropdown).
    addCurrentTask(inp.value, null);
    inp.value = '';
  };
  document.getElementById('addTaskBtn').addEventListener('click', addFocusTask);
  document.getElementById('currentTaskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addFocusTask();
  });
  // Collapse / expand Today's Focus
  document.getElementById('tfHead')?.addEventListener('click', e => {
    if (e.target.closest('select') || e.target.closest('input')) return;
    state._tfCollapsed = !state._tfCollapsed;
    saveStateDebounced();
    renderTaskPills();
  });
  // Pick from Task Manager
  document.getElementById('tfPickBtn')?.addEventListener('click', openFocusPick);
  document.getElementById('closeFocusPick')?.addEventListener('click', () => hideSheet('focusPickSheet'));
  document.getElementById('closeFolderPick')?.addEventListener('click', () => hideSheet('folderPickSheet'));
  document.getElementById('closeClientPick')?.addEventListener('click', () => hideSheet('clientPickSheet'));

  // Todo add
  document.getElementById('todoAddBtn').addEventListener('click', () => {
    const inp = document.getElementById('todoInput');
    addTodo(inp.value);
    inp.value = '';
  });
  document.getElementById('todoInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { addTodo(e.target.value); e.target.value = ''; }
  });
  document.getElementById('todoSort').addEventListener('change', e => {
    state._todoSort = e.target.value;
    renderTodos();
  });
  document.getElementById('todoClearDone').addEventListener('click', () => {
    if (confirm('Clear completed from the list? They stay in History.')) {
      state.todos.forEach(t => { if (t.done) t.archived = true; });
      saveStateDebounced();
      renderTodos();
    }
  });

  // Task groups — add
  document.getElementById('groupAddBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('groupInput');
    addTodoGroup(inp.value);
    inp.value = '';
  });
  document.getElementById('groupInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { addTodoGroup(e.target.value); e.target.value = ''; }
  });

  // Completed history
  document.getElementById('openCompletedBtn')?.addEventListener('click', openCompletedHistory);
  document.getElementById('closeCompleted')?.addEventListener('click', () => hideSheet('completedSheet'));

  // Group-assign sheet (add existing tasks to a group)
  document.getElementById('closeGroupAssign')?.addEventListener('click', () => hideSheet('groupAssignSheet'));
  document.getElementById('gaSkip')?.addEventListener('click', () => hideSheet('groupAssignSheet'));
  document.getElementById('gaSave')?.addEventListener('click', confirmGroupAssign);

  // Meeting reminders
  document.getElementById('openReminders')?.addEventListener('click', openRemindersSheet);
  document.getElementById('closeReminders')?.addEventListener('click', () => hideSheet('remindersSheet'));
  document.getElementById('remAdd')?.addEventListener('click', () => {
    addReminder(document.getElementById('remLabel').value, document.getElementById('remTime').value);
  });

  // Settings save
  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  // Level chip → achievements sheet
  document.getElementById('levelChip').addEventListener('click', () => {
    renderAchievementsSheet();
    showSheet('achievementsSheet');
    haptic('light');
  });

  // Goal selector (button removed from timer view; guard in case it's absent)
  document.getElementById('goalSelectorBtn')?.addEventListener('click', openGoalSelector);

  // Heatmap toggle
  document.getElementById('heatmapToggleBtn').addEventListener('click', () => {
    const hm = document.getElementById('focusHeatmap');
    const btn = document.getElementById('heatmapToggleBtn');
    if (hm.classList.contains('hidden')) {
      hm.classList.remove('hidden');
      btn.classList.add('active');
      renderFocusHeatmap();
    } else {
      hm.classList.add('hidden');
      btn.classList.remove('active');
    }
    haptic('light');
  });

  // Achievements sheet
  document.getElementById('closeAchievements').addEventListener('click', () => hideSheet('achievementsSheet'));

  // North Star sheet
  document.getElementById('closeNorthStar').addEventListener('click', () => hideSheet('northStarSheet'));
  document.getElementById('nsSave').addEventListener('click', saveNorthStar);
  document.getElementById('nsClear').addEventListener('click', clearNorthStar);
  // Why-builder pager
  document.getElementById('nsWhyPrev')?.addEventListener('click', () => nsMovePillar(-1));
  document.getElementById('nsWhyNext')?.addEventListener('click', () => nsMovePillar(1));
  document.getElementById('nsWhySkip')?.addEventListener('click', nsPickWhyQuestion);
  document.getElementById('nsWhySaveAns')?.addEventListener('click', nsSaveWhyAnswer);
  document.getElementById('nsVividBtn')?.addEventListener('click', nsGenerateVivid);
  document.getElementById('nsInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveNorthStar(); });

  // Goal selector sheet
  document.getElementById('closeGoalSelector').addEventListener('click', () => hideSheet('goalSelectorSheet'));

  // Journal entry sheet
  document.getElementById('closeJournalEntry').addEventListener('click', () => hideSheet('journalEntrySheet'));
  document.getElementById('jeSave').addEventListener('click', saveJournalEntry);
  document.getElementById('jeDelete').addEventListener('click', deleteJournalEntry);

  // Day reflect sheet
  document.getElementById('closeDayReflect').addEventListener('click', () => hideSheet('dayReflectSheet'));
  document.getElementById('drSave').addEventListener('click', saveDayReflect);
  document.querySelectorAll('#drRating .rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#drRating .rating-btn').forEach(b => b.classList.toggle('active', b === btn));
      haptic('light');
    });
  });

  // Feedback (mailto)
  document.getElementById('openFeedback').addEventListener('click', () => {
    const subject = `Dopamodoro feedback`;
    const body = `App: Dopamodoro Mobile\nPlatform: ${isNative ? 'Android (native)' : 'Web'}\nVersion: 1.2.3\nSessions: ${state.totalTomatoes}\nStreak: ${state.streak}\n\n--- Tell us what's on your mind ---\n\n`;
    window.location.href = `mailto:support@tigerbrandsglobal.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  document.getElementById('openAbout').addEventListener('click', () => {
    alert('Dopamodoro\nPomodoro for ADHD brains\nv1.2.3');
  });
  document.getElementById('replayWalkthrough')?.addEventListener('click', replayOnboarding);

  // Task detail sheet
  document.getElementById('closeTaskDetail').addEventListener('click', () => hideSheet('taskDetailSheet'));
  document.getElementById('tdSave').addEventListener('click', saveTaskDetail);
  document.getElementById('tdDelete').addEventListener('click', deleteFromDetail);
  document.querySelectorAll('#tdPri .pri-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tdPri .pri-btn').forEach(x => x.classList.toggle('is-active', x === b));
    });
  });
  document.getElementById('tdNoteAdd').addEventListener('click', () => {
    const inp = document.getElementById('tdNoteInput');
    const text = inp.value.trim();
    if (!text || !editingTaskId) return;
    const t = state.todos.find(x => x.id === editingTaskId);
    t.notes.push({ id: 'n' + Date.now(), text, createdAt: new Date().toISOString() });
    inp.value = '';
    saveStateDebounced();
    renderNotesAndSubtasks(t);
    renderTodos();
  });
  document.getElementById('tdSubtaskAdd').addEventListener('click', () => {
    const inp = document.getElementById('tdSubtaskInput');
    const text = inp.value.trim();
    if (!text || !editingTaskId) return;
    const t = state.todos.find(x => x.id === editingTaskId);
    t.subtasks.push({ id: 's' + Date.now(), text, done: false });
    inp.value = '';
    saveStateDebounced();
    renderNotesAndSubtasks(t);
    renderTodos();
  });

  // Task detail — due date clear
  document.getElementById('tdDueClear')?.addEventListener('click', () => {
    const d = document.getElementById('tdDue');
    if (d) d.value = '';
  });

  // Post-session task review sheet
  document.getElementById('closeTaskReview')?.addEventListener('click', skipTaskReview);
  document.getElementById('trSkip')?.addEventListener('click', skipTaskReview);
  document.getElementById('trSave')?.addEventListener('click', resolveTaskReview);

  // Daily wrap sheet
  document.getElementById('closeWrap')?.addEventListener('click', () => hideSheet('wrapSheet'));
  document.getElementById('wrapCancel')?.addEventListener('click', () => hideSheet('wrapSheet'));
  document.getElementById('wrapSave')?.addEventListener('click', saveWrap);
  document.querySelectorAll('#wrapSheet .wrap-suggest').forEach(b =>
    b.addEventListener('click', () => wrapSuggest(b.dataset.fill)));

  // Manual entry sheet
  document.getElementById('addManualBtn').addEventListener('click', () => {
    document.getElementById('meDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('meDuration').value = 25;
    document.getElementById('meTask').value = '';
    showSheet('manualEntrySheet');
  });
  document.getElementById('closeManualEntry').addEventListener('click', () => hideSheet('manualEntrySheet'));
  document.getElementById('meCancel').addEventListener('click', () => hideSheet('manualEntrySheet'));
  document.getElementById('meSave').addEventListener('click', () => {
    addManualSession(
      document.getElementById('meDate').value,
      document.getElementById('meDuration').value,
      document.getElementById('meTask').value.trim()
    );
    hideSheet('manualEntrySheet');
  });

  // Sheet backdrop tap to close
  document.querySelectorAll('.sheet-backdrop').forEach(b => {
    b.addEventListener('click', () => {
      b.closest('.sheet').classList.add('hidden');
    });
  });

  // Android back button — close sheets first, then settings, etc.
  if (App) {
    App.addListener('backButton', () => {
      const openSheet = document.querySelector('.sheet:not(.hidden)');
      if (openSheet) { openSheet.classList.add('hidden'); return; }
      if (!document.getElementById('viewTimer').classList.contains('active')) {
        switchView('timer');
        return;
      }
      // On timer view — minimize to home
      if (App.exitApp) App.exitApp();
    });
    // Re-sync when app comes back to foreground
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await loadState();
        cleanupReminders();
        renderAll();
        if (state.isRunning || state.isPaused) showOngoingNotification();
        syncReminderNotifications();
        // Review is shown at the moment a session completes (handleTimerComplete),
        // not on every app re-entry.
      }
    });
  }
}

// ==================== STATUS BAR + PERMISSIONS ====================
async function initNative() {
  if (!isNative) return;
  try {
    if (StatusBar) {
      await StatusBar.setStyle({ style: 'DARK' });
      await StatusBar.setBackgroundColor({ color: '#100B1E' });
    }
  } catch (e) {}
  // Permission is NOT requested here. We defer it to a real value moment (first
  // completed session, or when a reminder is set) behind a custom pre-prompt —
  // a cold launch dialog converts <30% and burns the one shot we get.
  await createChannels();
}

// ==================== INIT ====================
(async function init() {
  await loadState();
  cleanupReminders();
  wire();
  wireOnboarding();
  await initNative();
  renderAll();
  showOnboardingIfNeeded();
  startTick();
  // Restore the sticky notification if a timer was already running, and (re)arm
  // deadline + meeting reminders + any pending post-session review.
  if (state.isRunning || state.isPaused) showOngoingNotification();
  syncDeadlineNotifications();
  syncReminderNotifications();
  syncStreakReminder();
  syncDailyStartNudge();  // personalized daily cue at their usual focus hour
  // Review is shown when a session completes (handleTimerComplete), not on app launch.
})();
