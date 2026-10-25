import { useQuery } from '@tanstack/react-query';
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
