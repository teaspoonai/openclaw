// Channels domain tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelsStatusSnapshot } from "../../api/types.ts";
import { createChannelCapability } from "./index.ts";

type ChannelsState = ReturnType<typeof createChannelCapability>["state"];

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) {
    throw new Error("Expected deferred callbacks to be initialized");
  }
  return { promise, resolve, reject };
}

function createChannelsSnapshot(label: string): ChannelsStatusSnapshot {
  return {
    ts: Date.now(),
    channelOrder: ["test"],
    channelLabels: { test: label },
    channels: {},
    channelAccounts: {},
    channelDefaultAccountId: {},
  };
}

function createState(): ChannelsState {
  return {
    client: {
      request: vi.fn(),
    } as never,
    connected: true,
    channelsLoading: false,
    channelsSnapshot: null,
    channelsError: null,
    channelsLastSuccess: null,
    whatsappLoginMessage: null,
    whatsappLoginQrDataUrl: "data:image/png;base64,current-qr",
    whatsappLoginConnected: false,
    whatsappBusy: false,
  };
}

function requireClientRequest(state: ChannelsState) {
  const request = state.client?.["request"];
  if (!request) {
    throw new Error("Expected channels controller client request");
  }
  return vi.mocked(request);
}

describe("channels controller WhatsApp wait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a stale login result after reconnecting with the same client", async () => {
    const staleWait = createDeferred<{
      message: string;
      connected: boolean;
      qrDataUrl: string;
    }>();
    const freshWait = createDeferred<{
      message: string;
      connected: boolean;
      qrDataUrl: string;
    }>();
    let waitCount = 0;
    const request = vi.fn((method: string) => {
      if (method === "web.login.wait") {
        waitCount += 1;
        return waitCount === 1 ? staleWait.promise : freshWait.promise;
      }
      return Promise.resolve(createChannelsSnapshot("fresh"));
    });
    const client = { request };
    let snapshot = { client, connected: true };
    const listeners = new Set<(next: typeof snapshot) => void>();
    const gateway = {
      get snapshot() {
        return snapshot;
      },
      subscribe(listener: (next: typeof snapshot) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const channels = createChannelCapability(gateway as never);

    const stale = channels.waitWhatsApp();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    snapshot = { client, connected: false };
    for (const listener of listeners) {
      listener(snapshot);
    }
    snapshot = { client, connected: true };
    for (const listener of listeners) {
      listener(snapshot);
    }

    const fresh = channels.waitWhatsApp();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    freshWait.resolve({
      message: "fresh login",
      connected: false,
      qrDataUrl: "data:image/png;base64,fresh-qr",
    });
    await fresh;

    staleWait.resolve({
      message: "stale login",
      connected: true,
      qrDataUrl: "data:image/png;base64,stale-qr",
    });
    await stale;

    expect(channels.state.whatsappLoginMessage).toBe("fresh login");
    expect(channels.state.whatsappLoginQrDataUrl).toBe("data:image/png;base64,fresh-qr");
    expect(request.mock.calls.filter(([method]) => method === "channels.status")).toHaveLength(1);
    channels.dispose();
  });

  it("does not apply or refresh a login result after its capability is disposed", async () => {
    const pending = createDeferred<{
      message: string;
      connected: boolean;
      qrDataUrl: string;
    }>();
    const request = vi.fn(() => pending.promise);
    const client = { request };
    const gateway = {
      snapshot: { client, connected: true },
      subscribe: () => () => undefined,
    };
    const channels = createChannelCapability(gateway as never);

    const wait = channels.waitWhatsApp();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    channels.dispose();
    pending.resolve({
      message: "stale login",
      connected: true,
      qrDataUrl: "data:image/png;base64,stale-qr",
    });
    await wait;

    expect(channels.state.whatsappLoginMessage).toBeNull();
    expect(channels.state.whatsappLoginQrDataUrl).toBeNull();
    expect(request).toHaveBeenCalledOnce();

    await channels.waitWhatsApp();
    expect(request).toHaveBeenCalledOnce();
  });
});
