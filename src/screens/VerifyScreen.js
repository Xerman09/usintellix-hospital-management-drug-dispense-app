import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import SplitView from '../components/SplitView';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import { Notice } from '../components/Form';
import PrescriptionDetail from './PrescriptionDetail';
import { useDispensingQueue, useVerifications } from '../query/dispensingQueries';
import { VERIFICATION_STATUSES, BLOCKING_STATUSES } from '../api/verification';
import { rowFlags, medicineSummary } from '../api/queueViews';
import { THEME, statusStyle } from '../constants/theme';

/**
 * Pharmacist clinical verification.
 *
 * Read-only: saving a verification stays on the desktop (Phase 8.4). The form
 * behind it covers renal function, weight-based dosing, indication and
 * interaction cross-checks -- a sit-down job, not a counter one.
 *
 * It reads TWO sources, because neither alone is the list a pharmacist wants:
 *
 *   To verify  prescriptions with no Approved verification yet. These come from
 *              the dispensing queue's `to_verify` view, because a prescription
 *              with no verification RECORD at all cannot appear in a list of
 *              records -- and those are exactly the ones needing attention.
 *   On hold    existing records whose status stops dispensing (Rejected,
 *              Intervention Needed, Clarification Requested). dispense()
 *              refuses these outright, so a pharmacist hunting a prescription
 *              that "will not dispense" needs to find it here.
 *   Approved   records already cleared, for looking back.
 */

const TABS = [
  { key: 'to_verify', label: 'To verify', hint: 'No approved verification yet.' },
  { key: 'on_hold', label: 'On hold', hint: 'A verification decision is stopping dispensing.' },
  { key: 'approved', label: 'Approved', hint: 'Already cleared for dispensing.' },
];

