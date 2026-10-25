import React from 'react';
import AuthFlow from '../components/AuthFlow';
import { useSession } from '../store/session';

/**
 * The idle lock.
 *
 * The username is fixed to whoever is signed in, so this can only confirm the
 * same person -- it is not a back door to switching accounts without signing
 * out. Someone else taking over the counter uses "Sign out instead", which
 * ends the session properly and records it.
 */
export default function LockScreen() {
  const { user, unlock, signOut } = useSession();

  return (
    <AuthFlow
      mode="unlock"
      lockedUsername={user?.username || ''}
      onAuthenticated={unlock}
      onSignOut={signOut}
    />
  );
}
