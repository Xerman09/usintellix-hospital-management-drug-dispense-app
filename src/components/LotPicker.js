import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { lotsAtWarehouse, fefoPlan } from '../api/dispenseDraft';
import { THEME } from '../constants/theme';

/**
 * Which lot a medicine comes out of.
 *
 * The important thing this screen has to get across is that "Earliest expiry
 * first" is not just a default sort -- it is the server doing the allocation,
 * and it may draw one line from SEVERAL lots. Pinning a lot turns that off:
 * only that lot is used, and if it is short the line is refused rather than
 * topped up. So the preview under each choice shows exactly what will be
 * taken, from which lot.
 *
 * Recalled, quarantined, near-expiry and expired lots never reach here -- the
 * server leaves them out of `item.lots` (they are reported separately as
 * `recalled_lots`), so there is nothing unsafe to pick.
 */
export default function LotPicker({ item, warehouseId, quantity, lotId, onChange }) {
  const lots = lotsAtWarehouse(item, warehouseId);
  const auto = fefoPlan(item, warehouseId, quantity, null);
  const unit = item.drug_unit_name || 'units';

  if (!lots.length) {
    return (
      <View style={styles.none}>
        <Text style={styles.noneText}>No usable stock of this medicine at this location.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>TAKE FROM</Text>

      <Option
        selected={!lotId}
        onPress={() => onChange(null)}
        title="Earliest expiry first"
        subtitle={
          auto.takes.length
            ? auto.takes.map((t) => `${t.lot_number} × ${t.quantity}`).join('  +  ')
            : 'Enter a quantity to see which lots would be used.'
        }
        warning={
          auto.spansLots
            ? `This will be taken from ${auto.takes.length} lots.`
            : null
        }
        error={auto.shortfall > 0 && Number(quantity) > 0 ? `Short by ${auto.shortfall} ${unit}.` : null}
      />

      {lots.map((lot) => {
        const pinned = fefoPlan(item, warehouseId, quantity, lot.id);
        const selected = Number(lotId) === Number(lot.id);
        return (
          <Option
            key={lot.id}
            selected={selected}
            onPress={() => onChange(lot.id)}
            title={lot.lot_number}
            subtitle={`${lot.quantity} ${unit} on hand${lot.expires_date ? `  ·  expires ${lot.expires_date}` : '  ·  no expiry recorded'}`}
            error={selected && pinned.shortfall > 0 ? `This lot is short by ${pinned.shortfall} ${unit}.` : null}
          />
        );
      })}
    </View>
  );
}

function Option({ selected, onPress, title, subtitle, warning, error }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionBody}>
        <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.optionSubtitle}>{subtitle}</Text> : null}
        {warning ? <Text style={styles.optionWarning}>{warning}</Text> : null}
        {error ? <Text style={styles.optionError}>{error}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: THEME.spacing.md },
  label: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },

  none: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.errorBg,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
  },
  noneText: { ...THEME.type.small, color: '#991b1b', fontWeight: '600' },

  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: THEME.touch.comfortable,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  optionSelected: { borderColor: THEME.colors.brandBlue, backgroundColor: THEME.colors.rowSelected, borderWidth: 2 },
  optionPressed: { backgroundColor: THEME.colors.rowAlt },

  radio: {
    width: 22,
    height: 22,
    borderRadius: THEME.radius.pill,
    borderWidth: 2,
    borderColor: THEME.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: THEME.spacing.md,
    marginTop: 2,
  },
  radioOn: { borderColor: THEME.colors.brandBlue },
  radioDot: { width: 10, height: 10, borderRadius: THEME.radius.pill, backgroundColor: THEME.colors.brandBlue },

  optionBody: { flex: 1 },
  optionTitle: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
  optionTitleSelected: { color: THEME.colors.textTitle },
  optionSubtitle: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  optionWarning: { ...THEME.type.small, color: THEME.colors.warning, marginTop: 4, fontWeight: '600' },
  optionError: { ...THEME.type.small, color: THEME.colors.error, marginTop: 4, fontWeight: '600' },
});
