import { apiRequest } from './client';

/**
 * Resolving a scanned code.
 *
 * Thin wrappers over /dispensing/scan/*. All three answer 200 with
 * `found: true|false`, so a code that matches nothing is ordinary data rather
 * than an error -- someone scanned the shelf label instead of the pack.
 *
 * `expected*` is what makes these safety checks rather than searches: the
 * server compares what was scanned against what the pharmacist is about to do
 * and returns the verdict, so the tablet never has to decide on its own
 * whether two identifiers refer to the same thing.
 */
export const ScanService = {
  /** An Rx number from a prescription slip. */
  rx(code) {
    return apiRequest('/dispensing/scan/rx', { query: { code } });
  },

  /** A patient number from a wristband or ID card. */
  patient(code, expectedPatientId) {
    return apiRequest('/dispensing/scan/patient', {
      query: { code, expected_patient_id: expectedPatientId },
    });
  },

  /** A pack barcode or lot number. */
  lot(code, { expectedDrugId, warehouseId } = {}) {
    return apiRequest('/dispensing/scan/lot', {
      query: { code, expected_drug_id: expectedDrugId, warehouse_id: warehouseId },
    });
  },
};
