// Control UI tests cover sidebar pinned-route customization behavior.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_PINNED_ROUTES,
  SIDEBAR_NAV_ROUTES,
  isSettingsNavigationRoute,
  normalizeSidebarPinnedRoutes,
  sidebarMoreRoutes,
} from "./app-navigation.ts";

describe("sidebar pinned routes", () => {
  it("keeps operational destinations visible by default", () => {
    expect(DEFAULT_SIDEBAR_PINNED_ROUTES).toEqual(["usage", "cron", "plugins"]);
  });

  it("drops the retired overview route from persisted pins", () => {
    expect(normalizeSidebarPinnedRoutes(["overview", "usage"])).toEqual(["usage"]);
  });

  it("normalizes persisted pinned routes, dropping unknown and duplicate entries", () => {
    expect(
      normalizeSidebarPinnedRoutes(["usage", "sessions", "usage", "worktrees", "instances", 7]),
    ).toEqual(["usage", "sessions"]);
    expect(normalizeSidebarPinnedRoutes([])).toEqual([]);
  });

  it("falls back to null for non-list values so callers use defaults", () => {
    expect(normalizeSidebarPinnedRoutes(undefined)).toBeNull();
    expect(normalizeSidebarPinnedRoutes({ usage: true })).toBeNull();
    expect(normalizeSidebarPinnedRoutes("usage")).toBeNull();
  });

  it("puts every unpinned nav route into the More section", () => {
    const pinned = ["sessions", "usage"] as const;
    const more = sidebarMoreRoutes(pinned);
    expect(more).not.toContain("sessions");
    expect(more).not.toContain("usage");
    expect(new Set([...pinned, ...more])).toEqual(new Set(SIDEBAR_NAV_ROUTES));
  });
});
