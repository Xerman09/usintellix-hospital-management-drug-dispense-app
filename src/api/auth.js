import { apiRequest, clearSession } from './client';

/**
 * Staff authentication.
 *
 * The mirror image of the patient app's guard: this app is for pharmacy staff,
 * so a `patient` login is refused here and told to use the Patient app, exactly
 * as the patient app refuses staff.
 *
 * Phase 2 builds the screens on top of this; the roles below are what Phase 0.5
 * granted in backend/config/role_access.php.
 */

/** Roles allowed to run the counter. `admin` is included for support cover. */
export const COUNTER_ROLES = ['pharmacist', 'admin'];

/** Added in Phase 12, when the nurse eMAR surface lands. */
export const WARD_ROLES = ['nurse', 'charge_nurse'];

export const AuthService = {
  /**
   * Sign in. A successful reply may still require 2FA, a first-login setup, a
   * password renewal or an NPP acknowledgement -- the backend says which, and
   * Phase 2 handles each. Here we only enforce the role boundary.
   */
  async login(username, password) {
    const res = await apiRequest('/login', { method: 'POST', body: { username, password } });

    const role = res.data?.user?.role;
    if (res.ok && role && !COUNTER_ROLES.includes(role)) {
      await this.logout();
      return {
        ...res,
        ok: false,
        errorKind: 'forbidden',
        isWrongApp: role === 'patient',
        message:
          role === 'patient'
            ? 'This tablet is for pharmacy staff. Please use the USIntellix Patient app.'
            : `The ${role} role cannot dispense medicine. Sign in with a pharmacist account.`,
      };
    }

    return res;
  },

  verify2FA(code) {
    return apiRequest('/verify-2fa', { method: 'POST', body: { code } });
  },

  resend2FA() {
    return apiRequest('/resend-2fa', { method: 'POST' });
  },

  /** Who is signed in. Used to revalidate the restored session on resume. */
  me() {
    return apiRequest('/auth/me');
  },

  completeFirstLogin(payload) {
    return apiRequest('/auth/first-login', { method: 'PUT', body: payload });
  },

  updateExpiredPassword(payload) {
    return apiRequest('/auth/expired-password', { method: 'PUT', body: payload });
  },

  acknowledgeNpp(payload) {
    return apiRequest('/auth/npp-acknowledge', { method: 'POST', body: payload });
  },

  async logout() {
    const res = await apiRequest('/logout', { method: 'POST' });
    await clearSession();
    return res;
  },
};
