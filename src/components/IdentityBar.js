import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';

/**
 * Who is signed in, on every screen.
 *
 * Not a nicety: this pharmacist's id is written into created_by on every
 * dispense and into every HIPAA audit row, so on a shared tablet the name has
 * to be visible before they press Dispense -- not two taps away in a menu.
 *
 * @param {Object} user   from /auth/me
 * @param {() => void} onSignOut
 * @param {() => void} [onLock]
 */
export default function IdentityBar({ user, onSignOut, onLock }) {
  if (!user) return null;

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const expiringSoon = user.password_expiring_soon;
  const days = user.days_until_expiration;

  return (
    <View style={styles.bar}>
      <View style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.role} numberOfLines={1}>
            {user.role === 'admin' ? 'Admin' : 'Pharmacist'} &#183; {user.username}
          </Text>
        </View>
      </View>

      {expiringSoon ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Password expires in {days} day{days === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {onLock ? (
          <Pressable onPress={onLock} style={styles.action} accessibilityRole="button">
            <Text style={styles.actionText}>Lock</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onSignOut} style={[styles.action, styles.actionStrong]} accessibilityRole="button">
          <Text style={[styles.actionText, styles.actionStrongText]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: THEME.layout.headerHeight,
    paddingHorizontal: THEME.spacing.lg,
    backgroundColor: THEME.colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  who: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.colors.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...THEME.type.bodyStrong, color: THEME.colors.textOnDark },
  names: { marginLeft: THEME.spacing.md, flexShrink: 1 },
  name: { ...THEME.type.subheading, color: THEME.colors.textTitle },
  role: { ...THEME.type.small, color: THEME.colors.textLabel },

  warn: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 1,
    borderColor: THEME.colors.warningBorder,
    marginRight: THEME.spacing.md,
  },
  warnText: { ...THEME.type.small, color: '#92400e', fontWeight: '600' },

  actions: { flexDirection: 'row' },
  action: {
    minHeight: THEME.touch.min,
    minWidth: 88,
    paddingHorizontal: THEME.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.btnSecondaryBorder,
    marginLeft: THEME.spacing.sm,
  },
  actionText: { ...THEME.type.bodyStrong, color: THEME.colors.btnSecondaryText },
  actionStrong: { backgroundColor: THEME.colors.btnPrimary, borderColor: THEME.colors.btnPrimary },
  actionStrongText: { color: THEME.colors.btnPrimaryText },
});
