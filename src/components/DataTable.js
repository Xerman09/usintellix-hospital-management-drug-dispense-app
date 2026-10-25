import React from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * Dense, touch-scrollable table for the queues and the lot lists.
 *
 * Rows are at least 56dp high (THEME.touch.comfortable) because they are
 * tapped on the dispensing path, sometimes with gloves -- a 40dp row looks
 * tidier and gets mis-tapped.
 *
 * A row can be disabled with a reason: that is how an expired, recalled or
 * quarantined lot appears in the lot picker. It stays visible and says why it
 * cannot be used, rather than vanishing and leaving the pharmacist wondering
 * where the stock went.
 *
 * @param {Array<{key: string, title: string, width?: number, flex?: number,
 *                align?: 'left'|'right'|'center', render?: (row) => React.ReactNode}>} columns
 * @param {Array<Object>} rows
 * @param {(row: Object) => string|number} keyExtractor
 * @param {(row: Object) => void} [onSelect]
 * @param {string|number} [selectedKey]
 * @param {(row: Object) => ?string} [disabledReason] non-null disables the row
 * @param {boolean} [loading]
 * @param {string} [emptyText]
 * @param {React.ReactNode} [footer]
 */
export default function DataTable({
  columns,
  rows,
  keyExtractor,
  onSelect,
  selectedKey,
  disabledReason,
  loading = false,
  emptyText = 'Nothing to show.',
  footer,
}) {
  const renderCell = (col, row) => {
    if (col.render) return col.render(row);
    const value = row[col.key];
    return (
      <Text style={[styles.cellText, col.align === 'right' && styles.alignRight]} numberOfLines={2}>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </Text>
    );
  };

  const cellStyle = (col) => [
    styles.cell,
    col.width ? { width: col.width } : { flex: col.flex || 1 },
    col.align === 'right' && styles.cellRight,
    col.align === 'center' && styles.cellCenter,
  ];

  const renderRow = ({ item, index }) => {
    const reason = disabledReason ? disabledReason(item) : null;
    const disabled = Boolean(reason);
    const selected = keyExtractor(item) === selectedKey;

    return (
      <Pressable
        onPress={disabled || !onSelect ? undefined : () => onSelect(item)}
        disabled={disabled || !onSelect}
        accessibilityRole={onSelect ? 'button' : undefined}
        accessibilityState={{ selected, disabled }}
        style={({ pressed }) => [
          styles.row,
          index % 2 === 1 && styles.rowAlt,
          selected && styles.rowSelected,
          disabled && styles.rowDisabled,
          pressed && !disabled && styles.rowPressed,
        ]}
      >
        <View style={styles.rowCells}>
          {columns.map((col) => (
            <View key={col.key} style={cellStyle(col)}>
              {renderCell(col, item)}
            </View>
          ))}
        </View>
        {disabled ? <Text style={styles.disabledReason}>{reason}</Text> : null}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {columns.map((col) => (
          <View key={col.key} style={cellStyle(col)}>
            <Text style={[styles.headerText, col.align === 'right' && styles.alignRight]}>
              {col.title.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(keyExtractor(item))}
        renderItem={renderRow}
        ListEmptyComponent={
          <View style={styles.centre}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        }
        ListFooterComponent={footer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },
  emptyText: { ...THEME.type.body, color: THEME.colors.textDim, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.md,
    height: 40,
    backgroundColor: THEME.colors.rowAlt,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderStrong,
  },
  headerText: { ...THEME.type.label, color: THEME.colors.textLabel },

  row: {
    minHeight: THEME.touch.comfortable,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.cardBg,
  },
  rowCells: { flexDirection: 'row', alignItems: 'center' },
  rowAlt: { backgroundColor: THEME.colors.rowAlt },
  rowPressed: { backgroundColor: THEME.colors.rowSelected },
  rowSelected: {
    backgroundColor: THEME.colors.rowSelected,
    borderLeftWidth: 4,
    borderLeftColor: THEME.colors.rowSelectedBorder,
    paddingLeft: THEME.spacing.md - 4,
  },
  rowDisabled: { backgroundColor: THEME.colors.rowAlt, opacity: 0.75 },
  disabledReason: {
    ...THEME.type.small,
    color: THEME.safety.expired.fg,
    fontWeight: '600',
    marginTop: THEME.spacing.xs,
  },

  cell: { paddingRight: THEME.spacing.md, justifyContent: 'center' },
  cellRight: { alignItems: 'flex-end' },
  cellCenter: { alignItems: 'center' },
  cellText: { ...THEME.type.body, color: THEME.colors.textValue },
  alignRight: { textAlign: 'right' },
});
