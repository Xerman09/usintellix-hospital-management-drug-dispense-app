import { apiRequest } from './client';

/**
 * Pharmacist clinical verification.
 *
 * Reading only. Saving a verification stays on the desktop for now (Phase 8.4):
 * the form behind it covers renal function, weight-based dosing, indication and
 * interaction cross-checks, which is a longer sit-down job than a counter
 * tablet is for.
 *
 * `/dispensing/clinical-verifications` lists existing verification RECORDS.
 * That is not the same as "prescriptions needing verification" -- a prescription
 * with no record at all has nothing to list, and those are the ones a pharmacist
 * most needs to see. They come from the dispensing queue's `to_verify` view
 * instead, which is why the verification screen uses both sources.
 */

/** The five statuses, and which of them stop dispensing. */
export const VERIFICATION_STATUSES = {
  'Pending Review': { label: 'Pending review', blocks: false },
  Approved: { label: 'Approved', blocks: false },
  'Intervention Needed': { label: 'Intervention needed', blocks: true },
  'Clarification Requested': { label: 'Clarification requested', blocks: true },
  Rejected: { label: 'Rejected', blocks: true },
};

/** The statuses that hold picking, in the order a pharmacist should see them. */
export const BLOCKING_STATUSES = ['Rejected', 'Intervention Needed', 'Clarification Requested'];

export const VerificationService = {
  /** @param {{prescription_id?: number, patient_id?: number, verification_status?: string}} filters */
  list(filters = {}) {
    return apiRequest('/dispensing/clinical-verifications', { query: filters });
  },

  /** One prescription's record, if it has one. */
  forPrescription(prescriptionId) {
    return apiRequest('/dispensing/clinical-verifications', {
      query: { prescription_id: prescriptionId },
    });
  },
};
