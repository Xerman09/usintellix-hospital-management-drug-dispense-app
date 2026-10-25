/**
 * Building and checking a dispensing before it is sent.
 *
 * Pure, no imports, so the rules can be tested directly. They mirror
 * DispensingService::dispense()'s own validation -- not to replace it (the
 * server is the authority and holds the row locks) but so the pharmacist is
 * told at the counter instead of after pressing Dispense.
 *
 * Three things about the backend shape the whole screen:
 *
 *  1. ONE LOCATION per dispensing. dispense() takes a single warehouse_id and
 *     only looks at lots there. A prescription whose stock is split across
 *     locations cannot be filled in one go.
 *
 *  2. SPLITTING IS AUTOMATIC. Omit lot_id and the server takes earliest-expiry
 *     first across every usable lot at that location, splitting a line over as
 *     many lots as it needs. Pin a lot_id and ONLY that lot is used -- if it is
 *     short, the line is refused rather than topped up from the next lot.
 *     The same line twice in one request is rejected ("listed twice"), so a
 *     client cannot describe its own split. Auto is therefore the default, and
 *     pinning is the exception for when the pharmacist has a particular box.
 *
 *  3. FEFO ORDER is `expires_date IS NULL, expires_date, id` -- dated lots
 *     first, soonest first, undated last. fefoPlan() reproduces it exactly so
 *     the preview matches what the server will actually do.
 */

/** Quantities are DECIMAL(12,3); the backend compares with this tolerance. */
export const EPSILON = 0.0005;

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/** Round like the backend does before comparing or sending. */
export function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

/**
 * The server's lot order: dated before undated, then soonest expiry, then id.
 * Pure comparator, so a preview cannot drift from the real allocation.
 */
export function fefoCompare(a, b) {
  const aNull = !a.expires_date;
  const bNull = !b.expires_date;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && a.expires_date !== b.expires_date) {
    return a.expires_date < b.expires_date ? -1 : 1;
  }
  return num(a.id) - num(b.id);
}

/** Usable lots for one medicine at one location, in the order the server uses. */
export function lotsAtWarehouse(item, warehouseId) {
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  return lots.filter((l) => num(l.warehouse_id) === num(warehouseId)).slice().sort(fefoCompare);
}

export function stockAtWarehouse(item, warehouseId) {
  return round3(lotsAtWarehouse(item, warehouseId).reduce((sum, l) => sum + num(l.quantity), 0));
}

/**
 * Every location that holds any stock for this prescription, with how many of
 * its medicines it can fully cover. The picker leads with the best one, because
 * choosing a location that cannot finish the job is the easiest mistake here.
 */
export function warehouseOptions(items) {
  const dispensable = (Array.isArray(items) ? items : []).filter((i) => i.can_dispense);
  const byId = new Map();

  dispensable.forEach((item) => {
    (Array.isArray(item.lots) ? item.lots : []).forEach((lot) => {
      const id = num(lot.warehouse_id);
      if (!byId.has(id)) {
        byId.set(id, { warehouse_id: id, warehouse_name: lot.warehouse_name, covered: 0, partial: 0, missing: 0 });
      }
    });
  });

  byId.forEach((wh) => {
    dispensable.forEach((item) => {
      const need = num(item.remaining_quantity);
      const have = stockAtWarehouse(item, wh.warehouse_id);
      if (have + EPSILON >= need && need > 0) wh.covered += 1;
      else if (have > 0) wh.partial += 1;
      else wh.missing += 1;
    });
  });

  return [...byId.values()].sort(
    (a, b) => b.covered - a.covered || b.partial - a.partial || a.warehouse_name?.localeCompare(b.warehouse_name || '') || 0
  );
}

/**
 * What the server will take, and from where, for a quantity at one location.
 * `lotId` pins a single lot; without it, earliest expiry first across lots.
 *
 * @returns {{takes: Array, allocated: number, shortfall: number, spansLots: boolean}}
 */
