import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Field, PrimaryButton, SecondaryButton, Notice } from './Form';
import { AuthService, STEP } from '../api/auth';
import { CONFIG } from '../constants/config';
import { THEME } from '../constants/theme';

/**
 * Every way into this app: sign in, 2FA, the three HIPAA credential flows, and
 * the lockout notice.
 *
 * One component rather than six screens because the backend decides which step
 * comes next -- a login can land on any of them -- and that decision is read
 * from `flow.step` (authFlow.js), never re-derived here.
 *
 * Used twice:
 *   mode="login"   the sign-in screen
 *   mode="unlock"  the idle lock, with the username fixed and no way out
 *                  except signing in or signing out
 */
export default function AuthFlow({ mode = 'login', lockedUsername = '', onAuthenticated, onSignOut }) {
  const isUnlock = mode === 'unlock';

  const [step, setStep] = useState('credentials');
  const [flow, setFlow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});

  const [username, setUsername] = useState(lockedUsername);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Shared by the three password flows.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [breachWarning, setBreachWarning] = useState(null);

  const [resendIn, setResendIn] = useState(0);
  const [lockRemaining, setLockRemaining] = useState(0);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /**
   * Two independent countdowns, deliberately not sharing a timer: the resend
   * cooldown ticks in seconds and the lockout in minutes, and one interval
   * serving both would run the lockout down sixty times too fast.
   */
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn > 0]);

  useEffect(() => {
    if (lockRemaining <= 0) return undefined;
    const t = setInterval(() => setLockRemaining((m) => (m > 0 ? m - 1 : 0)), 60000);
    return () => clearInterval(t);
  }, [lockRemaining > 0]);

  const resetPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNewUsername('');
    setConfirmEmail('');
    setBreachWarning(null);
  };

  /** Act on the backend's verdict. The single place `step` is decided. */
  const applyFlow = useCallback((next) => {
    if (!mounted.current) return;
    setFlow(next);
    setErrors(next.errors || {});

    switch (next.step) {
      case STEP.AUTHENTICATED:
        setPassword('');
        setCode('');
        resetPasswordFields();
        setNotice(null);
        onAuthenticated?.(next.user);
        return;

      case STEP.TWO_FACTOR:
        setStep('twofactor');
        setResendIn(next.resendIn || 0);
        setNotice({
          tone: 'info',
          title: 'Verification code sent',
          message: next.destination
            ? `A 6-digit code was sent to ${next.destination}. It expires in ${Math.round((next.expiresIn || 300) / 60)} minutes.`
            : 'Enter the 6-digit code to continue.',
        });
        return;

      case STEP.FIRST_LOGIN:
        setStep('firstlogin');
        setNewUsername(username);
        setNotice({
          tone: 'warning',
          title: 'Set up your account',
          message: 'Before dispensing, choose your own username and password and confirm your email address.',
        });
        return;

      case STEP.EXPIRED:
        setStep('expired');
        resetPasswordFields();
        setNotice({
          tone: 'warning',
          title: `Password expired after ${next.daysOld} days`,
          message: next.message,
        });
        return;

      case STEP.BREACHED:
        setStep('breached');
        resetPasswordFields();
        setNotice({
          tone: 'error',
          title: 'This password is known to be compromised',
          message: next.message,
        });
        return;

      case STEP.LOCKED:
        setStep('locked');
        setLockRemaining(next.remainingMinutes || 0);
        setNotice({ tone: 'error', title: 'Account locked', message: next.message });
        return;

      case STEP.WRONG_APP:
      case STEP.FORBIDDEN:
        setStep('credentials');
        setPassword('');
        setNotice({ tone: 'error', title: 'Wrong app for this account', message: next.message });
        return;

      default:
        setStep((s) => (s === 'credentials' ? 'credentials' : s));
        setNotice({ tone: 'error', message: next.message });
    }
  }, [onAuthenticated, username]);

  const run = async (fn) => {
    setBusy(true);
    setNotice(null);
    try {
      applyFlow((await fn()).flow);
    } catch (e) {
      // apiRequest resolves rather than throws, so this is a genuine bug or an
      // unexpected shape. Never leave the pharmacist on a dead spinner.
      if (mounted.current) {
        setNotice({ tone: 'error', message: 'Something went wrong signing in. Please try again.' });
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const submitCredentials = () => {
    if (!username.trim() || !password) {
      setNotice({ tone: 'error', message: 'Enter your username and password.' });
      return;
    }
    run(() => AuthService.login(username.trim(), password));
  };

  const submit2FA = () => {
    if (code.trim().length < 6) {
      setNotice({ tone: 'error', message: 'Enter the 6-digit code.' });
      return;
    }
    run(() => AuthService.verify2FA(code.trim()));
  };

  const resend = async () => {
    setBusy(true);
    const res = await AuthService.resend2FA();
    if (!mounted.current) return;
    setBusy(false);
    if (res.ok) {
      setResendIn(Number(res.data?.resend_in ?? 60));
      setNotice({ tone: 'success', message: 'A new code is on its way.' });
    } else {
      setNotice({ tone: 'error', message: res.message });
    }
  };

  /** Shared validation for the three flows that set a new password. */
  const passwordProblem = () => {
    if (!newPassword) return 'Enter a new password.';
    if (newPassword !== confirmPassword) return 'The two new passwords do not match.';
    if (newPassword === currentPassword) return 'The new password must be different from the current one.';
    return null;
  };

  /** Warn before submitting, using the backend's own breach list. */
  const checkBreach = async (value) => {
    setNewPassword(value);
    setBreachWarning(null);
    if (value.length < 8) return;
    const res = await AuthService.checkPasswordBreach(value);
    if (mounted.current && res.breached) {
      setBreachWarning(
        `This password appears in known breaches (${res.count.toLocaleString()} times). Choose a different one.`
      );
    }
  };

  const submitFirstLogin = () => {
    const problem = passwordProblem();
    if (problem) return setNotice({ tone: 'error', message: problem });
    if (!newUsername.trim()) return setNotice({ tone: 'error', message: 'Choose a username.' });
    if (!confirmEmail.trim()) return setNotice({ tone: 'error', message: 'Confirm your email address.' });

    return run(() =>
      AuthService.completeFirstLogin({
        current_password: currentPassword || password,
        username: newUsername.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
        confirm_email: confirmEmail.trim(),
      })
    );
  };

  const submitPasswordRenewal = (which) => {
    const problem = passwordProblem();
    if (problem) return setNotice({ tone: 'error', message: problem });

    const payload = {
      user_id: flow?.userId ?? undefined,
      username: flow?.username || username.trim(),
      current_password: currentPassword || password,
      new_password: newPassword,
      confirm_password: confirmPassword,
    };

    return run(() =>
      which === 'breached'
        ? AuthService.updateBreachedPassword(payload)
        : AuthService.updateExpiredPassword(payload)
    );
  };

  const backToCredentials = () => {
    setStep('credentials');
    setFlow(null);
    setCode('');
    setPassword('');
    resetPasswordFields();
    setNotice(null);
    setErrors({});
  };

  // ---------------------------------------------------------------- render

  const newPasswordFields = (
    <>
      <Field
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secure
        error={errors.current_password}
        hint={password ? 'Already entered — leave blank to reuse it.' : undefined}
      />
      <Field
        label="New password"
        value={newPassword}
        onChangeText={checkBreach}
        secure
        error={errors.new_password || breachWarning}
      />
      <Field
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secure
        error={errors.confirm_password}
        returnKeyType="done"
      />
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>{CONFIG.APP_NAME}</Text>
        <Text style={styles.subtitle}>
          {isUnlock ? 'Locked — confirm it is still you' : CONFIG.APP_SUBTITLE}
        </Text>

        {notice ? <Notice tone={notice.tone} title={notice.title} message={notice.message} /> : null}

        {step === 'credentials' ? (
          <>
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              editable={!isUnlock}
              error={errors.username}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secure
              error={errors.password}
              returnKeyType="done"
              onSubmitEditing={submitCredentials}
            />
            <PrimaryButton title={isUnlock ? 'Unlock' : 'Sign in'} onPress={submitCredentials} busy={busy} />
            {isUnlock ? (
              <View style={styles.spacer}>
                <SecondaryButton title="Sign out instead" onPress={onSignOut} disabled={busy} />
              </View>
            ) : null}
          </>
        ) : null}

        {step === 'twofactor' ? (
          <>
            <Field
              label="6-digit code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              mono
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={submit2FA}
            />

            {flow?.devCode ? (
              <Notice
                tone="warning"
                title="Email is not configured on this server"
                message={`The code is ${flow.devCode}. The server returned it directly because it could not send the email — this is not secure, and must be fixed before the pilot.`}
              />
            ) : null}

            <PrimaryButton title="Verify" onPress={submit2FA} busy={busy} />
            <View style={styles.spacer}>
              <SecondaryButton
                title={resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                onPress={resend}
                disabled={busy || resendIn > 0}
              />
            </View>
            <View style={styles.spacer}>
              <SecondaryButton title="Start over" onPress={backToCredentials} disabled={busy} />
            </View>
          </>
        ) : null}

        {step === 'firstlogin' ? (
          <>
            <Field label="Choose a username" value={newUsername} onChangeText={setNewUsername} error={errors.username} />
            {newPasswordFields}
            <Field
              label="Confirm your email address"
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              keyboardType="email-address"
              error={errors.confirm_email}
            />
            <PrimaryButton title="Save and continue" onPress={submitFirstLogin} busy={busy} />
          </>
        ) : null}

        {step === 'expired' || step === 'breached' ? (
          <>
            {newPasswordFields}
            <PrimaryButton
              title="Set new password and sign in"
              onPress={() => submitPasswordRenewal(step)}
              busy={busy}
            />
            <View style={styles.spacer}>
              <SecondaryButton title="Back" onPress={backToCredentials} disabled={busy} />
            </View>
          </>
        ) : null}

        {step === 'locked' ? (
          <>
            <Text style={styles.lockText}>
              {lockRemaining > 0
                ? `Try again in about ${lockRemaining} minute${lockRemaining === 1 ? '' : 's'}, or ask IT to unlock the account.`
                : 'The lockout should have expired. Try signing in again.'}
            </Text>
            <PrimaryButton title="Back to sign in" onPress={backToCredentials} />
          </>
        ) : null}

        <Text style={styles.version}>
          v{CONFIG.VERSION}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.xl,
    backgroundColor: THEME.colors.pageBg,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radius.xl,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  brand: { ...THEME.type.display, color: THEME.colors.textTitle },
  subtitle: { ...THEME.type.body, color: THEME.colors.textSubtitle, marginBottom: THEME.spacing.xl },
  spacer: { marginTop: THEME.spacing.sm },
  lockText: { ...THEME.type.body, color: THEME.colors.textValue, marginBottom: THEME.spacing.lg, lineHeight: 24 },
  version: { ...THEME.type.small, color: THEME.colors.textDim, textAlign: 'center', marginTop: THEME.spacing.lg },
});
