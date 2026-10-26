import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import SplitView from '../components/SplitView';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import ScanButton from '../components/ScanButton';
import ViewTabs from '../components/ViewTabs';
import PrescriptionDetail from './PrescriptionDetail';
import { ScanService } from '../api/scan';
import { verdictForRx } from '../api/scanVerdict';
import { useDispensingQueue } from '../query/dispensingQueries';
import { DEFAULT_VIEW, rowFlags, medicineSummary, freshness, viewMeta } from '../api/queueViews';
import { THEME, statusStyle } from '../constants/theme';

/**
 * The dispensing queue -- the app's main screen, on live data.
 *
 * The board polls every 30s because the desktop HMS works the same
 * prescriptions: a slip can be filled by someone else while it sits on this
 * tablet. "Updated Xs ago" is shown for that reason, not as decoration -- a
 * pharmacist needs to know whether what they are looking at is current.
 */

/** Which THEME token each flag from rowFlags() draws with. */
const FLAG_TOKENS = {
  awaitingCheck: { token: THEME.safety.highAlert, text: 'AWAITING CHECK' },
  dangerous: { token: THEME.safety.controlled, text: 'DANGEROUS DRUG' },
  expired: { token: THEME.safety.expired, text: 'EXPIRED' },
  refill: { token: THEME.flag.refill, text: null },
  unverified: { token: THEME.flag.unverified, text: null },
  nothingToFill: { token: THEME.flag.blocked, text: 'NOTHING TO FILL' },
};

/**
 * "Updated 12s ago", ticking on its own.
 *
 * Its own component with its own timer so the second-by-second count does not
 * re-render the queue table underneath it -- that list is long and this screen
 * stays open all shift.
 */
function Freshness({ updatedAt, fetching }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <Text style={styles.refreshText}>
      {fetching ? 'Updating…' : `Updated ${freshness(updatedAt)}`}
    </Text>
  );
}

