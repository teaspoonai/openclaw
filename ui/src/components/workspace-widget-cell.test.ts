import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceWidget, WidgetManifestView } from "../lib/workspace/types.ts";
import type { BuiltinWidgetContext } from "../lib/workspace/widgets/index.ts";
import {
  renderWidgetCell,
  type WorkspaceCustomWidgetContext,
  type WorkspaceWidgetCellCallbacks,
} from "./workspace-widget-cell.ts";

const BUILTIN_CONTEXT: BuiltinWidgetContext = {
  basePath: "",
  embed: { embedSandboxMode: "strict", allowExternalEmbedUrls: false },
};

function noopCallbacks(): WorkspaceWidgetCellCallbacks {
  return {
    onToggleCollapse: vi.fn(),
    onToggleMenu: vi.fn(),
    onHide: vi.fn(),
    onRemove: vi.fn(),
    onEditTitle: vi.fn(),
    onMoveToTab: vi.fn(),
    onMovePointerDown: vi.fn(),
    onResizePointerDown: vi.fn(),
    onKeyboardNudge: vi.fn(),
  };
}

function widget(overrides: Partial<WorkspaceWidget> = {}): WorkspaceWidget {
  return {
    id: "w1",
    kind: "builtin:stat-card",
    title: "Revenue",
    grid: { x: 0, y: 0, w: 4, h: 2 },
    collapsed: false,
    ...overrides,
  };
}

function renderToContainer(template: unknown): HTMLElement {
  const container = document.createElement("div");
  render(template as never, container);
  return container;
}

describe("workspace widget cell", () => {
  it("renders the title bar with collapse and menu affordances", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget(),
        binding: { value: 1000 },
        menuOpen: false,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    expect(container.querySelector(".workspace-widget__title")?.textContent).toContain("Revenue");
    expect(container.querySelector(".workspace-widget__collapse")).not.toBeNull();
    expect(container.querySelector(".workspace-widget__menu-toggle")).not.toBeNull();
    // Not collapsed → body + resize handle present.
    expect(container.querySelector(".workspace-widget__resize")).not.toBeNull();
  });

  it("strips a trailing (custom) suffix from the visible title but keeps the full title attr (#8)", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget({ title: "Revenue (custom)" }),
        binding: { value: 1 },
        menuOpen: false,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    const title = container.querySelector(".workspace-widget__title");
    expect(title?.textContent?.trim()).toBe("Revenue");
    expect(title?.getAttribute("title")).toBe("Revenue (custom)");
  });

  it("renders a provenance chip for agent-authored widgets", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget({ createdBy: "agent:finance" }),
        binding: { value: 1 },
        menuOpen: false,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    const chip = container.querySelector(".workspace-widget__provenance");
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("title")).toContain("finance");
  });

  it("omits the provenance chip for user-authored widgets", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget({ createdBy: "user" }),
        binding: { value: 1 },
        menuOpen: false,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    expect(container.querySelector(".workspace-widget__provenance")).toBeNull();
  });

  it("hides the body and resize handle when collapsed", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget({ collapsed: true }),
        binding: { value: 1 },
        menuOpen: false,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    expect(container.querySelector(".workspace-widget__body")).toBeNull();
    expect(container.querySelector(".workspace-widget__resize")).toBeNull();
  });

  it("opens the kebab menu with hide/remove/edit/move items", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget(),
        binding: { value: 1 },
        menuOpen: true,
        pending: false,
        dragging: false,
        builtinContext: BUILTIN_CONTEXT,
        callbacks: noopCallbacks(),
      }),
    );
    const items = container.querySelectorAll(".workspace-widget__menu-item");
    expect(items.length).toBe(4);
  });
});

function customManifest(): WidgetManifestView {
  return {
    name: "chart",
    frameToken: "11111111-1111-4111-8111-111111111111",
    entrypoint: "index.html",
    bindings: { value: { source: "static", value: null } },
    capabilities: ["data:read"],
  };
}

function customContext(
  overrides: Partial<WorkspaceCustomWidgetContext> = {},
): WorkspaceCustomWidgetContext {
  return {
    status: "approved",
    createdBy: "user",
    manifest: customManifest(),
    host: { client: null, basePath: "", sessionKey: "main" },
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
}

describe("renderCustomWidget (L5 dispatch)", () => {
  it("never builds an iframe for a pending widget even via the full cell", () => {
    const container = renderToContainer(
      renderWidgetCell({
        widget: widget({ kind: "custom:chart" }),
        binding: null,
        builtinContext: BUILTIN_CONTEXT,
        menuOpen: false,
        pending: false,
        dragging: false,
        callbacks: noopCallbacks(),
        custom: customContext({ status: "pending", manifest: null }),
      }),
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[data-test-id="workspace-custom-pending"]')).not.toBeNull();
  });
});
