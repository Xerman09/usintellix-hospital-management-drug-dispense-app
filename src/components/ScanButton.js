import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * Barcode entry.
 *
 * Phase 1 ships the SHELL: the button, the sheet, and the manual-entry path,
 * which works now. The camera is wired in Phase 6, together with the three
 * backend lookup endpoints that turn a scanned code into an id -- without
 * those, a scan has nothing to resolve against, so pretending to scan here
 * would be theatre.
 *
 * Manual entry is not a stopgap: it stays in Phase 6 as the permanent
 * fallback for dim light and damaged barcodes.
 *
 * @param {'rx'|'patient'|'lot'} kind      what is being identified
 * @param {(code: string, source: 'manual'|'camera') => void} onCode
 * @param {string} [title]
 * @param {boolean} [disabled]
 */
const PROMPTS = {
  rx: { title: 'Scan prescription', hint: 'Scan the Rx barcode on the prescription slip, or type the Rx number.', placeholder: 'RX-2026-00001' },
  patient: { title: 'Scan patient', hint: 'Scan the patient’s wristband or ID card, or type the patient ID.', placeholder: 'Patient ID' },
  lot: { title: 'Scan lot', hint: 'Scan the barcode on the medicine pack, or type the lot number.', placeholder: 'Lot number' },
};

export default function ScanButton({ kind = 'rx', onCode, title, disabled }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');

  const prompt = PROMPTS[kind] || PROMPTS.rx;

  const submit = () => {
    const code = manual.trim();
    if (!code) return;
    onCode?.(code, 'manual');
    setManual('');
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title || prompt.title}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}
      >
        <Text style={styles.buttonIcon}>&#9707;</Text>
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{title || prompt.title}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{prompt.title}</Text>
            <Text style={styles.sheetHint}>{prompt.hint}</Text>

            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderText}>
                Camera scanning arrives in Phase 6.{'\n'}Use manual entry below.
              </Text>
            </View>

            <Text style={styles.label}>ENTER MANUALLY</Text>
            <TextInput
              value={manual}
              onChangeText={setManual}
              placeholder={prompt.placeholder}
              placeholderTextColor={THEME.colors.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
              onSubmitEditing={submit}
              returnKeyType="done"
            />

            <View style={styles.actions}>
              <Pressable onPress={() => setOpen(false)} style={[styles.action, styles.actionSecondary]}>
                <Text style={styles.actionSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!manual.trim()}
                style={[styles.action, styles.actionPrimary, !manual.trim() && styles.actionDisabled]}
              >
                <Text style={[styles.actionPrimaryText, !manual.trim() && styles.actionDisabledText]}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: THEME.touch.comfortable,
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.brandBlue,
  },
  buttonPressed: { backgroundColor: THEME.colors.brandBlueDark },
  buttonDisabled: { backgroundColor: THEME.colors.btnDisabledBg },
  buttonIcon: { fontSize: 20, color: THEME.colors.btnPrimaryText, marginRight: THEME.spacing.sm },
  buttonText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },
  buttonTextDisabled: { color: THEME.colors.btnDisabledText },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radius.xl,
    backgroundColor: THEME.colors.cardBg,
  },
  sheetTitle: { ...THEME.type.title, color: THEME.colors.textTitle },
  sheetHint: { ...THEME.type.body, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.sm },

  cameraPlaceholder: {
    marginTop: THEME.spacing.lg,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.inputBg,
  },
  cameraPlaceholderText: { ...THEME.type.small, color: THEME.colors.textDim, textAlign: 'center' },

  label: { ...THEME.type.label, color: THEME.colors.textLabel, marginTop: THEME.spacing.lg, marginBottom: THEME.spacing.sm },
  input: {
    minHeight: THEME.touch.comfortable,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 2,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.mono,
    color: THEME.colors.textTitle,
  },

  actions: { flexDirection: 'row', marginTop: THEME.spacing.lg },
  action: {
    flex: 1,
    minHeight: THEME.touch.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
  },
  actionSecondary: {
    marginRight: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.btnSecondaryBorder,
    backgroundColor: THEME.colors.btnSecondaryBg,
  },
  actionSecondaryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnSecondaryText },
  actionPrimary: { marginLeft: THEME.spacing.sm, backgroundColor: THEME.colors.btnPrimary },
  actionPrimaryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },
  actionDisabled: { backgroundColor: THEME.colors.btnDisabledBg },
  actionDisabledText: { color: THEME.colors.btnDisabledText },
});
