import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthService } from '../api/auth';
import { stepForUser, STEP } from '../api/authFlow';
import { clearSession, loadSession, onUnauthorized } from '../api/client';

/**
 * Who is signed in on this tablet, and whether the screen is locked.
 *
 * Three states, and the difference between the last two matters:
 *
 *   signed out  no user, no cookie      -> the sign-in screen
 *   locked      user known, cookie live -> the lock screen. The session is
 *                                          still valid; we are only confirming
 *                                          the person holding the tablet is
 *                                          the one who signed in.
 *   signed in   user known, unlocked    -> the app
 *
 * Locking deliberately keeps the cookie. Dropping it would force a fresh 2FA
 * every few idle minutes at a busy counter, and a safety control that staff
 * find unusable gets switched off -- which is worse than one they accept.
 */

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [locked, setLocked] = useState(false);
  const [restoring, setRestoring] = useState(true);

  /**
   * Reload the stored cookie and ask the backend who it belongs to.
   *
   * The role is re-checked here, not just at login: a pharmacist whose role
   * was changed in the HMS while the tablet sat on the counter must not come
   * back to a working dispensing screen.
   */
  const restore = useCallback(async () => {
    setRestoring(true);
    try {
      const cookie = await loadSession();
      if (!cookie) {
        setUser(null);
        return null;
      }

      const res = await AuthService.me();
      const fresh = res.ok ? res.data?.user ?? null : null;
      if (!fresh) {
        setUser(null);
        return null;
      }

      const flow = stepForUser(fresh);
      if (flow.step !== STEP.AUTHENTICATED) {
        // Role revoked, or a credential change is now required: make them
        // go through the sign-in flow again rather than guessing.
        await AuthService.logout();
        setUser(null);
        return null;
      }

      setUser(fresh);
      setLocked(false);
      return fresh;
    } finally {
      setRestoring(false);
    }
  }, []);

  const signIn = useCallback((nextUser) => {
    setUser(nextUser);
    setLocked(false);
  }, []);

  const signOut = useCallback(async () => {
    await AuthService.logout();
    setUser(null);
    setLocked(false);
  }, []);

  const lock = useCallback(() => {
    setLocked((already) => already || Boolean(user));
  }, [user]);

  const unlock = useCallback((nextUser) => {
    if (nextUser) setUser(nextUser);
    setLocked(false);
  }, []);

  /** A 401 from anywhere ends the session, so every screen reacts the same way. */
  useEffect(() => {
    onUnauthorized(async () => {
      await clearSession();
      setUser(null);
      setLocked(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      locked,
      restoring,
      isAuthenticated: Boolean(user) && !locked,
      signIn,
      signOut,
      lock,
      unlock,
      restore,
    }),
    [user, locked, restoring, signIn, signOut, lock, unlock, restore]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
