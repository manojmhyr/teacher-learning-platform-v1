/**
 * Single source of truth for runtime configuration.
 *
 * Everything here is driven by Vite env vars (`.env.local`, or the pipeline's
 * variable group). Nothing secret belongs in these values: anything compiled
 * into the bundle is readable by anyone who opens the app. Storage account
 * keys and connection strings stay on the backend — see docs/AZURE_SETUP.md.
 */

export type ContentSource = 'mock' | 'azure';

interface AppConfig {
  /** Which content provider serves lesson plans, videos and resources. */
  contentSource: ContentSource;
  /**
   * Backend base URL (Spring Boot). Empty while running on mock data, and also
   * when VITE_API_BASE_URL is `/`: then calls go to the page's own origin and
   * the Vite dev server forwards them — how a phone reaches the API in testing.
   */
  apiBaseUrl: string;
  /** Azure Blob service base, e.g. https://acct.blob.core.windows.net */
  azureBlobBaseUrl: string;
  /** Container holding lesson content. */
  azureContainer: string;
  /**
   * Endpoint on OUR backend that mints a short-lived read-only SAS URL for a
   * blob. The browser never holds an account key — it asks the backend, which
   * checks the teacher is entitled to that lesson, then signs a narrow SAS.
   */
  sasEndpoint: string;
  /** Seconds a minted SAS URL is treated as valid client-side. */
  sasTtlSeconds: number;
  appName: string;
  organisation: string;
  /** Build id surfaced in Settings so support can identify a version. */
  buildId: string;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function int(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const raw = import.meta.env;

export const config: AppConfig = {
  contentSource: str(raw.VITE_CONTENT_SOURCE, 'mock') === 'azure' ? 'azure' : 'mock',
  apiBaseUrl: str(raw.VITE_API_BASE_URL, '').replace(/\/+$/, ''),
  azureBlobBaseUrl: str(raw.VITE_AZURE_BLOB_BASE_URL, '').replace(/\/+$/, ''),
  azureContainer: str(raw.VITE_AZURE_CONTAINER, 'lesson-content'),
  sasEndpoint: str(raw.VITE_SAS_ENDPOINT, '/api/content/sas'),
  sasTtlSeconds: int(raw.VITE_SAS_TTL_SECONDS, 300),
  appName: str(raw.VITE_APP_NAME, 'Teacher Portal'),
  organisation: str(raw.VITE_ORG_NAME, 'Rastriya Academy'),
  buildId: str(raw.VITE_BUILD_ID, 'dev'),
};

/** True when the app is serving built-in demo content rather than real Azure content. */
export const isDemoContent = config.contentSource === 'mock';

/**
 * True when a backend is configured.
 *
 * With it set, accounts, assignments, lessons and teaching records all come
 * from the API. Without it, the app runs entirely on demo data, which keeps
 * the offline sales demo working.
 */
export const isLiveBackend = str(raw.VITE_API_BASE_URL, '') !== '';

/**
 * Validates the Azure configuration up front so a half-configured deployment
 * fails loudly at startup instead of silently showing empty lesson plans.
 */
export function assertConfigValid(): string[] {
  const problems: string[] = [];
  if (config.contentSource === 'azure') {
    if (!config.azureBlobBaseUrl) problems.push('VITE_AZURE_BLOB_BASE_URL is required when VITE_CONTENT_SOURCE=azure');
    if (!config.apiBaseUrl) problems.push('VITE_API_BASE_URL is required when VITE_CONTENT_SOURCE=azure (needed to mint SAS URLs)');
    if (!config.azureContainer) problems.push('VITE_AZURE_CONTAINER is required when VITE_CONTENT_SOURCE=azure');
  }
  return problems;
}
