import type { HealthEndpoint } from "@/lib/health-config";
import { getFailureThreshold, getTimeout } from "@/lib/health-config";
import { DEFAULT_COMPONENTS } from "@/lib/defaults";

afterEach(() => {
  delete process.env.HEALTH_CHECK_ENDPOINTS;
});

describe("health-config helpers", () => {
  it("getTimeout returns default when not specified", () => {
    const endpoint: HealthEndpoint = {
      componentId: "test",
      name: "Test",
      url: "https://example.com",
    };
    expect(getTimeout(endpoint)).toBe(10_000);
  });

  it("getTimeout returns custom value", () => {
    const endpoint: HealthEndpoint = {
      componentId: "test",
      name: "Test",
      url: "https://example.com",
      timeoutMs: 5000,
    };
    expect(getTimeout(endpoint)).toBe(5000);
  });

  it("getFailureThreshold returns default when not specified", () => {
    const endpoint: HealthEndpoint = {
      componentId: "test",
      name: "Test",
      url: "https://example.com",
    };
    expect(getFailureThreshold(endpoint)).toBe(2);
  });

  it("getFailureThreshold returns custom value", () => {
    const endpoint: HealthEndpoint = {
      componentId: "test",
      name: "Test",
      url: "https://example.com",
      failureThreshold: 5,
    };
    expect(getFailureThreshold(endpoint)).toBe(5);
  });
});

describe("HEALTH_CHECK_ENDPOINTS env var parsing", () => {
  it("parses array format", () => {
    process.env.HEALTH_CHECK_ENDPOINTS = JSON.stringify([
      { componentId: "dashboard", name: "Dashboard", url: "https://app.hydradb.com" },
    ]);

    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].componentId).toBe("dashboard");
  });

  it("parses simple object format", () => {
    process.env.HEALTH_CHECK_ENDPOINTS = JSON.stringify({
      dashboard: "https://app.hydradb.com",
      query: "https://api.hydradb.com/query",
    });

    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints();
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].componentId).toBe("dashboard");
    expect(endpoints[0].url).toBe("https://app.hydradb.com");
  });

  it("falls back to defaults on invalid JSON", () => {
    process.env.HEALTH_CHECK_ENDPOINTS = "not-json";

    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints();
    // Falls back to defaults derived from DEFAULT_COMPONENTS
    expect(endpoints).toHaveLength(DEFAULT_COMPONENTS.length);
    expect(endpoints[0].componentId).toBe("api-gateway");
  });
});

describe("getHealthEndpoints default endpoints", () => {
  it("returns endpoints whose componentIds exactly match DEFAULT_COMPONENTS ids", () => {
    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints() as HealthEndpoint[];

    const endpointIds = endpoints.map((ep: HealthEndpoint) => ep.componentId);
    const defaultIds = DEFAULT_COMPONENTS.map((c) => c.id);

    expect(endpointIds).toEqual(defaultIds);
  });

  it("returns endpoints with matching names from DEFAULT_COMPONENTS", () => {
    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints() as HealthEndpoint[];

    const endpointNames = endpoints.map((ep: HealthEndpoint) => ep.name);
    const defaultNames = DEFAULT_COMPONENTS.map((c) => c.name);

    expect(endpointNames).toEqual(defaultNames);
  });

  it("every endpoint has a valid URL", () => {
    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints() as HealthEndpoint[];

    for (const ep of endpoints) {
      expect(ep.url).toMatch(/^https:\/\//);
    }
  });

  it("maps default checks to the documented v2 API and product surfaces", () => {
    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints() as HealthEndpoint[];
    const byId = new Map(endpoints.map((ep) => [ep.componentId, ep]));

    expect(byId.get("api-gateway")?.url).toBe("https://api.hydradb.com/health");
    expect(byId.get("create-tenant")).toMatchObject({
      url: "https://api.hydradb.com/tenants",
      method: "POST",
      headers: { "API-Version": "2" },
    });
    expect(byId.get("list-tenants")).toMatchObject({
      url: "https://api.hydradb.com/tenants",
      method: "GET",
    });
    expect(byId.get("delete-tenant")).toMatchObject({
      url: "https://api.hydradb.com/tenants",
      method: "DELETE",
    });
    expect(byId.get("ingest-context")).toMatchObject({
      url: "https://api.hydradb.com/context/ingest",
      method: "POST",
      headers: { "API-Version": "2" },
    });
    expect(byId.get("query")).toMatchObject({
      url: "https://api.hydradb.com/query",
      method: "POST",
      headers: { "API-Version": "2" },
    });
    expect(byId.get("register-indexing-webhook")).toMatchObject({
      url: "https://api.hydradb.com/webhooks/indexing",
      method: "POST",
      headers: { "API-Version": "2" },
    });
    expect(byId.get("dashboard")?.url).toBe("https://app.hydradb.com");
    expect(byId.get("documentation")?.url).toBe("https://agents.hydradb.com");
  });

  it("treats auth/validation responses as healthy for v2 endpoint reachability checks", () => {
    jest.resetModules();
    const { getHealthEndpoints } = require("@/lib/health-config");
    const endpoints = getHealthEndpoints() as HealthEndpoint[];
    const queryEndpoint = endpoints.find((ep) => ep.componentId === "query");

    expect(queryEndpoint?.expectedStatus).toEqual([200, 202, 400, 401, 403, 422]);
  });
});