export default function VerifyScreen() {
  const [tab, setTab] = useState('to_verify');
  const [selectedId, setSelectedId] = useState(null);

  const queue = useDispensingQueue('to_verify', '');

  // One request per blocking status: the endpoint filters on a single status.
  const rejected = useVerifications({ verification_status: 'Rejected' });
  const intervention = useVerifications({ verification_status: 'Intervention Needed' });
  const clarification = useVerifications({ verification_status: 'Clarification Requested' });
  const approved = useVerifications({ verification_status: 'Approved' });

  const holdSources = [rejected, intervention, clarification];
  const holdRows = holdSources.flatMap((q) => q.data?.verifications || []);
  const holdLoading = holdSources.some((q) => q.isLoading);
  const holdError = holdSources.find((q) => q.isError);

  const isVerificationTab = tab !== 'to_verify';
  const activeQuery = tab === 'approved' ? approved : tab === 'on_hold' ? null : queue;

  const rows = tab === 'to_verify'
    ? queue.data?.rows || []
    : tab === 'approved'
      ? approved.data?.verifications || []
      : holdRows;

  const loading = tab === 'on_hold' ? holdLoading : activeQuery?.isLoading;
  const errored = tab === 'on_hold' ? holdError : activeQuery?.isError ? activeQuery : null;

  const queueColumns = [
    {
      key: 'rx_number',
      title: 'Rx / patient',
      flex: 2.2,
      render: (row) => (
        <View>
          <Text style={styles.rx}>{row.rx_number}</Text>
          <Text style={styles.patient} numberOfLines={1}>{row.patient_name}</Text>
          {medicineSummary(row) ? (
            <Text style={styles.medicines} numberOfLines={1}>{medicineSummary(row)}</Text>
          ) : null}
        </View>
      ),
    },
    { key: 'prescribed_date', title: 'Prescribed', flex: 1 },
    {
      key: 'status',
      title: 'Verification',
      flex: 1.4,
      render: (row) => (
        <View style={styles.badges}>
          <Badge
            token={THEME.flag.unverified}
            text={row.clinical_verification_status || 'Pending Review'}
            size="sm"
          />
          {rowFlags(row).includes('dangerous') ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
        </View>
      ),
    },
  ];

  const recordColumns = [
    {
      key: 'rx_number',
      title: 'Rx / patient',
      flex: 2.2,
      render: (row) => (
        <View>
          <Text style={styles.rx}>{row.rx_number || `Prescription ${row.prescription_id}`}</Text>
          <Text style={styles.patient} numberOfLines={1}>
            {row.patient_name}
            {row.patient_no ? <Text style={styles.patientNo}>  {row.patient_no}</Text> : null}
          </Text>
          {row.verification_number ? (
            <Text style={styles.medicines}>{row.verification_number}</Text>
          ) : null}
        </View>
      ),
    },
    { key: 'prescribed_date', title: 'Prescribed', flex: 1 },
    {
      key: 'verification_status',
      title: 'Decision',
      flex: 1.6,
      render: (row) => {
        const meta = VERIFICATION_STATUSES[row.verification_status];
        return (
          <View style={styles.badges}>
            <Badge
              token={meta?.blocks ? THEME.safety.highAlert : THEME.status.dispensed}
              text={meta?.label || row.verification_status}
              size="sm"
            />
            {row.dispense_status ? <Badge token={statusStyle(row.dispense_status)} size="sm" /> : null}
          </View>
        );
      },
    },
  ];

  const master = (
    <View style={styles.pane}>
      <View style={styles.header}>
        <Text style={styles.title}>Clinical verification</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            const count =
              t.key === 'to_verify'
                ? queue.data?.counts?.to_verify
                : t.key === 'on_hold'
                  ? holdRows.length
                  : approved.data?.count;

            return (
              <Pressable
                key={t.key}
                onPress={() => { setTab(t.key); setSelectedId(null); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityHint={t.hint}
                style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && !active && styles.tabPressed]}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
                {typeof count === 'number' ? (
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.hint}>{TABS.find((t) => t.key === tab)?.hint}</Text>
      </View>

      {tab === 'to_verify' ? (
        <View style={styles.readOnlyNote}>
          <Text style={styles.readOnlyText}>
            Read-only here. Record a verification decision in the desktop HMS.
          </Text>
        </View>
      ) : null}

      {errored ? (
        <View style={styles.centre}>
          <Notice
            tone="error"
            title="Could not load"
            message={errored.error?.message || 'Unknown error.'}
          />
        </View>
      ) : (
        <DataTable
          columns={isVerificationTab ? recordColumns : queueColumns}
          rows={rows}
          keyExtractor={(row) => (isVerificationTab ? `v-${row.id}` : row.id)}
          onSelect={(row) => setSelectedId(isVerificationTab ? row.prescription_id : row.id)}
          selectedKey={
            isVerificationTab
              ? rows.find((r) => r.prescription_id === selectedId)
                ? `v-${rows.find((r) => r.prescription_id === selectedId).id}`
                : null
              : selectedId
          }
          loading={Boolean(loading)}
          emptyText={
            tab === 'to_verify'
              ? 'Nothing is waiting for clinical verification.'
              : tab === 'on_hold'
                ? 'No prescription is held by a verification decision.'
                : 'No verifications have been recorded yet.'
          }
        />
      )}
    </View>
  );

  return (
    <SplitView
      master={master}
      detail={selectedId ? <PrescriptionDetail prescriptionId={selectedId} /> : null}
      hasSelection={Boolean(selectedId)}
      onBack={() => setSelectedId(null)}
      emptyDetailText="Select a prescription to see its medicines and its verification record."
    />
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  header: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    paddingBottom: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  title: { ...THEME.type.heading, color: THEME.colors.textTitle },
  tabs: { paddingVertical: THEME.spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.md,
    marginRight: THEME.spacing.sm,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
    backgroundColor: THEME.colors.cardBg,
  },
  tabActive: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  tabPressed: { backgroundColor: THEME.colors.rowSelected },
  tabLabel: { ...THEME.type.small, fontWeight: '600', color: THEME.colors.textValue },
  tabLabelActive: { color: THEME.colors.textOnDark },
  badge: {
    marginLeft: THEME.spacing.sm,
    minWidth: 24,
    paddingHorizontal: 6,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.colors.rowAlt,
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: THEME.colors.railBgActive },
  badgeText: { ...THEME.type.small, fontWeight: '700', color: THEME.colors.textLabel },
  badgeTextActive: { color: THEME.colors.textOnDark },
  hint: { ...THEME.type.small, color: THEME.colors.textDim },

  readOnlyNote: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.infoBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  readOnlyText: { ...THEME.type.small, color: THEME.colors.textValue },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xl },
  rx: { ...THEME.type.mono, color: THEME.colors.textTitle },
  patient: { ...THEME.type.body, color: THEME.colors.textValue, marginTop: 2 },
  patientNo: { ...THEME.type.small, color: THEME.colors.textDim },
  medicines: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  badges: { gap: 4, alignItems: 'flex-start' },
});