export function fefoPlan(item, warehouseId, quantity, lotId = null) {
  const wanted = round3(num(quantity));
  let pool = lotsAtWarehouse(item, warehouseId);

  if (lotId) {
    pool = pool.filter((l) => num(l.id) === num(lotId));
  }

  const takes = [];
  let left = wanted;

  pool.forEach((lot) => {
    if (left <= EPSILON) return;
    const take = round3(Math.min(left, num(lot.quantity)));
    if (take <= 0) return;
    takes.push({ lot_id: num(lot.id), lot_number: lot.lot_number, expires_date: lot.expires_date, quantity: take });
    left = round3(left - take);
  });

  const allocated = round3(takes.reduce((s, t) => s + t.quantity, 0));

  return {
    takes,
    allocated,
    shortfall: round3(Math.max(0, wanted - allocated)),
    spansLots: takes.length > 1,
  };
}

/**
 * How much of a line may still be given, and under which fill.
 * The backend works this out too; this only reads what it already returned,
 * because refills make the arithmetic subtle and two implementations would drift.
 */
export function lineAllowance(item, asRefill = false) {
  if (asRefill) {
    // A refill restarts the line, so the whole prescribed quantity is allowed.
    return round3(num(item.prescribed_quantity));
  }
  return round3(num(item.remaining_quantity));
}

/**
 * Why this line cannot be given as entered, or null when it can.
 * Mirrors dispense()'s per-line refusals, in the same order.
 */
export function validateLine(item, entry, warehouseId) {
  if (!entry || !entry.include) return null;

  const quantity = round3(num(entry.quantity));
  const asRefill = Boolean(entry.refill);

  if (!item.can_dispense) {
    return 'Not in the Drug Catalog, so it cannot be dispensed from stock.';
  }
  if (quantity <= 0) {
    return 'Enter how much you are giving.';
  }

  if (asRefill) {
    if (!item.is_complete) return 'Finish the current fill before starting a refill.';
    if (num(item.refills_remaining) < 1) return 'No refills are left on this medicine.';
    if (!item.can_refill) return 'This refill cannot be given now (the refill period may have ended).';
  } else {
    if (item.is_complete) {
      return num(item.refills_remaining) > 0
        ? 'This fill has been given in full. Give it as a refill instead.'
        : 'This medicine has already been given in full.';
    }
    if (!item.can_give_now) return 'This medicine cannot be given now (the prescription may have expired).';
  }

  const allowed = lineAllowance(item, asRefill);
  if (quantity > allowed + EPSILON) {
    const unit = item.drug_unit_name || 'units';
    return `Only ${allowed} ${unit} ${asRefill ? 'can be given per refill.' : 'left to give in this fill.'}`;
  }

  const plan = fefoPlan(item, warehouseId, quantity, entry.lot_id || null);
  if (plan.shortfall > EPSILON) {
    const unit = item.drug_unit_name || 'units';
    if (entry.lot_id) {
      return `That lot only has ${plan.allocated} ${unit}. Pick another lot, or let the system choose.`;
    }
    return `Only ${plan.allocated} ${unit} usable at this location.`;
  }

  return null;
}

/**
 * Check the whole draft.
 *
 * @returns {{ok: boolean, errors: Object, lineErrors: Object, included: Array,
 *            needsCheck: boolean, spansLots: boolean, estimatedNet: number}}
 */
