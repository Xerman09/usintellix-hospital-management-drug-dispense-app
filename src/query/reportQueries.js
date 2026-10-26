import { useQuery } from '@tanstack/react-query';
import { ReportService } from '../api/reports';
import { unwrap } from './queryClient';

/**
 * Reports are read at the end of a shift rather than watched, so none of these
 * poll. They are cached for a minute so flicking between tabs is instant, and
 * refetched when the pharmacist pulls or changes a filter.
 *
 * The dashboard is the exception: it is the screen someone leaves open, so it
 * refreshes on a slower beat than the dispensing queue does.
 */
const REPORT_STALE_MS = 60 * 1000;

export function usePharmacyDashboard(warehouseId) {
  return useQuery({
    queryKey: ['pharmacy', 'dashboard', warehouseId ?? null],
    queryFn: () => unwrap(ReportService.dashboard(warehouseId)),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 30 * 1000,
  });
}

export function useReportOptions() {
  return useQuery({
    queryKey: ['pharmacy', 'report-options'],
    queryFn: () => unwrap(ReportService.options()),
    staleTime: 10 * 60 * 1000,
  });
}

export function useDispensingLog(filters) {
  return useQuery({
    queryKey: ['pharmacy', 'dispensing-log', filters],
    queryFn: () => unwrap(ReportService.dispensingLog(filters)),
    staleTime: REPORT_STALE_MS,
  });
}

export function useDangerousDrugs(filters) {
  return useQuery({
    queryKey: ['pharmacy', 'dangerous-drugs', filters],
    queryFn: () => unwrap(ReportService.dangerousDrugs(filters)),
    staleTime: REPORT_STALE_MS,
  });
}

export function useUnfilled(filters) {
  return useQuery({
    queryKey: ['pharmacy', 'unfilled', filters],
    queryFn: () => unwrap(ReportService.unfilled(filters)),
    staleTime: REPORT_STALE_MS,
  });
}

export function useByPrescriber(filters) {
  return useQuery({
    queryKey: ['pharmacy', 'by-prescriber', filters],
    queryFn: () => unwrap(ReportService.byPrescriber(filters)),
    staleTime: REPORT_STALE_MS,
  });
}
