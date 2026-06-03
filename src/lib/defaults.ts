import type { ComponentGroup, StatusComponent } from "@/types/status";

const op = (id: string, name: string): StatusComponent => ({
  id,
  name,
  status: "operational",
  uptime: { "30d": 100, "60d": 100, "90d": 100 },
  daily_history: [],
});

/**
 * Default component definitions for HydraDB.
 *
 * This list mirrors the current v2 API surface documented at
 * https://agents.hydradb.com and https://docs.hydradb.com/api-reference/v2.
 */
export const DEFAULT_COMPONENTS: StatusComponent[] = [
  // API gateway
  op("api-gateway", "API Gateway"),

  // Tenants
  op("create-tenant", "Create Tenant"),
  op("list-tenants", "List Tenants"),
  op("delete-tenant", "Delete Tenant"),
  op("tenant-status", "Tenant Status"),
  op("list-sub-tenants", "List Sub-Tenants"),
  op("tenant-stats", "Tenant Stats"),

  // Context
  op("ingest-context", "Ingest Context"),
  op("ingestion-status", "Ingestion Status"),
  op("inspect-context", "Inspect Context"),
  op("list-context", "List Context"),
  op("delete-context", "Delete Context"),
  op("context-relations", "Context Relations"),

  // Query
  op("query", "Query"),

  // Indexing webhooks
  op("get-indexing-webhook", "Get Indexing Webhook"),
  op("register-indexing-webhook", "Register / Update Indexing Webhook"),
  op("delete-indexing-webhook", "Delete Indexing Webhook"),
  op("test-indexing-webhook", "Test Indexing Webhook"),
  op("list-webhook-deliveries", "List Webhook Deliveries"),
  op("get-webhook-delivery", "Get Webhook Delivery"),
  op("retry-webhook-delivery", "Retry Webhook Delivery"),

  // Product surfaces
  op("dashboard", "Dashboard"),
  op("documentation", "Documentation"),
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
