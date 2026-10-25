import { apiRequest } from './client';

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
  /** The work board. `filters` are whatever /dispensing/options offers. */
  queue(filters = {}) {
    return apiRequest('/dispensing', { query: filters });
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

  /** Undo a dispense: stock returns, ledger records 'dispense_voided'. */
  void: (dispenseId, reason) =>
    apiRequest('/dispensing/void', { method: 'POST', body: { dispense_id: dispenseId, reason } }),

  /**
   * High-alert second check. The backend refuses the person who prepared it,
   * so the checker must be a different signed-in user (Phase 5.2).
   */
  check(dispenseId, payload) {
    return apiRequest('/dispensing/check', { method: 'POST', body: { dispense_id: dispenseId, ...payload } });
  },

  /** The pharmacy will not give the rest (patient declined, out of stock). */
  close(prescriptionId, reason) {
    return apiRequest('/dispensing/close', {
      method: 'POST',
      body: { prescription_id: prescriptionId, reason },
    });
  },

  /** Auxiliary labels for a completed dispense. */
  labels(dispenseId) {
    return apiRequest('/dispensing/labels', { query: { dispense_id: dispenseId } });
  },

  saveAuxiliaryLabel(payload) {
    return apiRequest('/dispensing/labels/customize', { method: 'POST', body: payload });
  },

  /** Take payment. Senior / PWD discounts require the ID number. */
  payment(dispenseId, payload) {
    return apiRequest('/dispensing/payment', {
      method: 'POST',
      body: { dispense_id: dispenseId, ...payload },
    });
  },

  chargeSlip(dispenseId) {
    return apiRequest('/dispensing/charge-slip', { query: { dispense_id: dispenseId } });
  },

  requestRefill(payload) {
    return apiRequest('/dispensing/refill-request', { method: 'POST', body: payload });
  },

  declineRefill(requestId, reason) {
    return apiRequest('/dispensing/refill-decline', {
      method: 'POST',
      body: { request_id: requestId, reason },
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
