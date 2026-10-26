import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import Badge from './Badge';
import { Field, PrimaryButton, SecondaryButton, Notice } from './Form';
import {
  CHECK_POINTS, CHECK_ROUTE, checkability, isDistinctChecker,
  allPointsTicked, untickedPoints, safetyWarnings,
} from '../api/secondCheck';
import { CheckerService, STEP } from '../api/auth';
import { SESSION } from '../api/client';
import { useCheckDispense } from '../query/dispensingQueries';
import { THEME } from '../constants/theme';

/**
 * The second check on a high-alert dispensing.
 *
 * The control this implements is simple and absolute: the person who prepared a
 * high-alert dispensing may not be the person who checks it. The backend
 * enforces that against the acting session's user, so the checker has to be
 * genuinely signed in -- a "confirm" button on the preparer's screen would be
 * no check at all.
 *
 * Two routes, decided by the backend's own `can_check` flag:
 *
 *   SELF         the pharmacist signed in did not prepare this one, so their
 *                own session is a valid second check. No second sign-in.
 *   SECOND_USER  the signed-in pharmacist prepared it, so a colleague signs in
 *                here on a separate session. The preparer is NOT signed out --
 *                see the secondary session in client.js.
 *
 * Failing a check is not a button here: there is no "reject" endpoint. The
 * dispensing is VOIDED instead, which is why the fail path hands back to the
 * caller rather than pretending to do it itself.
 */
