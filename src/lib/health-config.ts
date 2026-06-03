/**
 * Health check endpoint configuration.
 *
 * Each entry maps a component ID (matching DEFAULT_COMPONENTS in defaults.ts)
 * to the URL that should be pinged. A component is considered healthy when the
 * endpoint returns an expected status within the timeout.
 *
 * Set the HEALTH_CHECK_ENDPOINTS env var as a JSON string to override at
 * runtime without redeploying:
 *
 *   HEALTH_CHECK_ENDPOINTS='[{"componentId":"dashboard","name":"Dashboard","url":"https://app.hydradb.com"}]'
 */

import { DEFAULT_COMPONENTS } from "./defaults";

export interface HealthEndpoint {
  /** Component ID from defaults.ts */
  componentId: string;
  /** Display name (used in incident titles) */
  name: string;
  /** URL to ping */
  url: string;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Number of consecutive failures before creating an incident (default: 2) */
  failureThreshold?: number;
  /** HTTP method (default: GET) */
  method?: string;
  /** Additional request headers */
  headers?: Record<string, string>;
  /** Expected status codes (default: any 2xx) */
  expectedStatus?: number[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const API_BASE_URL = "https://api.hydradb.com";

const V2_ENDPOINT_HEALTHY_STATUSES = [200, 202, 400, 401, 403, 422];
const V2_HEADERS = { "API-Version": "2" };

const v2Endpoint = (
  path: string,
  method = "GET",
): Pick<HealthEndpoint, "url" | "method" | "headers" | "expectedStatus"> => ({
  url: `${API_BASE_URL}${path}`,
  method,
  headers: V2_HEADERS,
  expectedStatus: V2_ENDPOINT_HEALTHY_STATUSES,
});

/**
 * Returns the configured health check endpoints.
 *
 * Priority:
 * 1. HEALTH_CHECK_ENDPOINTS env var (JSON string)
 * 2. Hardcoded defaults below
 *
 * Health check strategy:
 * - The v2 API is auth-gated, so endpoint-specific checks expect auth or
 *   validation responses (401/403/400/422) as healthy. That proves the route
 *   and service are reachable without requiring production credentials or
 *   mutating data.
 * - The API gateway, Dashboard, and documentation are checked with simple GETs
 *   that must return 2xx.
 */
export function getHealthEndpoints(): HealthEndpoint[] {
  const envEndpoints = process.env.HEALTH_CHECK_ENDPOINTS;
  if (envEndpoints) {
    try {
      const parsed = JSON.parse(envEndpoints);
      if (Array.isArray(parsed)) return parsed;
      // Support simple { componentId: url } format
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.entries(parsed).map(([componentId, url]) => ({
          componentId,
          name: componentId
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          url: url as string,
        }));
      }
    } catch {
      console.error("[health-check] Failed to parse HEALTH_CHECK_ENDPOINTS env var");
    }
  }

  const endpointByComponentId: Record<
    string,
    Pick<HealthEndpoint, "url" | "method" | "headers" | "expectedStatus">
  > = {
    "api-gateway": { url: `${API_BASE_URL}/health` },

    "create-tenant": v2Endpoint("/tenants", "POST"),
    "list-tenants": v2Endpoint("/tenants", "GET"),
    "delete-tenant": v2Endpoint("/tenants", "DELETE"),
    "tenant-status": v2Endpoint("/tenants/status", "GET"),
    "list-sub-tenants": v2Endpoint("/tenants/sub-tenants", "GET"),
    "tenant-stats": v2Endpoint("/tenants/stats", "GET"),

    "ingest-context": v2Endpoint("/context/ingest", "POST"),
    "ingestion-status": v2Endpoint("/context/status", "GET"),
    "inspect-context": v2Endpoint("/context/inspect", "GET"),
    "list-context": v2Endpoint("/context/list", "POST"),
    "delete-context": v2Endpoint("/context", "DELETE"),
    "context-relations": v2Endpoint("/context/relations", "GET"),

    query: v2Endpoint("/query", "POST"),

    "get-indexing-webhook": v2Endpoint("/webhooks/indexing", "GET"),
    "register-indexing-webhook": v2Endpoint("/webhooks/indexing", "POST"),
    "delete-indexing-webhook": v2Endpoint("/webhooks/indexing", "DELETE"),
    "test-indexing-webhook": v2Endpoint("/webhooks/indexing/test", "POST"),
    "list-webhook-deliveries": v2Endpoint("/webhooks/indexing/deliveries", "GET"),
    "get-webhook-delivery": v2Endpoint("/webhooks/indexing/deliveries/health-check-placeholder", "GET"),
    "retry-webhook-delivery": v2Endpoint("/webhooks/indexing/deliveries/health-check-placeholder/retry", "POST"),

    dashboard: { url: "https://app.hydradb.com" },
    documentation: { url: "https://agents.hydradb.com" },
  };

  return DEFAULT_COMPONENTS.map((c) => ({
    componentId: c.id,
    name: c.name,
    ...(endpointByComponentId[c.id] ?? { url: `${API_BASE_URL}/health` }),
  }));
}

export function getTimeout(endpoint: HealthEndpoint): number {
  return endpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function getFailureThreshold(endpoint: HealthEndpoint): number {
  return endpoint.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
}
