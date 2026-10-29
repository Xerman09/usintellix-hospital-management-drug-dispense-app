/**
 * The dispensing queue's views, and what a row should warn about.
 *
 * Pure, no imports, so it can be tested directly.
 *
 * The queue is filtered by ONE parameter -- `view` -- not by a set of status
 * filters. The views are defined by DispensingService::queue()'s switch, and
 * each has its own ordering built into the SQL. The names below are the
 * backend's; changing them silently falls through to `to_fill`, which would
 * look like a working filter that quietly shows the wrong list.
 */

export const VIEWS = [
  { key: 'to_fill', label: 'To fill', countKey: 'to_fill', hint: 'Waiting or partly filled. Oldest first.' },
  { key: 'to_verify', label: 'To verify', countKey: 'to_verify', hint: 'Not yet clinically verified by a pharmacist.' },
  { key: 'to_check', label: 'Awaiting check', countKey: 'to_check', hint: 'High-alert dispensings waiting for a second pharmacist.' },
  { key: 'refills', label: 'Refills', countKey: 'refills', hint: 'Refills the patient or staff asked for.' },
  { key: 'partial', label: 'Partly filled', countKey: 'partial', hint: 'Some given, some still owed.' },
  { key: 'expired', label: 'Expired', countKey: 'expired', hint: 'Past the date they can still be filled.' },
  { key: 'dispensed', label: 'Dispensed', countKey: null, hint: 'Completed, most recent first.' },
  { key: 'closed', label: 'Closed', countKey: null, hint: 'Closed with whatever was given.' },
  { key: 'all', label: 'All', countKey: null, hint: 'Everything with something to dispense.' },
];

export const DEFAULT_VIEW = 'to_fill';

export function isValidView(view) {
  return VIEWS.some((v) => v.key === view);
}

export function viewMeta(view) {
  return VIEWS.find((v) => v.key === view) || VIEWS[0];
}

/**
 * Badge keys for a queue row, worst first.
 *
 * Returned as keys rather than styles so this stays free of the theme and
 * testable. The screen maps them onto THEME.safety / THEME.flag / THEME.status.
 *
 *   awaitingCheck  a high-alert dispensing is held for a second pharmacist
 *   dangerous      the slip contains a dangerous (controlled) drug
 *   expired        past fillable_until -- the backend decides this, not us
 *   refill         a refill request is pending on this slip
 *   unverified     no Approved clinical verification yet
 *   nothingToFill  no catalog medicines, so the pharmacy has nothing to give
 */
export function rowFlags(row) {
  if (!row) return [];
  const flags = [];

  if (Number(row.awaiting_check) > 0) flags.push('awaitingCheck');
  if (row.has_dangerous_drug) flags.push('dangerous');
  if (row.is_expired) flags.push('expired');
  if (Number(row.refill_requests) > 0) flags.push('refill');

  // 'Pending Review' is what the backend returns when no verification exists,
  // so anything other than Approved means it has not been verified.
  if (row.clinical_verification_status && row.clinical_verification_status !== 'Approved') {
    flags.push('unverified');
  }

  if (Number(row.catalog_count) === 0) flags.push('nothingToFill');

  return flags;
}

/**
 * One line summarising the medicines on a slip, for the queue row.
 * `medicines` is the slip's line titles in order.
 */
export function medicineSummary(row, max = 2) {
  const list = Array.isArray(row?.medicines) ? row.medicines.filter(Boolean) : [];
  if (!list.length) return '';
  if (list.length <= max) return list.join(', ');
  return `${list.slice(0, max).join(', ')} +${list.length - max} more`;
}

/**
 * Human "how long ago", for the auto-refresh indicator. The pharmacist needs
 * to know whether the board in front of them is current.
 */
export function freshness(lastUpdatedMs, nowMs = Date.now()) {
  if (!lastUpdatedMs) return 'not loaded yet';
  const secs = Math.max(0, Math.round((nowMs - lastUpdatedMs) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} h ago`;
}

/** Count for a view's chip, or null when that view has no count. */
export function countFor(view, counts) {
  const meta = viewMeta(view);
  if (!meta.countKey || !counts) return null;
  const n = counts[meta.countKey];
  return typeof n === 'number' ? n : null;
}

/* ------------------------------------------------------------------ *
 * Row models (Phase 10.3)
 * ------------------------------------------------------------------ */

/**
 * Everything a queue row draws, worked out once.
 *
 * Why this exists: the queue is capped at 300 rows and the screen re-renders
 * on every keystroke in the search box. Doing rowFlags() and medicineSummary()
 * inside the render of each visible row meant repeating that work for every
 * mounted row on every keystroke -- cheap individually, and the sort of thing
 * that makes a 2 GB counter tablet feel like it is lagging behind the typist.
 *
 * Pure: the same row object in gives an equal model out, with no theme and no
 * React in sight. The screen turns the flag keys into badges.
 */
export function buildRowModel(row) {
  if (!row) return null;

  const lines = Number(row.line_count) || 0;

  return {
    id: row.id,
    rxNumber: row.rx_number,
    patientName: row.patient_name,
    patientNo: row.patient_no || null,
    medicines: medicineSummary(row),
    prescribedDate: row.prescribed_date,
    lineLabel: `${lines} line${lines === 1 ? '' : 's'}`,
    status: row.dispense_status,
    statusLabel: row.status_label,
    flags: rowFlags(row),
  };
}

/**
 * Cache keyed by the row OBJECT, not its id.
 *
 * react-query hands back the same row objects between renders and new ones
 * after a refetch, which is exactly the lifetime a model should have: identity
 * is the signal that the row's contents cannot have changed. A WeakMap because
 * the models must not keep refetched rows -- and the patient names in them --
 * alive after the queue has moved on.
 */
const MODELS = new WeakMap();

/** The model for one row, built at most once per row object. */
export function rowModel(row) {
  if (!row || typeof row !== 'object') return null;

  const cached = MODELS.get(row);
  if (cached) return cached;

  const model = buildRowModel(row);
  MODELS.set(row, model);
  return model;
}

/** Models for a list of rows, in order. */
export function rowModels(rows) {
  return Array.isArray(rows) ? rows.map(rowModel) : [];
}
