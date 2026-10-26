import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Notice, PrimaryButton, SecondaryButton } from './Form';
import { SEVERITY } from '../api/scanVerdict';
import { THEME } from '../constants/theme';

/**
 * Scanning a code at the counter.
 *
 * The camera is the fast path; typing is the permanent fallback, not a stopgap.
 * Pharmacy barcodes get scuffed, fridges are badly lit, and a tablet camera
 * that cannot read a pack must never be the reason a patient waits.
 *
 * Barcode types are limited to what pharmacy labels actually carry: EAN/UPC for
 * the product barcode, Code 128/39 for lot and patient labels, and QR/Data
 * Matrix for 2D codes. Narrowing the list makes decoding faster and stops the
 * camera latching onto something irrelevant in frame.
 *
 * `onResolve` is given the raw code and must return a verdict (see
 * scanVerdict.js). Two callbacks come back, and the difference matters:
 *
 *   onVerdict  EVERY verdict, including STOP. The caller needs to know a
 *              mismatch happened so it can refuse to go on after the sheet is
 *              closed -- a wrong-patient scan that is merely dismissed must
 *              still block the dispensing.
 *   onAccept   only a verdict the pharmacist may act on: a clean pass, or a
 *              warning they explicitly chose to continue past. A STOP never
 *              reaches it, so the caller cannot treat one as a pass.
 */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'datamatrix', 'itf14'];

const PROMPTS = {
  rx: {
    title: 'Scan prescription',
    hint: 'Scan the barcode on the prescription slip, or type the Rx number.',
    placeholder: 'RX-2026-00001',
  },
  patient: {
    title: 'Scan patient',
    hint: 'Scan the wristband or ID card, or type the patient number.',
    placeholder: 'PAT-000001',
  },
  lot: {
    title: 'Scan the pack',
    hint: 'Scan the barcode on the medicine pack, or type the lot number.',
    placeholder: 'Lot number or barcode',
  },
};

