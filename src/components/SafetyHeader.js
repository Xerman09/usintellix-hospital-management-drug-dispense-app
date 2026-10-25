import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Badge from './Badge';
import { THEME } from '../constants/theme';

/**
 * What the pharmacist must know BEFORE they start picking.
 *
 * Deliberately above the medicine lines and never behind a tab. Allergies and
 * high-alert flags that need a tap to reach are flags nobody reads at a busy
 * counter.
 *
 * Two wordings chosen with care:
 *
 *  * "No known allergies recorded" -- not "No allergies". The payload only
 *    tells us the chart is empty, which is not the same as the patient having
 *    none, and the difference matters when deciding to dispense.
 *  * The allergy list is capped at 10 by the backend, so it says so when full.
 */
export default function SafetyHeader({ patient, items = [], duplicateScreen, blockedReason, verificationStatus }) {
  const allergies = Array.isArray(patient?.allergies) ? patient.allergies : [];
  const highAlert = items.filter((i) => i.is_high_alert);
  const dangerous = items.filter((i) => i.is_dangerous_drug);
  const dupAlerts = Array.isArray(duplicateScreen?.alerts) ? duplicateScreen.alerts : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        <Text style={styles.name}>{patient?.name || 'Unknown patient'}</Text>
        <Text style={styles.meta}>
          {[patient?.patient_no, patient?.sex, patient?.age != null ? `${patient.age} yrs` : null]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>

      {blockedReason ? (
        <View style={[styles.panel, styles.panelBlocked]}>
          <Text style={styles.panelTitleBlocked}>CANNOT BE FILLED</Text>
          <Text style={styles.panelTextBlocked}>{blockedReason}</Text>
        </View>
      ) : null}

      <View style={[styles.panel, allergies.length ? styles.panelAlert : styles.panelQuiet]}>
        <Text style={allergies.length ? styles.panelTitleAlert : styles.panelTitleQuiet}>
          {allergies.length ? `ALLERGIES (${allergies.length})` : 'ALLERGIES'}
        </Text>

        {allergies.length ? (
          <>
            {allergies.map((a, i) => (
              <Text key={`${a.allergen}-${i}`} style={styles.allergy}>
                <Text style={styles.allergen}>{a.allergen || 'Unnamed allergen'}</Text>
                {a.severity ? ` — ${a.severity}` : ''}
                {a.reaction ? ` (${a.reaction})` : ''}
              </Text>
            ))}
            {allergies.length >= 10 ? (
              <Text style={styles.capNote}>
                Showing the 10 most recent. Check the chart for the full list.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.panelTextQuiet}>
            No known allergies recorded. An empty chart is not the same as none — ask the patient.
          </Text>
        )}
      </View>

      {highAlert.length || dangerous.length || dupAlerts.length || verificationStatus ? (
        <View style={styles.flagRow}>
          {highAlert.length ? (
            <View style={styles.flagItem}>
              <Badge token={THEME.safety.highAlert} size="sm" />
              <Text style={styles.flagText}>
                {highAlert.length === 1
                  ? highAlert[0].drug_name || highAlert[0].title
                  : `${highAlert.length} high-alert medicines`}
                {' — needs a second pharmacist’s check'}
              </Text>
            </View>
          ) : null}

          {dangerous.length ? (
            <View style={styles.flagItem}>
              <Badge token={THEME.safety.controlled} size="sm" />
              <Text style={styles.flagText}>
                {dangerous.length === 1
                  ? dangerous[0].drug_name || dangerous[0].title
                  : `${dangerous.length} dangerous drugs`}
                {' — goes in the DD register'}
              </Text>
            </View>
          ) : null}

          {dupAlerts.length ? (
            <View style={styles.flagItem}>
              <Badge
                token={duplicateScreen?.has_critical_duplicates ? THEME.safety.highAlert : THEME.flag.unverified}
                size="sm"
                text={duplicateScreen?.has_critical_duplicates ? 'DUPLICATE THERAPY' : 'POSSIBLE DUPLICATE'}
              />
              <Text style={styles.flagText}>
                {dupAlerts.length} duplicate-therapy alert{dupAlerts.length === 1 ? '' : 's'} against the
                patient&#8217;s active medicines
              </Text>
            </View>
          ) : null}

          {verificationStatus && verificationStatus !== 'Approved' ? (
            <View style={styles.flagItem}>
              <Badge token={THEME.flag.unverified} size="sm" />
              <Text style={styles.flagText}>Clinical verification: {verificationStatus}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  identity: { marginBottom: THEME.spacing.md },
  name: { ...THEME.type.title, color: THEME.colors.textTitle },
  meta: { ...THEME.type.small, color: THEME.colors.textLabel, marginTop: 2 },

  panel: {
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    marginBottom: THEME.spacing.sm,
  },
  panelAlert: { backgroundColor: THEME.safety.highAlert.bg, borderColor: THEME.safety.highAlert.border },
  panelQuiet: { backgroundColor: THEME.colors.rowAlt, borderColor: THEME.colors.borderSubtle },
  panelBlocked: { backgroundColor: THEME.colors.errorBg, borderColor: THEME.colors.errorBorder },

  panelTitleAlert: { ...THEME.type.label, color: THEME.safety.highAlert.fg, marginBottom: THEME.spacing.xs },
  panelTitleQuiet: { ...THEME.type.label, color: THEME.colors.textLabel, marginBottom: THEME.spacing.xs },
  panelTitleBlocked: { ...THEME.type.label, color: '#991b1b', marginBottom: THEME.spacing.xs },
  panelTextQuiet: { ...THEME.type.small, color: THEME.colors.textLabel, lineHeight: 20 },
  panelTextBlocked: { ...THEME.type.small, color: '#991b1b', lineHeight: 20 },

  allergy: { ...THEME.type.body, color: THEME.safety.highAlert.fg, lineHeight: 24 },
  allergen: { fontWeight: '700' },
  capNote: { ...THEME.type.small, color: THEME.safety.highAlert.fg, marginTop: THEME.spacing.xs, fontStyle: 'italic' },

  flagRow: { marginTop: THEME.spacing.xs },
  flagItem: { flexDirection: 'row', alignItems: 'center', marginTop: THEME.spacing.sm },
  flagText: { ...THEME.type.small, color: THEME.colors.textValue, marginLeft: THEME.spacing.sm, flex: 1 },
});
