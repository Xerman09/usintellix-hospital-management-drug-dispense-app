import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, StyleSheet } from 'react-native';
import { PrimaryButton, SecondaryButton, Notice } from './Form';
import { THEME } from '../constants/theme';

/**
 * Ask why, for the two actions the backend refuses without a reason:
 * voiding a dispensing and closing a prescription. Both reasons are stored and
 * read back later (void_reason, close_reason), so the box is deliberately not
 * pre-filled with anything -- a default would end up in the record as if
 * someone had typed it.
 *
 * @param {string} [confirmTone] 'danger' for undoing a dispensing
 */
/**
 * @param {boolean} [optional] the text is a note, not a reason, so an empty one
 *                             is allowed. Used for a refill request, where the
 *                             backend asks for no reason at all.
 */
export default function ReasonPrompt({
  visible,
  title,
  description,
  confirmLabel = 'Confirm',
  busy = false,
  error = null,
  optional = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const trimmed = reason.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {error ? <Notice tone="error" message={error} /> : null}

          <Text style={styles.label}>{optional ? 'NOTE (OPTIONAL)' : 'REASON (REQUIRED)'}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={optional ? 'Anything worth recording' : 'Why is this being done?'}
            placeholderTextColor={THEME.colors.textDim}
            multiline
            maxLength={500}
            style={styles.input}
            autoCapitalize="sentences"
          />

          <View style={styles.actions}>
            <View style={styles.action}>
              <SecondaryButton title="Cancel" onPress={onCancel} disabled={busy} />
            </View>
            <View style={styles.action}>
              <PrimaryButton
                title={confirmLabel}
                onPress={() => onConfirm(trimmed)}
                busy={busy}
                disabled={!optional && !trimmed}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radius.xl,
    backgroundColor: THEME.colors.cardBg,
  },
  title: { ...THEME.type.title, color: THEME.colors.textTitle },
  description: { ...THEME.type.body, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.sm, lineHeight: 24 },
  label: { ...THEME.type.label, color: THEME.colors.textLabel, marginTop: THEME.spacing.lg, marginBottom: THEME.spacing.xs },
  input: {
    minHeight: 96,
    padding: THEME.spacing.md,
    borderWidth: 2,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.body,
    color: THEME.colors.textTitle,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', marginTop: THEME.spacing.lg },
  action: { flex: 1, marginHorizontal: THEME.spacing.xs },
});
