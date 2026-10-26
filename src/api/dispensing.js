import { apiRequest, SESSION } from './client';

/**
 * Pharmacy > Dispensing.
 *
 * Thin wrappers over the backend's existing /dispensing routes -- the whole
 * workflow already exists server-side, so nothing here invents behaviour.
 * Phase 0.5 granted the pharmacist role every path used below.
 *
 * Workflow: queue -> detail -> dispense -> (check, if high-alert) -> payment.
 * void undoes a dispense and puts the stock back; close ends a prescription
 * with whatever was given.
 */
export const DispensingService = {
  /**
   * The work board.
   *
   * Only two parameters exist: `view` (one of queueViews.js's keys) and `q`
   * (free text over rx_number, patient_no and patient name). The view is what
   * filters the queue -- there is no per-status filter beyond it.
   */
  queue({ view = 'to_fill', q = '' } = {}) {
    return apiRequest('/dispensing', { query: { view, q } });
  },

  /** One prescription: lines, quantities given and remaining, usable lots. */
  detail(prescriptionId) {
    return apiRequest('/dispensing/show', { query: { id: prescriptionId } });
  },

  /** Filter values, payment methods, discounts, warehouses. */
  options() {
    return apiRequest('/dispensing/options');
  },

  /** Give medicine from stock. The one call that moves inventory. */
  dispense(payload) {
    return apiRequest('/dispensing', { method: 'POST', body: payload });
  },

  /**
   * Undo a dispense: stock returns, ledger records 'dispense_voided'.
   *
   * Every one of these takes `id`, not a named key -- DispensingController
   * reads `$request->input('id')` throughout. Phase 1 guessed `dispense_id`
   * and `prescription_id`, which would have silently acted on id 0.
   */
  void: (dispenseId, reason) =>
    apiRequest('/dispensing/void', { method: 'POST', body: { id: dispenseId, reason } }),

  /**
   * High-alert second check, made on the CHECKER's session.
   *
   * The backend reads the acting user from the session cookie and refuses the
   * person who prepared the dispensing, so this must not go out on the
   * preparer's session -- it would simply be rejected. It runs on the secondary
   * session the checker signed in to (see CheckerService).
   *
   * There is no "fail" option: the backend only accepts confirmed = true, and
   * refuses anything else with a validation error. Failing a check means
   * VOIDING the dispensing instead, which is a separate call.
   *
   * `session` defaults to the checker's own session. It is PRIMARY only when
   * the pharmacist already signed in did not prepare this dispensing, in which
   * case they are themselves a valid second checker and need not sign in again
   * (the backend's `can_check` flag says exactly that).
   *
   * Body: id, confirmed, notes?
   */
  check(dispenseId, { confirmed, notes, session = SESSION.SECONDARY } = {}) {
    return apiRequest('/dispensing/check', {
      method: 'POST',
      body: { id: dispenseId, confirmed, notes },
      session,
    });
  },

  /** The pharmacy will not give the rest (patient declined, out of stock). */
  close(prescriptionId, reason) {
    return apiRequest('/dispensing/close', { method: 'POST', body: { id: prescriptionId, reason } });
  },

  /** Auxiliary labels for a completed dispense. */
  labels(dispenseId) {
    return apiRequest('/dispensing/labels', { query: { id: dispenseId } });
  },

  saveAuxiliaryLabel(payload) {
    return apiRequest('/dispensing/labels/customize', { method: 'POST', body: payload });
  },

  /**
   * Take payment. Body: id, amount, method, reference?
   * The senior / PWD discount is applied on the DISPENSE call, not here.
   */
  payment(dispenseId, { amount, method, reference } = {}) {
    return apiRequest('/dispensing/payment', {
      method: 'POST',
      body: { id: dispenseId, amount, method, reference },
    });
  },

  chargeSlip(dispenseId) {
    return apiRequest('/dispensing/charge-slip', { query: { id: dispenseId } });
  },

  /** Staff asking for a refill on the patient's behalf. */
  requestRefill(prescriptionItemId, notes) {
    return apiRequest('/dispensing/refill-request', {
      method: 'POST',
      body: { prescription_item_id: prescriptionItemId, notes },
    });
  },

  declineRefill(requestId, reason) {
    return apiRequest('/dispensing/refill-decline', {
      method: 'POST',
      body: { id: requestId, reason },
    });
  },

  /** Pharmacist clinical verification queue: renal, weight, allergy cross-check. */
  clinicalVerifications(filters = {}) {
    return apiRequest('/dispensing/clinical-verifications', { query: filters });
  },

  saveClinicalVerification(payload) {
    return apiRequest('/dispensing/clinical-verifications/save', { method: 'POST', body: payload });
  },
};
