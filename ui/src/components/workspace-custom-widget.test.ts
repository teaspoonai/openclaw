import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceWidget, WidgetManifestView } from "../lib/workspace/types.ts";
import {
  loadWidgetManifestView,
  renderCustomWidgetHost,
  type CustomWidgetHostContext,
} from "./workspace-custom-widget.ts";

const BRIDGE_TOKEN = "11111111-1111-4111-8111-111111111111";
const FRAME_EXPIRES_AT = Date.now() + 60 * 60 * 1000;

function widget(overrides: Partial<WorkspaceWidget> = {}): WorkspaceWidget {
  return {
    id: "w_custom",
    kind: "custom:revenue-chart",
    title: "Revenue Chart",
    grid: { x: 0, y: 0, w: 6, h: 4 },
    collapsed: false,
    bindings: { value: { source: "static", value: { revenue: 42 } } },
    ...overrides,
  };
}

function manifest(overrides?: Partial<WidgetManifestView>): WidgetManifestView {
  return {
    name: "revenue-chart",
    frameToken: BRIDGE_TOKEN,
    entrypoint: "index.html",
    bindings: { value: { source: "static", value: null } },
    capabilities: ["data:read"],
    ...overrides,
  };
}

function host(overrides?: Partial<CustomWidgetHostContext>): CustomWidgetHostContext {
  return { client: null, basePath: "", sessionKey: "main", ...overrides };
}

function renderToContainer(template: unknown): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(template as never, container);
  return container;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("loadWidgetManifestView", () => {
  it("shapes an authenticated frame response into the bridge read model", async () => {
    const request = vi.fn(async () => ({
      frameToken: BRIDGE_TOKEN,
      frameExpiresAt: FRAME_EXPIRES_AT,
      manifest: {
        entrypoint: "index.html",
        bindings: [{ id: "value", source: "static", value: 1 }],
        capabilities: ["data:read", "prompt:send"],
      },
    }));
    const view = await loadWidgetManifestView({ request } as never, "revenue-chart");
    expect(view).toEqual({
      name: "revenue-chart",
      frameToken: BRIDGE_TOKEN,
      frameExpiresAt: FRAME_EXPIRES_AT,
      entrypoint: "index.html",
      bindings: { value: { source: "static", value: 1 } },
      capabilities: ["data:read", "prompt:send"],
    });
  });

  it("returns null when the authenticated frame request fails", async () => {
    const request = vi.fn(async () => {
      throw new Error("denied");
    });
    expect(await loadWidgetManifestView({ request } as never, "revenue-chart")).toBeNull();
  });

  it("drops prototype-setter binding ids", async () => {
    const request = vi.fn(async () => ({
      frameToken: BRIDGE_TOKEN,
      frameExpiresAt: FRAME_EXPIRES_AT,
      manifest: {
        entrypoint: "index.html",
        bindings: [{ id: "__proto__", source: "static", value: 1 }],
        capabilities: ["data:read"],
      },
    }));

    const view = await loadWidgetManifestView({ request } as never, "revenue-chart");
    expect(Object.keys(view?.bindings ?? {})).toEqual([]);
  });
});

describe("renderCustomWidgetHost DOM", () => {
  it("renders an iframe whose sandbox is exactly allow-scripts", () => {
    const container = renderToContainer(
      renderCustomWidgetHost({ widget: widget(), manifest: manifest(), context: host() }),
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    // The sandbox attribute is a CONSTANT — exactly "allow-scripts", nothing else.
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    const tokens = (iframe?.getAttribute("sandbox") ?? "").split(/\s+/).filter(Boolean);
    expect(tokens).toEqual(["allow-scripts"]);
    expect(tokens).not.toContain("allow-same-origin");
    expect(tokens).not.toContain("allow-forms");
    expect(tokens).not.toContain("allow-popups");
    expect(tokens).not.toContain("allow-top-navigation");
  });

  it("sets referrerpolicy=no-referrer and the served src", () => {
    const container = renderToContainer(
      renderCustomWidgetHost({
        widget: widget(),
        manifest: manifest(),
        context: host({ basePath: "/gw" }),
      }),
    );
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe?.getAttribute("src")).toMatch(
      new RegExp(`^/gw/plugins/workspaces/widgets/${BRIDGE_TOKEN}/revenue-chart/index\\.html$`),
    );
  });
});
