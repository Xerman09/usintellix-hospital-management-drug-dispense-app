/**
 * Refill requests.
 *
 * Pure, no imports, so the rules can be tested directly. They mirror
 * DispensingService::requestRefill() and declineRefill().
 *
 * The distinction that matters: a refill can be DISPENSED and a refill can be
 * REQUESTED, and they are not the same action.
 *
 *   dispense a refill  the patient is here, so give it now (item.can_refill)
 *   request a refill   the patient is not here -- they rang, or a relative
 *                      asked -- so record that one is wanted, for the pharmacy
 *                      to fill later
 *
 * Both need the current fill finished and a refill left inside the refill
 * period. Requesting additionally needs no request already waiting, because the
 * backend allows one pending request per medicine at a time.
 */

/** Request states the backend sets. */
export const REFILL_STATUS = {
  PENDING: 'pending',
  DISPENSED: 'dispensed',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
};

/**
 * May a refill be requested for this line, and if not, why?
 *
 * @param {Object} item   a detail() prescription item
 * @param {Object} detail the whole detail payload (for refill_until)
 * @returns {{can: boolean, reason: ?string}}
 */
export function canRequestRefill(item, detail) {
  if (!item) return { can: false, reason: null };

  if (!item.can_dispense) {
    return { can: false, reason: 'Not in the Drug Catalog, so it cannot be refilled from stock.' };
  }

  if (item.refill_request && item.refill_request.status !== REFILL_STATUS.DECLINED) {
    return { can: false, reason: 'A refill of this medicine has already been requested and is waiting.' };
  }

  if (!item.is_complete) {
    return { can: false, reason: 'The current fill has not been given in full yet.' };
  }

  if (Number(item.refills_remaining) < 1) {
    return { can: false, reason: 'No refills are left on this medicine.' };
  }

  const until = detail?.refill_until;
  if (!until) {
    return { can: false, reason: 'This prescription has no refill period set.' };
  }

  // Date-only comparison, as the backend does it (refill_until >= today).
  const today = new Date().toISOString().slice(0, 10);
  if (until < today) {
    return { can: false, reason: `The refill period ended on ${until}.` };
  }

  return { can: true, reason: null };
}

/** A pending request can be declined; anything else has already been decided. */
export function canDecline(request) {
  if (!request) return false;
  // pendingRequests() only ever returns pending ones, so a missing status is
  // treated as pending rather than assumed decided.
  return !request.status || request.status === REFILL_STATUS.PENDING;
}

/** Where a request came from, in words. */
export function sourceLabel(source) {
  if (source === 'patient') return 'asked by the patient';
  if (source === 'staff') return 'recorded by staff';
  return source ? `from ${source}` : '';
}

/** The POST /dispensing/refill-request body. */
export function buildRefillRequestBody(itemId, notes) {
  const body = { prescription_item_id: Number(itemId) };
  const text = String(notes || '').trim();
  if (text) body.notes = text.slice(0, 500);
  return body;
}

/**
 * A decline needs a reason, and the PATIENT SEES IT -- the backend says so
 * explicitly. That changes what a good reason looks like, so the UI says it
 * too, and an empty one is refused here rather than at the server.
 */
export function validateDecline(reason) {
  const text = String(reason || '').trim();
  if (!text) {
    return { ok: false, error: 'Enter why the refill is declined. The patient will see it.' };
  }
  return { ok: true, error: null, reason: text.slice(0, 500) };
}
