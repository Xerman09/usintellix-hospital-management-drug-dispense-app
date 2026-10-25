import { apiRequest, clearSession } from './client';
import { COUNTER_ROLES, WARD_ROLES, STEP, nextStepFor, stepForUser } from './authFlow';

export { COUNTER_ROLES, WARD_ROLES, STEP };

/**
 * Both password-renewal endpoints grant the session server-side and return the
 * granted user at data.user.
 *
 * The fallback to /auth/me is deliberate: an HMS build from before the
 * AuthController fix returns data.user = null here even though the session IS
 * live, which would otherwise look like a failed login immediately after the
 * pharmacist successfully set a new password.
 */
async function passwordUpdate(endpoint, payload) {
  const res = await apiRequest(endpoint, { method: 'PUT', body: payload });

  if (!res.ok) {
    return { ...res, flow: { step: STEP.ERROR, message: res.message, errors: res.payload?.errors || null } };
  }

  let user = res.data?.user || null;
  if (!user) {
    const who = await apiRequest('/auth/me');
    user = who.data?.user || null;
  }

  return { ...res, flow: stepForUser(user) };
}

/**
 * Staff authentication.
 *
 * The mirror image of the patient app's guard: this app is for pharmacy staff,
 * so a `patient` login is refused here and told to use the Patient app, exactly
 * as the patient app refuses staff.
 *
 * Every method that can finish a login returns `{ ...ApiResult, flow }`, where
 * `flow` is the next step from authFlow.js. The screens act on `flow.step` and
 * never re-derive it, so there is one place where "what happens next" is
 * decided -- and it is unit-tested.
 */
export const AuthService = {
  /** Step 1. May end in 2FA, a password renewal, a lockout, or straight in. */
  async login(username, password) {
    const res = await apiRequest('/login', { method: 'POST', body: { username, password } });
    const flow = nextStepFor(res);

    // Refused on role grounds: do not leave a usable session behind.
    if (flow.step === STEP.WRONG_APP || flow.step === STEP.FORBIDDEN) {
      await this.logout();
    }

    return { ...res, flow };
  },

  /** Step 2, when 2FA is on for this role. Same role guard applies after it. */
  async verify2FA(code) {
    const res = await apiRequest('/verify-2fa', { method: 'POST', body: { code } });
    const flow = nextStepFor(res);

    if (flow.step === STEP.WRONG_APP || flow.step === STEP.FORBIDDEN) {
      await this.logout();
    }

    return { ...res, flow };
  },

  /** Backend answers 429 while the resend cooldown is still running. */
  resend2FA() {
    return apiRequest('/resend-2fa', { method: 'POST' });
  },

  /** Who is signed in. Revalidates a restored cookie on app resume. */
  me() {
    return apiRequest('/auth/me');
  },

  /**
   * Forced first-login reset: new username, password and email confirmation.
   * Requires the session the login already granted.
   */
  async completeFirstLogin(payload) {
    const res = await apiRequest('/auth/first-login', { method: 'PUT', body: payload });
    if (!res.ok) return { ...res, flow: { step: STEP.FIRST_LOGIN, message: res.message, errors: res.payload?.errors || null } };
    return { ...res, flow: stepForUser(res.data?.user) };
  },

  /** 90-day renewal. Unauthenticated: it carries user_id/username itself. */
  updateExpiredPassword(payload) {
    return passwordUpdate('/auth/expired-password', payload);
  },

  /** Compromised-credential replacement. Unauthenticated, same shape. */
  updateBreachedPassword(payload) {
    return passwordUpdate('/auth/breached-password', payload);
  },

  /** Live breach check while typing a new password. Unauthenticated. */
  async checkPasswordBreach(password) {
    const res = await apiRequest('/auth/check-password-breach', { method: 'POST', body: { password } });
    return {
      breached: Boolean(res.data?.breached),
      count: Number(res.data?.count ?? 0),
      message: res.data?.message || res.message || '',
      ok: res.ok,
    };
  },

  /** HIPAA 164.520 acknowledgement. Not gated on for staff -- see README. */
  acknowledgeNpp(payload) {
    return apiRequest('/auth/npp-acknowledge', { method: 'POST', body: payload });
  },

  async logout() {
    const res = await apiRequest('/logout', { method: 'POST' });
    await clearSession();
    return res;
  },
};
