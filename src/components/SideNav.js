import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * The permanent left rail.
 *
 * Deliberately NOT @react-navigation/drawer. A drawer hides the navigation
 * behind a gesture to save width -- on a landscape tablet there is width to
 * spare, and a pharmacist should be able to see where they are without
 * swiping. It also keeps react-native-reanimated and gesture-handler out of
 * the build, which matters for an APK that gets side-loaded onto hospital
 * tablets.
 *
 * @param {Array<{key: string, label: string, glyph: string, badge?: number}>} items
 * @param {string} activeKey
 * @param {(key: string) => void} onSelect
 * @param {React.ReactNode} [footer]  the signed-in pharmacist (Phase 2.7)
 */
export default function SideNav({ items, activeKey, onSelect, footer }) {
  return (
    <View style={styles.rail}>
      <View style={styles.brand}>
        <Text style={styles.brandMark}>Rx</Text>
      </View>

      <View style={styles.items}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && !active && styles.itemPressed,
              ]}
            >
              <Text style={[styles.glyph, active && styles.glyphActive]}>{item.glyph}</Text>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
                {item.label}
              </Text>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: THEME.layout.railWidth,
    backgroundColor: THEME.colors.railBg,
    paddingTop: THEME.spacing.md,
    paddingBottom: THEME.spacing.sm,
  },
  brand: { alignItems: 'center', paddingVertical: THEME.spacing.md },
  brandMark: { ...THEME.type.title, color: THEME.colors.textOnDark },

  items: { flex: 1, marginTop: THEME.spacing.md },
  item: {
    minHeight: THEME.touch.large,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: { backgroundColor: THEME.colors.railBgActive, borderLeftWidth: 3, borderLeftColor: THEME.colors.brandBlue },
  itemPressed: { backgroundColor: THEME.colors.railBgActive },
  glyph: { fontSize: 22, color: THEME.colors.textOnDarkDim },
  glyphActive: { color: THEME.colors.textOnDark },
  label: { ...THEME.type.label, fontSize: 11, color: THEME.colors.textOnDarkDim, textAlign: 'center', marginTop: 4 },
  labelActive: { color: THEME.colors.textOnDark },

  badge: {
    position: 'absolute',
    top: 6,
    right: 12,
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.colors.error,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#ffffff' },

  footer: { borderTopWidth: 1, borderTopColor: THEME.colors.railBgActive, paddingTop: THEME.spacing.sm },
});
