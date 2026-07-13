// @vitest-environment node

import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../components/icons.ts", () => ({
  icons: {},
}));

vi.mock("../../../lib/chat/tool-display.ts", () => ({
  formatToolDetail: () => undefined,
  resolveToolDisplay: ({ name }: { name: string }) => ({
    name,
    label:
      {
        sessions_spawn: "Sub-agent",
        skill_workshop: "Skill Workshop",
        web_search: "Web Search",
      }[name] ??
      name
        .split(/[._-]/g)
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join(" "),
    icon: "zap",
  }),
}));

describe("tool-card canvas URLs", () => {
  async function loadResolver() {
    return vi.importActual<typeof import("../../../lib/chat/tool-display.ts")>(
      "../../../lib/chat/tool-display.ts",
    );
  }

  it("accepts hosted canvas paths and scopes them through the canvas capability host", async () => {
    const { resolveCanvasIframeUrl } = await loadResolver();

    expect(resolveCanvasIframeUrl("/__openclaw__/canvas/documents/cv_demo/index.html")).toBe(
      "/__openclaw__/canvas/documents/cv_demo/index.html",
    );
    expect(
      resolveCanvasIframeUrl(
        "/__openclaw__/canvas/documents/cv_demo/index.html",
        "http://127.0.0.1:19003/__openclaw__/cap/cap_123",
      ),
    ).toBe(
      "http://127.0.0.1:19003/__openclaw__/cap/cap_123/__openclaw__/canvas/documents/cv_demo/index.html",
    );
  });

  it("rejects unsafe canvas frame URLs unless external embeds are explicitly enabled", async () => {
    const { resolveCanvasIframeUrl } = await loadResolver();

    expect(resolveCanvasIframeUrl("/not-canvas/snake.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("https://example.com/evil.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("file:///tmp/snake.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("https://example.com/embed.html?x=1#y", undefined, true)).toBe(
      "https://example.com/embed.html?x=1#y",
    );
  });
});

describe("isRunningToolCard", () => {
  it("marks only live uncompleted cards as running while a run is active", async () => {
    const { isRunningToolCard } = await import("./chat-tool-cards.ts");
    const liveCard = { id: "t:1", name: "bash", live: true } as const;
    const historicalCard = { id: "t:2", name: "bash" } as const;

    expect(isRunningToolCard(liveCard, true)).toBe(true);
    // Partial streamed output must not end the running state; only the final
    // result event does.
    expect(isRunningToolCard({ ...liveCard, outputText: "partial…" }, true)).toBe(true);
    expect(isRunningToolCard({ ...liveCard, completed: true, outputText: "" }, true)).toBe(false);
    // Historical transcript calls without results (e.g. aborted runs) must
    // stay inert when a later run is active in the same session.
    expect(isRunningToolCard(historicalCard, true)).toBe(false);
    expect(isRunningToolCard(liveCard, false)).toBe(false);
  });

  it("derives a closed outcome from result presence and error state", async () => {
    const { resolveToolCardOutcome } = await import("../../../lib/chat/tool-cards.ts");
    const call = { id: "t:call", name: "edit" } as const;

    expect(resolveToolCardOutcome(call, false)).toBe("unknown");
    expect(resolveToolCardOutcome({ ...call, live: true }, true)).toBe("running");
    expect(resolveToolCardOutcome({ ...call, completed: true, outputText: "" }, false)).toBe(
      "succeeded",
    );
    expect(resolveToolCardOutcome({ ...call, completed: true, isError: true }, false)).toBe(
      "failed",
    );
  });
});
