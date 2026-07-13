// Control UI tests cover tool-title request eligibility and the title store.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayBrowserClient } from "../../api/gateway.ts";
import { configureToolTitleFetcher, getToolCallTitle } from "./tool-titles.ts";

afterEach(() => {
  configureToolTitleFetcher({ client: null, sessionKey: null, onTitlesChanged: null });
  vi.useRealTimers();
});

describe("getToolCallTitle", () => {
  it("returns undefined for eligible calls without a stored title", () => {
    expect(getToolCallTitle("bash", { command: "git log --oneline -5" })).toBeUndefined();
  });
});

describe("title fetch batching", () => {
  it("notifies every pane that contributed rows to a title batch", async () => {
    vi.useFakeTimers();
    const client = {
      request: vi.fn(async (_method: string, params: unknown) => {
        const items = (params as { items: Array<{ id: string }> }).items;
        return { titles: Object.fromEntries(items.map((item) => [item.id, "Titled"])) };
      }),
    } as unknown as GatewayBrowserClient;
    const notifyA = vi.fn();
    const notifyB = vi.fn();

    // Two panes on the same session/agent enqueue into one batch.
    configureToolTitleFetcher({
      client,
      sessionKey: "agent:a:main",
      agentId: "a",
      onTitlesChanged: notifyA,
    });
    getToolCallTitle("bash", { command: "pnpm run build --filter ui --reporter append-only" });
    configureToolTitleFetcher({
      client,
      sessionKey: "agent:a:main",
      agentId: "a",
      onTitlesChanged: notifyB,
    });
    getToolCallTitle("bash", { command: "pnpm test ui/src/pages/chat --reporter verbose" });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(notifyA).toHaveBeenCalled();
    expect(notifyB).toHaveBeenCalled();
  });

  it("stops requesting for the session once the gateway reports titles disabled", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => ({ titles: {}, disabled: true }));
    const client = { request } as unknown as GatewayBrowserClient;

    configureToolTitleFetcher({
      client,
      sessionKey: "agent:a:main",
      agentId: "a",
      onTitlesChanged: null,
    });
    getToolCallTitle("bash", { command: "pnpm run build --filter ui --mode production" });
    await vi.advanceTimersByTimeAsync(1_000);
    // A different eligible call after the disabled response must not schedule.
    getToolCallTitle("bash", { command: "pnpm test ui/src/pages/chat --runInBand" });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sends queued items with the session and agent captured at schedule time", async () => {
    vi.useFakeTimers();
    const requests: Array<{ sessionKey: string; agentId?: string }> = [];
    const client = {
      request: vi.fn(async (_method: string, params: unknown) => {
        requests.push(params as { sessionKey: string; agentId?: string });
        return { titles: {} };
      }),
    } as unknown as GatewayBrowserClient;

    // Pane A schedules, then pane B re-renders (and reconfigures) before the
    // debounce fires; the request must keep pane A's session and agent.
    configureToolTitleFetcher({
      client,
      sessionKey: "global",
      agentId: "alice",
      onTitlesChanged: null,
    });
    getToolCallTitle("bash", { command: "pnpm run build --filter ui --mode development" });
    configureToolTitleFetcher({
      client,
      sessionKey: "agent:b:main",
      agentId: "b",
      onTitlesChanged: null,
    });
    getToolCallTitle("bash", { command: "pnpm test ui/src/pages/chat --sequence.concurrent" });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(requests).toEqual([
      expect.objectContaining({ sessionKey: "global", agentId: "alice" }),
      expect.objectContaining({ sessionKey: "agent:b:main", agentId: "b" }),
    ]);
  });
});
