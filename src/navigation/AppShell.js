import React, { useEffect, useState } from 'react';
import { View, Text, BackHandler, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SideNav from '../components/SideNav';
import ConnectionBanner from '../components/ConnectionBanner';
import IdentityBar from '../components/IdentityBar';
import QueueScreen from '../screens/QueueScreen';
import VerifyScreen from '../screens/VerifyScreen';
import ReportsScreen from '../screens/ReportsScreen';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import { useSession } from '../store/session';
import { CONFIG } from '../constants/config';
import { THEME } from '../constants/theme';

const Stack = createNativeStackNavigator();

/**
 * The app frame: permanent left rail, connection banner, routed content.
 *
 * The rail sits OUTSIDE the navigator so it never unmounts or animates, and
 * drives it through a container ref. A stack (rather than tabs) because from
 * Phase 3 the queue pushes a prescription, then a dispense, then a check --
 * each a route the pharmacist can back out of.
 */

const SECTIONS = [
  { key: 'Queue', label: 'Queue', glyph: '☰' },
  { key: 'Verify', label: 'Verify', glyph: '✓' },
  { key: 'Reports', label: 'Reports', glyph: '▤' },
  { key: 'Diagnostics', label: 'Status', glyph: '⚙' },
];

export default function AppShell() {
  const navRef = useNavigationContainerRef();
  const [active, setActive] = useState('Queue');
  const { user, signOut, lock } = useSession();

  const go = (key) => {
    setActive(key);
    if (navRef.isReady()) navRef.navigate(key);
  };

  /**
   * The hardware Back button never leaves the app (Phase 10.1).
   *
   * Inside the app it goes back a screen, as it should. At the first screen
   * Android's default is to exit to the launcher, which on a counter tablet
   * puts a signed-in pharmacy session behind whatever the next person opens.
   * Returning true there means "handled, do nothing".
   *
   * This is the JS half of the kiosk. It is NOT a substitute for lock task
   * mode -- Home and Overview are not reported to JS at all, which is exactly
   * why the manifest side exists.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navRef.isReady() && navRef.canGoBack()) {
        navRef.goBack();
      }
      return true;
    });

    return () => sub.remove();
  }, [navRef]);

  return (
    <View style={styles.root}>
      <SideNav
        items={SECTIONS}
        activeKey={active}
        onSelect={go}
        footer={
          <View style={styles.railFooter}>
            <Text style={styles.railFooterText}>v{CONFIG.VERSION}</Text>
          </View>
        }
      />

      <View style={styles.main}>
        <IdentityBar user={user} onSignOut={signOut} onLock={lock} />
        <ConnectionBanner />
        <NavigationContainer
          ref={navRef}
          onStateChange={() => {
            const name = navRef.getCurrentRoute()?.name;
            if (name && name !== active) setActive(name);
          }}
        >
          {/*
            * One boundary per content area, not one around the whole app: a
            * render error in Reports should not take the rail and the identity
            * bar with it, and "Reload this screen" should leave the pharmacist
            * where they were rather than back at sign-in.
            */}
          <ErrorBoundary where="content">
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Queue" component={QueueScreen} />
              <Stack.Screen name="Verify" component={VerifyScreen} />
              <Stack.Screen name="Reports" component={ReportsScreen} />
              <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
            </Stack.Navigator>
          </ErrorBoundary>
        </NavigationContainer>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: THEME.colors.pageBg },
  main: { flex: 1 },
  railFooter: { alignItems: 'center', paddingVertical: THEME.spacing.sm },
  railFooterText: { ...THEME.type.label, fontSize: 10, color: THEME.colors.textOnDarkDim },
});
