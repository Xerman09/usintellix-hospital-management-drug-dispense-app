import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Lock the screen after a period with no interaction.
 *
 * This exists because the tablet is shared. A pharmacist walks away mid-shift
 * and the next person at the counter must not inherit their session -- every
 * dispense is written against whoever is signed in, so an unattended unlocked
 * tablet attributes one pharmacist's work to another.
 *
 * Two triggers, both needed:
 *   * no touch for `timeoutMs` while the app is open
 *   * the app was in the background longer than `timeoutMs` -- a timer does
 *     not fire reliably while Android has the app suspended, so the elapsed
 *     time is checked again on resume
 *
 * @param {{timeoutMs: number, onIdle: () => void, enabled?: boolean}} options
 * @returns {{notifyActivity: () => void}} call on interaction to reset the clock
 */
export default function useIdleTimer({ timeoutMs, onIdle, enabled = true }) {
  const lastActivity = useRef(Date.now());
  const firedRef = useRef(false);
  const onIdleRef = useRef(onIdle);

  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);

  const notifyActivity = useCallback(() => {
    lastActivity.current = Date.now();
    firedRef.current = false;
  }, []);

  // Reset the clock whenever the timer is switched on (a fresh sign-in).
  useEffect(() => {
    if (enabled) notifyActivity();
  }, [enabled, notifyActivity]);

  const fireIfIdle = useCallback(() => {
    if (!enabled || firedRef.current) return;
    if (Date.now() - lastActivity.current >= timeoutMs) {
      firedRef.current = true;
      onIdleRef.current?.();
    }
  }, [enabled, timeoutMs]);

  // Poll rather than one long timeout, so a changed timeout or a suspended
  // app cannot leave a stale timer holding the screen open.
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = setInterval(fireIfIdle, Math.min(10000, Math.max(1000, Math.floor(timeoutMs / 6))));
    return () => clearInterval(tick);
  }, [enabled, timeoutMs, fireIfIdle]);

  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fireIfIdle();
    });
    return () => sub.remove();
  }, [enabled, fireIfIdle]);

  return { notifyActivity };
}
