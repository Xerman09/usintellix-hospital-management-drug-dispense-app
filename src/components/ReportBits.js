import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { DATE_PRESETS } from '../api/reportViews';
import { THEME } from '../constants/theme';

/**
 * Shared furniture for the dashboard and the four reports.
 *
 * Numbers on these screens are read at a glance across a counter, so they use
 * the tabular-figure type scale and a severity colour only where the number
 * means something is wrong. A stat tile that is red when everything is fine
 * teaches the pharmacist to ignore red.
 */

/** One figure with a label, optionally flagged when it is not zero. */
export function Stat({ label, value, hint, severity = 'none', wide = false }) {
  const tone = {
    stop: { box: styles.tileStop, value: styles.valueStop },
    warn: { box: styles.tileWarn, value: styles.valueWarn },
    ok: { box: styles.tileOk, value: styles.valueOk },
    none: { box: null, value: null },
  }[severity] || { box: null, value: null };

  return (
    <View style={[styles.tile, wide && styles.tileWide, tone.box]}>
      <Text style={styles.tileLabel}>{String(label).toUpperCase()}</Text>
      <Text style={[styles.tileValue, tone.value]} numberOfLines={1}>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

/** A row of figures that wraps. */
export function StatRow({ children }) {
  return <View style={styles.statRow}>{children}</View>;
}

/** Date range presets, shared so "last 7 days" means one thing everywhere. */
export function DateRangeFilter({ preset, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {DATE_PRESETS.map((p) => {
        const active = p.key === preset;
        return (
          <Pressable
            key={p.key}
            onPress={() => onChange(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A picker over options from /pharmacy-reports/options. `null` means "all". */
export function OptionFilter({ label, options, value, onChange, allLabel = 'All', max = 12 }) {
  const list = (Array.isArray(options) ? options : []).slice(0, max);
  if (!list.length) return null;

  return (
    <View style={styles.optionWrap}>
      <Text style={styles.optionLabel}>{label.toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={allLabel} active={value === null || value === undefined} onPress={() => onChange(null)} />
        {list.map((o) => (
          <Chip
            key={String(o.id ?? o.value)}
            label={o.name ?? o.label}
            active={String(value) === String(o.id ?? o.value)}
            onPress={() => onChange(o.id ?? o.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The "showing the first N" note, when a report was cut short. */
export function TruncationNote({ text }) {
  if (!text) return null;
  return (
    <View style={styles.truncated}>
      <Text style={styles.truncatedText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: THEME.spacing.md },
  tile: {
    minWidth: 150,
    flexGrow: 1,
    flexBasis: 150,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  tileWide: { flexBasis: 320, minWidth: 320 },
  tileStop: { backgroundColor: THEME.safety.expired.bg, borderColor: THEME.safety.expired.border },
  tileWarn: { backgroundColor: THEME.colors.warningBg, borderColor: THEME.colors.warningBorder },
  tileOk: { backgroundColor: THEME.colors.successBg, borderColor: THEME.colors.successBorder },
  tileLabel: { ...THEME.type.label, fontSize: 11, color: THEME.colors.textLabel },
  tileValue: { ...THEME.type.monoLarge, color: THEME.colors.textTitle, marginTop: 4 },
  valueStop: { color: THEME.safety.expired.fg },
  valueWarn: { color: '#92400e' },
  valueOk: { color: '#065f46' },
  tileHint: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },

  chips: { paddingVertical: THEME.spacing.xs, paddingRight: THEME.spacing.lg },
  chip: {
    minHeight: THEME.touch.min,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.md,
    marginRight: THEME.spacing.sm,
    maxWidth: 240,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.cardBg,
  },
  chipActive: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  chipPressed: { backgroundColor: THEME.colors.rowSelected },
  chipLabel: { ...THEME.type.small, fontWeight: '600', color: THEME.colors.textValue },
  chipLabelActive: { color: THEME.colors.textOnDark },

  optionWrap: { marginTop: THEME.spacing.sm },
  optionLabel: { ...THEME.type.label, fontSize: 11, color: THEME.colors.textLabel },

  truncated: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.warningBg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.warningBorder,
  },
  truncatedText: { ...THEME.type.small, color: '#92400e', textAlign: 'center' },
});
