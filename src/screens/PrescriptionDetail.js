import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Badge from '../components/Badge';
import SafetyHeader from '../components/SafetyHeader';
import { useDispensingDetail } from '../query/dispensingQueries';
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

      <View style={styles.phaseNote}>
        <Text style={styles.phaseNoteTitle}>Read-only for now</Text>
        <Text style={styles.phaseNoteText}>
          Lot selection and dispensing arrive in Phase 4. The stock figures below each medicine come
          from the usable lots the server offers for that drug.
        </Text>
      </View>
    </ScrollView>
  );
}

/** One medicine line: what was ordered, what is owed, and what stock exists. */
function MedicineLine({ item }) {
  const lots = Array.isArray(item.lots) ? item.lots : [];
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
          {item.is_dangerous_drug ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
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

      {item.refill_request ? (
        <Text style={styles.refillNote}>A refill has been requested on this medicine.</Text>
      ) : null}
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

  phaseNote: {
    margin: THEME.spacing.lg,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
  },
  phaseNoteTitle: { ...THEME.type.bodyStrong, color: '#92400e' },
  phaseNoteText: { ...THEME.type.small, color: '#92400e', marginTop: 2, lineHeight: 20 },
});
