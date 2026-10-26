/**
 * Taking payment for a dispensing.
 *
 * Pure, no imports, so the rules can be tested directly. They mirror
 * DispensingService::recordPayment(), including the two refusals that are easy
 * to miss and annoying to hit at a counter:
 *
 *   * A dispensing whose high-alert second check is still outstanding cannot
 *     be paid for. Payment comes after the check and the handover, not before.
 *   * A voided dispensing cannot be paid for at all.
 *
 * Partial payment is allowed: anything up to what is still owed. The server
 * returns the remaining balance, so "paid in full" is its verdict, not ours.
 */

export const PAYABLE = {
  OK: 'ok',
  AWAITING_CHECK: 'awaiting_check',
  VOIDED: 'voided',
  SETTLED: 'settled',
  NOTHING_DUE: 'nothing_due',
};

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Format for display. The backend's messages use the peso sign too. */
export function formatMoney(amount) {
  return `₱${money(amount).toFixed(2)}`;
}

/** What is still owed on a dispensing, never below zero. */
export function balanceOf(entry) {
  if (!entry) return 0;
  if (entry.status !== 'completed') return 0;
  const net = money(entry.net_amount);
  const paid = money(entry.paid_amount);
  return money(Math.max(0, net - paid));
}

/**
 * May payment be taken, and if not, why?
 *
 * @returns {{state: string, payable: boolean, balance: number, reason: ?string}}
 */
export function payability(entry) {
  if (!entry) {
    return { state: PAYABLE.NOTHING_DUE, payable: false, balance: 0, reason: 'No dispensing selected.' };
  }

  if (entry.status !== 'completed') {
    return {
      state: PAYABLE.VOIDED,
      payable: false,
      balance: 0,
      reason: 'This dispensing was undone, so there is nothing to pay.',
    };
  }

  if (entry.check_status === 'awaiting') {
    return {
      state: PAYABLE.AWAITING_CHECK,
      payable: false,
      balance: balanceOf(entry),
      reason:
        'It contains a high-alert medicine that has not had its second check. Take payment once it is checked and handed over.',
    };
  }

  const balance = balanceOf(entry);
  if (balance <= 0) {
    return { state: PAYABLE.SETTLED, payable: false, balance: 0, reason: 'Paid in full.' };
  }

  return { state: PAYABLE.OK, payable: true, balance, reason: null };
}

/**
 * Check a payment before sending it.
 *
 * @param {{amount: string|number, method: string, reference?: string}} input
 * @param {Object} entry        the dispensing being paid for
 * @param {string[]} methods    PAYMENT_METHODS from /dispensing/options
 */
export function validatePayment(input, entry, methods = []) {
  const errors = {};
  const state = payability(entry);

  if (!state.payable) {
    return { ok: false, errors: { form: state.reason }, amount: 0 };
  }

  const amount = money(input?.amount);
  if (!(amount > 0)) {
    errors.amount = 'Enter the amount paid.';
  } else if (amount > state.balance + 0.004) {
    // The backend's own tolerance, so the two cannot disagree on the last centavo.
    errors.amount = `At most ${formatMoney(state.balance)}.`;
  }

  // The method must be one of the server's exact strings; a near-match is refused.
  if (!input?.method) {
    errors.method = 'Choose how it was paid.';
  } else if (methods.length && !methods.includes(input.method)) {
    errors.method = 'Choose how it was paid.';
  }

  return { ok: Object.keys(errors).length === 0, errors, amount };
}

/** The POST /dispensing/payment body. */
export function buildPaymentBody(input, entry) {
  const body = {
    amount: money(input?.amount),
    method: input?.method,
  };
  const reference = String(input?.reference || '').trim();
  if (reference) body.reference = reference.slice(0, 100);
  return body;
}

/**
 * Totals for the charge slip.
 *
 * Derived from the slip payload rather than recomputed from the lines: the
 * server rounds each charge line and then the dispensing total, and re-adding
 * the lines here could disagree by a centavo on a discounted slip.
 */
export function slipTotals(slip) {
  if (!slip) {
    return { gross: 0, discount: 0, net: 0, paid: 0, balance: 0, owed: 0, refundDue: 0, settled: false, voided: false };
  }

  const voided = slip.status !== 'completed';
  const net = money(slip.net_amount);
  const paid = money(slip.paid_amount);

  // The server returns a NEGATIVE balance when more has been paid than is
  // charged -- which is exactly what a voided dispensing that was already paid
  // for looks like: the charges are cancelled but the money was taken, so the
  // patient is owed it back. Clamping that to zero and calling it "settled"
  // would quietly hide a refund, so the two directions are kept apart.
  const balance = money(slip.balance);

  return {
    gross: money(slip.gross_amount),
    discount: money(slip.discount_amount),
    net,
    paid,
    balance,
    owed: money(Math.max(0, balance)),
    refundDue: money(Math.max(0, -balance)),
    settled: !voided && balance <= 0,
    voided,
  };
}
