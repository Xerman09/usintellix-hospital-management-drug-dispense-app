import React from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Text } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * Master-detail layout: the queue on the left, the selected prescription on
 * the right. This is the single biggest structural difference from the phone
 * app, which stacks modals instead.
 *
 * On a narrow screen (a small tablet, or portrait) there is not room for both,
 * so it shows one pane at a time with a back affordance -- the layout degrades
 * instead of cramming two columns into 400dp.
 *
 * @param {React.ReactNode} master   the list pane
 * @param {React.ReactNode} detail   the detail pane
 * @param {boolean} hasSelection     whether anything is selected (drives the
 *                                   narrow-screen pane choice and the placeholder)
 * @param {() => void} onBack        clear the selection, narrow screens only
 * @param {string} [emptyDetailText] shown in the detail pane with no selection
 */
export default function SplitView({
  master,
  detail,
  hasSelection = false,
  onBack,
  emptyDetailText = 'Select a prescription from the list.',
}) {
  const { width } = useWindowDimensions();
  const isNarrow = width < THEME.layout.splitBreakpoint;

  if (isNarrow) {
    if (!hasSelection) return <View style={styles.single}>{master}</View>;
    return (
      <View style={styles.single}>
        <Pressable
          onPress={onBack}
          style={styles.backBar}
          accessibilityRole="button"
          accessibilityLabel="Back to the list"
        >
          <Text style={styles.backText}>&#8592;  Back to list</Text>
        </Pressable>
        <View style={styles.flex}>{detail}</View>
      </View>
    );
  }

  const masterWidth = Math.max(
    THEME.layout.masterMinWidth,
    Math.round(width * THEME.layout.masterRatio)
  );

  return (
    <View style={styles.row}>
      <View style={[styles.master, { width: masterWidth }]}>{master}</View>
      <View style={styles.detail}>
        {hasSelection ? (
          detail
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{emptyDetailText}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: THEME.colors.pageBg },
  single: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  master: {
    borderRightWidth: 1,
    borderRightColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  detail: { flex: 1, backgroundColor: THEME.colors.pageBg },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },
  placeholderText: { ...THEME.type.body, color: THEME.colors.textDim, textAlign: 'center' },
  backBar: {
    height: THEME.touch.min,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  backText: { ...THEME.type.bodyStrong, color: THEME.colors.brandBlue },
});
