/**
 * What a scan means, and whether it stops the pharmacist.
 *
 * Pure, no imports, so the rules can be tested directly. This is the payoff of
 * the whole scanning phase: a scan that merely *reports* a mismatch is useless,
 * because the person scanning is busy and will carry on. Each verdict therefore
 * carries a severity, and STOP is a refusal the screen must enforce.
 *
 *   OK    what was scanned is what was expected
 *   WARN  not wrong, but worth reading before continuing
 *   STOP  do not proceed: wrong patient, wrong medicine, unusable lot
 */

export const SEVERITY = { OK: 'ok', WARN: 'warn', STOP: 'stop' };

const verdict = (severity, title, message, extra = {}) => ({
  severity,
  ok: severity === SEVERITY.OK,
  blocking: severity === SEVERITY.STOP,
  title,
  message,
  ...extra,
});

/** A failed request is never a pass. A scanner that cannot reach the server stops. */
function transportVerdict(result) {
  if (!result) {
    return verdict(SEVERITY.STOP, 'Scan failed', 'No answer from the hospital server. Try again.');
  }
  if (result.ok === false) {
    return verdict(SEVERITY.STOP, 'Scan failed', result.message || 'The code could not be checked.');
  }
  return null;
}

/**
 * Scanning a prescription slip to open it.
 *
 * A cancelled or already-closed prescription is still opened -- the pharmacist
 * asked for it and needs to see why it cannot be filled -- but it is flagged.
 */
export function verdictForRx(result) {
  const transport = transportVerdict(result);
  if (transport) return transport;

  const data = result.data || {};
  if (!data.found) {
    return verdict(SEVERITY.STOP, 'No such prescription', data.message || 'Nothing matches that code.');
  }

  const rx = data.prescription || {};

  if (rx.status === 'cancelled') {
    return verdict(SEVERITY.WARN, 'Cancelled prescription', `${rx.rx_number} was cancelled and cannot be dispensed.`, {
      prescriptionId: rx.id,
      prescription: rx,
    });
  }

  if (rx.dispense_status === 'closed') {
    return verdict(SEVERITY.WARN, 'Closed prescription', `${rx.rx_number} was closed by the pharmacy.`, {
      prescriptionId: rx.id,
      prescription: rx,
    });
  }

  return verdict(SEVERITY.OK, rx.rx_number, data.message || '', {
    prescriptionId: rx.id,
    prescription: rx,
  });
}

/**
 * Scanning a wristband at handover.
 *
 * The wrong patient is the single worst outcome at a dispensing counter, so a
 * mismatch is always STOP, and a code that resolves to nobody is STOP too --
 * an unreadable wristband is not confirmation.
 */
export function verdictForPatient(result, expectedName = null) {
  const transport = transportVerdict(result);
  if (transport) return transport;

  const data = result.data || {};

  if (!data.found) {
    return verdict(SEVERITY.STOP, 'Not a known patient', data.message || 'Nothing matches that wristband.');
  }

  const patient = data.patient || {};

  if (data.matches_expected === false) {
    return verdict(
      SEVERITY.STOP,
      'Wrong patient',
      `${patient.name} (${patient.patient_no}) is not the patient on this prescription` +
        (expectedName ? `, which is for ${expectedName}.` : '.'),
      { patient }
    );
  }

  // No expectation was sent, so this identifies a patient but confirms nothing.
  if (data.matches_expected === null || data.matches_expected === undefined) {
    return verdict(SEVERITY.WARN, patient.name || 'Patient found', data.message || '', { patient });
  }

  return verdict(SEVERITY.OK, 'Patient confirmed', `${patient.name} (${patient.patient_no}).`, { patient });
}

/**
 * Scanning the pack before it is handed over -- the lot check.
 *
 * `expectedLotId` is the lot the pharmacist pinned, when they pinned one. If
 * they left the allocation to the server there is no single expected lot, so
 * the check is only that the right MEDICINE is in hand and that the scanned lot
 * is usable.
 */
export function verdictForLot(result, { expectedLotId = null, expectedDrugName = null } = {}) {
  const transport = transportVerdict(result);
  if (transport) return transport;

  const data = result.data || {};

  if (!data.found) {
    return verdict(SEVERITY.STOP, 'Unknown code', data.message || 'Nothing matches that barcode.');
  }

  if (data.matches_expected === false) {
    const scanned = data.drugs?.[0]?.name || 'Another medicine';
    return verdict(
      SEVERITY.STOP,
      'Wrong medicine',
      `${scanned} is not the medicine on this line` + (expectedDrugName ? `, which is ${expectedDrugName}.` : '.'),
      { drugs: data.drugs }
    );
  }

  const lots = Array.isArray(data.lots) ? data.lots : [];
  const usable = lots.filter((l) => l.is_dispensable);

  if (lots.length && !usable.length) {
    return verdict(SEVERITY.STOP, 'This stock cannot be used', lots[0].blocked_reason || 'No usable lot.', { lots });
  }

  if (!lots.length) {
    return verdict(SEVERITY.STOP, 'No stock here', data.message || 'No lots of this medicine at this location.', {
      lots,
    });
  }

  // The pack in hand is a different lot from the one that was pinned.
  if (expectedLotId) {
    const match = usable.find((l) => Number(l.id) === Number(expectedLotId));
    if (!match) {
      const scanned = usable[0];
      return verdict(
        SEVERITY.STOP,
        'Different lot',
        `You selected a different lot. The pack scanned is ${scanned.lot_number}` +
          (scanned.expires_date ? `, expiring ${scanned.expires_date}.` : '.') +
          ' Use this lot instead, or fetch the one you selected.',
        { lots, scannedLot: scanned }
      );
    }
    return verdict(SEVERITY.OK, 'Lot confirmed', `${match.lot_number} matches the lot you selected.`, {
      lots,
      scannedLot: match,
    });
  }

  const first = usable[0];
  return verdict(
    SEVERITY.OK,
    'Medicine confirmed',
    `${data.drugs?.[0]?.name || 'Medicine'} — lot ${first.lot_number}` +
      (first.expires_date ? `, expiring ${first.expires_date}` : '') +
      ', usable.',
    { lots, scannedLot: first }
  );
}

/** Should the screen refuse to continue on this verdict? */
export function isBlocking(v) {
  return Boolean(v && v.severity === SEVERITY.STOP);
}
