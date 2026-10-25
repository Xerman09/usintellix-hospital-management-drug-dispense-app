import * as SecureStore from 'expo-secure-store';
import { CONFIG } from '../constants/config';

/**
 * The HMS API client.
 *
 * The backend authenticates with a PHP session cookie (PHPSESSID), not a
 * token, so this client is a cookie jar as well as a fetch wrapper.
 *
 * Differences from patient_mobile_app/src/api/client.js, and why:
 *
 *  1. The cookie is PERSISTED (expo-secure-store, not a module variable).
 *     The patient app loses its session whenever the app restarts, which is
 *     fine on someone's own phone and wrong on a counter tablet that gets
 *     backgrounded all shift. Secure storage, not AsyncStorage, because the
 *     device is shared.
 *  2. Every reply is normalised to ONE envelope (see ApiResult below), so a
 *     caller never has to tell `{success:false}` apart from an HTTP 500 apart
 *     from a dropped connection. On the dispensing path those three mean very
 *     different things to the pharmacist.
 *  3. A 401 fires a listener, so the app can lock the screen and re-login
 *     from anywhere instead of each screen handling expiry itself.
 *  4. Requests time out. A hung fetch on a dispense is indistinguishable from
 *     a slow one, and the pharmacist must not be left guessing.
 */

const COOKIE_KEY = 'hms.session.cookie';

let sessionCookie = '';
let unauthorizedListener = null;

/**
 * Endpoints where HTTP 401 means "these credentials were rejected", NOT
 * "your session expired".
 *
 * This distinction is load-bearing. The backend answers a failed login with
 * 401 and the reason as a TOP-LEVEL flag (locked / password_expired /
 * password_breached). Treating that as session expiry would show the
 * pharmacist "your session has ended" when they simply mistyped, and would
 * fire the global re-login handler in the middle of logging in.
 */
const CREDENTIAL_ENDPOINTS = [
  '/login',
  '/verify-2fa',
  '/resend-2fa',
  '/auth/expired-password',
  '/auth/breached-password',
  '/auth/check-password-breach',
];

function isCredentialAttempt(endpoint) {
  const path = endpoint.split('?')[0];
  return CREDENTIAL_ENDPOINTS.includes(path);
}

/**
 * @typedef {Object} ApiResult
 * @property {boolean} ok        true only when the request AND the backend both succeeded
 * @property {*}       data      the backend's `data` payload, or null
 * @property {Object}  payload   the WHOLE response body. The auth flows need this:
 *                               login's state flags are top-level, not inside `data`.
 * @property {string}  message   human-readable message, always safe to show
 * @property {?('network'|'timeout'|'auth'|'forbidden'|'notfound'|'server'|'invalid'|'malformed')} errorKind
 * @property {number}  httpStatus 0 when the request never reached the server
 */

/** Classify a failure so callers can branch on kind, not on string matching. */
function kindForStatus(status) {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status === 422 || status === 400) return 'invalid';
  if (status >= 500) return 'server';
  return 'invalid';
}

function messageForKind(kind, fallback) {
  switch (kind) {
    case 'network':
      return 'Cannot reach the hospital server. Check the tablet’s Wi-Fi connection.';
    case 'timeout':
      return 'The hospital server did not respond in time. Nothing was saved — try again.';
    case 'auth':
      return 'Your session has ended. Please sign in again.';
    case 'forbidden':
      return 'Your account is not permitted to do this.';
    case 'server':
      return 'The hospital server reported an error. Nothing was saved.';
    case 'malformed':
      return 'The hospital server sent a reply this app could not read.';
    default:
      return fallback || 'The request could not be completed.';
  }
}

/** Restore the saved session cookie. Call once at startup, before any request. */
export async function loadSession() {
  try {
    sessionCookie = (await SecureStore.getItemAsync(COOKIE_KEY)) || '';
  } catch (e) {
    // Secure storage is unavailable (e.g. a preview build). Carry on with an
    // in-memory session rather than refusing to start.
    sessionCookie = '';
  }
  return sessionCookie;
}

async function persistCookie(cookie) {
  sessionCookie = cookie;
  try {
    if (cookie) {
      await SecureStore.setItemAsync(COOKIE_KEY, cookie);
    } else {
      await SecureStore.deleteItemAsync(COOKIE_KEY);
    }
  } catch (e) {
    // Non-fatal: the session still works for this run.
  }
}

export async function clearSession() {
  await persistCookie('');
}

export function hasSession() {
  return Boolean(sessionCookie);
}

/** Register the app-wide handler for an expired session (Phase 2.8). */
export function onUnauthorized(handler) {
  unauthorizedListener = handler;
}

/**
 * Make a request against the HMS API.
 *
 * @param {string} endpoint path beginning with '/', e.g. '/dispensing'
 * @param {{method?: string, body?: *, query?: Object, signal?: AbortSignal}} [options]
 * @returns {Promise<ApiResult>}
 */
export async function apiRequest(endpoint, options = {}) {
  const { method = 'GET', body, query, signal } = options;

  let url = `${CONFIG.BASE_URL}${endpoint}`;
  if (query) {
    const params = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (params.length) url += `?${params.join('&')}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), CONFIG.REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener?.('abort', () => controller.abort());

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    clearTimeout(timer);
    const kind = controller.signal.aborted ? 'timeout' : 'network';
    return { ok: false, data: null, payload: {}, message: messageForKind(kind), errorKind: kind, httpStatus: 0 };
  }
  clearTimeout(timer);

  // Keep the session cookie the server hands back.
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const cookie = setCookie.split(';')[0];
    if (cookie && cookie !== sessionCookie) await persistCookie(cookie);
  }

  let payload = null;
  const raw = await response.text();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return {
        ok: false,
        data: null,
        payload: {},
        message: messageForKind('malformed'),
        errorKind: 'malformed',
        httpStatus: response.status,
      };
    }
  }

  // A 401 while signing in is a rejected credential, not a dead session, so it
  // must not drop the stored cookie or trigger the app-wide re-login.
  if (response.status === 401 && !isCredentialAttempt(endpoint)) {
    await clearSession();
    unauthorizedListener?.();
  }

  if (!response.ok) {
    const kind = kindForStatus(response.status);
    return {
      ok: false,
      data: payload?.data ?? null,
      payload: payload || {},
      message: payload?.message || messageForKind(kind),
      errorKind: kind,
      httpStatus: response.status,
    };
  }

  // HTTP 200 but the backend said no -- a rejected dispense, a stock shortfall.
  // The message is the useful part, so pass it through untouched.
  if (payload && payload.success === false) {
    return {
      ok: false,
      data: payload.data ?? null,
      payload,
      message: payload.message || 'The request was refused.',
      errorKind: 'invalid',
      httpStatus: response.status,
    };
  }

  return {
    ok: true,
    data: payload?.data ?? payload ?? null,
    payload: payload || {},
    message: payload?.message || '',
    errorKind: null,
    httpStatus: response.status,
  };
}

/** Liveness check for the connection banner. Unauthenticated 401 still means reachable. */
export async function ping() {
  const res = await apiRequest('/ping');
  return { reachable: res.httpStatus > 0, authenticated: res.ok, result: res };
}
