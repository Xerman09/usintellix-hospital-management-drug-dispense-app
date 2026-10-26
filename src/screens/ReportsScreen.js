import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import { Notice } from '../components/Form';
import { Stat, StatRow, DateRangeFilter, OptionFilter, TruncationNote } from '../components/ReportBits';
import {
  usePharmacyDashboard, useReportOptions, useDispensingLog,
  useDangerousDrugs, useUnfilled, useByPrescriber,
} from '../query/reportQueries';
import {
  rangeFor, rangeLabel, reconciliation, unreconciledSections,
  expiryBuckets, truncationNote, fillRate, formatValue, waitingLabel,
} from '../api/reportViews';
import { THEME, statusStyle } from '../constants/theme';

/**
 * Pharmacy dashboard and the four reports.
 *
 * Read-only, and read at the end of a shift rather than watched, so nothing
 * here polls except the dashboard.
 *
 * The one screen that is not merely a table is the dangerous drugs register:
 * its point is whether the book balance matches the shelf, so anything that
 * does not reconcile is pulled to the top and stated plainly. A controlled-drug
 * discrepancy is a legal matter, not a rounding nuisance.
 */

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'log', label: 'Dispensing log' },
  { key: 'dd', label: 'Dangerous drugs' },
  { key: 'unfilled', label: 'Unfilled' },
  { key: 'prescriber', label: 'By prescriber' },
];

export default function ReportsScreen() {
  const [tab, setTab] = useState('dashboard');
  const [preset, setPreset] = useState('month');
  const [warehouseId, setWarehouseId] = useState(null);
  const [prescriberId, setPrescriberId] = useState(null);

  const { data: options } = useReportOptions();
  const range = rangeFor(preset);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Pharmacy reports</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && !active && styles.tabPressed]}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {tab === 'dashboard' ? (
        <DashboardPanel warehouseId={warehouseId} onWarehouse={setWarehouseId} options={options} />
      ) : (
        <View style={styles.flex}>
          <View style={styles.filters}>
            <DateRangeFilter preset={preset} onChange={setPreset} />
            {tab === 'log' || tab === 'dd' ? (
              <OptionFilter
                label="Location"
                options={options?.warehouses}
                value={warehouseId}
                onChange={setWarehouseId}
                allLabel="All locations"
              />
            ) : null}
            {tab === 'unfilled' || tab === 'prescriber' || tab === 'log' ? (
              <OptionFilter
                label="Prescriber"
                options={options?.prescribers}
                value={prescriberId}
                onChange={setPrescriberId}
                allLabel="All prescribers"
              />
            ) : null}
          </View>

          {tab === 'log' ? (
            <DispensingLog filters={{ ...range, warehouse_id: warehouseId, prescriber_id: prescriberId }} />
          ) : null}
          {tab === 'dd' ? <DangerousDrugs filters={{ ...range, warehouse_id: warehouseId }} /> : null}
          {tab === 'unfilled' ? <Unfilled filters={{ ...range, prescriber_id: prescriberId }} /> : null}
          {tab === 'prescriber' ? <ByPrescriber filters={{ ...range, prescriber_id: prescriberId }} preset={preset} /> : null}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ states */

function Loading() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={THEME.colors.brandBlue} />
    </View>
  );
}

function Failed({ error }) {
  return (
    <View style={styles.centre}>
      <Notice tone="error" title="Could not load the report" message={error?.message || 'Unknown error.'} />
    </View>
  );
}

/* --------------------------------------------------------------- dashboard */

