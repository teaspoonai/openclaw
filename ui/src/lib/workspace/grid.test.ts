import { describe, expect, it } from "vitest";
import {
  collides,
  WORKSPACE_GRID_GAP,
  gridPlacementStyle,
  gridRowCount,
  nudgeRect,
  resolveDrop,
} from "./grid.ts";
import type { WorkspaceWidget } from "./types.ts";

function widget(id: string, x: number, y: number, w: number, h: number): WorkspaceWidget {
  return { id, kind: "builtin:stat-card", title: id, grid: { x, y, w, h }, collapsed: false };
}

describe("workspace grid math", () => {
  it("detects collisions against other widgets, ignoring self", () => {
    const widgets = [widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2)];
    expect(collides({ x: 2, y: 0, w: 4, h: 2 }, widgets, "b")).toBe(true);
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, widgets, "a")).toBe(false);
    expect(collides({ x: 8, y: 0, w: 4, h: 2 }, widgets, "c")).toBe(false);
  });

  it("accepts a non-overlapping drop as-is", () => {
    const widgets = [widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2)];
    expect(resolveDrop({ requested: { x: 8, y: 0, w: 4, h: 2 }, widgets, widgetId: "b" })).toEqual({
      x: 8,
      y: 0,
      w: 4,
      h: 2,
    });
  });

  it("rejects an overlapping drop and offers the nearest free slot", () => {
    const widgets = [widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2)];
    // Dropping b onto a's cells must not overlap; nearest free slot is offered.
    const resolved = resolveDrop({ requested: { x: 0, y: 0, w: 4, h: 2 }, widgets, widgetId: "b" });
    expect(resolved).not.toBeNull();
    expect(collides(resolved!, widgets, "b")).toBe(false);
  });

  it("renders 1-based grid placement CSS", () => {
    expect(gridPlacementStyle({ x: 0, y: 0, w: 4, h: 2 })).toBe(
      "grid-column: 1 / span 4; grid-row: 1 / span 2",
    );
    expect(gridPlacementStyle({ x: 8, y: 3, w: 4, h: 1 })).toBe(
      "grid-column: 9 / span 4; grid-row: 4 / span 1",
    );
  });

  it("counts total grid rows spanned", () => {
    expect(gridRowCount([widget("a", 0, 0, 4, 2), widget("b", 4, 1, 4, 3)])).toBe(4);
    expect(gridRowCount([])).toBe(0);
  });

  it("nudges rects by keyboard for move and resize", () => {
    expect(nudgeRect({ x: 2, y: 2, w: 4, h: 2 }, "move", "left")).toEqual({
      x: 1,
      y: 2,
      w: 4,
      h: 2,
    });
    expect(nudgeRect({ x: 0, y: 0, w: 4, h: 2 }, "move", "left")).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 2,
    });
    expect(nudgeRect({ x: 0, y: 0, w: 4, h: 2 }, "resize", "right")).toEqual({
      x: 0,
      y: 0,
      w: 5,
      h: 2,
    });
    expect(nudgeRect({ x: 0, y: 0, w: 1, h: 1 }, "resize", "left")).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it("exports the grid gap constant used by view sizing", () => {
    expect(WORKSPACE_GRID_GAP).toBeGreaterThan(0);
  });
});
