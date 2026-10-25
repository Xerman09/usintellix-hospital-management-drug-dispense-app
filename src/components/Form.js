import React from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * Form primitives for the auth screens.
 *
 * Kept here so every field on the dispensing tablet is the same height and the
 * same target size. Inputs are 56dp, not the 40dp a phone form would use.
 */

export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  secure = false,
  autoCapitalize = 'none',
  keyboardType = 'default',
  editable = true,
  maxLength,
  onSubmitEditing,
  returnKeyType = 'next',
  mono = false,
  textAlign,
}) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={editable}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        placeholderTextColor={THEME.colors.textDim}
        style={[
          styles.input,
          mono && styles.inputMono,
          textAlign ? { textAlign } : null,
          !editable && styles.inputDisabled,
          error && styles.inputError,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, busy = false, disabled = false }) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [styles.primary, pressed && !off && styles.primaryPressed, off && styles.primaryOff]}
    >
      {busy ? (
        <ActivityIndicator color={THEME.colors.btnPrimaryText} />
      ) : (
        <Text style={[styles.primaryText, off && styles.offText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondary, pressed && !disabled && styles.secondaryPressed, disabled && styles.secondaryOff]}
    >
      <Text style={[styles.secondaryText, disabled && styles.offText]}>{title}</Text>
    </Pressable>
  );
}

/**
 * A message above a form. `tone` picks the colour: 'error' for a refusal,
 * 'warning' for something the pharmacist must act on (an expired password),
 * 'info' for guidance, 'success' when something worked.
 */
export function Notice({ tone = 'info', title, message }) {
  if (!message && !title) return null;
  const toneStyle = {
    error: { box: styles.noticeError, text: styles.noticeErrorText },
    warning: { box: styles.noticeWarning, text: styles.noticeWarningText },
    success: { box: styles.noticeSuccess, text: styles.noticeSuccessText },
    info: { box: styles.noticeInfo, text: styles.noticeInfoText },
  }[tone] || { box: styles.noticeInfo, text: styles.noticeInfoText };

  return (
    <View style={[styles.notice, toneStyle.box]} accessibilityLiveRegion="polite">
      {title ? <Text style={[styles.noticeTitle, toneStyle.text]}>{title}</Text> : null}
      {message ? <Text style={[styles.noticeText, toneStyle.text]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { marginBottom: THEME.spacing.md },
  label: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.xs },
  input: {
    minHeight: THEME.touch.comfortable,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 2,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.body,
    color: THEME.colors.textTitle,
  },
  inputMono: { ...THEME.type.monoLarge, letterSpacing: 6 },
  inputDisabled: { backgroundColor: THEME.colors.btnDisabledBg, color: THEME.colors.textLabel },
  inputError: { borderColor: THEME.colors.error },
  error: { ...THEME.type.small, color: THEME.colors.error, marginTop: THEME.spacing.xs },
  hint: { ...THEME.type.small, color: THEME.colors.textDim, marginTop: THEME.spacing.xs },

  primary: {
    minHeight: THEME.touch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.btnPrimary,
  },
  primaryPressed: { backgroundColor: THEME.colors.btnPrimaryHover },
  primaryOff: { backgroundColor: THEME.colors.btnDisabledBg },
  primaryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },

  secondary: {
    minHeight: THEME.touch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.btnSecondaryBorder,
    backgroundColor: THEME.colors.btnSecondaryBg,
  },
  secondaryPressed: { backgroundColor: THEME.colors.rowSelected },
  secondaryOff: { backgroundColor: THEME.colors.btnDisabledBg, borderColor: THEME.colors.btnDisabledBg },
  secondaryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnSecondaryText },
  offText: { color: THEME.colors.btnDisabledText },

  notice: {
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    marginBottom: THEME.spacing.lg,
  },
  noticeTitle: { ...THEME.type.bodyStrong, marginBottom: 2 },
  noticeText: { ...THEME.type.small, lineHeight: 20 },
  noticeError: { backgroundColor: THEME.colors.errorBg, borderColor: THEME.colors.errorBorder },
  noticeErrorText: { color: '#991b1b' },
  noticeWarning: { backgroundColor: THEME.colors.warningBg, borderColor: THEME.colors.warningBorder },
  noticeWarningText: { color: '#92400e' },
  noticeSuccess: { backgroundColor: THEME.colors.successBg, borderColor: THEME.colors.successBorder },
  noticeSuccessText: { color: '#065f46' },
  noticeInfo: { backgroundColor: THEME.colors.infoBg, borderColor: THEME.colors.borderSubtle },
  noticeInfoText: { color: THEME.colors.textValue },
});
