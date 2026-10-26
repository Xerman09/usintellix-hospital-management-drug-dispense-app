/**
 * Pharmacy dashboard and reports: the bits worth getting right.
 *
 * Pure, no imports, so they can be tested directly.
 *
 * Most of a report screen is just rendering rows the server already shaped.
 * What is NOT just rendering, and lives here:
 *
 *   * date ranges, so "last 7 days" means the same thing on every report
 *   * the dangerous-drugs reconciliation verdict, which is the one number on
 *     these screens that can indicate a legal problem rather than a typo
 *   * the expiry buckets, which are named by the server's own thresholds
 *     rather than hard-coded to 30 and 90 days
 */

const iso = (d) => d.toISOString().slice(0, 10);

/** Day offsets, so "today" is the device's today and ranges are inclusive. */
export function rangeFor(preset, today = new Date()) {
  const end = iso(today);
  const back = (days) => {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - days);
    return iso(d);
  };

  switch (preset) {
    case 'today':
      return { date_from: end, date_to: end };
    case 'week':
      return { date_from: back(6), date_to: end };
    case 'month':
      return { date_from: back(29), date_to: end };
    case 'quarter':
      return { date_from: back(89), date_to: end };
    case 'all':
    default:
      // Omitted entirely rather than sent empty: the server treats absent as
      // "no limit", and an empty string is not the same thing.
      return {};
  }
}

export const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'quarter', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
];

export function rangeLabel(preset) {
  return DATE_PRESETS.find((p) => p.key === preset)?.label || 'All time';
}

/**
 * Does a controlled drug's book balance match what is on the shelf?
 *
 * The register's whole purpose: opening + in - out should equal what is
 * physically there. A mismatch on a dangerous drug is a controlled-substance
 * discrepancy, not a rounding nuisance, so it is reported with the signed
 * difference and never softened.
 *
 * @returns {{reconciled: boolean, difference: number, direction: ?string, text: string}}
 */
export function reconciliation(section) {
  if (!section) return { reconciled: true, difference: 0, direction: null, text: '' };

  const closing = Number(section.closing_balance) || 0;
  const onHand = Number(section.on_hand) || 0;
  const difference = Math.round((onHand - closing) * 1000) / 1000;

  // Trust the server's own verdict where it gives one; it is the authority on
  // how the balance was computed.
  const reconciled = section.reconciled !== undefined ? Boolean(section.reconciled) : difference === 0;

  if (reconciled && difference === 0) {
    return { reconciled: true, difference: 0, direction: null, text: 'Balances.' };
  }

  const direction = difference > 0 ? 'surplus' : 'shortfall';
  const unit = section.unit_name ? ` ${section.unit_name}` : '';

  return {
    reconciled,
    difference,
    direction,
    text:
      difference === 0
        ? 'The register does not balance.'
        : `${Math.abs(difference)}${unit} ${direction}: the register says ${closing}, the shelf has ${onHand}.`,
  };
}

/** Sections that do not balance, worst first. These are what a pharmacist opens the report for. */
export function unreconciledSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((s) => ({ section: s, verdict: reconciliation(s) }))
    .filter((x) => !x.verdict.reconciled || x.verdict.difference !== 0)
    .sort((a, b) => Math.abs(b.verdict.difference) - Math.abs(a.verdict.difference));
}

/**
 * The expiry buckets, named from the server's own thresholds so the wording
 * cannot drift from the numbers the dashboard actually used.
 */
export function expiryBuckets(expiry, thresholds) {
  const soon = Number(thresholds?.expiry_soon_days ?? 30);
  const watch = Number(thresholds?.expiry_watch_days ?? 90);
  const b = expiry?.buckets || {};

  return [
    { key: 'expired', label: 'Expired', hint: 'Cannot be dispensed.', severity: 'stop', ...(b.expired || {}) },
    { key: 'soon', label: `Within ${soon} days`, hint: 'Quarantined from dispensing at 60 days.', severity: 'warn', ...(b.soon || {}) },
    { key: 'watch', label: `Within ${watch} days`, hint: 'Worth planning around.', severity: 'info', ...(b.watch || {}) },
  ];
}

/** A one-line note when a list was cut short, or null. */
export function truncationNote(truncated, shown) {
  if (!truncated) return null;
  return `Showing the first ${shown}. Narrow the dates or filters to see the rest.`;
}

/** Fill rate reads as a percentage; the server already rounds it. */
export function fillRate(value) {
  if (value === null || value === undefined || value === '') return null;
  return `${Number(value)}%`;
}

/** Peso amounts on the reports, matching the charge slip's formatting. */
export function formatValue(amount) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** How long a prescription has been waiting, in words. */
export function waitingLabel(days) {
  const n = Number(days) || 0;
  if (n <= 0) return 'today';
  if (n === 1) return '1 day';
  if (n < 30) return `${n} days`;
  const months = Math.floor(n / 30);
  return months === 1 ? 'over a month' : `over ${months} months`;
}
