import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * A section the rail can reach but that is not built yet.
 *
 * It names the phase that builds it, so a tester tapping around the shell
 * learns what is missing instead of meeting a blank screen and filing it
 * as a bug.
 */
export default function PlaceholderScreen({ title, phase, description }) {
  return (
    <View style={styles.container}>
      <Text style={styles.phase}>{phase}</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },
  phase: { ...THEME.type.label, color: THEME.colors.brandBlue },
  title: { ...THEME.type.title, color: THEME.colors.textTitle, marginTop: THEME.spacing.sm },
  description: {
    ...THEME.type.body,
    color: THEME.colors.textSubtitle,
    marginTop: THEME.spacing.md,
    textAlign: 'center',
    maxWidth: 520,
    lineHeight: 24,
  },
});
