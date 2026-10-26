import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DispensingService } from '../api/dispensing';
import { unwrap } from './queryClient';
import { CONFIG } from '../constants/config';

/**
 * Server state for the dispensing screens.
 *
 * The queue polls, because the desktop HMS is live on the same prescriptions:
 * another pharmacist can fill a slip while this tablet is showing it. The
 * detail does NOT poll -- refetching under someone mid-selection would move
 * the ground beneath them. It refetches when they open it and after any write.
 */

export const queueKey = (view, q) => ['dispensing', 'queue', view, q];
export const detailKey = (id) => ['dispensing', 'detail', id];
export const optionsKey = () => ['dispensing', 'options'];

export function useDispensingQueue(view, q) {
  return useQuery({
    queryKey: queueKey(view, q),
    queryFn: () => unwrap(DispensingService.queue({ view, q })),
    refetchInterval: CONFIG.QUEUE_POLL_MS,
    // Keep the previous view's rows on screen while the next one loads, so
    // switching a chip does not blank the board.
    placeholderData: (prev) => prev,
  });
}

export function useDispensingDetail(prescriptionId) {
  return useQuery({
    queryKey: detailKey(prescriptionId),
    queryFn: () => unwrap(DispensingService.detail(prescriptionId)),
    enabled: Boolean(prescriptionId),
  });
}

/** Warehouses, discounts and payment methods. Rarely changes. */
export function useDispensingOptions() {
  return useQuery({
    queryKey: optionsKey(),
    queryFn: () => unwrap(DispensingService.options()),
    staleTime: 10 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ writes */

/**
 * Writes are never retried (see queryClient's mutation defaults): re-sending
 * POST /dispensing could give the same medicine twice. A failed dispense is
 * retried by the pharmacist, deliberately.
 *
 * Every write invalidates the prescription AND the queue. The queue because a
 * filled slip leaves the "to fill" view; the detail because quantities, lot
 * stock and the dispense history all moved. On FAILURE the detail is
 * invalidated too -- a refusal usually means this tablet was working from a
 * stale copy (someone filled it on the desktop), so the truth is refetched
 * rather than left on screen.
 */
function useDispensingWrite(fn) {
  const qc = useQueryClient();

  const refresh = (prescriptionId) => {
    qc.invalidateQueries({ queryKey: ['dispensing', 'queue'] });
    if (prescriptionId) qc.invalidateQueries({ queryKey: detailKey(prescriptionId) });
  };

  return useMutation({
    mutationFn: async (vars) => {
      const res = await fn(vars);
      if (!res.ok) {
        const error = new Error(res.message);
        error.errorKind = res.errorKind;
        error.httpStatus = res.httpStatus;
        error.serverErrors = res.payload?.errors || null;
        throw error;
      }
      return res.data;
    },
    onSettled: (_data, _err, vars) => refresh(vars?.prescriptionId),
  });
}

/** POST /dispensing -- the one call that moves stock. */
export function useDispense() {
  return useDispensingWrite(({ body }) => DispensingService.dispense(body));
}

/** POST /dispensing/void -- stock goes back to the lots it came from. */
export function useVoidDispense() {
  return useDispensingWrite(({ dispenseId, reason }) => DispensingService.void(dispenseId, reason));
}

/** POST /dispensing/close -- the pharmacy will not give the rest. */
export function useClosePrescription() {
  return useDispensingWrite(({ prescriptionId, reason }) => DispensingService.close(prescriptionId, reason));
}

/**
 * POST /dispensing/check -- the high-alert second check.
 *
 * `session` decides whose session it goes out on: the checker's own secondary
 * session, or the primary one when the signed-in pharmacist did not prepare it.
 */
export function useCheckDispense() {
  return useDispensingWrite(({ dispenseId, confirmed, notes, session }) =>
    DispensingService.check(dispenseId, { confirmed, notes, session })
  );
}
