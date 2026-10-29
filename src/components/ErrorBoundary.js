import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { record } from '../api/crashLog';
import { THEME } from '../constants/theme';

/**
 * Phase 10.2 -- what the pharmacist sees when the app breaks.
 *
 * Without this, a render error unmounts the whole tree and leaves a blank
 * white screen mid-dispense. The pharmacist has no idea whether the medicine
 * was given, and nothing tells them what to do.
 *
 * So the recovery screen says the two things that actually matter at a
 * counter: nothing was lost that had already been saved, and how to check.
 * "Reload" remounts the subtree, which is enough for a transient render error
 * and keeps the session -- signing them out would be a worse outcome than the
 * crash.
 *
 * It deliberately does NOT show the stack. The pharmacist cannot act on it and
 * it may carry a patient's details; it goes to the crash log, redacted, where
 * Diagnostics shows it to whoever is supporting them.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crash: null };
  }

  static getDerivedStateFromError() {
    // A placeholder until componentDidCatch records the real entry: this runs
    // first and must not have side effects.
    return { crash: { id: 'pending' } };
  }

  componentDidCatch(error, info) {
    const crash = record(error, {
      where: this.props.where || 'screen',
      fatal: false,
    });
    // The component stack says which screen broke; it is already redacted by
    // record() for anything that looks like an identifier.
    crash.componentStack = String(info?.componentStack || '').split('\n').slice(0, 6).join('\n');
    this.setState({ crash });
    this.props.onCrash?.(crash);
  }

  reset = () => this.setState({ crash: null });

  render() {
    const { crash } = this.state;
    if (!crash) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong on this screen</Text>
          <Text style={styles.body}>
            Anything already saved is safe — a dispensing is only recorded once the
            pharmacy server has confirmed it. If you were in the middle of giving a
            medicine, reload and check the prescription's history before giving it
            again.
          </Text>

          <Pressable onPress={this.reset} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Reload this screen</Text>
          </Pressable>

          <Text style={styles.reference}>
            Reference {crash.id}. The details are under Diagnostics.
          </Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl, backgroundColor: THEME.colors.pageBg },
  card: {
    maxWidth: 560,
    padding: THEME.spacing.xxl,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.errorBorder,
  },
  title: { ...THEME.type.subheading, color: THEME.colors.textTitle },
  body: { ...THEME.type.body, color: THEME.colors.textValue, marginTop: THEME.spacing.md, lineHeight: 22 },
  button: {
    marginTop: THEME.spacing.xl,
    minHeight: THEME.touch.comfortable,
    paddingHorizontal: THEME.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.btnPrimary,
  },
  buttonText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },
  reference: { ...THEME.type.small, color: THEME.colors.textDim, marginTop: THEME.spacing.md, textAlign: 'center' },
});