export default function CheckSheet({ visible, entry, items, preparerUser, currentUser, onClose, onFail }) {
  const [ticked, setTicked] = useState({});
  const [notes, setNotes] = useState('');
  const [checker, setChecker] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('credentials');
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);
  const [done, setDone] = useState(false);

  const check = useCheckDispense();
  const status = checkability(entry);
  const route = status.route;

  // Fresh state every time the sheet opens, and the checker's session is
  // dropped on close so no live session is left on a shared tablet.
  useEffect(() => {
    if (!visible) return;
    setTicked({});
    setNotes('');
    setChecker(null);
    setUsername('');
    setPassword('');
    setCode('');
    setStage('credentials');
    setAuthNotice(null);
    setDone(false);
    check.reset();
  }, [visible, entry?.id]);

  const close = async () => {
    await CheckerService.signOut();
    onClose?.();
  };

  const signInChecker = async () => {
    if (!username.trim() || !password) {
      setAuthNotice({ tone: 'error', message: 'Enter the checking pharmacist’s username and password.' });
      return;
    }

    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await CheckerService.login(username.trim(), password);
      applyAuth(res.flow);
    } finally {
      setAuthBusy(false);
      setPassword('');
    }
  };

  const verifyChecker = async () => {
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await CheckerService.verify2FA(code.trim());
      applyAuth(res.flow);
    } finally {
      setAuthBusy(false);
    }
  };

  const applyAuth = (flow) => {
    if (flow.step === STEP.AUTHENTICATED) {
      const distinct = isDistinctChecker(flow.user, preparerUser, entry);
      if (!distinct.ok) {
        CheckerService.signOut();
        setAuthNotice({ tone: 'error', title: 'That is the same person', message: distinct.reason });
        return;
      }
      setChecker(flow.user);
      setStage('ready');
      setAuthNotice(null);
      return;
    }

    if (flow.step === STEP.TWO_FACTOR) {
      setStage('twofactor');
      setAuthNotice({
        tone: 'info',
        message: flow.destination
          ? `A code was sent to ${flow.destination}.`
          : 'Enter the 6-digit code.',
      });
      return;
    }

    // A checker whose own credentials need attention cannot sort it out from
    // inside a check sheet -- they are told where to do it instead.
    if (flow.step === STEP.FIRST_LOGIN || flow.step === STEP.EXPIRED || flow.step === STEP.BREACHED) {
      setAuthNotice({
        tone: 'error',
        title: 'That account needs attention first',
        message: 'Sign in on the main screen to set the password, then come back and check this dispensing.',
      });
      return;
    }

    setAuthNotice({ tone: 'error', message: flow.message });
  };

  const confirm = async () => {
    const activeChecker = route === CHECK_ROUTE.SELF ? currentUser : checker;
    if (!activeChecker) return;

    try {
      await check.mutateAsync({
        dispenseId: entry.id,
        confirmed: true,
        notes: notes.trim() || undefined,
        session: route === CHECK_ROUTE.SELF ? SESSION.PRIMARY : SESSION.SECONDARY,
        prescriptionId: entry.prescription_id,
      });
      setDone(true);
      await CheckerService.signOut();
    } catch (e) {
      // The sheet keeps the server's message and stays open.
    }
  };

  const everything = allPointsTicked(ticked);
  const activeChecker = route === CHECK_ROUTE.SELF ? currentUser : checker;
  const ready = everything && Boolean(activeChecker);

  const dispensedItems = Array.isArray(entry?.items) ? entry.items : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Second check</Text>
            <Text style={styles.headerMeta}>{entry?.dispense_number}</Text>
          </View>
          <Badge token={THEME.safety.highAlert} />
        </View>

        {done ? (
          <View style={styles.doneWrap}>
            <Text style={styles.doneTitle}>Checked</Text>
            <Text style={styles.doneText}>
              {entry?.dispense_number} was checked by{' '}
              {[activeChecker?.first_name, activeChecker?.last_name].filter(Boolean).join(' ') ||
                activeChecker?.username}
              . It can be handed over to the patient.
            </Text>
            <PrimaryButton title="Done" onPress={close} />
          </View>
        ) : !status.checkable ? (
          <View style={styles.doneWrap}>
            <Notice tone="info" title="Nothing to check" message={status.reason} />
            <PrimaryButton title="Close" onPress={close} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.pad}>
              <Text style={styles.sectionLabel}>WHAT WAS DISPENSED</Text>
              {dispensedItems.map((i, idx) => (
                <View key={`${entry.id}-${idx}`} style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle}>{i.title}</Text>
                    {i.is_high_alert ? <Badge token={THEME.safety.highAlert} size="sm" /> : null}
                  </View>
                  <Text style={styles.itemMeta}>
                    {i.quantity} {i.unit_name || ''}
                    {i.lot_number ? `  ·  lot ${i.lot_number}` : ''}
                    {i.expires_date ? `  ·  expires ${i.expires_date}` : ''}
                    {i.fill_label ? `  ·  ${i.fill_label}` : ''}
                  </Text>
                </View>
              ))}

              <SafetyNotes items={items} />

              <Text style={[styles.sectionLabel, styles.spaced]}>CONFIRM EACH POINT</Text>
              {CHECK_POINTS.map((point) => {
                const on = Boolean(ticked[point.key]);
                return (
                  <Pressable
                    key={point.key}
                    onPress={() => setTicked((prev) => ({ ...prev, [point.key]: !prev[point.key] }))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.point, on && styles.pointOn, pressed && styles.pointPressed]}
                  >
                    <View style={[styles.box, on && styles.boxOn]}>
                      {on ? <Text style={styles.boxMark}>&#10003;</Text> : null}
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.pointLabel, on && styles.pointLabelOn]}>{point.label}</Text>
                      <Text style={styles.pointHint}>{point.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={[styles.sectionLabel, styles.spaced]}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything the checker wants on the record"
                placeholderTextColor={THEME.colors.textDim}
                multiline
                maxLength={500}
                style={styles.notes}
              />

              <Text style={[styles.sectionLabel, styles.spaced]}>CHECKED BY</Text>

              {route === CHECK_ROUTE.SELF ? (
                <Notice
                  tone="success"
                  title={`${[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.username}`}
                  message="You did not prepare this dispensing, so you can check it yourself. No second sign-in is needed."
                />
              ) : (
                <View style={styles.signIn}>
                  <Text style={styles.signInLead}>
                    You prepared this dispensing, so a second pharmacist must sign in to check it. You
                    stay signed in on this tablet.
                  </Text>

                  {authNotice ? (
                    <Notice tone={authNotice.tone} title={authNotice.title} message={authNotice.message} />
                  ) : null}

                  {checker ? (
                    <Notice
                      tone="success"
                      title={[checker.first_name, checker.last_name].filter(Boolean).join(' ') || checker.username}
                      message="Signed in as the checking pharmacist."
                    />
                  ) : stage === 'twofactor' ? (
                    <>
                      <Field
                        label="6-digit code"
                        value={code}
                        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        mono
                        textAlign="center"
                      />
                      <PrimaryButton title="Verify" onPress={verifyChecker} busy={authBusy} />
                    </>
                  ) : (
                    <>
                      <Field label="Checking pharmacist" value={username} onChangeText={setUsername} />
                      <Field
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        secure
                        returnKeyType="done"
                        onSubmitEditing={signInChecker}
                      />
                      <PrimaryButton title="Sign in to check" onPress={signInChecker} busy={authBusy} />
                    </>
                  )}
                </View>
              )}

              {check.isError ? (
                <View style={styles.spaced}>
                  <Notice tone="error" title="Not checked" message={check.error?.message} />
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.flex}>
                {!everything ? (
                  <Text style={styles.footerNote}>
                    Still to confirm: {untickedPoints(ticked).join(', ')}
                  </Text>
                ) : !activeChecker ? (
                  <Text style={styles.footerNote}>The checking pharmacist must sign in.</Text>
                ) : (
                  <Text style={styles.footerReady}>Ready to confirm.</Text>
                )}
              </View>

              <View style={styles.footerActions}>
                <View style={styles.failButton}>
                  <SecondaryButton title="Fails check — undo it" onPress={() => onFail?.(entry)} />
                </View>
                <View style={styles.confirmButton}>
                  <PrimaryButton
                    title="Confirm check"
                    onPress={confirm}
                    busy={check.isPending}
                    disabled={!ready}
                  />
                </View>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** LASA, controlled class and storage notes for the medicines involved. */
function SafetyNotes({ items }) {
  const warnings = (Array.isArray(items) ? items : [])
    .flatMap((item) => safetyWarnings(item).map((w) => ({ ...w, title: item.title || item.drug_name })))
    .filter((w) => w.key !== 'highAlert');

  if (!warnings.length) return null;

  return (
    <View style={styles.warnings}>
      <Text style={styles.warningsLabel}>BEFORE YOU HAND IT OVER</Text>
      {warnings.map((w, idx) => (
        <Text key={`${w.key}-${idx}`} style={styles.warning}>
          <Text style={styles.warningDrug}>{w.title}: </Text>
          {w.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  pad: { padding: THEME.spacing.lg, paddingBottom: THEME.spacing.xxxl },
  spaced: { marginTop: THEME.spacing.xl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  headerTitle: { ...THEME.type.title, color: THEME.colors.textTitle },
  headerMeta: { ...THEME.type.mono, color: THEME.colors.textLabel, marginTop: 2 },

  sectionLabel: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },

  item: {
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: THEME.spacing.sm },
  itemTitle: { ...THEME.type.bodyStrong, color: THEME.colors.textTitle, flex: 1 },
  itemMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 4 },

  warnings: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.safety.lasa.bg,
    borderWidth: 1,
    borderColor: THEME.safety.lasa.border,
  },
  warningsLabel: { ...THEME.type.label, color: THEME.safety.lasa.fg, marginBottom: THEME.spacing.xs },
  warning: { ...THEME.type.small, color: THEME.safety.lasa.fg, lineHeight: 20, marginTop: 2 },
  warningDrug: { fontWeight: '700' },

  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: THEME.touch.large,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  pointOn: { borderColor: THEME.colors.success, backgroundColor: THEME.colors.successBg },
  pointPressed: { backgroundColor: THEME.colors.rowAlt },
  box: {
    width: 30,
    height: 30,
    borderRadius: THEME.radius.sm,
    borderWidth: 2,
    borderColor: THEME.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: THEME.spacing.md,
  },
  boxOn: { backgroundColor: THEME.colors.success, borderColor: THEME.colors.success },
  boxMark: { color: '#ffffff', fontWeight: '900', fontSize: 18 },
  pointLabel: { ...THEME.type.bodyStrong, color: THEME.colors.textValue },
  pointLabelOn: { color: THEME.colors.textTitle },
  pointHint: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },

  notes: {
    minHeight: 80,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.body,
    color: THEME.colors.textTitle,
    textAlignVertical: 'top',
  },

  signIn: {
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 2,
    borderColor: THEME.colors.brandBlue,
  },
  signInLead: { ...THEME.type.small, color: THEME.colors.textValue, marginBottom: THEME.spacing.md, lineHeight: 20 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  footerNote: { ...THEME.type.small, color: THEME.colors.textLabel },
  footerReady: { ...THEME.type.bodyStrong, color: THEME.colors.success },
  footerActions: { flexDirection: 'row' },
  failButton: { width: 200 },
  confirmButton: { width: 200, marginLeft: THEME.spacing.md },

  doneWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: THEME.spacing.xxl,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
  },
  doneTitle: { ...THEME.type.display, color: THEME.colors.success, textAlign: 'center' },
  doneText: {
    ...THEME.type.body,
    color: THEME.colors.textValue,
    textAlign: 'center',
    marginVertical: THEME.spacing.xl,
    lineHeight: 24,
  },
});
