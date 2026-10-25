import { QueryClient } from '@tanstack/react-query';

/**
 * Server-state defaults for a dispensing counter.
 *
 * The reasoning behind each, because the defaults matter more here than in a
 * normal app:
 *
 *  * retry on reads, never on writes. Re-sending a GET is harmless;
 *    re-sending POST /dispensing could dispense the same medicine twice.
 *    Mutations are retried by the pharmacist, deliberately, never silently.
 *  * no retry on auth/forbidden. The session is gone or the role is wrong --
 *    retrying just delays the login prompt.
 *  * short staleTime. Stock and queue state change under the pharmacist's
 *    feet because the desktop HMS is live on the same data.
 *  * refetch on reconnect, so the queue is never read from a cache filled
 *    before a Wi-Fi drop.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      gcTime: 5 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const kind = error?.errorKind;
        if (kind === 'auth' || kind === 'forbidden' || kind === 'notfound' || kind === 'invalid') return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Turn an ApiResult into something react-query treats as success or failure.
 * Callers do `queryFn: () => unwrap(DispensingService.queue(filters))`.
 */
export function unwrap(promise) {
  return promise.then((res) => {
    if (!res.ok) {
      const error = new Error(res.message);
      error.errorKind = res.errorKind;
      error.httpStatus = res.httpStatus;
      error.data = res.data;
      throw error;
    }
    return res.data;
  });
}
