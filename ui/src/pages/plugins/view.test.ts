/* @vitest-environment jsdom */

import { expectDefined } from "@openclaw/normalization-core";
import { nothing, render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import type { PluginCatalogItem, PluginListResult } from "../../lib/plugins/index.ts";
import { CONNECTOR_SUGGESTIONS } from "./presentation.ts";
import { pluginRowKey, renderPlugins } from "./view.ts";

type PluginsViewProps = Parameters<typeof renderPlugins>[0];

function createPlugin(overrides: Partial<PluginCatalogItem> = {}): PluginCatalogItem {
  return {
    id: "workboard",
    name: "Workboard",
    description: "Agent work queue and session handoff.",
    version: "1.0.0",
    kind: ["productivity"],
    origin: "bundled",
    installed: true,
    enabled: false,
    state: "disabled",
    featured: true,
    order: 10,
    category: "tool",
    removable: false,
    ...overrides,
  };
}

function createResult(plugins: PluginCatalogItem[]): PluginListResult {
  return { plugins, diagnostics: [], mutationAllowed: true };
}

function createProps(overrides: Partial<PluginsViewProps> = {}): PluginsViewProps {
  return {
    connected: true,
    loading: false,
    result: createResult([createPlugin()]),
    error: null,
    activeTab: "installed",
    query: "",
    installedFilter: "all",
    searchResults: null,
    searchLoading: false,
    searchError: null,
    busy: {},
    messages: {},
    pendingRemoval: {},
    openMenuKey: null,
    detailPluginId: null,
    canMutate: true,
    mutationBlockedReason: null,
    pageNotice: null,
    mcpSettingsHref: "/settings/mcp",
    mcpServers: [],
    mcpMessage: null,
    mcpBusy: false,
    mcpFormOpen: false,
    onQueryChange: () => undefined,
    onFilterChange: () => undefined,
    onRefresh: () => undefined,
    onToggleMenu: () => undefined,
    onShowDetails: () => undefined,
    onSetEnabled: () => undefined,
    onInstall: () => undefined,
    onRequestUninstall: () => undefined,
    onCancelUninstall: () => undefined,
    onUninstall: () => undefined,
    onAddConnector: () => undefined,
    onSearchClawHub: () => undefined,
    onMcpToggle: () => undefined,
    onMcpRemove: () => undefined,
    onMcpFormToggle: () => undefined,
    onMcpAdd: () => undefined,
    ...overrides,
  };
}

function mount(props: PluginsViewProps): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  render(renderPlugins(props), container);
  return container;
}

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function menuItem(container: Element, label: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll<HTMLButtonElement>(".plugins-menu__item")].find((item) =>
      item.textContent?.includes(label),
    ) ?? null
  );
}

function clawHubKey(packageName: string): string {
  return "clawhub:" + packageName;
}

