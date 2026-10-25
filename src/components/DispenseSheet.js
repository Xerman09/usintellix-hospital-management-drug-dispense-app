import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import Badge from './Badge';
import NumPad from './NumPad';
import LotPicker from './LotPicker';
import { Notice, PrimaryButton, SecondaryButton, Field } from './Form';
import {
  warehouseOptions, initialEntries, validateDraft, buildDispenseBody,
  lineAllowance, stockAtWarehouse, mapServerErrors, fefoPlan, round3,
} from '../api/dispenseDraft';
import { useDispense } from '../query/dispensingQueries';
import { THEME } from '../constants/theme';

/**
 * Giving the medicine out.
 *
 * Laid out as location -> lines -> confirm, because that is the order the
 * backend imposes: dispense() takes ONE warehouse_id and only sees lots there,
 * so the location has to be settled before any quantity means anything.
 *
 * Quantity entry uses the NumPad rather than the OS keyboard, and only for the
 * line being worked on, so the lot list stays visible while the number is
 * typed -- on a tablet the Android keyboard covers exactly that area.
 *
 * Nothing here is optimistic. The sheet shows success only once the server has
 * answered with a DSP number, because the alternative is telling a pharmacist
 * medicine left the shelf when it did not.
 */
export default function DispenseSheet({ visible, detail, onClose, onDispensed }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;

  const items = useMemo(
    () => (Array.isArray(detail?.prescription?.items) ? detail.prescription.items : []),
    [detail]
  );
  const locations = useMemo(() => warehouseOptions(items), [items]);

  const [warehouseId, setWarehouseId] = useState(null);
  const [entries, setEntries] = useState({});
  const [activeLine, setActiveLine] = useState(null);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState({ type: null, rate: 0, id_no: '', reason: '' });
  const [serverLineErrors, setServerLineErrors] = useState({});
  const [serverFormErrors, setServerFormErrors] = useState({});
  const [result, setResult] = useState(null);

  const dispense = useDispense();

  // Start on the location that can cover the most of this prescription.
  useEffect(() => {
    if (!visible) return;
    const first = locations[0]?.warehouse_id ?? null;
    setWarehouseId(first);
    setResult(null);
    setServerLineErrors({});
    setServerFormErrors({});
    setNotes('');
    setDiscount({ type: null, rate: 0, id_no: '', reason: '' });
  }, [visible, locations]);

  // Changing location changes which lots exist, so the quantities and any
  // pinned lot are rebuilt rather than carried over to a different shelf.
  useEffect(() => {
    if (!visible) return;
    const next = initialEntries(items, warehouseId);
    setEntries(next);
    setActiveLine(Object.keys(next).find((id) => next[id].include) ?? null);
    setServerLineErrors({});
  }, [visible, warehouseId, items]);

  const draft = validateDraft({ detail, warehouseId, entries, discount });
  const lineError = (id) => serverLineErrors[id] || draft.lineErrors[id] || null;

  const update = (id, patch) => {
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setServerLineErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const submit = async () => {
    setServerLineErrors({});
    setServerFormErrors({});

    const body = buildDispenseBody({ detail, warehouseId, entries, notes, discount });

    try {
      const data = await dispense.mutateAsync({ body, prescriptionId: detail?.prescription?.id });
      setResult(data);
      onDispensed?.(data);
    } catch (e) {
      const mapped = mapServerErrors(e.serverErrors);
      setServerLineErrors(mapped.lineErrors);
      setServerFormErrors(mapped.formErrors);
    }
  };

  const activeItem = items.find((i) => String(i.id) === String(activeLine)) || null;
  const activeEntry = activeItem ? entries[activeItem.id] : null;

  // ------------------------------------------------------------- success view

  if (result) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.page}>
          <View style={styles.doneWrap}>
            <Text style={styles.doneNumber}>{result.dispense_number}</Text>
            <Text style={styles.doneTitle}>Dispensed</Text>

            {result.needs_check ? (
              <Notice
                tone="warning"
                title="Do not hand this over yet"
                message="It contains a high-alert medicine. A second pharmacist — not you — must check it first. It is waiting in the Awaiting check queue."
              />
            ) : null}

            <View style={styles.doneRows}>
              <DoneRow label="Prescription now" value={result.dispense_status} />
              <DoneRow label="Charged" value={`${result.net_amount}`} />
            </View>

            {result.reorder_evaluation?.draft_pr_number ? (
              <Notice
                tone="info"
                title="Stock hit its reorder point"
                message={`Draft purchase requisition ${result.reorder_evaluation.draft_pr_number} was raised automatically.`}
              />
            ) : null}

            <PrimaryButton title="Done" onPress={onClose} />
          </View>
        </View>
      </Modal>
    );
  }

  // --------------------------------------------------------------- form view

  const linesPane = (
    <ScrollView style={styles.flex} contentContainerStyle={styles.pad}>
      <Text style={styles.sectionLabel}>DISPENSING FROM</Text>
      {locations.length === 0 ? (
        <Notice tone="error" message="None of these medicines have usable stock at any location." />
      ) : (
        locations.map((loc) => {
          const selected = loc.warehouse_id === warehouseId;
          return (
            <Pressable
              key={loc.warehouse_id}
              onPress={() => setWarehouseId(loc.warehouse_id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.loc, selected && styles.locSelected, pressed && styles.locPressed]}
            >
              <View style={styles.flex}>
                <Text style={[styles.locName, selected && styles.locNameSelected]}>{loc.warehouse_name}</Text>
                <Text style={styles.locMeta}>
                  {loc.covered} of {loc.covered + loc.partial + loc.missing} medicines fully in stock
                  {loc.partial ? `  ·  ${loc.partial} partly` : ''}
                  {loc.missing ? `  ·  ${loc.missing} none` : ''}
                </Text>
              </View>
              {selected ? <Badge token={THEME.status.pending} text="SELECTED" size="sm" /> : null}
            </Pressable>
          );
        })
      )}
      {serverFormErrors.warehouse_id ? (
        <Text style={styles.fieldError}>{serverFormErrors.warehouse_id}</Text>
      ) : null}

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>MEDICINES</Text>
      {items.map((item) => (
        <LineRow
          key={item.id}
          item={item}
          entry={entries[item.id]}
          warehouseId={warehouseId}
          active={String(activeLine) === String(item.id)}
          error={lineError(item.id)}
          onActivate={() => setActiveLine(String(item.id))}
          onToggle={() => update(item.id, { include: !entries[item.id]?.include })}
        />
      ))}

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>DISCOUNT</Text>
      <DiscountPicker discount={discount} onChange={setDiscount} errors={{ ...draft.errors, ...serverFormErrors }} />

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>NOTE (OPTIONAL)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything worth recording about this dispensing"
        placeholderTextColor={THEME.colors.textDim}
        multiline
        style={styles.notes}
        maxLength={500}
      />
    </ScrollView>
  );

  const entryPane = (
    <ScrollView style={styles.entryPane} contentContainerStyle={styles.pad}>
      {activeItem && activeEntry ? (
        <>
          <Text style={styles.entryTitle}>{activeItem.title || activeItem.drug_name}</Text>
          <Text style={styles.entryMeta}>
            {activeEntry.refill ? 'Refill' : activeItem.fill_label}
            {'  ·  '}
            {lineAllowance(activeItem, activeEntry.refill)} {activeItem.drug_unit_name || 'units'} allowed
            {'  ·  '}
            {stockAtWarehouse(activeItem, warehouseId)} in stock here
          </Text>

          {activeItem.is_high_alert ? (
            <View style={styles.entryFlag}>
              <Badge token={THEME.safety.highAlert} size="sm" />
              <Text style={styles.entryFlagText}>A second pharmacist must check this before handover.</Text>
            </View>
          ) : null}

          <NumPad
            value={activeEntry.quantity}
            onChange={(q) => update(activeItem.id, { quantity: q, include: round3(Number(q || 0)) > 0 })}
            max={lineAllowance(activeItem, activeEntry.refill)}
            unit={activeItem.drug_unit_name}
            label="Quantity to give"
          />

          <LotPicker
            item={activeItem}
            warehouseId={warehouseId}
            quantity={activeEntry.quantity}
            lotId={activeEntry.lot_id}
            onChange={(lotId) => update(activeItem.id, { lot_id: lotId })}
          />
        </>
      ) : (
        <Text style={styles.entryEmpty}>Tap a medicine to enter how much you are giving.</Text>
      )}
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Dispense {detail?.prescription?.rx_number}</Text>
            <Text style={styles.headerMeta}>{detail?.patient?.name}</Text>
          </View>
          <SecondaryButton title="Cancel" onPress={onClose} disabled={dispense.isPending} />
        </View>

        {draft.errors.prescription ? (
          <View style={styles.banner}>
            <Notice tone="error" title="This prescription cannot be filled" message={draft.errors.prescription} />
          </View>
        ) : null}

        {dispense.isError && !Object.keys(serverLineErrors).length && !Object.keys(serverFormErrors).length ? (
          <View style={styles.banner}>
            <Notice tone="error" title="Nothing was dispensed" message={dispense.error?.message} />
          </View>
        ) : null}

        {Object.keys(serverLineErrors).length ? (
          <View style={styles.banner}>
            <Notice
              tone="error"
              title="Nothing was dispensed"
              message="The server refused some lines — see each medicine below. The prescription has been reloaded, so the figures now show what is actually left."
            />
          </View>
        ) : null}

        <View style={wide ? styles.body : styles.bodyNarrow}>
          <View style={wide ? styles.leftPane : styles.flex}>{linesPane}</View>
          {wide ? <View style={styles.rightPane}>{entryPane}</View> : null}
        </View>

        {!wide && activeItem ? <View style={styles.narrowEntry}>{entryPane}</View> : null}

        <View style={styles.footer}>
          <View style={styles.flex}>
            <Text style={styles.summary}>
              {draft.included.length} medicine{draft.included.length === 1 ? '' : 's'}
              {draft.estimatedGross ? `  ·  ${draft.estimatedNet} to charge` : ''}
            </Text>
            {draft.needsCheck ? (
              <Text style={styles.summaryWarn}>Includes a high-alert medicine: a second check will be required.</Text>
            ) : null}
            {draft.spansLots ? (
              <Text style={styles.summaryNote}>Some lines will be taken from more than one lot.</Text>
            ) : null}
            {draft.errors.items ? <Text style={styles.fieldError}>{draft.errors.items}</Text> : null}
          </View>

          <View style={styles.submit}>
            <PrimaryButton
              title={dispense.isPending ? 'Dispensing…' : 'Dispense'}
              onPress={submit}
              busy={dispense.isPending}
              disabled={!draft.ok}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** One medicine in the list: include it, and what will be given. */
function LineRow({ item, entry, warehouseId, active, error, onActivate, onToggle }) {
  if (!entry) return null;

  const unit = item.drug_unit_name || 'units';
  const plan = fefoPlan(item, warehouseId, entry.quantity, entry.lot_id || null);
  const canTouch = item.can_dispense && (item.can_give_now || item.can_refill);

  return (
    <Pressable
      onPress={canTouch ? onActivate : undefined}
      disabled={!canTouch}
      style={({ pressed }) => [
        styles.line,
        active && styles.lineActive,
        !canTouch && styles.lineOff,
        pressed && canTouch && styles.linePressed,
      ]}
    >
      <Pressable
        onPress={canTouch ? onToggle : undefined}
        disabled={!canTouch}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(entry.include) }}
        style={[styles.check, entry.include && styles.checkOn]}
      >
        {entry.include ? <Text style={styles.checkMark}>&#10003;</Text> : null}
      </Pressable>

      <View style={styles.flex}>
        <View style={styles.lineTop}>
          <Text style={styles.lineTitle} numberOfLines={2}>{item.title || item.drug_name}</Text>
          {item.is_high_alert ? <Badge token={THEME.safety.highAlert} size="sm" /> : null}
          {item.is_dangerous_drug ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
        </View>

        {canTouch ? (
          <Text style={styles.lineQty}>
            {entry.include && Number(entry.quantity) > 0
              ? `Giving ${entry.quantity} ${unit}`
              : 'Not being given'}
            {entry.refill ? '  (as a refill)' : ''}
          </Text>
        ) : (
          <Text style={styles.lineOffText}>
            {!item.can_dispense ? 'Not in the Drug Catalog.' : 'Cannot be given now.'}
          </Text>
        )}

        {entry.include && plan.takes.length ? (
          <Text style={styles.lineLots}>
            {entry.lot_id ? 'Lot ' : 'From '}
            {plan.takes.map((t) => `${t.lot_number} × ${t.quantity}`).join('  +  ')}
          </Text>
        ) : null}

        {error ? <Text style={styles.lineError}>{error}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Senior / PWD / other, as DispensingService::DISCOUNTS defines them. */
function DiscountPicker({ discount, onChange, errors }) {
  const OPTIONS = [
    { value: null, label: 'None' },
    { value: 'senior', label: 'Senior Citizen (RA 9994) 20%', rate: 20 },
    { value: 'pwd', label: 'PWD (RA 10754) 20%', rate: 20 },
    { value: 'other', label: 'Other discount', rate: 0 },
  ];

  return (
    <View>
      <View style={styles.discountRow}>
        {OPTIONS.map((o) => {
          const selected = discount.type === o.value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange({ type: o.value, rate: o.rate ?? 0, id_no: '', reason: '' })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.discountChip, selected && styles.discountChipOn, pressed && styles.locPressed]}
            >
              <Text style={[styles.discountLabel, selected && styles.discountLabelOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {discount.type === 'senior' || discount.type === 'pwd' ? (
        <Field
          label="ID number (required)"
          value={discount.id_no}
          onChangeText={(v) => onChange({ ...discount, id_no: v })}
          error={errors.discount_id_no}
          autoCapitalize="characters"
        />
      ) : null}

      {discount.type === 'other' ? (
        <>
          <Field
            label="Discount percent"
            value={String(discount.rate || '')}
            onChangeText={(v) => onChange({ ...discount, rate: v.replace(/[^0-9.]/g, '') })}
            keyboardType="decimal-pad"
            error={errors.discount_rate}
          />
          <Field
            label="Reason"
            value={discount.reason}
            onChangeText={(v) => onChange({ ...discount, reason: v })}
            error={errors.discount_reason}
            autoCapitalize="sentences"
          />
        </>
      ) : null}
    </View>
  );
}

function DoneRow({ label, value }) {
  return (
    <View style={styles.doneRow}>
      <Text style={styles.doneLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.doneValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  pad: { padding: THEME.spacing.lg, paddingBottom: THEME.spacing.xxxl },

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

  banner: { paddingHorizontal: THEME.spacing.lg, paddingTop: THEME.spacing.md },

  body: { flex: 1, flexDirection: 'row' },
  bodyNarrow: { flex: 1 },
  leftPane: { flex: 1.3, borderRightWidth: 1, borderRightColor: THEME.colors.borderSubtle },
  rightPane: { flex: 1, backgroundColor: THEME.colors.cardBg },
  entryPane: { flex: 1 },
  narrowEntry: { maxHeight: 420, backgroundColor: THEME.colors.cardBg, borderTopWidth: 1, borderTopColor: THEME.colors.borderSubtle },

  sectionLabel: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },
  sectionSpaced: { marginTop: THEME.spacing.xl },

  loc: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: THEME.touch.comfortable,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  locSelected: { borderColor: THEME.colors.brandBlue, borderWidth: 2, backgroundColor: THEME.colors.rowSelected },
  locPressed: { backgroundColor: THEME.colors.rowAlt },
  locName: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
  locNameSelected: { color: THEME.colors.textTitle },
  locMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },

  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  lineActive: { borderColor: THEME.colors.brandBlue, borderWidth: 2 },
  linePressed: { backgroundColor: THEME.colors.rowAlt },
  lineOff: { backgroundColor: THEME.colors.rowAlt, opacity: 0.8 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: THEME.spacing.sm },
  lineTitle: { ...THEME.type.bodyStrong, color: THEME.colors.textTitle, flex: 1 },
  lineQty: { ...THEME.type.small, color: THEME.colors.textValue, marginTop: 4 },
  lineLots: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  lineOffText: { ...THEME.type.small, color: THEME.colors.textDim, marginTop: 4 },
  lineError: { ...THEME.type.small, color: THEME.colors.error, marginTop: 4, fontWeight: '600' },

  check: {
    width: 28,
    height: 28,
    borderRadius: THEME.radius.sm,
    borderWidth: 2,
    borderColor: THEME.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: THEME.spacing.md,
  },
  checkOn: { backgroundColor: THEME.colors.brandBlue, borderColor: THEME.colors.brandBlue },
  checkMark: { color: '#ffffff', fontWeight: '900', fontSize: 16 },

  entryTitle: { ...THEME.type.subheading, color: THEME.colors.textTitle },
  entryMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 4 },
  entryFlag: { flexDirection: 'row', alignItems: 'center', marginTop: THEME.spacing.md },
  entryFlagText: { ...THEME.type.small, color: THEME.safety.highAlert.fg, marginLeft: THEME.spacing.sm, flex: 1 },
  entryEmpty: { ...THEME.type.body, color: THEME.colors.textDim, textAlign: 'center', marginTop: THEME.spacing.xxl },

  discountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: THEME.spacing.sm, marginBottom: THEME.spacing.md },
  discountChip: {
    minHeight: THEME.touch.min,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.md,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.cardBg,
  },
  discountChipOn: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  discountLabel: { ...THEME.type.small, fontWeight: '600', color: THEME.colors.textValue },
  discountLabelOn: { color: THEME.colors.textOnDark },

  notes: {
    minHeight: 88,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.body,
    color: THEME.colors.textTitle,
    textAlignVertical: 'top',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  summary: { ...THEME.type.bodyStrong, color: THEME.colors.textTitle },
  summaryWarn: { ...THEME.type.small, color: THEME.safety.highAlert.fg, marginTop: 2, fontWeight: '600' },
  summaryNote: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  submit: { width: 220, marginLeft: THEME.spacing.lg },
  fieldError: { ...THEME.type.small, color: THEME.colors.error, marginTop: 2, fontWeight: '600' },

  doneWrap: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: THEME.spacing.xxl,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
  },
  doneNumber: { ...THEME.type.display, color: THEME.colors.textTitle, textAlign: 'center' },
  doneTitle: {
    ...THEME.type.heading,
    color: THEME.colors.success,
    textAlign: 'center',
    marginBottom: THEME.spacing.xl,
  },
  doneRows: { marginBottom: THEME.spacing.xl },
  doneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  doneLabel: { ...THEME.type.label, color: THEME.colors.textLabel },
  doneValue: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
});
