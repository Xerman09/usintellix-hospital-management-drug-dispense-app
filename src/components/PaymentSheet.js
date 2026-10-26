import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, StyleSheet } from 'react-native';
import NumPad from './NumPad';
import { Field, PrimaryButton, SecondaryButton, Notice } from './Form';
import { payability, validatePayment, buildPaymentBody, formatMoney, PAYABLE } from '../api/payment';
import { useRecordPayment, useDispensingOptions } from '../query/dispensingQueries';
import { THEME } from '../constants/theme';

/**
 * Taking payment for a dispensing.
 *
 * Payment comes last, and the sheet enforces the order rather than explaining
 * it: a dispensing still waiting for its high-alert second check cannot be paid
 * for, because it has not been handed over yet. The sheet says so and offers no
 * way to send it.
 *
 * Partial payment is allowed -- anything up to what is still owed -- and the
 * remaining balance comes back from the server, so "paid in full" is its
 * verdict and not an arithmetic guess made here.
 */
export default function PaymentSheet({ visible, entry, patientName, onClose, onPaid }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState('');
  const [result, setResult] = useState(null);

  const { data: options } = useDispensingOptions();
  const pay = useRecordPayment();

  const methods = options?.payment_methods || [];
  const state = payability(entry);

  useEffect(() => {
    if (!visible) return;
    // Pre-filled with the whole balance: paying it off in one go is the normal
    // case, and making the pharmacist type a figure they did not choose invites
    // a typo on a money field.
    setAmount(state.payable && state.balance > 0 ? String(state.balance) : '');
    setMethod(null);
    setReference('');
    setResult(null);
    pay.reset();
  }, [visible, entry?.id]);

  const check = validatePayment({ amount, method, reference }, entry, methods);

  const submit = async () => {
    if (!check.ok) return;
    try {
      const data = await pay.mutateAsync({
        dispenseId: entry.id,
        body: buildPaymentBody({ amount, method, reference }, entry),
        prescriptionId: entry.prescription_id,
      });
      setResult(data);
      onPaid?.(data);
    } catch (e) {
      // The sheet shows the server's refusal and stays open.
    }
  };

  const paidInFull = result && Number(result.balance) <= 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Payment</Text>
            <Text style={styles.headerMeta}>
              {entry?.dispense_number}
              {patientName ? `  ·  ${patientName}` : ''}
            </Text>
          </View>
          <SecondaryButton title="Close" onPress={onClose} disabled={pay.isPending} />
        </View>

        {result ? (
          <View style={styles.doneWrap}>
            <Text style={styles.doneAmount}>{formatMoney(amount)}</Text>
            <Text style={[styles.doneTitle, !paidInFull && styles.doneTitlePartial]}>
              {paidInFull ? 'Paid in full' : `${formatMoney(result.balance)} still owed`}
            </Text>
            <Text style={styles.doneMeta}>{method}</Text>
            <PrimaryButton title="Done" onPress={onClose} />
          </View>
        ) : !state.payable ? (
          <View style={styles.doneWrap}>
            <Notice
              tone={state.state === PAYABLE.SETTLED ? 'success' : 'info'}
              title={state.state === PAYABLE.AWAITING_CHECK ? 'Not yet' : 'Nothing to pay'}
              message={state.reason}
            />
            <PrimaryButton title="Close" onPress={onClose} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.pad}>
              <View style={styles.summary}>
                <Row label="Charged" value={formatMoney(entry?.net_amount)} />
                {Number(entry?.discount_amount) > 0 ? (
                  <Row
                    label={entry?.discount_label || 'Discount'}
                    value={`−${formatMoney(entry.discount_amount)}`}
                    muted
                  />
                ) : null}
                {Number(entry?.paid_amount) > 0 ? (
                  <Row label="Already paid" value={formatMoney(entry.paid_amount)} muted />
                ) : null}
                <Row label="Still owed" value={formatMoney(state.balance)} strong />
              </View>

              <Text style={styles.sectionLabel}>HOW IT WAS PAID</Text>
              <View style={styles.methods}>
                {methods.map((m) => {
                  const on = method === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMethod(m)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [styles.method, on && styles.methodOn, pressed && styles.methodPressed]}
                    >
                      <Text style={[styles.methodText, on && styles.methodTextOn]}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {check.errors.method ? <Text style={styles.error}>{check.errors.method}</Text> : null}

              {method && method !== 'Cash' ? (
                <Field
                  label="Reference (optional)"
                  value={reference}
                  onChangeText={setReference}
                  hint="Transaction or cheque number, if there is one."
                  autoCapitalize="characters"
                />
              ) : null}

              {pay.isError ? (
                <Notice tone="error" title="Nothing was recorded" message={pay.error?.message} />
              ) : null}
            </ScrollView>

            <View style={styles.entryPane}>
              <NumPad
                value={amount}
                onChange={setAmount}
                max={state.balance}
                decimals={2}
                label="Amount paid"
              />
              {check.errors.amount ? <Text style={styles.error}>{check.errors.amount}</Text> : null}

              <View style={styles.submit}>
                <PrimaryButton
                  title={pay.isPending ? 'Recording…' : `Record ${formatMoney(amount)}`}
                  onPress={submit}
                  busy={pay.isPending}
                  disabled={!check.ok}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, value, strong, muted }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowMuted]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong, muted && styles.rowMuted]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  pad: { padding: THEME.spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  headerTitle: { ...THEME.type.title, color: THEME.colors.textTitle },
  headerMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },

  summary: {
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginBottom: THEME.spacing.xl,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.xs },
  rowLabel: { ...THEME.type.body, color: THEME.colors.textValue },
  rowValue: { ...THEME.type.mono, color: THEME.colors.textValue },
  rowStrong: { ...THEME.type.monoLarge, color: THEME.colors.textTitle },
  rowMuted: { color: THEME.colors.textLabel },

  sectionLabel: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: THEME.spacing.sm },
  method: {
    minHeight: THEME.touch.comfortable,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.cardBg,
  },
  methodOn: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  methodPressed: { backgroundColor: THEME.colors.rowAlt },
  methodText: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
  methodTextOn: { color: THEME.colors.textOnDark },

  entryPane: {
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
    padding: THEME.spacing.md,
  },
  submit: { marginTop: THEME.spacing.md },
  error: { ...THEME.type.small, color: THEME.colors.error, fontWeight: '600', marginTop: THEME.spacing.sm },

  doneWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: THEME.spacing.xxl,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  doneAmount: { ...THEME.type.display, color: THEME.colors.textTitle, textAlign: 'center' },
  doneTitle: {
    ...THEME.type.heading,
    color: THEME.colors.success,
    textAlign: 'center',
    marginTop: THEME.spacing.sm,
  },
  doneTitlePartial: { color: THEME.colors.warning },
  doneMeta: {
    ...THEME.type.body,
    color: THEME.colors.textLabel,
    textAlign: 'center',
    marginBottom: THEME.spacing.xl,
  },
});