describe("renderPlugins", () => {
  beforeEach(async () => {
    await i18n.setLocale("en");
  });

  afterEach(() => {
    for (const container of document.body.querySelectorAll("div")) {
      render(nothing, container);
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders grouped inventory counts and filters", () => {
    const plugins = [
      createPlugin(),
      createPlugin({
        id: "telegram",
        name: "Telegram",
        category: "channel",
        enabled: true,
        state: "enabled",
        featured: false,
      }),
      createPlugin({
        id: "broken",
        name: "Broken",
        category: "channel",
        state: "error",
        error: "manifest invalid",
        featured: false,
      }),
    ];
    const onFilterChange = vi.fn();
    const container = mount(createProps({ result: createResult(plugins), onFilterChange }));
    const pulse = container.querySelector(".plugins-pulse");
    expect(normalizedText(pulse)).toContain("All 3");
    expect(normalizedText(pulse)).toContain("Enabled 1");
    expect(normalizedText(pulse)).toContain("Issues 1");
    expect(container.querySelector('[data-plugin-id="broken"] [role="alert"]')?.textContent).toContain(
      "manifest invalid",
    );
    const chips = container.querySelectorAll<HTMLButtonElement>(".plugins-filters button");
    expectDefined(chips[3], "issues filter chip").click();
    expect(onFilterChange).toHaveBeenCalledWith("issues");
  });

  it("renders discover shelves and installs official plugins", () => {
    const plugins = [
      createPlugin(),
      createPlugin({
        id: "tavily",
        name: "Tavily",
        origin: "official",
        installed: false,
        enabled: false,
        state: "not-installed",
        featured: false,
        install: { source: "official", pluginId: "tavily" },
      }),
    ];
    const onInstall = vi.fn();
    const container = mount(
      createProps({ activeTab: "discover", result: createResult(plugins), onInstall }),
    );
    expect(container.querySelector("#plugins-shelf-featured")).not.toBeNull();
    container
      .querySelector<HTMLButtonElement>('[data-plugin-id="tavily"] .plugins-install')
      ?.click();
    expect(onInstall).toHaveBeenCalledWith(pluginRowKey("tavily"), {
      source: "official",
      pluginId: "tavily",
    });
  });

  it("renders and installs live ClawHub search results", () => {
    const packageName = "@openclaw/calendar-plus";
    const onInstall = vi.fn();
    const container = mount(
      createProps({
        activeTab: "discover",
        query: "calendar",
        searchResults: [
          {
            score: 0.9,
            package: {
              name: packageName,
              displayName: "Calendar Plus",
              family: "code-plugin",
              channel: "official",
              isOfficial: true,
              summary: "Plan and coordinate work.",
              latestVersion: "2.0.0",
              downloads: 149263,
              verificationTier: "source-linked",
            },
          },
        ],
        onInstall,
      }),
    );
    const row = container.querySelector<HTMLElement>(
      '[data-package-name="' + packageName + '"]',
    );
    expect(normalizedText(row)).toContain("Official");
    expect(normalizedText(row)).toContain("Verified source");
    expect(normalizedText(row)).toContain("149.3K");
    row?.querySelector<HTMLButtonElement>('[aria-label="Install Calendar Plus"]')?.click();
    expect(onInstall).toHaveBeenCalledWith(clawHubKey(packageName), {
      source: "clawhub",
      packageName,
    });
  });

  it("renders row-local risk acknowledgement", () => {
    const packageName = "@openclaw/calendar-plus";
    const key = clawHubKey(packageName);
    const onInstall = vi.fn();
    const container = mount(
      createProps({
        activeTab: "discover",
        query: "calendar",
        searchResults: [
          {
            score: 0.9,
            package: {
              name: packageName,
              displayName: "Calendar Plus",
              family: "bundle-plugin",
              channel: "community",
              isOfficial: false,
            },
          },
        ],
        messages: {
          [key]: {
            kind: "error",
            text: "Review required.",
            acknowledge: { packageName, version: "2.0.0" },
          },
        },
        onInstall,
      }),
    );
    const row = container.querySelector<HTMLElement>(
      '[data-package-name="' + packageName + '"]',
    );
    expect(row?.querySelector('[role="alert"]')?.textContent).toContain("Review required.");
    row?.querySelector<HTMLButtonElement>(".plugins-row-message button")?.click();
    expect(onInstall).toHaveBeenCalledWith(key, {
      source: "clawhub",
      packageName,
      version: "2.0.0",
      acknowledgeClawHubRisk: true,
    });
  });

  it("correlates installed ClawHub packages without a search runtime id", () => {
    const packageName = "@community/calendar-plus";
    const installed = createPlugin({
      id: "calendar-runtime",
      name: "Calendar Plus",
      packageName,
      origin: "global",
      installed: true,
      enabled: true,
      state: "enabled",
      featured: false,
      install: undefined,
    });
    const onSetEnabled = vi.fn();
    const container = mount(
      createProps({
        activeTab: "discover",
        query: "calendar",
        result: createResult([installed]),
        openMenuKey: clawHubKey(packageName),
        searchResults: [
          {
            score: 0.9,
            package: {
              name: packageName,
              displayName: "Calendar Plus",
              family: "code-plugin",
              channel: "community",
              isOfficial: false,
            },
          },
        ],
        onSetEnabled,
      }),
    );
    const row = container.querySelector<HTMLElement>(
      '[data-package-name="' + packageName + '"]',
    )!;
    expect(row.querySelector(".plugins-install")).toBeNull();
    expect(normalizedText(row.querySelector(".plugins-state"))).toBe("Enabled");
    menuItem(row, "Disable")?.click();
    expect(onSetEnabled).toHaveBeenCalledWith("calendar-runtime", false, clawHubKey(packageName));
  });

  it("offers enable and remove through the row actions menu", () => {
    const onSetEnabled = vi.fn();
    const onRequestUninstall = vi.fn();
    const onToggleMenu = vi.fn();
    const removableKey = pluginRowKey("community-thing");
    const plugins = [
      createPlugin(),
      createPlugin({
        id: "community-thing",
        name: "Community Thing",
        origin: "global",
        removable: true,
        featured: false,
      }),
    ];
    const closedMenus = mount(createProps({ result: createResult(plugins), onToggleMenu }));
    const kebab = closedMenus.querySelector<HTMLButtonElement>(
      '[data-plugin-id="community-thing"] .plugins-kebab',
    );
    expect(kebab?.getAttribute("aria-expanded")).toBe("false");
    kebab?.click();
    expect(onToggleMenu).toHaveBeenCalledWith(removableKey);

    const container = mount(
      createProps({
        result: createResult(plugins),
        openMenuKey: removableKey,
        onSetEnabled,
        onRequestUninstall,
      }),
    );
    const row = container.querySelector<HTMLElement>('[data-plugin-id="community-thing"]')!;
    expect(normalizedText(row.querySelector(".plugins-state"))).toBe("Disabled");
    menuItem(row, "Enable")?.click();
    expect(onSetEnabled).toHaveBeenCalledWith("community-thing", true, removableKey);
    menuItem(row, "Remove")?.click();
    expect(onRequestUninstall).toHaveBeenCalledWith(removableKey);

    // Bundled plugins expose no Remove item, only enable/disable and details.
    const bundledMenu = mount(
      createProps({ result: createResult(plugins), openMenuKey: pluginRowKey("workboard") }),
    );
    const bundledRow = bundledMenu.querySelector<HTMLElement>('[data-plugin-id="workboard"]')!;
    expect(menuItem(bundledRow, "Remove")).toBeNull();
    expect(menuItem(bundledRow, "Enable")).not.toBeNull();
    expect(menuItem(bundledRow, "View details")).not.toBeNull();
  });

  it("confirms removal before uninstalling", () => {
    const onUninstall = vi.fn();
    const onCancelUninstall = vi.fn();
    const rowKey = pluginRowKey("community-thing");
    const plugins = [
      createPlugin({
        id: "community-thing",
        name: "Community Thing",
        origin: "global",
        removable: true,
        featured: false,
      }),
    ];
    const container = mount(
      createProps({
        result: createResult(plugins),
        pendingRemoval: { [rowKey]: true },
        onUninstall,
        onCancelUninstall,
      }),
    );

    const confirm = container.querySelector<HTMLElement>(".plugins-remove-confirm");
    expect(normalizedText(confirm)).toContain("Remove this plugin?");
    confirm?.querySelector<HTMLButtonElement>(".btn.danger")?.click();
    expect(onUninstall).toHaveBeenCalledWith("community-thing", rowKey);
    confirm?.querySelectorAll<HTMLButtonElement>("button")[1]?.click();
    expect(onCancelUninstall).toHaveBeenCalledWith(rowKey);
  });

  it("opens the detail overlay from a row and renders actions and metadata", () => {
    const onShowDetails = vi.fn();
    const clickable = mount(createProps({ onShowDetails }));
    clickable.querySelector<HTMLElement>('[data-plugin-id="workboard"]')?.click();
    expect(onShowDetails).toHaveBeenCalledWith("workboard");

    const onSetEnabled = vi.fn();
    const container = mount(
      createProps({
        detailPluginId: "workboard",
        onShowDetails,
        onSetEnabled,
      }),
    );
    const detail = container.querySelector<HTMLElement>(".plugins-detail")!;
    expect(detail.getAttribute("role")).toBe("dialog");
    expect(normalizedText(detail.querySelector(".plugins-detail__title"))).toContain("Workboard");
    expect(normalizedText(detail.querySelector(".plugins-detail__meta"))).toContain("workboard");
    detail.querySelectorAll<HTMLButtonElement>(".plugins-detail__actions button")[0]?.click();
    expect(onSetEnabled).toHaveBeenCalledWith("workboard", true, pluginRowKey("workboard"));
    detail.querySelector<HTMLButtonElement>(".plugins-detail__close")?.click();
    expect(onShowDetails).toHaveBeenCalledWith(null);
  });

  it("lists MCP servers with menu-driven toggle and remove plus the add form", () => {
    const onMcpToggle = vi.fn();
    const onMcpRemove = vi.fn();
    const onMcpAdd = vi.fn();
    const container = mount(
      createProps({
        mcpFormOpen: true,
        openMenuKey: "mcp:github",
        mcpServers: [
          {
            name: "github",
            enabled: true,
            transport: "http",
            target: "https://api.githubcopilot.com/mcp/",
            auth: "oauth",
          },
        ],
        onMcpToggle,
        onMcpRemove,
        onMcpAdd,
      }),
    );

    const row = container.querySelector<HTMLElement>('[data-mcp-name="github"]')!;
    expect(normalizedText(row)).toContain("github");
    expect(normalizedText(row)).toContain("OAuth");
    menuItem(row, "Disable")?.click();
    expect(onMcpToggle).toHaveBeenCalledWith("github", false);
    menuItem(row, "Remove")?.click();
    expect(onMcpRemove).toHaveBeenCalledWith("github");

    const form = container.querySelector<HTMLFormElement>(".plugins-mcp-form")!;
    form.querySelector<HTMLInputElement>('[name="mcp-name"]')!.value = "context7";
    form.querySelector<HTMLInputElement>('[name="mcp-target"]')!.value =
      "https://mcp.context7.com/mcp";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onMcpAdd).toHaveBeenCalledWith({
      name: "context7",
      target: "https://mcp.context7.com/mcp",
    });
  });

  it("adds MCP connectors and routes ClawHub connector searches", () => {
    const onAddConnector = vi.fn();
    const onSearchClawHub = vi.fn();
    const container = mount(
      createProps({ activeTab: "discover", onAddConnector, onSearchClawHub }),
    );

    const github = container.querySelector<HTMLElement>('[data-connector-id="github"]');
    expect(normalizedText(github)).toContain("MCP");
    github?.querySelector<HTMLButtonElement>(".plugins-card__footer button")?.click();
    expect(onAddConnector).toHaveBeenCalledWith(
      CONNECTOR_SUGGESTIONS.find((connector) => connector.id === "github"),
    );

    const spotify = container.querySelector<HTMLElement>('[data-connector-id="spotify"]');
    spotify?.querySelector<HTMLButtonElement>(".plugins-card__footer button")?.click();
    expect(onSearchClawHub).toHaveBeenCalledWith("spotify");
  });

  it("marks already-added MCP connectors instead of offering Add", () => {
    const container = mount(
      createProps({
        activeTab: "discover",
        mcpServers: [
          { name: "github", enabled: true, transport: "http", target: "https://x", auth: "oauth" },
        ],
      }),
    );

    const github = container.querySelector<HTMLElement>('[data-connector-id="github"]');
    expect(normalizedText(github)).toContain("Added");
    expect(github?.querySelector(".plugins-card__footer button")).toBeNull();
  });

  it("keeps discovery available while disabling all read-only mutations", () => {
    const onInstall = vi.fn();
    const onSetEnabled = vi.fn();
    const available = createPlugin({
      id: "lobster",
      name: "Lobster",
      installed: false,
      enabled: false,
      state: "not-installed",
      install: { source: "official", pluginId: "lobster" },
    });
    const container = mount(
      createProps({
        activeTab: "discover",
        result: createResult([createPlugin(), available]),
        canMutate: false,
        mutationBlockedReason: "Browsing only. Plugin changes require operator.admin access.",
        openMenuKey: pluginRowKey("workboard"),
        onInstall,
        onSetEnabled,
      }),
    );

    expect(container.querySelector(".plugins-readonly")?.textContent).toContain("operator.admin");
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Install Lobster"]')?.disabled,
    ).toBe(true);
    const workboardRow = container.querySelector<HTMLElement>('[data-plugin-id="workboard"]')!;
    const enableItem = menuItem(workboardRow, "Enable");
    expect(enableItem?.disabled).toBe(true);
    enableItem?.click();
    expect(onInstall).not.toHaveBeenCalled();
    expect(onSetEnabled).not.toHaveBeenCalled();
  });

  it("does not present an empty catalog alongside an initial list failure", () => {
    const container = mount(createProps({ result: null, error: "Plugin inventory unavailable" }));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Plugin inventory unavailable",
    );
    expect(container.textContent).not.toContain("No optional plugins installed");
  });

  it("renders bundled cover art in discover and gradient fallbacks elsewhere", () => {
    const plugins = [
      createPlugin(),
      createPlugin({
        id: "totally-unknown",
        name: "Totally Unknown",
        featured: true,
        origin: "official",
        installed: false,
        state: "not-installed",
      }),
    ];
    const container = mount(createProps({ activeTab: "discover", result: createResult(plugins) }));

    const art = container.querySelector<HTMLImageElement>(
      '[data-plugin-id="workboard"] .plugins-cover img',
    );
    expect(art?.src).toContain("plugin-art/workboard.webp");

    const fallback = container.querySelector<HTMLElement>(
      '[data-plugin-id="totally-unknown"] .plugins-cover--fallback',
    );
    expect(fallback?.getAttribute("style")).toContain("--plugins-art-a");
    expect(normalizedText(fallback)).toBe("TU");
  });
});
