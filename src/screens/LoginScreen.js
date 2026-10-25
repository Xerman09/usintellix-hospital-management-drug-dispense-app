import React from 'react';
import AuthFlow from '../components/AuthFlow';
import { useSession } from '../store/session';

/**
 * Sign in. All the branching lives in AuthFlow / authFlow.js; this screen only
 * says what happens once a pharmacist is through.
 */
export default function LoginScreen() {
  const { signIn } = useSession();
  return <AuthFlow mode="login" onAuthenticated={signIn} />;
}
