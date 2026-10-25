import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * On-screen numeric entry for dispensing quantities.
 *
 * Why not a TextInput with keyboardType="numeric": the Android keyboard covers
 * the bottom half of the screen, which is exactly where the lot table sits.
 * The pharmacist needs to see the lot and the quantity at the same time.
 *
 * Quantities are DECIMAL(12,3) in the database, so up to 3 decimal places are
 * accepted. `max` is the quantity still owed on the line -- entry stops there
 * rather than letting the pharmacist type a number the backend will reject.
 *
 * @param {string} value          current entry, as a string ('' when empty)
 * @param {(next: string) => void} onChange
 * @param {number} [max]          refuse entries above this
 * @param {number} [decimals=3]
 * @param {string} [label]
 * @param {string} [unit]         the medicine's dispensing unit, e.g. 'tablet'
 */
export default function NumPad({ value, onChange, max, decimals = 3, label, unit }) {
  const append = (ch) => {
    let next;
    if (ch === '.') {
      if (value.includes('.')) return;
      next = value === '' ? '0.' : `${value}.`;
    } else {
      const [, frac = ''] = value.split('.');
      if (value.includes('.') && frac.length >= decimals) return;
      next = value === '0' ? ch : `${value}${ch}`;
    }

    if (max !== undefined && Number(next) > max) return;
    onChange(next);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');
  const fillMax = () => max !== undefined && onChange(String(max));

  const over = max !== undefined && value !== '' && Number(value) > max;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}

      <View style={[styles.display, over && styles.displayOver]}>
        <Text style={styles.displayValue}>{value === '' ? '0' : value}</Text>
        {unit ? <Text style={styles.displayUnit}>{unit}</Text> : null}
      </View>

      {max !== undefined ? (
        <Pressable onPress={fillMax} style={styles.maxRow} accessibilityRole="button">
          <Text style={styles.maxText}>Remaining: {max}{unit ? ` ${unit}` : ''} &#183; tap to fill</Text>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} label={d} onPress={() => append(d)} />
        ))}
        <Key label="." onPress={() => append('.')} disabled={decimals === 0} />
        <Key label="0" onPress={() => append('0')} />
        <Key label="&#9003;" onPress={backspace} accessibilityLabel="Backspace" />
      </View>

      <Pressable onPress={clear} style={styles.clear} accessibilityRole="button">
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
    </View>
  );
}

function Key({ label, onPress, disabled, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && styles.keyDisabled]}
    >
      <Text style={[styles.keyText, disabled && styles.keyTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: THEME.spacing.md },
  label: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },

  display: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    minHeight: THEME.touch.large,
    paddingHorizontal: THEME.spacing.lg,
    borderWidth: 2,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
  },
  displayOver: { borderColor: THEME.colors.error, backgroundColor: THEME.colors.errorBg },
  displayValue: { ...THEME.type.monoLarge, color: THEME.colors.textTitle },
  displayUnit: { ...THEME.type.small, color: THEME.colors.textLabel, marginLeft: THEME.spacing.sm },

  maxRow: { paddingVertical: THEME.spacing.sm, minHeight: THEME.touch.min, justifyContent: 'center' },
  maxText: { ...THEME.type.small, color: THEME.colors.brandBlue, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: THEME.spacing.sm },
  key: {
    width: '33.33%',
    height: THEME.touch.large,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  keyPressed: { backgroundColor: THEME.colors.rowSelected },
  keyDisabled: { backgroundColor: THEME.colors.btnDisabledBg },
  keyText: { ...THEME.type.title, color: THEME.colors.textTitle },
  keyTextDisabled: { color: THEME.colors.btnDisabledText },

  clear: {
    marginTop: THEME.spacing.sm,
    height: THEME.touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  clearText: { ...THEME.type.bodyStrong, color: THEME.colors.textLabel },
});
