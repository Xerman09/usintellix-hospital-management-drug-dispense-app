import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { AuthService } from '../api/auth';
import { hasSecondarySession } from '../api/client';
import { all as allCrashes, clear as clearCrashes, subscribe, summarise } from '../api/crashLog';
import { useSession } from '../store/session';
import { CONFIG, isInsecureTransport } from '../constants/config';
import { THEME } from '../constants/theme';

/**
 * Phase 10.2 -- the screen support asks for.
 *
 * When a counter says "it isn't working", the questions are always the same:
 * which server is it talking to, who is signed in, is the network up, and what
 * did it say when it broke. Without this, answering them means someone walking
 * to the counter with a laptop.
 *
 * It shows no patient data at all. That is deliberate -- this is the one
 * screen likely to be photographed and sent to IT.
 */

function Row({ label, value, tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === 'bad' && styles.bad, tone === 'good' && styles.good]} selectable>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </Text>
    </View>
  );
}

function Section({ title, children, note }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const seconds = (ms) => `${Math.round(ms / 1000)}s`;

export default function DiagnosticsScreen() {
  const { user, locked } = useSession();
  const [crashes, setCrashes] = useState(allCrashes());
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => subscribe(setCrashes), []);

  const testConnection = async () => {
    setProbing(true);
    const started = Date.now();
    const res = await AuthService.me();
    setProbe({
      at: Date.now(),
      ms: Date.now() - started,
      ok: res.ok,
      detail: res.ok ? `signed in as ${res.data?.user?.username ?? '?'}` : `${res.errorKind}: ${res.message}`,
    });
    setProbing(false);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Diagnostics</Text>
      <Text style={styles.subtitle}>
        Nothing on this screen identifies a patient, so it is safe to photograph and send to IT.
      </Text>

      <Section title="This app">
        <Row label="Version" value={`${CONFIG.APP_NAME} ${CONFIG.VERSION}`} />
        <Row label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
        <Row label="Device" value={Constants.deviceName} />
        <Row label="Build" value={Constants.appOwnership === 'expo' ? 'Expo Go (development)' : 'standalone APK'} />
      </Section>

      <Section
        title="Pharmacy server"
        note={
          isInsecureTransport()
            ? 'This tablet is reaching the server over plain HTTP. That is fine on a development machine and must not be used at a counter: prescriptions cross the hospital Wi-Fi in the clear.'
            : null
        }
      >
        <Row label="Address" value={CONFIG.BASE_URL} />
        <Row
          label="Transport"
          value={isInsecureTransport() ? 'HTTP — not safe for a pilot' : 'HTTPS'}
          tone={isInsecureTransport() ? 'bad' : 'good'}
        />
        <Row label="Request timeout" value={seconds(CONFIG.REQUEST_TIMEOUT_MS)} />

        <Pressable onPress={testConnection} disabled={probing} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{probing ? 'Testing…' : 'Test the connection'}</Text>
        </Pressable>

        {probe ? (
          <Row
            label="Last test"
            value={`${probe.ok ? 'reached' : 'failed'} in ${probe.ms} ms — ${probe.detail}`}
            tone={probe.ok ? 'good' : 'bad'}
          />
        ) : null}
      </Section>

      <Section title="Session">
        <Row label="Signed in as" value={user ? `${user.username} (${user.role})` : 'nobody'} />
        <Row label="Screen" value={locked ? 'locked' : 'unlocked'} />
        <Row label="Idle lock after" value={seconds(CONFIG.IDLE_LOCK_MS)} />
        <Row
          label="Checker session"
          value={hasSecondarySession() ? 'open — a second check is in progress' : 'none'}
        />
      </Section>

      <Section
        title="Safety settings"
        note="These are build-time settings. Changing one means a new APK, which is intended: they are safety controls, not preferences."
      >
        <Row
          label="Wristband scan before dispensing"
          value={CONFIG.REQUIRE_PATIENT_SCAN ? 'required' : 'not required'}
          tone={CONFIG.REQUIRE_PATIENT_SCAN ? 'good' : 'bad'}
        />
        <Row label="Queue refresh" value={seconds(CONFIG.QUEUE_POLL_MS)} />
      </Section>

      <Section
        title="Kiosk mode"
        note={
          'Whether Android has this app pinned cannot be read from inside it without a native module, '
          + 'so this is not a live reading. Check it the way a pharmacist would: press Home. If the tablet '
          + 'is provisioned, nothing happens. tools/KIOSK-SETUP.md has the provisioning steps.'
        }
      >
        <Row label="Manifest" value="lockTaskMode=if_whitelisted (applied at build time)" />
      </Section>

      <Section
        title={`Crashes this session (${crashes.length})`}
        note="Kept on this tablet only and wiped when the app restarts. Nothing is sent anywhere. Patient numbers, prescription numbers and e-mail addresses are masked."
      >
        {crashes.length === 0 ? (
          <Text style={styles.none}>None.</Text>
        ) : (
          <>
            {crashes.map((c) => (
              <View key={c.id} style={styles.crash}>
                <Text style={styles.crashLine}>{summarise(c)}</Text>
                {c.stack ? <Text style={styles.stack} selectable>{c.stack}</Text> : null}
              </View>
            ))}
            <Pressable onPress={clearCrashes} style={styles.buttonQuiet} accessibilityRole="button">
              <Text style={styles.buttonQuietText}>Clear the list</Text>
            </Pressable>
          </>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.colors.pageBg },
  content: { padding: THEME.spacing.xl, paddingBottom: THEME.spacing.xxxl },
  title: { ...THEME.type.heading, color: THEME.colors.textTitle },
  subtitle: { ...THEME.type.small, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.xs },

  section: { marginTop: THEME.spacing.xl },
  sectionTitle: { ...THEME.type.label, color: THEME.colors.textLabel },
  sectionNote: { ...THEME.type.small, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.xs, lineHeight: 18 },
  sectionBody: {
    marginTop: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.cardBg,
    paddingHorizontal: THEME.spacing.md,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: THEME.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  rowLabel: { ...THEME.type.small, color: THEME.colors.textLabel, width: 210 },
  rowValue: { ...THEME.type.body, color: THEME.colors.textValue, flex: 1 },
  bad: { color: THEME.colors.error, fontWeight: '600' },
  good: { color: THEME.colors.success, fontWeight: '600' },

  button: {
    marginVertical: THEME.spacing.md,
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.lg,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.btnPrimary,
  },
  buttonText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },
  buttonQuiet: {
    marginVertical: THEME.spacing.md,
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.lg,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.btnSecondaryBorder,
    backgroundColor: THEME.colors.btnSecondaryBg,
  },
  buttonQuietText: { ...THEME.type.bodyStrong, color: THEME.colors.btnSecondaryText },

  none: { ...THEME.type.body, color: THEME.colors.textDim, paddingVertical: THEME.spacing.md },
  crash: { paddingVertical: THEME.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.colors.borderSubtle },
  crashLine: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
  stack: { ...THEME.type.mono, fontSize: 11, color: THEME.colors.textDim, marginTop: THEME.spacing.xs },
});