export default function ScanButton({
  kind = 'rx',
  title,
  disabled,
  onResolve,
  onVerdict,
  onAccept,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  // Cameras fire the same barcode many times a second; one resolve per sheet.
  const handling = useRef(false);
  const lastCode = useRef('');

  const prompt = PROMPTS[kind] || PROMPTS.rx;

  useEffect(() => {
    if (!open) return;
    setManual('');
    setVerdict(null);
    setBusy(false);
    setCameraOn(true);
    handling.current = false;
  }, [open]);

  const resolve = async (code, source) => {
    if (handling.current || !code) return;
    handling.current = true;
    lastCode.current = code;
    setBusy(true);
    setCameraOn(false);

    try {
      const next = await onResolve(code, source);
      setVerdict(next);
      onVerdict?.(next, code, source);

      // A clean pass needs no confirmation tap: the scan WAS the confirmation.
      if (next && next.severity === SEVERITY.OK) {
        onAccept?.(next, code, source);
        setOpen(false);
      }
    } catch (e) {
      const failed = {
        severity: SEVERITY.STOP,
        blocking: true,
        title: 'Scan failed',
        message: 'The code could not be checked. Try again.',
      };
      setVerdict(failed);
      onVerdict?.(failed, code, source);
    } finally {
      setBusy(false);
      handling.current = false;
    }
  };

  const retry = () => {
    setVerdict(null);
    onVerdict?.(null, lastCode.current, 'retry');
    setManual('');
    setCameraOn(true);
    handling.current = false;
  };

  const tone = {
    [SEVERITY.OK]: 'success',
    [SEVERITY.WARN]: 'warning',
    [SEVERITY.STOP]: 'error',
  }[verdict?.severity] || 'info';

  const granted = permission?.granted;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title || prompt.title}
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonCompact,
          pressed && styles.buttonPressed,
          disabled && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonIcon}>&#9707;</Text>
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{title || prompt.title}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{prompt.title}</Text>
            <Text style={styles.sheetHint}>{prompt.hint}</Text>

            {verdict ? (
              <View style={styles.verdictWrap}>
                <Notice tone={tone} title={verdict.title} message={verdict.message} />
                {verdict.severity === SEVERITY.STOP ? (
                  <Text style={styles.stopNote}>
                    This cannot be accepted. Scan the right one, or close and check.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.cameraBox}>
                {granted === false ? (
                  <View style={styles.cameraFallback}>
                    <Text style={styles.cameraFallbackText}>
                      The camera is not allowed for this app, so scanning is unavailable. Type the code
                      below instead.
                    </Text>
                    <SecondaryButton title="Allow the camera" onPress={requestPermission} />
                  </View>
                ) : !granted ? (
                  <View style={styles.cameraFallback}>
                    <Text style={styles.cameraFallbackText}>The camera is needed to scan.</Text>
                    <PrimaryButton title="Turn on the camera" onPress={requestPermission} />
                  </View>
                ) : cameraOn ? (
                  <>
                    <CameraView
                      style={styles.camera}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
                      onBarcodeScanned={({ data }) => resolve(data, 'camera')}
                    />
                    <View style={styles.reticle} pointerEvents="none" />
                  </>
                ) : (
                  <View style={styles.cameraFallback}>
                    <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
                  </View>
                )}
              </View>
            )}

            {!verdict || verdict.severity !== SEVERITY.OK ? (
              <>
                <Text style={styles.label}>
                  {verdict ? 'TRY ANOTHER CODE' : 'OR ENTER IT MANUALLY'}
                </Text>
                <TextInput
                  value={manual}
                  onChangeText={setManual}
                  placeholder={prompt.placeholder}
                  placeholderTextColor={THEME.colors.textDim}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  onSubmitEditing={() => resolve(manual.trim(), 'manual')}
                  returnKeyType="done"
                  editable={!busy}
                />
              </>
            ) : null}

            <View style={styles.actions}>
              <View style={styles.action}>
                <SecondaryButton title="Close" onPress={() => setOpen(false)} disabled={busy} />
              </View>
              {verdict?.severity === SEVERITY.WARN ? (
                <>
                  <View style={styles.action}>
                    <SecondaryButton title="Scan again" onPress={retry} disabled={busy} />
                  </View>
                  <View style={styles.action}>
                    {/* A warning is not a refusal: the pharmacist may still need
                        to open a cancelled or closed prescription to see why. */}
                    <PrimaryButton
                      title="Continue anyway"
                      onPress={() => {
                        onAccept?.(verdict, lastCode.current, 'manual');
                        setOpen(false);
                      }}
                    />
                  </View>
                </>
              ) : verdict ? (
                <View style={styles.action}>
                  <PrimaryButton title="Scan again" onPress={retry} busy={busy} />
                </View>
              ) : (
                <View style={styles.action}>
                  <PrimaryButton
                    title="Check code"
                    onPress={() => resolve(manual.trim(), 'manual')}
                    busy={busy}
                    disabled={!manual.trim()}
                  />
                </View>
              )}
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
  buttonCompact: { minHeight: THEME.touch.min, paddingHorizontal: THEME.spacing.md },
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
    maxWidth: 560,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radius.xl,
    backgroundColor: THEME.colors.cardBg,
  },
  sheetTitle: { ...THEME.type.title, color: THEME.colors.textTitle },
  sheetHint: { ...THEME.type.body, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.sm },

  cameraBox: {
    marginTop: THEME.spacing.lg,
    height: 260,
    borderRadius: THEME.radius.lg,
    overflow: 'hidden',
    backgroundColor: THEME.colors.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: { ...StyleSheet.absoluteFillObject },
  reticle: {
    width: '70%',
    height: 110,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: THEME.radius.md,
  },
  cameraFallback: { padding: THEME.spacing.lg, alignItems: 'center' },
  cameraFallbackText: {
    ...THEME.type.small,
    color: THEME.colors.textOnDark,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
    lineHeight: 20,
  },

  verdictWrap: { marginTop: THEME.spacing.lg },
  stopNote: { ...THEME.type.small, color: THEME.colors.error, fontWeight: '700', marginTop: -THEME.spacing.sm },

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
  action: { flex: 1, marginHorizontal: THEME.spacing.xs },
});
