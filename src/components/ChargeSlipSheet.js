import React from 'react';
import { View, Text, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import Badge from './Badge';
import { PrimaryButton, Notice } from './Form';
import { slipTotals, formatMoney } from '../api/payment';
import { useChargeSlip } from '../query/dispensingQueries';
import { THEME } from '../constants/theme';

/**
 * The charge slip, shown on screen for the patient to read.
 *
 * On screen, not printed: printing to a thermal printer is deliberately out of
 * scope (see the README), and the desktop HMS can print the same slip from the
 * same endpoint. What matters here is that the patient can see what they are
 * being charged for and what the discount came to, before they pay.
 *
 * Totals come from the server's own figures rather than being re-added from the
 * lines: each charge line is rounded and then the dispensing total is rounded,
 * so re-adding here could disagree by a centavo on a discounted slip -- and a
 * receipt that does not add up is worse than no receipt.
 */
export default function ChargeSlipSheet({ visible, dispenseId, onClose }) {
  const { data: slip, isLoading, isError, error } = useChargeSlip(visible ? dispenseId : null);
  const totals = slipTotals(slip);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.page}>
        {isLoading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
          </View>
        ) : isError ? (
          <View style={styles.centre}>
            <Notice tone="error" title="Could not load the slip" message={error?.message} />
            <PrimaryButton title="Close" onPress={onClose} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.slipWrap}>
              <View style={styles.slip}>
                <Text style={styles.facility}>{slip?.facility || 'Pharmacy'}</Text>
                <Text style={styles.slipTitle}>Charge slip</Text>
                <Text style={styles.number}>{slip?.dispense_number}</Text>

                {totals.voided ? (
                  <View style={styles.voidedStamp}>
                    <Badge token={THEME.flag.blocked} text="UNDONE" />
                    <Text style={styles.voidedText}>
                      This dispensing was undone. Its charges have been cancelled.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.meta}>
                  <Meta label="Patient" value={`${slip?.patient_name || ''} ${slip?.patient_no ? `(${slip.patient_no})` : ''}`} />
                  <Meta label="Prescription" value={slip?.rx_number} />
                  <Meta label="Prescriber" value={slip?.prescriber_name} />
                  <Meta label="Dispensed" value={slip?.dispensed_date} />
                  <Meta label="From" value={slip?.warehouse_name} />
                </View>

                <View style={styles.divider} />

                {(slip?.charges || []).map((c, i) => (
                  <View key={i} style={styles.lineRow}>
                    <View style={styles.lineMain}>
                      <Text style={styles.lineDescription}>{c.description}</Text>
                      <Text style={styles.lineSub}>
                        {c.quantity} &#215; {formatMoney(c.unit_price)}
                        {c.discount_amount > 0 ? `   less ${formatMoney(c.discount_amount)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.lineAmount}>{formatMoney(c.net_amount)}</Text>
                  </View>
                ))}

                <View style={styles.divider} />

                <Total label="Subtotal" value={formatMoney(totals.gross)} />
                {totals.discount > 0 ? (
                  <>
                    <Total
                      label={slip?.discount_label || 'Discount'}
                      value={`−${formatMoney(totals.discount)}`}
                      muted
                    />
                    {slip?.discount_id_no ? (
                      <Text style={styles.discountId}>ID {slip.discount_id_no}</Text>
                    ) : null}
                    {slip?.discount_reason ? (
                      <Text style={styles.discountId}>{slip.discount_reason}</Text>
                    ) : null}
                  </>
                ) : null}
                <Total label="Total" value={formatMoney(totals.net)} strong />

                {(slip?.payments || []).length ? (
                  <>
                    <View style={styles.divider} />
                    {slip.payments.map((p, i) => (
                      <Total key={i} label={`Paid ${p.date} (${p.method})`} value={formatMoney(p.amount)} muted />
                    ))}
                    {totals.refundDue > 0 ? (
                      <>
                        <Total label="Refund due" value={formatMoney(totals.refundDue)} strong />
                        <Text style={styles.refundNote}>
                          This dispensing was undone after it was paid for. The patient is owed
                          {' '}{formatMoney(totals.refundDue)} back &#8212; refund it through billing.
                        </Text>
                      </>
                    ) : (
                      <Total
                        label={totals.settled ? 'Settled' : 'Still owed'}
                        value={formatMoney(totals.owed)}
                        strong
                      />
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.unpaid}>
                      {totals.voided ? 'No payment was taken.' : `Unpaid — ${formatMoney(totals.balance)} due.`}
                    </Text>
                  </>
                )}

                {slip?.check_status === 'awaiting' ? (
                  <View style={styles.holdNote}>
                    <Text style={styles.holdText}>
                      Not yet handed over: a high-alert medicine on this dispensing is still waiting for
                      its second check.
                    </Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <PrimaryButton title="Close" onPress={onClose} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Meta({ label, value }) {
  if (!value || !String(value).trim()) return null;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{String(value).trim()}</Text>
    </View>
  );
}

function Total({ label, value, strong, muted }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong && styles.totalStrong, muted && styles.totalMuted]}>{label}</Text>
      <Text style={[styles.totalValue, strong && styles.totalStrong, muted && styles.totalMuted]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.colors.pageBg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },
  slipWrap: { padding: THEME.spacing.xl, alignItems: 'center' },
  slip: {
    width: '100%',
    maxWidth: 560,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },

  facility: { ...THEME.type.bodyStrong, color: THEME.colors.textTitle, textAlign: 'center' },
  slipTitle: { ...THEME.type.small, color: THEME.colors.textLabel, textAlign: 'center' },
  number: { ...THEME.type.monoLarge, color: THEME.colors.textTitle, textAlign: 'center', marginTop: THEME.spacing.sm },

  voidedStamp: {
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.rowAlt,
  },
  voidedText: { ...THEME.type.small, color: THEME.colors.textLabel, textAlign: 'center', marginTop: THEME.spacing.xs },

  meta: { marginTop: THEME.spacing.lg },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metaLabel: { ...THEME.type.small, color: THEME.colors.textLabel },
  metaValue: { ...THEME.type.small, color: THEME.colors.textValue, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  divider: { height: 1, backgroundColor: THEME.colors.borderSubtle, marginVertical: THEME.spacing.lg },

  lineRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: THEME.spacing.sm },
  lineMain: { flex: 1, paddingRight: THEME.spacing.md },
  lineDescription: { ...THEME.type.body, color: THEME.colors.textValue },
  lineSub: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  lineAmount: { ...THEME.type.mono, color: THEME.colors.textValue },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.xs },
  totalLabel: { ...THEME.type.body, color: THEME.colors.textValue },
  totalValue: { ...THEME.type.mono, color: THEME.colors.textValue },
  totalStrong: { ...THEME.type.monoLarge, color: THEME.colors.textTitle, fontWeight: '700' },
  totalMuted: { color: THEME.colors.textLabel },
  discountId: { ...THEME.type.small, color: THEME.colors.textLabel, textAlign: 'right' },

  unpaid: { ...THEME.type.bodyStrong, color: THEME.colors.warning, textAlign: 'center' },
  refundNote: {
    ...THEME.type.small,
    color: THEME.colors.warning,
    fontWeight: '600',
    marginTop: THEME.spacing.sm,
    lineHeight: 18,
  },

  holdNote: {
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.safety.highAlert.bg,
    borderWidth: 1,
    borderColor: THEME.safety.highAlert.border,
  },
  holdText: { ...THEME.type.small, color: THEME.safety.highAlert.fg, fontWeight: '600', lineHeight: 20 },

  footer: {
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
});
