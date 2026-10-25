import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * A short, coloured label: a dispense status, or a safety warning.
 *
 * Takes a token straight from THEME.safety or THEME.status ({fg, bg, border,
 * label}) so the colour of "HIGH ALERT" is decided in one place and cannot
 * drift between screens.
 *
 * @param {{fg: string, bg: string, border: string, label?: string}} token
 * @param {string} [text]  overrides token.label
 * @param {'sm'|'md'} [size]
 */
export default function Badge({ token, text, size = 'md' }) {
  if (!token) return null;
  const label = text || token.label || '';
  if (!label) return null;

  return (
    <View
      style={[
        styles.base,
        size === 'sm' && styles.sm,
        { backgroundColor: token.bg, borderColor: token.border },
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSm, { color: token.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: THEME.radius.sm,
  },
  sm: { paddingHorizontal: 6, paddingVertical: 2 },
  text: { ...THEME.type.label, fontSize: 12 },
  textSm: { fontSize: 11, letterSpacing: 0.2 },
});
