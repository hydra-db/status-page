/**
 * Tests for the Vercel Cron job handler (src/app/api/cron/route.ts).
 *
 * We mock the S3 layer and incident.io client to test the handler logic
 * in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock("@/lib/s3", () => ({
  readStatusData: jest.fn(),
  writeStatusData: jest.fn(),
}));

jest.mock("@/lib/incident-io", () => ({
  fetchWidgetData: jest.fn(),
  normalizeWidgetResponse: jest.fn(),
  mapComponentStatuses: jest.fn(),
  // normalizeName is used in the reverseComponentMap build (cron route step 4).
  // Return a simple passthrough so the mock doesn't silently swallow calls.
  normalizeName: jest.fn((name: string) =>
    name.toLowerCase().replace(/[&/]/g, " ").replace(/\s+/g, " ").trim(),
  ),
}));

import { GET } from "@/app/api/cron/route";
import { readStatusData, writeStatusData } from "@/lib/s3";
import {
  fetchWidgetData,
  normalizeWidgetResponse,
  mapComponentStatuses,
  normalizeName,
} from "@/lib/incident-io";
import { DEFAULT_COMPONENT_GROUPS } from "@/lib/defaults";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockReadStatusData = readStatusData as jest.MockedFunction<typeof readStatusData>;
const mockWriteStatusData = writeStatusData as jest.MockedFunction<typeof writeStatusData>;
const mockFetchWidgetData = fetchWidgetData as jest.MockedFunction<typeof fetchWidgetData>;
const mockNormalizeWidgetResponse = normalizeWidgetResponse as jest.MockedFunction<typeof normalizeWidgetResponse>;
const mockMapComponentStatuses = mapComponentStatuses as jest.MockedFunction<typeof mapComponentStatuses>;
const mockNormalizeName = normalizeName as jest.MockedFunction<typeof normalizeName>;

function makeRequest(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return new Request("https://status.hydradb.com/api/cron", { headers: h });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/cron", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: "test-secret" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest({ authorization: "Bearer anything" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("CRON_SECRET not configured");
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when authorization header is wrong", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // Not configured (no INCIDENT_IO_WIDGET_URL)
  // -----------------------------------------------------------------------

  it("writes default data on first run when not configured", async () => {
    mockReadStatusData.mockResolvedValue(null);
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(false);

    // Should write default snapshot
    expect(mockWriteStatusData).toHaveBeenCalledTimes(1);
    const snapshot = mockWriteStatusData.mock.calls[0][0];
    expect(snapshot.configured).toBe(false);
    expect(snapshot.overall_status).toBe("operational");
    expect(snapshot.component_groups.length).toBeGreaterThan(0);
    expect(snapshot.incidents).toEqual([]);
    expect(snapshot.maintenance_windows).toEqual([]);
  });

  it("does not overwrite existing current default data when not configured", async () => {
    mockReadStatusData.mockResolvedValue({
      generated_at: "2026-04-14T00:00:00Z",
      configured: false,
      overall_status: "operational",
      component_groups: DEFAULT_COMPONENT_GROUPS,
      incidents: [],
      maintenance_windows: [],
    });

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    expect(mockWriteStatusData).not.toHaveBeenCalled();
  });

  it("migrates stale unconfigured fallback data to the current default components", async () => {
    mockReadStatusData.mockResolvedValue({
      generated_at: "2026-04-14T00:00:00Z",
      configured: false,
      overall_status: "operational",
      component_groups: [],
      incidents: [],
      maintenance_windows: [],
    });
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    expect(mockWriteStatusData).toHaveBeenCalledTimes(1);
    const snapshot = mockWriteStatusData.mock.calls[0][0];
    const allIds = snapshot.component_groups.flatMap((g) => g.components.map((c) => c.id));
    expect(allIds).toContain("api-gateway");
    expect(allIds).toContain("query");
    expect(allIds).toContain("documentation");
  });

  // -----------------------------------------------------------------------
  // Configured — successful fetch
  // -----------------------------------------------------------------------

  it("fetches widget data, computes uptime, and writes snapshot when configured", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    mockReadStatusData.mockResolvedValue(null);
    mockFetchWidgetData.mockResolvedValue({ components: [] });
    mockNormalizeWidgetResponse.mockReturnValue({
      incidents: [],
      maintenance_windows: [],
    });
    mockMapComponentStatuses.mockReturnValue(new Map());
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    expect(body.components_updated).toBeGreaterThan(0);

    // Should have called the full pipeline
    expect(mockFetchWidgetData).toHaveBeenCalledWith("https://example.com/widget");
    expect(mockNormalizeWidgetResponse).toHaveBeenCalled();
    expect(mockMapComponentStatuses).toHaveBeenCalled();
    expect(mockWriteStatusData).toHaveBeenCalledTimes(1);

    const snapshot = mockWriteStatusData.mock.calls[0][0];
    expect(snapshot.configured).toBe(true);
    expect(snapshot.overall_status).toBe("operational");
  });

  // -----------------------------------------------------------------------
  // Configured — fetch failure (last-known-good)
  // -----------------------------------------------------------------------

  it("keeps existing data when widget API fetch fails", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    mockReadStatusData.mockResolvedValue({
      generated_at: "2026-04-14T00:00:00Z",
      configured: true,
      overall_status: "operational",
      component_groups: [],
      incidents: [],
      maintenance_windows: [],
    });
    mockFetchWidgetData.mockResolvedValue(null); // fetch failed

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("widget_api_unreachable");

    // Should NOT have written anything
    expect(mockWriteStatusData).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("returns 500 on unexpected errors", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";
    mockReadStatusData.mockRejectedValue(new Error("S3 connection failed"));

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("S3 connection failed");
  });

  // -----------------------------------------------------------------------
  // Migration: DEFAULT_COMPONENT_GROUPS as structural source of truth
  // -----------------------------------------------------------------------

  it("uses DEFAULT_COMPONENT_GROUPS structure even when existing data has different components", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    // Existing snapshot has old-style component layout (from before the restructure)
    mockReadStatusData.mockResolvedValue({
      generated_at: "2026-04-14T00:00:00Z",
      configured: true,
      overall_status: "operational",
      component_groups: [
        {
          id: "old-group",
          name: "Old Group",
          components: [
            {
              id: "hybrid-search", // old component, no longer in DEFAULT_COMPONENTS
              name: "Hybrid Search",
              status: "operational",
              daily_history: [{ date: "2026-04-13", uptime_pct: 99.5, status: "degraded" }],
              uptime: { "30d": 99.5, "60d": 99.7, "90d": 99.8 },
            },
          ],
        },
      ],
      incidents: [],
      maintenance_windows: [],
    });
    mockFetchWidgetData.mockResolvedValue({ components: [] });
    mockNormalizeWidgetResponse.mockReturnValue({ incidents: [], maintenance_windows: [] });
    mockMapComponentStatuses.mockReturnValue(new Map());
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const snapshot = mockWriteStatusData.mock.calls[0][0];

    // Must use DEFAULT_COMPONENT_GROUPS structure, not the old "old-group"
    const groupIds = snapshot.component_groups.map((g: { id: string }) => g.id);
    expect(groupIds).not.toContain("old-group");
    // New groups from DEFAULT_COMPONENT_GROUPS must be present
    expect(groupIds).toContain("tenants");
    expect(groupIds).toContain("context");
    expect(groupIds).toContain("query");
    expect(groupIds).toContain("indexing-webhooks");

    // Old component "hybrid-search" should not appear in any group
    const allComponents = snapshot.component_groups.flatMap(
      (g: { components: { id: string }[] }) => g.components,
    );
    const allIds = allComponents.map((c: { id: string }) => c.id);
    expect(allIds).not.toContain("hybrid-search");
  });

  it("preserves historical uptime data for components that carry over across the migration", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    // Existing snapshot already has the new-style "dashboard" component with history
    const existingHistory = [
      { date: "2026-04-12", uptime_pct: 99.1, status: "degraded" },
      { date: "2026-04-13", uptime_pct: 100, status: "operational" },
    ];
    mockReadStatusData.mockResolvedValue({
      generated_at: "2026-04-14T00:00:00Z",
      configured: true,
      overall_status: "operational",
      component_groups: [
        {
          id: "dashboard",
          name: "Dashboard",
          components: [
            {
              id: "dashboard",
              name: "Dashboard",
              status: "operational",
              daily_history: existingHistory,
              uptime: { "30d": 99.5, "60d": 99.7, "90d": 99.8 },
            },
          ],
        },
      ],
      incidents: [],
      maintenance_windows: [],
    });
    mockFetchWidgetData.mockResolvedValue({ components: [] });
    mockNormalizeWidgetResponse.mockReturnValue({ incidents: [], maintenance_windows: [] });
    mockMapComponentStatuses.mockReturnValue(new Map());
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const snapshot = mockWriteStatusData.mock.calls[0][0];
    const allComponents = snapshot.component_groups.flatMap(
      (g: { components: any[] }) => g.components,
    );
    const dashboardComp = allComponents.find((c: { id: string }) => c.id === "dashboard");
    expect(dashboardComp).toBeDefined();

    // Historical entries from before today should be preserved in the merged history
    const history = dashboardComp.daily_history as Array<{ date: string }>;
    const preservedDates = history.map((h) => h.date);
    expect(preservedDates).toContain("2026-04-12");
    expect(preservedDates).toContain("2026-04-13");
  });

  it("reverseComponentMap remaps display names via componentNameMap (e.g. webhook display name -> internal ID)", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    // Restore normalizeName implementation (resetAllMocks clears the factory mock)
    mockNormalizeName.mockImplementation((name: string) =>
      name.toLowerCase().replace(/[&/]/g, " ").replace(/\s+/g, " ").trim(),
    );

    mockReadStatusData.mockResolvedValue(null);
    // Widget returns a component with a display name that does not match the
    // simple hyphen-to-space form of our internal ID.
    const WIDGET_WEBHOOK_ID = "widget-uuid-for-register-webhook";
    mockFetchWidgetData.mockResolvedValue({
      components: [
        { id: WIDGET_WEBHOOK_ID, name: "Register / Update Indexing Webhook", status: { id: "operational" } },
      ],
    });
    // normalizeWidgetResponse returns an incident that references the widget UUID
    mockNormalizeWidgetResponse.mockReturnValue({
      incidents: [
        {
          id: "inc-1",
          name: "Indexing webhook registration is down",
          status: "investigating",
          components: [WIDGET_WEBHOOK_ID],
          updates: [],
          started_at: new Date().toISOString(),
        },
      ],
      maintenance_windows: [],
    });
    // mapComponentStatuses must include the internal ID so reverseComponentMap can index it
    mockMapComponentStatuses.mockReturnValue(
      new Map([["register-indexing-webhook", "operational"]]),
    );
    mockWriteStatusData.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    // The written snapshot should have the incident's component remapped from
    // the widget UUID to our internal ID "register-indexing-webhook"
    const snapshot = mockWriteStatusData.mock.calls[0][0];
    const allComponents = snapshot.component_groups.flatMap(
      (g: { components: any[] }) => g.components,
    );
    const webhookComp = allComponents.find((c: { id: string }) => c.id === "register-indexing-webhook");
    expect(webhookComp).toBeDefined();
    // The incident should have overridden the status to "outage" because the
    // reverseComponentMap correctly mapped the widget UUID to our internal ID.
    expect(webhookComp.status).toBe("outage");
  });

  it("passes componentNameMap to mapComponentStatuses for display-name matching", async () => {
    process.env.INCIDENT_IO_WIDGET_URL = "https://example.com/widget";

    mockReadStatusData.mockResolvedValue(null);
    mockFetchWidgetData.mockResolvedValue({ components: [] });
    mockNormalizeWidgetResponse.mockReturnValue({ incidents: [], maintenance_windows: [] });
    mockMapComponentStatuses.mockReturnValue(new Map());
    mockWriteStatusData.mockResolvedValue(undefined);

    await GET(makeRequest({ authorization: "Bearer test-secret" }));

    // mapComponentStatuses must be called with the componentNameMap (3rd arg)
    const callArgs = mockMapComponentStatuses.mock.calls[0];
    expect(callArgs).toHaveLength(3);
    const componentNameMap = callArgs[2] as Map<string, string>;
    expect(componentNameMap).toBeInstanceOf(Map);
    // Spot-check a few v2 component IDs
    expect(componentNameMap.get("tenant-status")).toBe("Tenant Status");
    expect(componentNameMap.get("ingest-context")).toBe("Ingest Context");
    expect(componentNameMap.get("register-indexing-webhook")).toBe("Register / Update Indexing Webhook");
    expect(componentNameMap.get("dashboard")).toBe("Dashboard");
  });
});
