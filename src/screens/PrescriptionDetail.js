import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Badge from '../components/Badge';
import SafetyHeader from '../components/SafetyHeader';
import DispenseSheet from '../components/DispenseSheet';
import CheckSheet from '../components/CheckSheet';
import ReasonPrompt from '../components/ReasonPrompt';
import { PrimaryButton, SecondaryButton } from '../components/Form';
import { useDispensingDetail, useVoidDispense, useClosePrescription } from '../query/dispensingQueries';
import { useSession } from '../store/session';
import { THEME, statusStyle } from '../constants/theme';

/**
 * One prescription, read-only (Phase 3).
 *
 * Shows everything needed to DECIDE: the safety header, each medicine line
 * with what was prescribed, given and still owed, and how much usable stock
 * exists. Choosing lots and giving the medicine is Phase 4.
 *
 * Quantities come from the backend already worked out per line
 * (prescribed_quantity / dispensed_quantity / remaining_quantity, and
 * fill_label for which fill is under way). None of that arithmetic is redone
 * here -- refills make it subtle, and two implementations would drift.
 */
export default function PrescriptionDetail({ prescriptionId }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useDispensingDetail(prescriptionId);

  const [dispensing, setDispensing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [checking, setChecking] = useState(null);

  const { user } = useSession();
  const voidDispense = useVoidDispense();
  const closePrescription = useClosePrescription();

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
      </View>
    );
  }

  if (isError) {
    const notFound = error?.errorKind === 'notfound';
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>
          {notFound ? 'This prescription is no longer there' : 'Could not load the prescription'}
        </Text>
        <Text style={styles.errorText}>{error?.message || 'Unknown error.'}</Text>
        {!notFound ? (
          <Pressable onPress={refetch} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const rx = data?.prescription || {};
  const items = Array.isArray(rx.items) ? rx.items : [];
  const history = Array.isArray(data?.history) ? data.history : [];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.rxNumber}>{rx.rx_number || '—'}</Text>
          <View style={styles.headerBadges}>
            <Badge token={statusStyle(data?.dispense_status)} text={data?.status_label} />
            {isFetching ? <Text style={styles.refreshing}>refreshing</Text> : null}
          </View>
        </View>
        <Text style={styles.headerMeta}>
          {[
            rx.prescriber_name ? `Dr ${rx.prescriber_name}` : null,
            rx.prescribed_date ? `prescribed ${rx.prescribed_date}` : null,
            rx.valid_until ? `fill by ${rx.valid_until}` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
        {rx.diagnosis ? <Text style={styles.diagnosis}>{rx.diagnosis}</Text> : null}
      </View>

      <SafetyHeader
        patient={data?.patient}
        items={items}
        duplicateScreen={data?.duplicate_therapy_screen}
        blockedReason={data?.blocked_reason}
        verificationStatus={data?.clinical_verification?.verification_status || null}
      />

      {data?.can_dispense || data?.can_close ? (
        <View style={styles.actions}>
          {data?.can_dispense ? (
            <View style={styles.actionPrimary}>
              <PrimaryButton title="Dispense" onPress={() => setDispensing(true)} />
            </View>
          ) : null}
          {data?.can_close ? (
            <View style={styles.actionSecondary}>
              <SecondaryButton title="Close prescription" onPress={() => setClosing(true)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {data?.awaiting_check > 0 ? (
        <View style={styles.awaitingBanner}>
          <Badge token={THEME.safety.highAlert} text="AWAITING CHECK" size="sm" />
          <Text style={styles.awaitingText}>
            A dispensing on this prescription is waiting for a second pharmacist to check it before
            handover. That check arrives in Phase 5.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          MEDICINES ({items.length})
        </Text>

        {items.length === 0 ? (
          <Text style={styles.empty}>This prescription has no medicine lines.</Text>
        ) : (
          items.map((item) => <MedicineLine key={item.id} item={item} />)
        )}
      </View>

      {rx.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRESCRIBER NOTES</Text>
          <Text style={styles.notes}>{rx.notes}</Text>
        </View>
      ) : null}

      {data?.close_reason ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLOSED</Text>
          <Text style={styles.notes}>
            {data.close_reason}
            {data.closed_by_name ? ` — ${data.closed_by_name}` : ''}
            {data.closed_at ? ` on ${data.closed_at}` : ''}
          </Text>
        </View>
      ) : null}

      {history.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DISPENSING HISTORY ({history.length})</Text>
          {history.map((h) => (
            <HistoryEntry
              key={h.id}
              entry={h}
              onVoid={() => setVoiding(h)}
              onCheck={() => setChecking(h)}
            />
          ))}
        </View>
      ) : null}

      <DispenseSheet
        visible={dispensing}
        detail={data}
        onClose={() => setDispensing(false)}
      />

      <CheckSheet
        visible={Boolean(checking)}
        entry={checking ? { ...checking, prescription_id: prescriptionId } : null}
        items={items}
        currentUser={user}
        // Only meaningful when the signed-in pharmacist prepared this one;
        // otherwise the server is the only authority on who prepared it.
        preparerUser={checking?.prepared_by_viewer ? user : null}
        onClose={() => setChecking(null)}
        onFail={(entry) => {
          setChecking(null);
          setVoiding(entry);
        }}
      />

      <ReasonPrompt
        visible={Boolean(voiding)}
        title={`Undo ${voiding?.dispense_number || 'this dispensing'}?`}
        description="The stock goes back to the lots it came from and the charges are voided. This is recorded against your name."
        confirmLabel="Undo dispensing"
        busy={voidDispense.isPending}
        error={voidDispense.isError ? voidDispense.error?.message : null}
        onCancel={() => { voidDispense.reset(); setVoiding(null); }}
        onConfirm={async (reason) => {
          try {
            await voidDispense.mutateAsync({ dispenseId: voiding.id, reason, prescriptionId });
            setVoiding(null);
          } catch (e) {
            // The prompt shows the server's refusal and stays open.
          }
        }}
      />

      <ReasonPrompt
        visible={closing}
        title="Close this prescription?"
        description="The pharmacy will not give the rest of it. Anything already given stays as it is."
        confirmLabel="Close prescription"
        busy={closePrescription.isPending}
        error={closePrescription.isError ? closePrescription.error?.message : null}
        onCancel={() => { closePrescription.reset(); setClosing(false); }}
        onConfirm={async (reason) => {
          try {
            await closePrescription.mutateAsync({ prescriptionId, reason });
            setClosing(false);
          } catch (e) {
            // Stays open with the message.
          }
        }}
      />
    </ScrollView>
  );
}

/** One past dispensing, with the option to undo it. */
function HistoryEntry({ entry, onVoid, onCheck }) {
  const voided = entry.status === 'voided';
  const awaiting = entry.check_status === 'awaiting' && !voided;

  return (
    <View style={[styles.history, voided && styles.historyVoided]}>
      <View style={styles.historyTop}>
        <Text style={styles.historyNumber}>{entry.dispense_number}</Text>
        <View style={styles.historyBadges}>
          {voided ? <Badge token={THEME.flag.blocked} text="UNDONE" size="sm" /> : null}
          {awaiting && !voided ? <Badge token={THEME.safety.highAlert} text="AWAITING CHECK" size="sm" /> : null}
          {entry.check_status === 'checked' ? <Badge token={THEME.status.dispensed} text="CHECKED" size="sm" /> : null}
        </View>
      </View>

      <Text style={styles.historyMeta}>
        {[entry.dispensed_date, entry.warehouse_name, entry.dispensed_by_name && `by ${entry.dispensed_by_name}`]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>

      {(entry.items || []).map((i, idx) => (
        <Text key={`${entry.id}-${idx}`} style={styles.historyItem}>
          {i.title} &#8212; {i.quantity} {i.unit_name || ''}
          {i.lot_number ? `  (lot ${i.lot_number})` : ''}
          {i.fill_label ? `  ${i.fill_label}` : ''}
        </Text>
      ))}

      {entry.check_status === 'checked' && entry.checked_by_name ? (
        <Text style={styles.historyChecked}>
          Checked by {entry.checked_by_name}
          {entry.checked_at ? ` on ${entry.checked_at}` : ''}
          {entry.check_notes ? `: ${entry.check_notes}` : ''}
        </Text>
      ) : null}

      {awaiting ? (
        <View style={styles.historyHold}>
          <Text style={styles.historyHoldText}>
            Do not hand this over. It contains a high-alert medicine and needs a second
            pharmacist&#8217;s check
            {entry.prepared_by_viewer ? ' — you prepared it, so it cannot be you.' : '.'}
          </Text>
        </View>
      ) : null}

      {voided ? (
        <Text style={styles.historyVoidReason}>
          Undone{entry.voided_by_name ? ` by ${entry.voided_by_name}` : ''}
          {entry.void_reason ? `: ${entry.void_reason}` : ''}
        </Text>
      ) : (
        <View style={styles.historyActions}>
          {awaiting ? (
            <View style={styles.historyAction}>
              <PrimaryButton title="Check this dispensing" onPress={onCheck} />
            </View>
          ) : null}
          <View style={styles.historyAction}>
            <SecondaryButton title="Undo this dispensing" onPress={onVoid} />
          </View>
        </View>
      )}
    </View>
  );
}

/** One medicine line: what was ordered, what is owed, and what stock exists. */
function MedicineLine({ item }) {
  const lots = Array.isArray(item.lots) ? item.lots : [];
  const recalled = Array.isArray(item.recalled_lots) ? item.recalled_lots : [];
  const stock = lots.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  const locations = new Set(lots.map((l) => l.warehouse_id)).size;
  const remaining = Number(item.remaining_quantity || 0);
  const short = item.can_dispense && remaining > 0 && stock < remaining;
  const unit = item.drug_unit_name ? `${item.drug_unit_name}${stock === 1 ? '' : 's'}` : 'units';

  return (
    <View style={styles.line}>
      <View style={styles.lineHead}>
        <Text style={styles.lineTitle}>{item.title || item.drug_name || 'Unnamed medicine'}</Text>
        <View style={styles.lineBadges}>
          {item.is_high_alert ? <Badge token={THEME.safety.highAlert} size="sm" /> : null}
          {item.is_lasa ? <Badge token={THEME.safety.lasa} size="sm" /> : null}
          {item.controlled_class || item.is_dangerous_drug ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
          {!item.can_dispense ? <Badge token={THEME.flag.blocked} size="sm" text="NOT IN CATALOG" /> : null}
          {item.is_complete ? <Badge token={THEME.status.dispensed} size="sm" text="COMPLETE" /> : null}
        </View>
      </View>

      {item.directions ? <Text style={styles.directions}>{item.directions}</Text> : null}

      <Text style={styles.sig}>
        {[item.dosage, item.route, item.frequency].filter(Boolean).join('  ·  ')}
      </Text>

      <View style={styles.quantities}>
        <Qty label="Prescribed" value={item.prescribed_quantity} unit={item.drug_unit_name} />
        <Qty label="Given" value={item.dispensed_quantity} unit={item.drug_unit_name} />
        <Qty label="Still owed" value={item.remaining_quantity} unit={item.drug_unit_name} strong />
      </View>

      <View style={styles.lineFooter}>
        <Text style={styles.fill}>
          {item.fill_label}
          {item.refills_allowed > 0 ? `  ·  ${item.refills_remaining} refill(s) left` : ''}
        </Text>

        {item.can_dispense ? (
          <Text style={[styles.stock, short && styles.stockShort]}>
            {stock > 0
              ? `${stock} ${unit} on hand${locations > 1 ? ` across ${locations} locations` : ''}`
              : 'No usable stock'}
            {short ? ' — not enough to finish this line' : ''}
          </Text>
        ) : null}
      </View>

      {item.is_lasa ? (
        <Text style={styles.lasaNote}>
          Look-alike / sound-alike &#8212; read the full name and strength aloud at handover.
        </Text>
      ) : null}

      {item.storage_condition ? (
        <Text style={styles.storageNote}>Storage: {item.storage_condition}</Text>
      ) : null}

      {recalled.length ? <WithheldLots lots={recalled} unitName={item.drug_unit_name} /> : null}

      {item.refill_request ? (
        <Text style={styles.refillNote}>A refill has been requested on this medicine.</Text>
      ) : null}
    </View>
  );
}

/**
 * Stock that is on the shelf but must not be given.
 *
 * Shown because the backend now withholds recalled lots from the pickable
 * list: without this the pharmacist would count 450 capsules on the shelf,
 * see 200 in the app, and reasonably assume the app was wrong. It carries no
 * lot id, so there is nothing here that can be selected.
 */
function WithheldLots({ lots, unitName }) {
  const total = lots.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  const unit = unitName ? `${unitName}${total === 1 ? '' : 's'}` : 'units';

  return (
    <View style={styles.withheld}>
      <View style={styles.withheldHead}>
        <Badge token={THEME.safety.recalled} size="sm" />
        <Text style={styles.withheldSummary}>
          {lots.length} lot{lots.length === 1 ? '' : 's'} ({total} {unit}) on the shelf cannot be given
        </Text>
      </View>
      {lots.map((l) => (
        <Text key={l.lot_number} style={styles.withheldLot}>
          <Text style={styles.withheldLotNo}>{l.lot_number}</Text>
          {l.warehouse_name ? ` at ${l.warehouse_name}` : ''}
          {l.recall_number ? ` — recall ${l.recall_number}` : ''}
          {l.recall_class ? ` (${l.recall_class})` : ''}
          {l.reason ? `: ${l.reason}` : ''}
        </Text>
      ))}
      <Text style={styles.withheldNote}>Quarantine these and tell the pharmacy manager.</Text>
    </View>
  );
}

function Qty({ label, value, unit, strong }) {
  return (
    <View style={styles.qty}>
      <Text style={styles.qtyLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.qtyValue, strong && styles.qtyValueStrong]}>
        {value === null || value === undefined ? '—' : value}
        {unit ? <Text style={styles.qtyUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: THEME.colors.pageBg },
  content: { paddingBottom: THEME.spacing.xxxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },

  errorTitle: { ...THEME.type.heading, color: THEME.colors.textTitle, textAlign: 'center' },
  errorText: { ...THEME.type.body, color: THEME.colors.textSubtitle, textAlign: 'center', marginTop: THEME.spacing.sm },
  retry: {
    marginTop: THEME.spacing.lg,
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.xl,
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.btnPrimary,
  },
  retryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },

  header: {
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rxNumber: { ...THEME.type.monoLarge, color: THEME.colors.textTitle },
  headerBadges: { flexDirection: 'row', alignItems: 'center' },
  refreshing: { ...THEME.type.small, color: THEME.colors.textDim, marginLeft: THEME.spacing.sm },
  headerMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: THEME.spacing.xs },
  diagnosis: { ...THEME.type.body, color: THEME.colors.textValue, marginTop: THEME.spacing.sm },

  section: { padding: THEME.spacing.lg },
  sectionTitle: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.md },
  empty: { ...THEME.type.body, color: THEME.colors.textDim },
  notes: { ...THEME.type.body, color: THEME.colors.textValue, lineHeight: 24 },

  line: {
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  lineTitle: { ...THEME.type.subheading, color: THEME.colors.textTitle, flex: 1, paddingRight: THEME.spacing.md },
  lineBadges: { alignItems: 'flex-end', gap: 4 },
  directions: { ...THEME.type.body, color: THEME.colors.textValue, marginTop: THEME.spacing.sm, lineHeight: 24 },
  sig: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: THEME.spacing.xs },

  quantities: {
    flexDirection: 'row',
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  qty: { flex: 1 },
  qtyLabel: { ...THEME.type.label, fontSize: 11, color: THEME.colors.textLabel },
  qtyValue: { ...THEME.type.mono, color: THEME.colors.textValue, marginTop: 2 },
  qtyValueStrong: { ...THEME.type.monoLarge, color: THEME.colors.textTitle },
  qtyUnit: { ...THEME.type.small, color: THEME.colors.textLabel, fontWeight: '400' },

  lineFooter: { marginTop: THEME.spacing.md },
  fill: { ...THEME.type.small, color: THEME.colors.textLabel },
  stock: { ...THEME.type.small, color: THEME.colors.success, fontWeight: '600', marginTop: 2 },
  stockShort: { color: THEME.colors.warning },
  refillNote: { ...THEME.type.small, color: THEME.flag.refill.fg, marginTop: THEME.spacing.sm, fontWeight: '600' },
  lasaNote: { ...THEME.type.small, color: THEME.safety.lasa.fg, marginTop: THEME.spacing.sm, fontWeight: '600' },
  storageNote: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: THEME.spacing.xs },

  withheld: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.safety.recalled.bg,
    borderWidth: 1,
    borderColor: THEME.safety.recalled.border,
  },
  withheldHead: { flexDirection: 'row', alignItems: 'center' },
  withheldSummary: {
    ...THEME.type.small,
    fontWeight: '700',
    color: THEME.safety.recalled.fg,
    marginLeft: THEME.spacing.sm,
    flex: 1,
  },
  withheldLot: { ...THEME.type.small, color: THEME.safety.recalled.fg, marginTop: THEME.spacing.xs, lineHeight: 20 },
  withheldLotNo: { fontWeight: '700' },
  withheldNote: { ...THEME.type.small, color: THEME.safety.recalled.fg, marginTop: THEME.spacing.sm, fontStyle: 'italic' },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  actionPrimary: { flex: 1, maxWidth: 260 },
  actionSecondary: { flex: 1, maxWidth: 260, marginLeft: THEME.spacing.md },

  awaitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: THEME.spacing.lg,
    marginBottom: 0,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.safety.highAlert.bg,
    borderWidth: 1,
    borderColor: THEME.safety.highAlert.border,
  },
  awaitingText: {
    ...THEME.type.small,
    color: THEME.safety.highAlert.fg,
    marginLeft: THEME.spacing.sm,
    flex: 1,
    lineHeight: 20,
  },

  history: {
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  historyVoided: { backgroundColor: THEME.colors.rowAlt, opacity: 0.85 },
  historyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyNumber: { ...THEME.type.mono, color: THEME.colors.textTitle },
  historyBadges: { flexDirection: 'row', gap: 4 },
  historyMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  historyItem: { ...THEME.type.small, color: THEME.colors.textValue, marginTop: 4 },
  historyVoidReason: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: THEME.spacing.sm, fontStyle: 'italic' },
  historyChecked: { ...THEME.type.small, color: THEME.colors.success, marginTop: THEME.spacing.sm, fontWeight: '600' },
  historyHold: {
    marginTop: THEME.spacing.sm,
    padding: THEME.spacing.sm,
    borderRadius: THEME.radius.sm,
    backgroundColor: THEME.safety.highAlert.bg,
    borderWidth: 1,
    borderColor: THEME.safety.highAlert.border,
  },
  historyHoldText: { ...THEME.type.small, color: THEME.safety.highAlert.fg, fontWeight: '600', lineHeight: 20 },
  historyActions: { flexDirection: 'row', marginTop: THEME.spacing.md },
  historyAction: { width: 220, marginRight: THEME.spacing.md },
});