export function validateDraft({ detail, warehouseId, entries, discount }) {
  const items = Array.isArray(detail?.prescription?.items) ? detail.prescription.items : [];
  const errors = {};
  const lineErrors = {};

  if (detail?.blocked_reason) errors.prescription = detail.blocked_reason;
  if (!warehouseId) errors.warehouse_id = 'Choose the storage location you are dispensing from.';

  const included = items.filter((i) => entries?.[i.id]?.include && round3(num(entries[i.id].quantity)) > 0);
  if (!included.length) errors.items = 'Enter a quantity for at least one medicine.';

  if (warehouseId) {
    included.forEach((item) => {
      const problem = validateLine(item, entries[item.id], warehouseId);
      if (problem) lineErrors[item.id] = problem;
    });
  }

  // Senior / PWD discounts need the ID number recorded (RA 9994 / RA 10754).
  if (discount?.type === 'senior' || discount?.type === 'pwd') {
    if (!String(discount.id_no || '').trim()) errors.discount_id_no = 'Enter the ID number for this discount.';
  }
  if (discount?.type === 'other') {
    const rate = num(discount.rate);
    if (rate <= 0 || rate > 100) errors.discount_rate = 'Enter a discount between 0 and 100 percent.';
    if (!String(discount.reason || '').trim()) errors.discount_reason = 'Enter why the discount is given.';
  }

  const needsCheck = included.some((i) => i.is_high_alert);
  const spansLots = included.some(
    (i) => fefoPlan(i, warehouseId, entries[i.id].quantity, entries[i.id].lot_id || null).spansLots
  );

  const gross = round3(
    included.reduce((sum, i) => sum + num(entries[i.id].quantity) * num(i.unit_price), 0)
  );
  const rate = discount?.type ? num(discount.rate) : 0;
  const estimatedNet = Math.round((gross - (gross * rate) / 100) * 100) / 100;

  return {
    ok: Object.keys(errors).length === 0 && Object.keys(lineErrors).length === 0,
    errors,
    lineErrors,
    included,
    needsCheck,
    spansLots,
    estimatedGross: gross,
    estimatedNet,
  };
}

/**
 * The POST /dispensing body.
 *
 * `lot_id` is left out when the pharmacist let the system choose, because
 * sending one would stop the server splitting across lots. Only lines that are
 * included with a real quantity are sent.
 */
export function buildDispenseBody({ detail, warehouseId, entries, notes, discount }) {
  const items = Array.isArray(detail?.prescription?.items) ? detail.prescription.items : [];

  const body = {
    prescription_id: num(detail?.prescription?.id),
    warehouse_id: num(warehouseId),
    items: items
      .filter((i) => entries?.[i.id]?.include && round3(num(entries[i.id].quantity)) > 0)
      .map((i) => {
        const entry = entries[i.id];
        const line = {
          prescription_item_id: num(i.id),
          quantity: round3(num(entry.quantity)),
        };
        if (entry.lot_id) line.lot_id = num(entry.lot_id);
        if (entry.refill) line.refill = true;
        return line;
      }),
  };

  if (notes && String(notes).trim()) body.notes = String(notes).trim().slice(0, 500);

  if (discount?.type) {
    body.discount_type = discount.type;
    if (discount.type === 'senior' || discount.type === 'pwd') body.discount_id_no = String(discount.id_no || '').trim();
    if (discount.type === 'other') {
      body.discount_rate = num(discount.rate);
      body.discount_reason = String(discount.reason || '').trim();
    }
  }

  return body;
}

/**
 * Starting entries for a prescription at a location: every line that can be
 * given now, pre-filled with everything still owed, lots left to the server.
 *
 * Pre-filling is deliberate -- the common case at a counter is "give all of
 * it", and making the pharmacist type a number they did not choose invites
 * typos. A line that cannot be given now starts excluded.
 */
export function initialEntries(items, warehouseId) {
  const entries = {};

  (Array.isArray(items) ? items : []).forEach((item) => {
    const canGive = item.can_dispense && item.can_give_now;
    const canRefill = item.can_dispense && item.can_refill && !item.can_give_now;
    const owed = lineAllowance(item, canRefill);
    const have = warehouseId ? stockAtWarehouse(item, warehouseId) : 0;
    const quantity = round3(Math.min(owed, have));

    entries[item.id] = {
      include: Boolean((canGive || canRefill) && quantity > 0),
      quantity: quantity > 0 ? String(quantity) : '',
      lot_id: null,
      refill: Boolean(canRefill),
    };
  });

  return entries;
}

/** Map the server's `items.<lineId>` error keys back onto the lines. */
export function mapServerErrors(serverErrors) {
  const lineErrors = {};
  const formErrors = {};

  Object.entries(serverErrors || {}).forEach(([key, message]) => {
    const match = /^items\.(\d+)$/.exec(key);
    if (match) lineErrors[Number(match[1])] = message;
    else formErrors[key] = message;
  });

  return { lineErrors, formErrors };
}
