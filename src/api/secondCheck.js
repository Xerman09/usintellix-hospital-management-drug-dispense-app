/**
 * The high-alert second check.
 *
 * Pure, no imports, so the rules can be tested directly.
 *
 * A dispensing containing a high-alert medicine is written with
 * check_status = 'awaiting' and must not be handed to the patient until a
 * SECOND person confirms it. The backend enforces the part that matters -- the
 * checker cannot be the person who prepared it -- and this module mirrors its
 * refusals so the screen explains them before a request is sent.
 *
 * Two routes to a valid checker, both legitimate:
 *
 *   1. The pharmacist already signed in did not prepare it. The backend's
 *      `can_check` flag says so, and their own session is enough.
 *   2. The signed-in pharmacist DID prepare it. Then a second pharmacist signs
 *      in on a separate session just for the check, and the preparer stays
 *      signed in on the tablet.
 *
 * There is no "fail the check" call. `check()` only accepts confirmed = true;
 * a dispensing that fails is VOIDED instead, which is a different action with
 * its own reason. FAIL_ACTION below says so in one place.
 */

export const FAIL_ACTION = 'void';

/**
 * What the checker confirms, one tick each.
 *
 * Every point is answerable from what is on the counter plus what the screen
 * shows, because a checklist that needs the checker to go and look something up
 * elsewhere gets ticked without being read.
 */
export const CHECK_POINTS = [
  { key: 'patient', label: 'Right patient', hint: 'Name and patient number match the prescription.' },
  { key: 'medicine', label: 'Right medicine and strength', hint: 'Including brand or generic substitution, if any.' },
  { key: 'quantity', label: 'Right quantity', hint: 'Counted, not assumed.' },
  { key: 'lot', label: 'Right lot, in date', hint: 'Lot number and expiry match what was dispensed.' },
  { key: 'label', label: 'Label and directions correct', hint: 'Dose, frequency and any auxiliary warnings.' },
];

export const CHECK_ROUTE = { SELF: 'self', SECOND_USER: 'second_user' };

/**
 * Can this dispensing be checked at all, and by whom?
 *
 * Mirrors DispensingService::check()'s refusals, in its order.
 *
 * @param {Object} entry  a row from detail().history
 * @returns {{checkable: boolean, reason: ?string, route: ?string}}
 */
export function checkability(entry) {
  if (!entry) return { checkable: false, reason: 'No dispensing selected.', route: null };

  if (entry.status !== 'completed') {
    return { checkable: false, reason: 'This dispensing was undone, so there is nothing to check.', route: null };
  }
  if (entry.check_status === 'checked') {
    return {
      checkable: false,
      reason: entry.checked_by_name
        ? `Already checked by ${entry.checked_by_name}.`
        : 'This dispensing has already been checked.',
      route: null,
    };
  }
  if (entry.check_status !== 'awaiting') {
    return {
      checkable: false,
      reason: 'This dispensing has no high-alert medicine, so it needs no second check.',
      route: null,
    };
  }

  // can_check is computed for whoever loaded the prescription: true means they
  // did not prepare it, so their own session is a valid second check.
  return {
    checkable: true,
    reason: null,
    route: entry.can_check ? CHECK_ROUTE.SELF : CHECK_ROUTE.SECOND_USER,
  };
}

/**
 * Is the signed-in checker a different person from the preparer?
 *
 * The server is the authority (it compares created_by to the acting user), but
 * the obvious case is worth catching before a round trip: the "second"
 * pharmacist signing in with the same account that prepared it.
 */
export function isDistinctChecker(checkerUser, preparerUser, entry) {
  if (!checkerUser) return { ok: false, reason: 'Sign in to check this dispensing.' };

  const sameAccount =
    preparerUser &&
    (Number(checkerUser.id) === Number(preparerUser.id) ||
      (checkerUser.username && checkerUser.username === preparerUser.username));

  if (sameAccount && entry?.prepared_by_viewer) {
    return {
      ok: false,
      reason: 'You prepared this dispensing, so someone else has to check it.',
    };
  }

  return { ok: true, reason: null };
}

/** Every point ticked? The backend refuses anything less. */
export function allPointsTicked(ticked) {
  return CHECK_POINTS.every((p) => Boolean(ticked?.[p.key]));
}

export function untickedPoints(ticked) {
  return CHECK_POINTS.filter((p) => !ticked?.[p.key]).map((p) => p.label);
}

/**
 * Safety warnings for one medicine, worst first (Phase 5.5 - 5.8).
 *
 * Returned as plain data so the screen maps them onto the theme, and so the
 * ordering is testable. `requires_prescription` is reported only when there is
 * something wrong with it -- an Rx-only medicine on a valid prescription is
 * the normal case and does not need a warning.
 */
export function safetyWarnings(item) {
  if (!item) return [];
  const out = [];

  if (item.is_high_alert) {
    out.push({ key: 'highAlert', text: 'High alert: a second pharmacist must check this before handover.' });
  }
  if (item.is_lasa) {
    out.push({
      key: 'lasa',
      text: 'Look-alike / sound-alike: read the full name and strength aloud before handing over.',
    });
  }
  if (item.controlled_class) {
    out.push({ key: 'controlled', text: `${item.controlled_class}: record it in the dangerous drugs register.` });
  }
  if (item.requires_prescription && !item.can_dispense) {
    out.push({
      key: 'rxOnly',
      text: 'Prescription-only medicine, but it is not in the Drug Catalog, so it cannot be dispensed from stock.',
    });
  }
  if (item.storage_condition) {
    out.push({ key: 'storage', text: `Storage: ${item.storage_condition}.` });
  }

  return out;
}

/** The medicines on a dispensing that triggered the check. */
export function highAlertItems(items) {
  return (Array.isArray(items) ? items : []).filter((i) => i.is_high_alert);
}
