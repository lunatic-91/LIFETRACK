import { apiClient } from '../lib/api.client';

export type ExportFormat = 'csv' | 'json';

export interface ExportRequest {
  format: ExportFormat;
  trackerId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface ExportResult {
  jobId: string;
  status: 'completed';
  downloadUrl: string;
  entryCount: number;
  generatedAt: string;
}

export interface ExportProcessing {
  jobId: string;
  status: 'processing';
}

export interface ExportJobStatus {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  downloadUrl: string | null;
  entryCount: number | null;
  errorMessage: string | null;
  generatedAt: string | null;
}

/**
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * <= 10,000 matching Entries: resolves already `completed`. More than that:
 * resolves `processing` — the caller polls `fetchExportJobStatus`.
 */
export async function requestExport(req: ExportRequest): Promise<ExportResult | ExportProcessing> {
  const { data } = await apiClient.post<ExportResult | ExportProcessing>('/exports', req);
  return data;
}

export async function fetchExportJobStatus(jobId: string): Promise<ExportJobStatus> {
  const { data } = await apiClient.get<ExportJobStatus>(`/exports/${jobId}`);
  return data;
}

/** `downloadUrl` from the API is a path relative to the API origin. */
export function resolveDownloadUrl(downloadUrl: string): string {
  const base = apiClient.defaults.baseURL ?? '';
  return downloadUrl.startsWith('http') ? downloadUrl : `${base}${downloadUrl}`;
}
