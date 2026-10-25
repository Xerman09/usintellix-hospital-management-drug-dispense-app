import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ping } from '../api/client';
import { CONFIG, isInsecureTransport } from '../constants/config';
import { THEME } from '../constants/theme';

/**
 * Whether the tablet can reach the hospital server.
 *
 * This is load-bearing, not decoration: the app refuses to queue dispenses
 * offline, so the pharmacist must be able to tell at a glance whether the
 * next dispense will go through. It also satisfies the Phase 1 exit
 * criterion -- proving GET /ping round-trips from the physical tablet.
 *
 * A 401 from /ping still means REACHABLE: the route exists and the server
 * answered, we simply are not signed in yet.
 */
export default function ConnectionBanner() {
  const [state, setState] = useState({ checked: false, reachable: false, authenticated: false });

  const check = async () => {
    const res = await ping();
    setState({ checked: true, reachable: res.reachable, authenticated: res.authenticated });
  };

  useEffect(() => {
    check();
    const timer = setInterval(check, CONFIG.QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const insecure = isInsecureTransport();

  let tone = styles.toneChecking;
  let text = 'Checking the connection to the hospital server…';

  if (state.checked && !state.reachable) {
    tone = styles.toneError;
    text = 'No connection to the hospital server. Dispensing is unavailable until it returns.';
  } else if (state.checked && state.reachable) {
    tone = insecure ? styles.toneWarning : styles.toneOk;
    text = insecure
      ? `Connected over plain HTTP — not for patient use. ${CONFIG.BASE_URL}`
      : `Connected${state.authenticated ? '' : ' — not signed in'}.`;
  }

  return (
    <Pressable onPress={check} style={[styles.banner, tone]} accessibilityRole="button">
      <Text style={styles.text} numberOfLines={2}>{text}</Text>
      <Text style={styles.retry}>Tap to re-check</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
  },
  toneChecking: { backgroundColor: THEME.colors.infoBg, borderBottomColor: THEME.colors.borderSubtle },
  toneOk: { backgroundColor: THEME.colors.successBg, borderBottomColor: THEME.colors.successBorder },
  toneWarning: { backgroundColor: THEME.colors.warningBg, borderBottomColor: THEME.colors.warningBorder },
  toneError: { backgroundColor: THEME.colors.errorBg, borderBottomColor: THEME.colors.errorBorder },
  text: { ...THEME.type.small, color: THEME.colors.textValue, flex: 1 },
  retry: { ...THEME.type.label, fontSize: 11, color: THEME.colors.textLabel, marginLeft: THEME.spacing.md },
});
