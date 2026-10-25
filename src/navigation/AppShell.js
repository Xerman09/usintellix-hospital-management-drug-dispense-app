import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SideNav from '../components/SideNav';
import ConnectionBanner from '../components/ConnectionBanner';
import QueueScreen from '../screens/QueueScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
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
];

export default function AppShell() {
  const navRef = useNavigationContainerRef();
  const [active, setActive] = useState('Queue');

  const go = (key) => {
    setActive(key);
    if (navRef.isReady()) navRef.navigate(key);
  };

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
        <ConnectionBanner />
        <NavigationContainer
          ref={navRef}
          onStateChange={() => {
            const name = navRef.getCurrentRoute()?.name;
            if (name && name !== active) setActive(name);
          }}
        >
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Queue" component={QueueScreen} />
            <Stack.Screen name="Verify">
              {() => (
                <PlaceholderScreen
                  phase="PHASE 8"
                  title="Clinical verification"
                  description="The pharmacist verification queue -- renal adjustment, patient weight, clinical indication and allergy cross-check -- is read from /dispensing/clinical-verifications in Phase 8."
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Reports">
              {() => (
                <PlaceholderScreen
                  phase="PHASE 9"
                  title="Pharmacy reports"
                  description="Dispensing log, dangerous drugs register, unfilled prescriptions and the by-prescriber report, from /pharmacy-reports in Phase 9."
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
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
