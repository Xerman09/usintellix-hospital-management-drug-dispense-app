import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { VIEWS, countFor } from '../api/queueViews';
import { THEME } from '../constants/theme';

/**
 * The queue's view chips, with the backend's own counts.
 *
 * Counts come from /dispensing's `counts` object, so the number on a chip is
 * the real backlog for that view rather than the length of the page currently
 * loaded. Views the backend gives no count for (dispensed, closed, all) show
 * no number instead of a misleading zero.
 */
export default function ViewTabs({ view, counts, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {VIEWS.map((v) => {
        const active = v.key === view;
        const count = countFor(v.key, counts);

        return (
          <Pressable
            key={v.key}
            onPress={() => onChange(v.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityHint={v.hint}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && !active && styles.chipPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{v.label}</Text>
            {count !== null ? (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: THEME.spacing.sm, paddingRight: THEME.spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.md,
    marginRight: THEME.spacing.sm,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.cardBg,
  },
  chipActive: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  chipPressed: { backgroundColor: THEME.colors.rowSelected },
  label: { ...THEME.type.small, fontWeight: '600', color: THEME.colors.textValue },
  labelActive: { color: THEME.colors.textOnDark },
  badge: {
    marginLeft: THEME.spacing.sm,
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.colors.rowAlt,
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: THEME.colors.railBgActive },
  badgeText: { ...THEME.type.small, fontWeight: '700', color: THEME.colors.textLabel },
  badgeTextActive: { color: THEME.colors.textOnDark },
});