export default function QueueScreen() {
  const [view, setView] = useState(DEFAULT_VIEW);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [scanNotice, setScanNotice] = useState(null);
  const fromScan = useRef(false);

  // Debounce typing, so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useDispensingQueue(view, query);

  const rows = data?.rows || [];
  const counts = data?.counts;

  // Keep the selection honest: if the chosen slip is no longer in this view,
  // clear the detail pane rather than showing a prescription the list denies.
  //
  // A scanned prescription is exempt. The pharmacist scanned the slip in their
  // hand, which is a stronger statement of intent than the current filter --
  // and it will usually be absent from the list, because they scan precisely
  // when they cannot find it.
  useEffect(() => {
    if (fromScan.current) return;
    if (selectedId && rows.length && !rows.some((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [rows, selectedId]);

  const columns = [
    {
      key: 'rx_number',
      title: 'Rx / patient',
      flex: 2.2,
      render: (row) => (
        <View>
          <Text style={styles.rxNumber}>{row.rx_number}</Text>
          <Text style={styles.patient} numberOfLines={1}>
            {row.patient_name}
            {row.patient_no ? <Text style={styles.patientNo}>  {row.patient_no}</Text> : null}
          </Text>
          {medicineSummary(row) ? (
            <Text style={styles.medicines} numberOfLines={1}>{medicineSummary(row)}</Text>
          ) : null}
        </View>
      ),
    },
    {
      key: 'prescribed_date',
      title: 'Prescribed',
      flex: 1,
      render: (row) => (
        <View>
          <Text style={styles.cellText}>{row.prescribed_date}</Text>
          <Text style={styles.cellDim}>
            {row.line_count} line{row.line_count === 1 ? '' : 's'}
          </Text>
        </View>
      ),
    },
    {
      key: 'flags',
      title: 'Status',
      flex: 1.6,
      render: (row) => {
        const flags = rowFlags(row);
        return (
          <View style={styles.badgeStack}>
            <Badge token={statusStyle(row.dispense_status)} text={row.status_label} size="sm" />
            {flags.map((f) => {
              const def = FLAG_TOKENS[f];
              if (!def) return null;
              return <Badge key={f} token={def.token} text={def.text || undefined} size="sm" />;
            })}
          </View>
        );
      },
    },
  ];

  const master = (
    <View style={styles.masterPane}>
      <View style={styles.masterHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Dispensing queue</Text>
          <Pressable onPress={refetch} style={styles.refresh} accessibilityRole="button">
            <Freshness updatedAt={dataUpdatedAt} fetching={isFetching} />
          </Pressable>
        </View>

        <ViewTabs view={view} counts={counts} onChange={setView} />

        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rx number, patient name or patient no."
            placeholderTextColor={THEME.colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} style={styles.clear} accessibilityRole="button">
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.scanRow}>
          <ScanButton
            kind="rx"
            title="Scan Rx"
            onResolve={async (code) => verdictForRx(await ScanService.rx(code))}
            onAccept={(v) => {
              fromScan.current = true;
              setSelectedId(v.prescriptionId);
            }}
          />
        </View>
      </View>

      {isError ? (
        <View style={styles.centre}>
          <Text style={styles.errorTitle}>
            {error?.errorKind === 'forbidden'
              ? 'This account cannot see the dispensing queue'
              : 'Could not load the queue'}
          </Text>
          <Text style={styles.errorText}>{error?.message || 'Unknown error.'}</Text>
          <Pressable onPress={refetch} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(row) => row.id}
          onSelect={(row) => {
            fromScan.current = false;
            setSelectedId(row.id);
          }}
          selectedKey={selectedId}
          loading={isLoading}
          emptyText={
            query
              ? `Nothing matches “${query}” in ${viewMeta(view).label}.`
              : `Nothing in ${viewMeta(view).label}.`
          }
          footer={
            data?.truncated ? (
              <View style={styles.truncated}>
                <Text style={styles.truncatedText}>
                  Showing the first 300. Narrow it with the search box to see the rest.
                </Text>
              </View>
            ) : null
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
      onBack={() => {
        fromScan.current = false;
        setSelectedId(null);
      }}
      emptyDetailText="Select a prescription to see its medicines, allergies and stock."
    />
  );
}

const styles = StyleSheet.create({
  masterPane: { flex: 1 },
  masterHeader: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    paddingBottom: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...THEME.type.heading, color: THEME.colors.textTitle },
  refresh: { minHeight: THEME.touch.min, justifyContent: 'center', paddingLeft: THEME.spacing.md },
  refreshText: { ...THEME.type.small, color: THEME.colors.brandBlue, fontWeight: '600' },

  searchRow: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flex: 1,
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.inputBorder,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.inputBg,
    ...THEME.type.body,
    color: THEME.colors.textTitle,
  },
  clear: {
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.md,
    justifyContent: 'center',
  },
  clearText: { ...THEME.type.small, color: THEME.colors.textLabel, fontWeight: '600' },
  scanRow: { marginTop: THEME.spacing.md },

  rxNumber: { ...THEME.type.mono, color: THEME.colors.textTitle },
  patient: { ...THEME.type.body, color: THEME.colors.textValue, marginTop: 2 },
  patientNo: { ...THEME.type.small, color: THEME.colors.textDim },
  medicines: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  cellText: { ...THEME.type.body, color: THEME.colors.textValue },
  cellDim: { ...THEME.type.small, color: THEME.colors.textDim, marginTop: 2 },
  badgeStack: { gap: 4, alignItems: 'flex-start' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xl },
  errorTitle: { ...THEME.type.subheading, color: THEME.colors.textTitle, textAlign: 'center' },
  errorText: { ...THEME.type.small, color: THEME.colors.textSubtitle, textAlign: 'center', marginTop: THEME.spacing.sm },
  retry: {
    marginTop: THEME.spacing.lg,
    minHeight: THEME.touch.min,
    paddingHorizontal: THEME.spacing.xl,
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.btnPrimary,
  },
  retryText: { ...THEME.type.bodyStrong, color: THEME.colors.btnPrimaryText },

  truncated: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.warningBg,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.warningBorder,
  },
  truncatedText: { ...THEME.type.small, color: '#92400e', textAlign: 'center' },
});
