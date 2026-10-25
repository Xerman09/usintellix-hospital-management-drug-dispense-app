import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppShell from './src/navigation/AppShell';
import { SessionProvider, useSession } from './src/store/session';
import { queryClient } from './src/query/queryClient';
import { THEME } from './src/constants/theme';

/**
 * USIntellix Pharmacy Tablet.
 *
 * PHASE 1 (this scaffold) boots straight into the shell: there is no login
 * gate yet, because Phase 2 builds the authentication screens. The session
 * plumbing underneath is real -- a stored cookie is restored on start and a
 * 401 from anywhere clears it -- so Phase 2 adds the gate without rewiring
 * what is here.
 */
function Boot() {
  const { restore, bindUnauthorized } = useSession();

  useEffect(() => {
    bindUnauthorized();
    restore();
  }, [bindUnauthorized, restore]);

  return <AppShell />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar barStyle="light-content" backgroundColor={THEME.colors.railBg} />
          <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
            <Boot />
          </SafeAreaView>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.colors.pageBg },
});
