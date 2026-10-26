import { apiRequest } from './client';

/**
 * Pharmacy dashboard and reports. All reads.
 *
 * Every one of these is already covered by the Phase 0.5 pharmacist grant
 * (`/pharmacy-dashboard` and `/pharmacy-reports/*`), and PharmacyReportService
 * takes its roles from DispensingService::ROLES -- so whoever may dispense may
 * read the reports on what was dispensed.
 */
export const ReportService = {
  /** Shift overview: stock value, low stock, expiry, transfers, worklists. */
  dashboard(warehouseId) {
    return apiRequest('/pharmacy-dashboard', { query: { warehouse_id: warehouseId } });
  },

  /** Filter values for every report below: warehouses, drugs, prescribers, dispensers. */
  options() {
    return apiRequest('/pharmacy-reports/options');
  },

  /** Every dispensed line, with who dispensed it and from which lot. */
  dispensingLog(filters = {}) {
    return apiRequest('/pharmacy-reports/dispensing-log', { query: filters });
  },

  /** The controlled-substances register: opening, in, out, closing, on hand. */
  dangerousDrugs(filters = {}) {
    return apiRequest('/pharmacy-reports/dangerous-drugs', { query: filters });
  },

  /** Prescriptions still waiting, and how long they have waited. */
  unfilled(filters = {}) {
    return apiRequest('/pharmacy-reports/unfilled', { query: filters });
  },

  /** Prescribing patterns per doctor, with fill rate. */
  byPrescriber(filters = {}) {
    return apiRequest('/pharmacy-reports/by-prescriber', { query: filters });
  },
};
