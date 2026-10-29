/**
 * Phase 10.2 -- what went wrong, kept on the tablet.
 *
 * Deliberately NOT a crash-reporting service.
 *
 * Sentry, Crashlytics and the rest work by posting the error, its stack and
 * whatever context the app attached to someone else's servers. On a dispensing
 * tablet that context is a prescription: patient names, medicine lists, Rx
 * numbers. Sending it off-site is a disclosure to a business associate, and
 * that is a decision for the hospital's HIPAA officer and a signed BAA, not
 * for a library default. So this keeps crashes ON THE DEVICE, where the
 * pharmacist and whoever supports them can read them off the Diagnostics
 * screen, and nothing is transmitted anywhere.
 *
 * It still redacts. Someone will photograph that screen and send it to IT over
 * a chat app, and the log should not be the thing that leaks a patient number.
 *
 * In memory only: a crash report is for the shift it happened in. Persisting
 * it would mean storing PHI-adjacent text on a shared device for an indefinite
 * period, which is the opposite of what the idle lock is for.
 */

/** How many crashes are kept. Enough for one shift's worth of a repeating bug. */
export const MAX_ENTRIES = 20;

/**
 * Patterns that get masked before a message is stored.
 *
 * Each keeps the SHAPE -- "RX-••••" rather than "[redacted]" -- because the
 * shape is what makes the message still readable as a bug report: knowing a
 * prescription number was in the string is useful, knowing which one is not.
 */
const MASKS = [
  [/\bPAT-\d+/gi, 'PAT-••••'],
  [/\bRX-\d{4}-\d+/gi, 'RX-••••'],
  [/\bDSP-\d{4}-\d+/gi, 'DSP-••••'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '••••@••••'],
  [/PHPSESSID=[^;\s]+/gi, 'PHPSESSID=••••'],
  // Any other run of six or more digits: patient numbers, phone numbers, IDs.
  [/\b\d{6,}\b/g, '••••'],
];

/**
 * Mask identifiers in a string.
 *
 * @param {*} text
 * @returns {string}
 */
export function redact(text) {
  if (text === null || text === undefined) return '';
  return MASKS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), String(text));
}

/**
 * Turn a thrown thing into a storable entry.
 *
 * Takes whatever was thrown -- an Error, a string, or something that is
 * neither, because a rejected promise can carry anything at all.
 *
 * @param {*} thrown
 * @param {{where?: string, fatal?: boolean, at?: number}} [context]
 * @returns {{id: string, at: number, where: string, fatal: boolean, name: string,
 *            message: string, stack: string}}
 */
export function makeEntry(thrown, context = {}) {
  const at = context.at ?? Date.now();
  const isError = thrown instanceof Error || (thrown && typeof thrown.message === 'string');

  return {
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    where: context.where || 'unknown',
    fatal: Boolean(context.fatal),
    name: isError ? String(thrown.name || 'Error') : typeof thrown,
    message: redact(isError ? thrown.message : thrown),
    // Only the top frames: the rest is React internals, and a long stack on a
    // tablet screen is unreadable.
    stack: redact(isError && thrown.stack ? String(thrown.stack).split('\n').slice(0, 12).join('\n') : ''),
  };
}

/**
 * Add an entry to a list, newest first, dropping the oldest past the limit.
 *
 * Pure, so the trimming rule can be tested without a running app.
 *
 * @param {Array} list
 * @param {Object} entry
 * @param {number} [max]
 * @returns {Array} a NEW list
 */
export function appendEntry(list, entry, max = MAX_ENTRIES) {
  return [entry, ...(Array.isArray(list) ? list : [])].slice(0, max);
}

/**
 * A one-line label for the crash list.
 *
 * @param {Object} entry
 * @returns {string}
 */
export function summarise(entry) {
  if (!entry) return '';
  const when = new Date(entry.at).toTimeString().slice(0, 8);
  const what = entry.message || entry.name || 'Unknown error';
  return `${when}  ${entry.where}: ${what}`;
}

/* ------------------------------------------------------------------ *
 * The store
 * ------------------------------------------------------------------ */

let entries = [];
let listeners = [];

/** Record a crash. Returns the entry, so a caller can show its id. */
export function record(thrown, context) {
  const entry = makeEntry(thrown, context);
  entries = appendEntry(entries, entry);
  listeners.forEach((fn) => fn(entries));
  return entry;
}

/** Newest first. */
export function all() {
  return entries;
}

export function clear() {
  entries = [];
  listeners.forEach((fn) => fn(entries));
}

/** @returns {() => void} unsubscribe */
export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/**
 * Catch what React's error boundary cannot: errors thrown outside render --
 * in a timer, an event handler, a rejected promise.
 *
 * React Native's global handler normally shows the red screen in development
 * and kills the app in production. We record first, then hand straight back to
 * whatever was there, so nothing about the existing behaviour changes.
 *
 * @param {{setGlobalHandler: Function, getGlobalHandler: Function}} [errorUtils]
 * @returns {boolean} whether a handler was installed
 */
export function installGlobalHandler(errorUtils = global.ErrorUtils) {
  if (!errorUtils?.setGlobalHandler) return false;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((thrown, isFatal) => {
    record(thrown, { where: 'global', fatal: Boolean(isFatal) });
    if (previous) previous(thrown, isFatal);
  });

  return true;
}
