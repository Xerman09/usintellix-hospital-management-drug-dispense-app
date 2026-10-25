/**
 * Which step the login flow goes to next.
 *
 * Pure functions, no imports -- the branching is the risky part of Phase 2, so
 * it lives apart from the screens where it can be tested directly.
 *
 * The backend answers POST /login in nine different ways, and a wrong branch
 * either locks a pharmacist out or waves through an account that should be
 * stopped. Mapped from AuthService::login() and AuthController::login():
 *
 *   HTTP 401 + locked              -> account locked, with remaining_minutes
 *   HTTP 401 + password_expired    -> 90-day renewal (HIPAA 164.308(a)(5)(ii)(D))
 *   HTTP 401 + password_breached   -> compromised credential (NIST SP 800-63B)
 *   HTTP 401 + errors              -> missing fields
 *   HTTP 401                       -> bad credentials, suspended, or
 *                                     decommissioned (the controller does not
 *                                     forward those last two as flags, so the
 *                                     message is all we get -- and it says so)
 *   HTTP 200 + data.requires_2fa   -> one-time code step
 *   HTTP 200 + data.user           -> signed in, subject to the checks below
 *
 * NOTE the flags live at the TOP LEVEL of the body, not inside `data`, which
 * is why ApiResult carries `payload`.
 */

/** Roles allowed to run the counter. `admin` is included for support cover. */
export const COUNTER_ROLES = ['pharmacist', 'admin'];

/** Added in Phase 12, when the nurse eMAR surface lands. */
export const WARD_ROLES = ['nurse', 'charge_nurse'];

export const STEP = {
  AUTHENTICATED: 'authenticated',
  TWO_FACTOR: 'twofactor',
  FIRST_LOGIN: 'firstlogin',
  EXPIRED: 'expired',
  BREACHED: 'breached',
  LOCKED: 'locked',
  WRONG_APP: 'wrongapp',
  FORBIDDEN: 'forbidden',
  ERROR: 'error',
};

/**
 * What to do with a user the backend has just signed in.
 *
 * The role is checked BEFORE must_change_password on purpose: a patient or a
 * nurse should be turned away at the door, not walked through a password reset
 * in an app they cannot use anyway.
 */
export function stepForUser(user) {
  if (!user) {
    return { step: STEP.ERROR, message: 'The server signed you in but sent no account details. Please try again.' };
  }

  const role = user.role || '';

  if (!COUNTER_ROLES.includes(role)) {
    if (role === 'patient') {
      return {
        step: STEP.WRONG_APP,
        role,
        message: 'This tablet is for pharmacy staff. Please use the USIntellix Patient app.',
      };
    }
    return {
      step: STEP.FORBIDDEN,
      role,
      message: `The ${role || 'unknown'} role cannot dispense medicine. Sign in with a pharmacist account.`,
    };
  }

  if (user.must_change_password) {
    return { step: STEP.FIRST_LOGIN, user, message: 'Set your own username and password before continuing.' };
  }

  return { step: STEP.AUTHENTICATED, user };
}

/**
 * Map a POST /login or POST /verify-2fa ApiResult to the next step.
 * @param {{ok: boolean, data: *, payload: Object, message: string, errorKind: ?string}} res
 */
export function nextStepFor(res) {
  if (!res) return { step: STEP.ERROR, message: 'No response from the hospital server.' };

  if (!res.ok) {
    const p = res.payload || {};

    // The network failed, or the server broke -- not a credential problem.
    if (res.errorKind === 'network' || res.errorKind === 'timeout' || res.errorKind === 'server' || res.errorKind === 'malformed') {
      return { step: STEP.ERROR, message: res.message, retryable: true };
    }

    if (p.locked) {
      return {
        step: STEP.LOCKED,
        remainingMinutes: Number(p.remaining_minutes ?? 30),
        message: res.message,
      };
    }

    if (p.password_expired) {
      return {
        step: STEP.EXPIRED,
        userId: p.user_id ?? null,
        username: p.username ?? '',
        daysOld: Number(p.days_old ?? 90),
        message: res.message,
      };
    }

    if (p.password_breached) {
      return {
        step: STEP.BREACHED,
        userId: p.user_id ?? null,
        username: p.username ?? '',
        breachCount: Number(p.breach_count ?? 1),
        message: res.message,
      };
    }

    return { step: STEP.ERROR, message: res.message, errors: p.errors || null };
  }

  const data = res.data || {};

  if (data.requires_2fa) {
    return {
      step: STEP.TWO_FACTOR,
      method: data.method || 'email',
      destination: data.destination || '',
      expiresIn: Number(data.expires_in ?? 300),
      resendIn: Number(data.resend_in ?? 60),
      // The backend hands the code back when mail is not configured, so staff
      // are not locked out while MAIL_PASSWORD is pending. Showing it is the
      // honest thing to do -- it is already in the response either way.
      devCode: data.dev_mode ? data.dev_code || null : null,
      message: res.message,
    };
  }

  return stepForUser(data.user);
}

/**
 * Minutes left on a lockout, floored at 0. Used by the countdown.
 */
export function lockoutRemaining(step, elapsedMs = 0) {
  const total = (step?.remainingMinutes ?? 0) * 60000;
  return Math.max(0, Math.ceil((total - elapsedMs) / 60000));
}