function DashboardPanel({ warehouseId, onWarehouse, options }) {
  const { data, isLoading, isError, error } = usePharmacyDashboard(warehouseId);

  if (isLoading) return <Loading />;
  if (isError) return <Failed error={error} />;

  const buckets = expiryBuckets(data?.expiry, data?.thresholds);
  const low = data?.low_stock?.totals || {};
  const stock = data?.stock || {};
  const transfers = data?.transfers || {};

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <OptionFilter
        label="Location"
        options={options?.warehouses}
        value={warehouseId}
        onChange={onWarehouse}
        allLabel="All locations"
      />

      <Text style={styles.asOf}>As of {data?.as_of}</Text>

      <Text style={styles.sectionLabel}>WORK WAITING</Text>
      <StatRow>
        {(data?.pending || []).map((p) => (
          <Stat
            key={p.key}
            label={p.label || p.title}
            value={p.count}
            severity={Number(p.count) > 0 ? 'warn' : 'none'}
          />
        ))}
      </StatRow>

      <Text style={[styles.sectionLabel, styles.spaced]}>STOCK</Text>
      <StatRow>
        <Stat label="Stock value" value={formatValue(stock.value)} />
        <Stat label="Medicines in stock" value={stock.items} />
        <Stat
          label="Out of stock"
          value={low.out}
          severity={Number(low.out) > 0 ? 'stop' : 'ok'}
          hint="At or below zero where a level is set."
        />
        <Stat label="Low stock" value={low.low} severity={Number(low.low) > 0 ? 'warn' : 'ok'} />
        <Stat label="Tracked items" value={low.tracked} hint="Items with a min/max level." />
      </StatRow>

      <Text style={[styles.sectionLabel, styles.spaced]}>EXPIRY</Text>
      <StatRow>
        {buckets.map((b) => (
          <Stat
            key={b.key}
            label={b.label}
            value={b.count ?? 0}
            hint={`${formatValue(b.value)} · ${b.hint}`}
            severity={Number(b.count) > 0 ? b.severity : 'none'}
          />
        ))}
      </StatRow>

      {(data?.expiry?.lots || []).length ? (
        <View style={styles.block}>
          {data.expiry.lots.slice(0, 8).map((l) => (
            <View key={l.lot_id} style={styles.lotRow}>
              <View style={styles.flex}>
                <Text style={styles.lotDrug}>{l.drug_name}</Text>
                <Text style={styles.lotMeta}>
                  lot {l.lot_number} &#183; {l.quantity} &#183; {l.warehouse_name}
                </Text>
              </View>
              <Badge
                token={Number(l.days_left) < 0 ? THEME.safety.expired : THEME.safety.nearExpiry}
                text={Number(l.days_left) < 0 ? `${Math.abs(l.days_left)}d ago` : `${l.days_left}d`}
                size="sm"
              />
            </View>
          ))}
        </View>
      ) : null}

      {Number(transfers.to_send) + Number(transfers.in_transit) + Number(transfers.overdue) > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.spaced]}>TRANSFERS</Text>
          <StatRow>
            <Stat label="To send" value={transfers.to_send} />
            <Stat label="In transit" value={transfers.in_transit} />
            <Stat label="Overdue" value={transfers.overdue} severity={Number(transfers.overdue) > 0 ? 'warn' : 'none'} />
          </StatRow>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, styles.spaced]}>LAST STOCK MOVEMENTS</Text>
      <View style={styles.block}>
        {(data?.recent || []).slice(0, 10).map((m) => (
          <View key={m.id} style={styles.lotRow}>
            <View style={styles.flex}>
              <Text style={styles.lotDrug} numberOfLines={1}>{m.drug_name}</Text>
              <Text style={styles.lotMeta} numberOfLines={1}>
                {m.type_label}
                {m.reference_no ? ` · ${m.reference_no}` : ''}
                {m.counterparty ? ` · ${m.counterparty}` : ''}
              </Text>
            </View>
            <Text style={[styles.movement, Number(m.quantity) < 0 && styles.movementOut]}>
              {Number(m.quantity) > 0 ? '+' : ''}{m.quantity} {m.unit_name || ''}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/* ----------------------------------------------------------- dispensing log */

function DispensingLog({ filters }) {
  const { data, isLoading, isError, error } = useDispensingLog(filters);
  if (isLoading) return <Loading />;
  if (isError) return <Failed error={error} />;

  const t = data?.totals || {};
  const rows = data?.rows || [];

  return (
    <View style={styles.flex}>
      <View style={styles.totalsStrip}>
        <StatRow>
          <Stat label="Dispensings" value={t.dispensings} />
          <Stat label="Medicine lines" value={t.lines} />
          <Stat label="Patients" value={t.patients} />
          <Stat label="Charged" value={formatValue(t.charged)} />
          <Stat label="Undone" value={t.voided} severity={Number(t.voided) > 0 ? 'warn' : 'none'} />
          <Stat
            label="Awaiting check"
            value={t.awaiting_check}
            severity={Number(t.awaiting_check) > 0 ? 'stop' : 'none'}
            hint="Not yet handed over."
          />
        </StatRow>
      </View>

      <DataTable
        columns={[
          {
            key: 'dispense_number',
            title: 'Dispensing',
            flex: 1.5,
            render: (r) => (
              <View>
                <Text style={styles.mono}>{r.dispense_number}</Text>
                <Text style={styles.sub}>{r.dispensed_date} &#183; {r.dispensed_by_name}</Text>
              </View>
            ),
          },
          {
            key: 'drug_name',
            title: 'Medicine',
            flex: 2,
            render: (r) => (
              <View>
                <Text style={styles.cell} numberOfLines={1}>{r.drug_name}</Text>
                <Text style={styles.sub}>
                  {r.quantity} {r.unit_name || ''}
                  {r.lot_number ? ` · lot ${r.lot_number}` : ''}
                </Text>
                <View style={styles.inlineBadges}>
                  {r.is_high_alert ? <Badge token={THEME.safety.highAlert} size="sm" /> : null}
                  {r.is_controlled ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
                </View>
              </View>
            ),
          },
          {
            key: 'patient_name',
            title: 'Patient',
            flex: 1.4,
            render: (r) => (
              <View>
                <Text style={styles.cell} numberOfLines={1}>{r.patient_name}</Text>
                <Text style={styles.sub}>{r.rx_number}</Text>
              </View>
            ),
          },
          {
            key: 'status',
            title: 'State',
            flex: 1,
            render: (r) => (
              <View style={styles.badges}>
                {r.status === 'voided' ? <Badge token={THEME.flag.blocked} text="UNDONE" size="sm" /> : null}
                {r.check_status === 'awaiting' ? (
                  <Badge token={THEME.safety.highAlert} text="AWAITING CHECK" size="sm" />
                ) : null}
                {r.check_status === 'checked' ? (
                  <Badge token={THEME.status.dispensed} text="CHECKED" size="sm" />
                ) : null}
              </View>
            ),
          },
        ]}
        rows={rows}
        keyExtractor={(r) => r.id}
        emptyText="Nothing was dispensed in this period."
        footer={<TruncationNote text={truncationNote(data?.truncated, rows.length)} />}
      />
    </View>
  );
}

/* ---------------------------------------------------------- dangerous drugs */

function DangerousDrugs({ filters }) {
  const { data, isLoading, isError, error } = useDangerousDrugs(filters);
  if (isLoading) return <Loading />;
  if (isError) return <Failed error={error} />;

  const sections = data?.sections || [];
  const problems = unreconciledSections(sections);

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.asOf}>
        {data?.facility?.name}
        {data?.warehouse_name ? ` · ${data.warehouse_name}` : ' · all locations'}
      </Text>

      {/* The verdict first. This is what the register is for. */}
      {problems.length ? (
        <Notice
          tone="error"
          title={`${problems.length} controlled ${problems.length === 1 ? 'medicine does' : 'medicines do'} not balance`}
          message="A controlled-substance discrepancy has to be reported, not corrected quietly. Details below."
        />
      ) : (
        <Notice
          tone="success"
          title="Every controlled medicine balances"
          message={`${data?.drug_count ?? sections.length} on the register for this period.`}
        />
      )}

      {problems.map(({ section, verdict }) => (
        <View key={`problem-${section.drug_id}`} style={styles.problemCard}>
          <Text style={styles.problemDrug}>{section.drug_name}</Text>
          <Text style={styles.problemText}>{verdict.text}</Text>
        </View>
      ))}

      {sections.map((s) => {
        const verdict = reconciliation(s);
        return (
          <View key={s.drug_id} style={styles.ddSection}>
            <View style={styles.ddHead}>
              <View style={styles.flex}>
                <Text style={styles.ddDrug}>{s.drug_name}</Text>
                <Text style={styles.sub}>
                  {[s.generic_name, s.strength, s.dosage_form].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Badge
                token={verdict.reconciled ? THEME.status.dispensed : THEME.safety.expired}
                text={verdict.reconciled ? 'BALANCES' : 'DOES NOT BALANCE'}
                size="sm"
              />
            </View>

            <StatRow>
              <Stat label="Opening" value={s.opening_balance} />
              <Stat label="In" value={s.total_in} />
              <Stat label="Out" value={s.total_out} />
              <Stat label="Closing (book)" value={s.closing_balance} />
              <Stat
                label="On shelf"
                value={s.on_hand}
                severity={verdict.reconciled ? 'ok' : 'stop'}
              />
            </StatRow>

            {!verdict.reconciled ? <Text style={styles.problemText}>{verdict.text}</Text> : null}
          </View>
        );
      })}

      {!sections.length ? (
        <Text style={styles.empty}>No controlled medicines moved in this period.</Text>
      ) : null}
    </ScrollView>
  );
}

/* ----------------------------------------------------------------- unfilled */

function Unfilled({ filters }) {
  const { data, isLoading, isError, error } = useUnfilled(filters);
  if (isLoading) return <Loading />;
  if (isError) return <Failed error={error} />;

  const t = data?.totals || {};
  const rows = data?.rows || [];

  return (
    <View style={styles.flex}>
      <View style={styles.totalsStrip}>
        <StatRow>
          <Stat label="Waiting" value={t.count} />
          <Stat label="Still fillable" value={t.open} />
          <Stat label="Lapsed" value={t.lapsed} severity={Number(t.lapsed) > 0 ? 'stop' : 'none'} hint="Past the fill-by date." />
          <Stat label="Never started" value={t.never_given} />
          <Stat label="Part given" value={t.partly_given} severity={Number(t.partly_given) > 0 ? 'warn' : 'none'} />
          <Stat label="With controlled drugs" value={t.controlled} />
        </StatRow>
      </View>

      <DataTable
        columns={[
          {
            key: 'rx_number',
            title: 'Rx / patient',
            flex: 2,
            render: (r) => (
              <View>
                <Text style={styles.mono}>{r.rx_number}</Text>
                <Text style={styles.cell} numberOfLines={1}>{r.patient_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {(r.medicines || []).slice(0, 2).join(', ')}
                </Text>
              </View>
            ),
          },
          {
            key: 'days_waiting',
            title: 'Waiting',
            flex: 1,
            render: (r) => (
              <View>
                <Text style={[styles.cell, Number(r.days_waiting) > 30 && styles.cellWarn]}>
                  {waitingLabel(r.days_waiting)}
                </Text>
                <Text style={styles.sub}>since {r.prescribed_date}</Text>
              </View>
            ),
          },
          { key: 'prescriber_name', title: 'Prescriber', flex: 1.2 },
          {
            key: 'dispense_status',
            title: 'State',
            flex: 1.2,
            render: (r) => (
              <View style={styles.badges}>
                <Badge token={statusStyle(r.dispense_status)} text={r.status_label} size="sm" />
                {r.is_lapsed ? <Badge token={THEME.safety.expired} text="LAPSED" size="sm" /> : null}
                {r.has_controlled ? <Badge token={THEME.safety.controlled} size="sm" /> : null}
              </View>
            ),
          },
        ]}
        rows={rows}
        keyExtractor={(r) => r.id}
        emptyText="Nothing is waiting to be filled."
        footer={<TruncationNote text={truncationNote(data?.truncated, rows.length)} />}
      />
    </View>
  );
}

/* ------------------------------------------------------------ by prescriber */

function ByPrescriber({ filters, preset }) {
  const { data, isLoading, isError, error } = useByPrescriber(filters);
  if (isLoading) return <Loading />;
  if (isError) return <Failed error={error} />;

  const t = data?.totals || {};
  const rows = data?.rows || [];

  return (
    <View style={styles.flex}>
      <View style={styles.totalsStrip}>
        <StatRow>
          <Stat label={`Prescriptions · ${rangeLabel(preset)}`} value={t.total} wide />
          <Stat label="Dispensed" value={t.dispensed} />
          <Stat label="Still open" value={t.open} severity={Number(t.open) > 0 ? 'warn' : 'none'} />
          <Stat label="Fill rate" value={fillRate(t.fill_rate)} />
          <Stat label="Controlled" value={t.controlled} />
        </StatRow>
      </View>

      <DataTable
        columns={[
          {
            key: 'prescriber_name',
            title: 'Prescriber',
            flex: 2,
            render: (r) => (
              <View>
                <Text style={styles.cell}>{r.prescriber_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {(r.top_medicines || []).slice(0, 3).map((m) => `${m.medicine} (${m.times})`).join(', ')}
                </Text>
              </View>
            ),
          },
          { key: 'total', title: 'Rx', flex: 0.7, align: 'right' },
          { key: 'patients', title: 'Patients', flex: 0.8, align: 'right' },
          { key: 'dispensed', title: 'Filled', flex: 0.8, align: 'right' },
          {
            key: 'fill_rate',
            title: 'Fill rate',
            flex: 0.9,
            align: 'right',
            render: (r) => <Text style={styles.mono}>{fillRate(r.fill_rate) ?? '—'}</Text>,
          },
          {
            key: 'controlled',
            title: 'Controlled',
            flex: 1,
            render: (r) =>
              Number(r.controlled) > 0 ? (
                <Badge token={THEME.safety.controlled} text={String(r.controlled)} size="sm" />
              ) : (
                <Text style={styles.sub}>none</Text>
              ),
          },
        ]}
        rows={rows}
        keyExtractor={(r) => r.prescriber_id}
        emptyText="No prescriptions in this period."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.colors.pageBg },
  flex: { flex: 1 },
  pad: { padding: THEME.spacing.lg, paddingBottom: THEME.spacing.xxxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: THEME.spacing.xxl },

  header: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  title: { ...THEME.type.heading, color: THEME.colors.textTitle },
  tabs: { paddingVertical: THEME.spacing.sm },
  tab: {
    minHeight: THEME.touch.min,
    justifyContent: 'center',
    paddingHorizontal: THEME.spacing.md,
    marginRight: THEME.spacing.sm,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
  },
  tabActive: { backgroundColor: THEME.colors.brandDark, borderColor: THEME.colors.brandDark },
  tabPressed: { backgroundColor: THEME.colors.rowSelected },
  tabLabel: { ...THEME.type.small, fontWeight: '600', color: THEME.colors.textValue },
  tabLabelActive: { color: THEME.colors.textOnDark },

  filters: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  totalsStrip: {
    padding: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },

  sectionLabel: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.sm },
  spaced: { marginTop: THEME.spacing.xl },
  asOf: { ...THEME.type.small, color: THEME.colors.textDim, marginBottom: THEME.spacing.md },
  empty: { ...THEME.type.body, color: THEME.colors.textDim, textAlign: 'center', marginTop: THEME.spacing.xl },

  block: {
    marginTop: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  lotDrug: { ...THEME.type.body, color: THEME.colors.textValue },
  lotMeta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  movement: { ...THEME.type.mono, color: THEME.colors.success },
  movementOut: { color: THEME.colors.error },

  ddSection: {
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.lg,
    backgroundColor: THEME.colors.cardBg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  ddHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: THEME.spacing.md },
  ddDrug: { ...THEME.type.subheading, color: THEME.colors.textTitle },

  problemCard: {
    marginBottom: THEME.spacing.sm,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.safety.expired.bg,
    borderWidth: 1,
    borderColor: THEME.safety.expired.border,
  },
  problemDrug: { ...THEME.type.bodyStrong, color: THEME.safety.expired.fg },
  problemText: { ...THEME.type.small, color: THEME.safety.expired.fg, marginTop: 2, fontWeight: '600' },

  mono: { ...THEME.type.mono, color: THEME.colors.textTitle },
  cell: { ...THEME.type.body, color: THEME.colors.textValue },
  cellWarn: { color: THEME.colors.warning, fontWeight: '700' },
  sub: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },
  badges: { gap: 4, alignItems: 'flex-start' },
  inlineBadges: { flexDirection: 'row', gap: 4, marginTop: 4 },
});
