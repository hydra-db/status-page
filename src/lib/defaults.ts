import type { ComponentGroup, StatusComponent } from "@/types/status";

const op = (
  id: string,
  name: string,
  details: Pick<StatusComponent, "method" | "path" | "href"> = {},
): StatusComponent => ({
  id,
  name,
  status: "operational",
  uptime: { "30d": 100, "60d": 100, "90d": 100 },
  daily_history: [],
  ...details,
});

/**
 * Default component definitions for HydraDB.
 *
 * This list mirrors the current v2 API surface documented at
 * https://agents.hydradb.com and https://docs.hydradb.com/api-reference/v2.
 */
export const DEFAULT_COMPONENTS: StatusComponent[] = [
  // API gateway
  op("api-gateway", "API Gateway", { method: "GET", path: "/health" }),

  // Tenants
  op("create-tenant", "Create Tenant", { method: "POST", path: "/tenants" }),
  op("list-tenants", "List Tenants", { method: "GET", path: "/tenants" }),
  op("delete-tenant", "Delete Tenant", { method: "DELETE", path: "/tenants" }),
  op("tenant-status", "Tenant Status", { method: "GET", path: "/tenants/status" }),
  op("list-sub-tenants", "List Sub-Tenants", { method: "GET", path: "/tenants/sub-tenants" }),
  op("tenant-stats", "Tenant Stats", { method: "GET", path: "/tenants/stats" }),

  // Context
  op("ingest-context", "Ingest Context", { method: "POST", path: "/context/ingest" }),
  op("ingestion-status", "Ingestion Status", { method: "GET", path: "/context/status" }),
  op("inspect-context", "Inspect Context", { method: "GET", path: "/context/inspect" }),
  op("list-context", "List Context", { method: "POST", path: "/context/list" }),
  op("delete-context", "Delete Context", { method: "DELETE", path: "/context" }),
  op("context-relations", "Context Relations", { method: "GET", path: "/context/relations" }),

  // Query
  op("query", "Query", { method: "POST", path: "/query" }),

  // Indexing webhooks
  op("get-indexing-webhook", "Get Indexing Webhook", { method: "GET", path: "/webhooks/indexing" }),
  op("register-indexing-webhook", "Register / Update Indexing Webhook", { method: "POST", path: "/webhooks/indexing" }),
  op("delete-indexing-webhook", "Delete Indexing Webhook", { method: "DELETE", path: "/webhooks/indexing" }),
  op("test-indexing-webhook", "Test Indexing Webhook", { method: "POST", path: "/webhooks/indexing/test" }),
  op("list-webhook-deliveries", "List Webhook Deliveries", { method: "GET", path: "/webhooks/indexing/deliveries" }),
  op("get-webhook-delivery", "Get Webhook Delivery", { method: "GET", path: "/webhooks/indexing/deliveries/{delivery_id}" }),
  op("retry-webhook-delivery", "Retry Webhook Delivery", { method: "POST", path: "/webhooks/indexing/deliveries/{delivery_id}/retry" }),

  // Product surfaces
  op("dashboard", "Dashboard", { href: "https://app.hydradb.com" }),
  op("documentation", "Documentation", { href: "https://docs.hydradb.com" }),
];

const group = (id: string, name: string, componentIds: string[]): ComponentGroup => ({
  id,
  name,
  components: DEFAULT_COMPONENTS.filter((c) => componentIds.includes(c.id)),
});

export const DEFAULT_COMPONENT_GROUPS: ComponentGroup[] = [
  group("api-gateway", "API Gateway", ["api-gateway"]),
  group("tenants", "Tenants", [
    "create-tenant",
    "list-tenants",
    "delete-tenant",
    "tenant-status",
    "list-sub-tenants",
    "tenant-stats",
  ]),
  group("context", "Context", [
    "ingest-context",
    "ingestion-status",
    "inspect-context",
    "list-context",
    "delete-context",
    "context-relations",
  ]),
  group("query", "Query", ["query"]),
  group("indexing-webhooks", "Indexing Webhooks", [
    "get-indexing-webhook",
    "register-indexing-webhook",
    "delete-indexing-webhook",
    "test-indexing-webhook",
    "list-webhook-deliveries",
    "get-webhook-delivery",
    "retry-webhook-delivery",
  ]),
  group("product-surfaces", "Product Surfaces", ["dashboard", "documentation"]),
];
