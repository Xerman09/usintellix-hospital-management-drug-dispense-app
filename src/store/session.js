import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AuthService } from '../api/auth';
import { clearSession, loadSession, onUnauthorized } from '../api/client';

/**
 * Who is signed in on this tablet.
 *
 * Phase 1 provides the container and the restore-on-start path. Phase 2 adds
 * the login screens, the 2FA and HIPAA flows, and the idle auto-lock -- the
 * hooks they need (`signIn`, `signOut`, `restore`) are already the shape they
 * will use, so Phase 2 fills them in rather than reshaping this.
 */

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);

  /** Reload the stored cookie and ask the backend who it belongs to. */
  const restore = useCallback(async () => {
    setRestoring(true);
    const cookie = await loadSession();
    if (!cookie) {
      setUser(null);
      setRestoring(false);
      return null;
    }
    const res = await AuthService.me();
    const restored = res.ok ? res.data?.user ?? null : null;
    setUser(restored);
    setRestoring(false);
    return restored;
  }, []);

  const signOut = useCallback(async () => {
    await AuthService.logout();
    setUser(null);
  }, []);

  /** A 401 from anywhere drops the session, so every screen reacts the same way. */
  const bindUnauthorized = useCallback(() => {
    onUnauthorized(async () => {
      await clearSession();
      setUser(null);
    });
  }, []);

  const value = useMemo(
    () => ({ user, restoring, setUser, restore, signOut, bindUnauthorized }),
    [user, restoring, restore, signOut, bindUnauthorized]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}
