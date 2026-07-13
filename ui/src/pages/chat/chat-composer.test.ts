/* @vitest-environment jsdom */

import { html, render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n, t } from "../../i18n/index.ts";
import { renderChatComposer, resetChatComposerState } from "./components/chat-composer.ts";

vi.mock("../../components/icons.ts", () => ({ icons: {} }));

type ComposerProps = Parameters<typeof renderChatComposer>[0];

function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    paneId: crypto.randomUUID(),
    sessionKey: "main",
    currentAgentId: "main",
    connected: true,
    canSend: true,
    disabledReason: null,
    sending: false,
    messages: [],
    stream: null,
    queue: [],
    draft: "",
    sessions: null,
    assistantName: "OpenClaw",
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onQueueRemove: vi.fn(),
    onNewSession: vi.fn(),
    ...overrides,
  };
}

function renderComposer(overrides: Partial<ComposerProps> = {}) {
  const container = document.createElement("div");
  const composerProps = props(overrides);
  render(renderChatComposer(composerProps), container);
  return { container, props: composerProps };
}

function button(container: Element, label: string): HTMLButtonElement {
  const result = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!result) {
    throw new Error(`expected button ${label}`);
  }
  return result;
}

afterEach(async () => {
  resetChatComposerState();
  await i18n.setLocale("en");
  vi.restoreAllMocks();
});

