import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppShell from './src/navigation/AppShell';
import LoginScreen from './src/screens/LoginScreen';
import LockScreen from './src/screens/LockScreen';
import useIdleTimer from './src/hooks/useIdleTimer';
import { SessionProvider, useSession } from './src/store/session';
import { queryClient } from './src/query/queryClient';
import { CONFIG } from './src/constants/config';
import { THEME } from './src/constants/theme';

/**
 * USIntellix Pharmacy Tablet.
 *
 * Phase 2: nothing is reachable without signing in. The gate below decides
 * between the sign-in screen, the idle lock and the app, and it is the only
 * place that decision is made.
 */
function Gate() {
  const { user, locked, restoring, isAuthenticated, lock, restore } = useSession();

  // Lock after inactivity, because the tablet is shared. Only armed while
  // someone is actually signed in and unlocked.
  const { notifyActivity } = useIdleTimer({
    timeoutMs: CONFIG.IDLE_LOCK_MS,
    onIdle: lock,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    restore();
  }, [restore]);

  if (restoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
        <Text style={styles.splashText}>{CONFIG.APP_NAME}</Text>
      </View>
    );
  }

  if (!user) return <LoginScreen />;
  if (locked) return <LockScreen />;

  // Capture-phase only: every touch resets the idle clock and still reaches
  // the control the pharmacist actually pressed.
  return (
    <View
      style={styles.flex}
      onStartShouldSetResponderCapture={() => {
        notifyActivity();
        return false;
      }}
    >
      <AppShell />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar barStyle="light-content" backgroundColor={THEME.colors.railBg} />
          <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
            <Gate />
          </SafeAreaView>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.pageBg },
  splashText: { ...THEME.type.heading, color: THEME.colors.textLabel, marginTop: THEME.spacing.lg },
});
