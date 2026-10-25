import { apiRequest } from './client';

/**
 * Drug catalog, lots and warehouse stock -- everything the lot picker needs.
 *
 * READ ONLY by design. Phase 0.5 deliberately granted the pharmacist role GET
 * on these paths but not POST/PUT/DELETE: receiving, transferring and
 * destroying stock stay with admin until Phase 13 decides otherwise. Adding a
 * write here will 403 until that grant changes, which is the intended answer.
 */
export const InventoryService = {
  drugs(filters = {}) {
    return apiRequest('/drug-inventory', { query: filters });
  },

  catalog(filters = {}) {
    return apiRequest('/drug-inventory/catalog', { query: filters });
  },

  drug(drugId) {
    return apiRequest('/drug-inventory/drug', { query: { id: drugId } });
  },

  options() {
    return apiRequest('/drug-inventory/options');
  },

  warehouses() {
    return apiRequest('/warehouses');
  },

  warehouseOptions() {
    return apiRequest('/warehouses/options');
  },

  /** Lots with quantity on hand, per location. The lot picker's source. */
  stock(filters = {}) {
    return apiRequest('/warehouses/stock', { query: filters });
  },

  /** Lots locked for being within 60 days of expiry. Not dispensable. */
  quarantine(filters = {}) {
    return apiRequest('/drug-inventory/quarantine', { query: filters });
  },

  /** Batch/lot recalls. A recalled lot is never dispensable. */
  recalls(filters = {}) {
    return apiRequest('/drug-inventory/recalls', { query: filters });
  },

  recallDetail(recallId) {
    return apiRequest('/drug-inventory/recalls/detail', { query: { id: recallId } });
  },
};