describe("renderChatComposer controls", () => {
  it("switches the primary action between voice, send, queue, and stop", () => {
    const onToggleRealtimeTalk = vi.fn();
    let view = renderComposer({ onToggleRealtimeTalk });
    button(view.container, t("chat.composer.startVoiceInput")).click();
    expect(onToggleRealtimeTalk).toHaveBeenCalledOnce();

    const onSend = vi.fn();
    view = renderComposer({ draft: "Send this", onSend });
    button(view.container, t("chat.runControls.sendMessage")).click();
    expect(onSend).toHaveBeenCalledOnce();

    const onAbort = vi.fn();
    view = renderComposer({ canAbort: true, onAbort, draft: "Follow up" });
    expect(button(view.container, t("chat.runControls.queueMessage")).disabled).toBe(false);
    button(view.container, t("chat.runControls.stopGenerating")).click();
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("queues ordinary drafts offline but disables live voice", () => {
    const onSend = vi.fn();
    let view = renderComposer({ connected: false, draft: "queue this", onSend });
    const send = button(view.container, t("chat.runControls.sendMessage"));
    expect(send.disabled).toBe(false);
    send.click();
    expect(onSend).toHaveBeenCalledOnce();

    view = renderComposer({ connected: false, onToggleRealtimeTalk: vi.fn() });
    expect(button(view.container, t("chat.composer.startVoiceInput")).disabled).toBe(true);
  });

  it("keeps Stop available while disconnected for an abortable run", () => {
    const onAbort = vi.fn();
    const { container } = renderComposer({ connected: false, canAbort: true, onAbort });
    const stop = button(container, t("chat.runControls.stopGenerating"));
    expect(stop.disabled).toBe(false);
    stop.click();
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("offers Steer only for eligible queued messages during an active run", () => {
    const onQueueSteer = vi.fn();
    const { container } = renderComposer({
      canAbort: true,
      onAbort: vi.fn(),
      onQueueSteer,
      queue: [
        { id: "queued-1", text: "tighten the plan", createdAt: 1 },
        { id: "steered-1", text: "already sent", createdAt: 2, kind: "steered" },
        { id: "local-1", text: "/status", createdAt: 3, localCommandName: "status" },
        {
          id: "waiting-idle-1",
          text: "queued during the run",
          createdAt: 4,
          sendState: "waiting-idle",
        },
      ],
    });
    const steer = [...container.querySelectorAll<HTMLButtonElement>(".chat-queue__steer")];
    expect(steer).toHaveLength(2);
    steer[0]?.click();
    steer[1]?.click();
    expect(onQueueSteer.mock.calls).toEqual([["queued-1"], ["waiting-idle-1"]]);
  });

  it("renders failed sends as retryable and running commands as inert", () => {
    const onQueueRetry = vi.fn();
    let view = renderComposer({
      onQueueRetry,
      queue: [
        {
          id: "failed-1",
          text: "still recoverable",
          createdAt: 1,
          sendError: "send blocked by session policy",
          sendRunId: "run-failed-1",
          sendState: "failed",
        },
      ],
    });
    expect(view.container.querySelector(".chat-queue__badge")?.textContent?.trim()).toBe("Failed");
    expect(view.container.querySelector(".chat-queue__error")?.textContent).toContain(
      "send blocked by session policy",
    );
    view.container.querySelector<HTMLButtonElement>(".chat-queue__retry")?.click();
    expect(onQueueRetry).toHaveBeenCalledWith("failed-1");

    view = renderComposer({
      queue: [
        {
          id: "running-command",
          text: "/compact",
          createdAt: 1,
          localCommandName: "compact",
          sendState: "executing-command",
        },
      ],
    });
    expect(view.container.querySelector(".chat-queue__badge")?.textContent?.trim()).toBe(
      "Running command",
    );
    expect(view.container.querySelector(".chat-queue__retry")).toBeNull();
    expect(view.container.querySelector(".chat-queue__remove")).toBeNull();
  });
});

describe("renderChatComposer status", () => {
  it("renders only a fresh interrupted run as visible status chrome", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    let view = renderComposer({
      runStatus: { phase: "done", runId: "run-0", sessionKey: "main", occurredAt: 900 },
    });
    expect(view.container.querySelector(".agent-chat__run-status")).toBeNull();

    view = renderComposer({
      runStatus: { phase: "interrupted", runId: "run-1", sessionKey: "main", occurredAt: 900 },
      composerControls: html`<button type="button">Settings</button>`,
    });
    expect(
      view.container.querySelector(".agent-chat__run-status--interrupted")?.textContent,
    ).toContain("Interrupted");

    now.mockReturnValue(7_000);
    view = renderComposer({
      runStatus: { phase: "interrupted", runId: "run-1", sessionKey: "main", occurredAt: 1_000 },
      composerControls: html`<button type="button">Settings</button>`,
    });
    expect(view.container.querySelector(".agent-chat__run-status--interrupted")).toBeNull();
  });

  it("renders fresh compaction and fallback status", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const { container } = renderComposer({
      compactionStatus: {
        phase: "active",
        runId: "run-1",
        startedAt: 1_000,
        completedAt: null,
      },
      fallbackStatus: {
        selected: "fireworks/minimax-m2p5",
        active: "deepinfra/moonshotai/Kimi-K2.5",
        attempts: ["fireworks/minimax-m2p5: rate limit"],
        occurredAt: 900,
      },
    });
    expect(container.querySelector(".compaction-indicator--active")?.textContent?.trim()).toBe(
      "Compacting context...",
    );
    expect(container.querySelector(".compaction-indicator--fallback")?.textContent?.trim()).toBe(
      "Fallback active: deepinfra/moonshotai/Kimi-K2.5",
    );
  });

  it("renders session context and plan usage through the full composer", () => {
    const { container } = renderComposer({
      sessions: {
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: null,
            totalTokens: 46_000,
            contextTokens: 200_000,
          },
        ],
        defaults: { contextTokens: 200_000 },
      } as never,
      providerUsage: {
        basePath: "/control",
        modelAuthStatusResult: {
          ts: Date.now(),
          providers: [
            {
              provider: "openai",
              displayName: "OpenAI",
              status: "ok",
              profiles: [{ profileId: "openai", type: "oauth", status: "ok" }],
              usage: { providerId: "openai", windows: [{ label: "Week", usedPercent: 72 }] },
            },
          ],
        },
      },
    });
    expect(container.querySelector(".context-ring")?.getAttribute("aria-label")).toBe(
      "Session context usage: 46k of 200k (23%)",
    );
    expect(container.querySelector(".context-usage__plan-header")?.textContent).toContain(
      "Plan usage",
    );
    expect(container.querySelector(".context-usage__limit")?.textContent).toContain("72%");
  });
});
