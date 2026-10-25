/**
 * Design tokens for the pharmacy tablet.
 *
 * Same shape as patient_mobile_app/src/constants/theme.js (colors / spacing /
 * radius) so one team can move between the two apps, plus what a tablet at a
 * dispensing counter needs and a phone portal does not:
 *
 *   * safety   -- high-alert, LASA, expired, recalled, quarantined. These are
 *                 not decoration: they are the difference between the right
 *                 medicine and the wrong one, so they get their own scale and
 *                 are never reused for anything else.
 *   * type     -- a larger scale. The pharmacist reads this at arm's length,
 *                 standing, often through a counter window.
 *   * touch    -- minimum target sizes. 48dp is the floor, 56dp for anything
 *                 on the dispensing path, because it may be tapped with gloves.
 *   * layout   -- the master/detail split ratio and breakpoints.
 */

export const THEME = {
  colors: {
    // Brand, carried over from the patient app so the two read as one system.
    brandBlue: '#2563eb',
    brandBlueDark: '#1d4ed8',
    brandDark: '#0f172a',

    // Surfaces
    pageBg: '#f1f5f9',
    cardBg: '#ffffff',
    railBg: '#0f172a',
    railBgActive: '#1e293b',
    headerBg: '#ffffff',
    inputBg: '#f8fafc',
    inputBorder: '#e2e8f0',
    inputBorderFocus: '#2563eb',
    rowAlt: '#f8fafc',
    rowSelected: '#eff6ff',
    rowSelectedBorder: '#2563eb',

    // Typography
    textTitle: '#0f172a',
    textValue: '#1e293b',
    textLabel: '#64748b',
    textSubtitle: '#64748b',
    textDim: '#94a3b8',
    textOnDark: '#f8fafc',
    textOnDarkDim: '#94a3b8',

    // Buttons
    btnPrimary: '#0f172a',
    btnPrimaryHover: '#1e293b',
    btnPrimaryText: '#ffffff',
    btnSecondaryBg: '#ffffff',
    btnSecondaryBorder: '#cbd5e1',
    btnSecondaryText: '#1e293b',
    btnDisabledBg: '#e2e8f0',
    btnDisabledText: '#94a3b8',

    // Semantic states
    error: '#ef4444',
    errorBg: '#fef2f2',
    errorBorder: '#fecaca',
    success: '#10b981',
    successBg: '#ecfdf5',
    successBorder: '#a7f3d0',
    warning: '#f59e0b',
    warningBg: '#fffbeb',
    warningBorder: '#fde68a',
    info: '#0ea5e9',
    infoBg: '#f0f9ff',

    borderSubtle: '#e2e8f0',
    borderStrong: '#cbd5e1',
  },

  /**
   * Medication safety. One colour per hazard, used nowhere else in the app.
   *
   *   highAlert   drugs.is_high_alert  -- needs a second pharmacist's check
   *   lasa        drugs.is_lasa        -- look-alike / sound-alike
   *   controlled  drugs.controlled_class
   *   expired     lot past expires_date        -- never dispensable
   *   recalled    pharmacy_batch_recalls       -- never dispensable
   *   quarantined lot is_active = 0            -- never dispensable
   *   nearExpiry  within 60 days               -- usable, but say so
   */
  safety: {
    highAlert: { fg: '#9f1239', bg: '#fff1f2', border: '#fda4af', label: 'HIGH ALERT' },
    lasa: { fg: '#854d0e', bg: '#fefce8', border: '#fde047', label: 'LASA' },
    controlled: { fg: '#5b21b6', bg: '#f5f3ff', border: '#c4b5fd', label: 'CONTROLLED' },
    expired: { fg: '#7f1d1d', bg: '#fef2f2', border: '#fca5a5', label: 'EXPIRED' },
    // Heavier than expired on purpose: an expired lot has degraded, a recalled
    // one may be actively harmful, and the two must not be mistaken at a glance.
    recalled: { fg: '#450a0a', bg: '#fee2e2', border: '#ef4444', label: 'RECALLED' },
    quarantined: { fg: '#9a3412', bg: '#fff7ed', border: '#fdba74', label: 'QUARANTINED' },
    nearExpiry: { fg: '#92400e', bg: '#fffbeb', border: '#fcd34d', label: 'NEAR EXPIRY' },
  },

  /**
   * Dispense status, matching DispensingService::STATUS_LABELS exactly so the
   * tablet never invents its own words for a state the backend already names.
   */
  status: {
    pending: { fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', label: 'To dispense' },
    partial: { fg: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'Partly dispensed' },
    dispensed: { fg: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', label: 'Dispensed' },
    closed: { fg: '#334155', bg: '#f1f5f9', border: '#cbd5e1', label: 'Closed' },
    none: { fg: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Nothing to dispense' },
  },

  // Read standing, at arm's length.
  type: {
    display: { fontSize: 32, fontWeight: '700' },
    title: { fontSize: 24, fontWeight: '700' },
    heading: { fontSize: 20, fontWeight: '600' },
    subheading: { fontSize: 17, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400' },
    bodyStrong: { fontSize: 16, fontWeight: '600' },
    small: { fontSize: 14, fontWeight: '400' },
    label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
    mono: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    monoLarge: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  },

  spacing: { xs: 4, sm: 8, md: 14, lg: 20, xl: 26, xxl: 36, xxxl: 48 },

  radius: { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 },

  // Android's floor is 48dp; the dispensing path gets more.
  touch: { min: 48, comfortable: 56, large: 64 },

  layout: {
    railWidth: 88,
    masterRatio: 0.35,
    masterMinWidth: 320,
    // Below this the split collapses to one pane at a time (small tablet, portrait).
    splitBreakpoint: 900,
    headerHeight: 64,
  },
};

/** Safety style for a drug row, or null when there is nothing to warn about. */
export function safetyForDrug(drug) {
  if (!drug) return null;
  if (drug.is_high_alert) return THEME.safety.highAlert;
  if (drug.is_lasa) return THEME.safety.lasa;
  return null;
}

/** Why a lot cannot be dispensed, or null when it can. Order matters: worst first. */
export function blockingReasonForLot(lot) {
  if (!lot) return null;
  if (lot.is_recalled) return THEME.safety.recalled;
  if (lot.is_expired) return THEME.safety.expired;
  if (lot.is_active === 0 || lot.is_active === false) return THEME.safety.quarantined;
  return null;
}

/** Status chip style, falling back to 'none' for a status we do not know. */
export function statusStyle(status) {
  return THEME.status[status] || THEME.status.none;
}
