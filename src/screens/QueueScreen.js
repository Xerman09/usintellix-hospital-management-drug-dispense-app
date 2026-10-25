import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import SplitView from '../components/SplitView';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import ScanButton from '../components/ScanButton';
import { THEME, statusStyle } from '../constants/theme';

/**
 * The dispensing queue -- the app's main screen.
 *
 * PHASE 1: the shell, on MOCK DATA (see MOCK_QUEUE below). It exists to prove
 * the layout, the table and the split behave on a real tablet in landscape.
 * Phase 3 replaces the mock with GET /dispensing and GET /dispensing/show;
 * the component shape is already what those payloads will fill.
 *
 * The mock deliberately includes one of every dispense_status the backend can
 * return, plus a high-alert row, so the status chips and safety badges are
 * exercised rather than assumed.
 */

const MOCK_QUEUE = [
  { id: 1, rx_number: 'RX-2026-00041', patient_name: 'Dela Cruz, Juan', prescriber: 'Dr. Reyes', prescribed_date: '2026-10-22', dispense_status: 'pending', lines: 3, high_alert: false },
  { id: 2, rx_number: 'RX-2026-00040', patient_name: 'Santos, Maria', prescriber: 'Dr. Lim', prescribed_date: '2026-10-22', dispense_status: 'pending', lines: 1, high_alert: true },
  { id: 3, rx_number: 'RX-2026-00038', patient_name: 'Bautista, Pedro', prescriber: 'Dr. Reyes', prescribed_date: '2026-10-21', dispense_status: 'partial', lines: 4, high_alert: false },
  { id: 4, rx_number: 'RX-2026-00035', patient_name: 'Garcia, Ana', prescriber: 'Dr. Tan', prescribed_date: '2026-10-21', dispense_status: 'dispensed', lines: 2, high_alert: false },
  { id: 5, rx_number: 'RX-2026-00031', patient_name: 'Ocampo, Jose', prescriber: 'Dr. Lim', prescribed_date: '2026-10-20', dispense_status: 'closed', lines: 2, high_alert: false },
];

export default function QueueScreen() {
  const [selected, setSelected] = useState(null);

  const columns = [
    {
      key: 'rx_number',
      title: 'Rx number',
      flex: 1.4,
      render: (row) => (
        <View>
          <Text style={styles.rxNumber}>{row.rx_number}</Text>
          {row.high_alert ? <Badge token={THEME.safety.highAlert} size="sm" /> : null}
        </View>
      ),
    },
    { key: 'patient_name', title: 'Patient', flex: 1.6 },
    { key: 'prescriber', title: 'Prescriber', flex: 1.2 },
    {
      key: 'dispense_status',
      title: 'Status',
      flex: 1.3,
      render: (row) => <Badge token={statusStyle(row.dispense_status)} size="sm" />,
    },
  ];

  const master = (
    <View style={styles.masterPane}>
      <View style={styles.masterHeader}>
        <View style={styles.masterHeaderRow}>
          <Text style={styles.masterTitle}>Dispensing queue</Text>
          <Text style={styles.masterCount}>{MOCK_QUEUE.length}</Text>
        </View>
        <Text style={styles.mockNotice}>Mock data &#8212; live queue arrives in Phase 3</Text>
        <View style={styles.scanRow}>
          <ScanButton kind="rx" title="Scan Rx" onCode={() => {}} />
        </View>
      </View>

      <DataTable
        columns={columns}
        rows={MOCK_QUEUE}
        keyExtractor={(row) => row.id}
        onSelect={setSelected}
        selectedKey={selected?.id}
        emptyText="No prescriptions are waiting."
      />
    </View>
  );

  const detail = selected ? (
    <ScrollView contentContainerStyle={styles.detailPane}>
      <Text style={styles.detailRx}>{selected.rx_number}</Text>
      <Text style={styles.detailPatient}>{selected.patient_name}</Text>

      <View style={styles.badgeRow}>
        <Badge token={statusStyle(selected.dispense_status)} />
        {selected.high_alert ? <Badge token={THEME.safety.highAlert} /> : null}
      </View>

      <View style={styles.detailCard}>
        <DetailRow label="Prescriber" value={selected.prescriber} />
        <DetailRow label="Prescribed" value={selected.prescribed_date} />
        <DetailRow label="Medicine lines" value={String(selected.lines)} />
      </View>

      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>Not built yet</Text>
        <Text style={styles.pendingText}>
          The patient safety header (allergies, high-alert flags) and the medicine lines
          with their quantities land in Phase 3. Lot selection and the dispense itself are
          Phase 4.
        </Text>
      </View>
    </ScrollView>
  ) : null;

  return (
    <SplitView
      master={master}
      detail={detail}
      hasSelection={Boolean(selected)}
      onBack={() => setSelected(null)}
      emptyDetailText="Select a prescription to see its medicines."
    />
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  masterPane: { flex: 1 },
  masterHeader: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.lg,
    paddingBottom: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  masterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  masterTitle: { ...THEME.type.heading, color: THEME.colors.textTitle },
  masterCount: { ...THEME.type.mono, color: THEME.colors.textLabel },
  mockNotice: { ...THEME.type.small, color: THEME.colors.warning, marginTop: 2 },
  scanRow: { marginTop: THEME.spacing.md },

  rxNumber: { ...THEME.type.mono, color: THEME.colors.textTitle },

  detailPane: { padding: THEME.spacing.xl },
  detailRx: { ...THEME.type.display, color: THEME.colors.textTitle },
  detailPatient: { ...THEME.type.heading, color: THEME.colors.textSubtitle, marginTop: THEME.spacing.xs },
  badgeRow: { flexDirection: 'row', gap: THEME.spacing.sm, marginTop: THEME.spacing.md },

  detailCard: {
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: THEME.spacing.sm },
  detailLabel: { ...THEME.type.label, color: THEME.colors.textLabel },
  detailValue: { ...THEME.type.body, color: THEME.colors.textValue },

  pendingCard: {
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
  },
  pendingTitle: { ...THEME.type.subheading, color: THEME.colors.warning },
  pendingText: { ...THEME.type.small, color: THEME.colors.textValue, marginTop: THEME.spacing.xs, lineHeight: 20 },
});
