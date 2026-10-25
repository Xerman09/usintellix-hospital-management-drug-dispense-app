import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Where the HMS API lives.
 *
 * Resolution order:
 *   1. app.json -> expo.extra.apiBaseUrl, when set. This is how a real tablet
 *      is pointed at the hospital server: set it once, build the APK.
 *   2. Android emulator: 10.0.2.2 reaches the host machine's XAMPP.
 *   3. Anything else: localhost.
 *
 * A PHYSICAL TABLET will not reach 10.0.2.2 -- it must be given a real host
 * through expo.extra.apiBaseUrl (Phase 0.2 settles what that host is, and
 * it must be https:// before any pilot: this is PHI on hospital Wi-Fi, and
 * Android blocks cleartext by default).
 */
const API_PATH = '/ims/usintellix-hospital-management-system/backend/public';

function resolveBaseUrl() {
  const configured = Constants.expoConfig?.extra?.apiBaseUrl;
  if (configured) return String(configured).replace(/\/+$/, '');

  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}${API_PATH}`;
}

export const CONFIG = {
  BASE_URL: resolveBaseUrl(),
  APP_NAME: 'USIntellix Pharmacy',
  APP_SUBTITLE: 'Dispensing Tablet',
  VERSION: '0.1.0',

  /** How long a request may take before we call it a network failure. */
  REQUEST_TIMEOUT_MS: 15000,

  /** Queue auto-refresh. The backend caps the queue at 300 rows. */
  QUEUE_POLL_MS: 30000,

  /** Shared-device idle lock (Phase 2.6). */
  IDLE_LOCK_MS: 3 * 60 * 1000,
};

/** True when the API is still being reached over plain HTTP -- not pilot-safe. */
export function isInsecureTransport() {
  return CONFIG.BASE_URL.startsWith('http://');
}
