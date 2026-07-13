// Control UI tests cover custom theme behavior.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createImportedCustomThemeFixture as createImportedTheme,
  createTweakcnThemePayload as createTweakcnPayload,
} from "../test-helpers/custom-theme.ts";
import {
  importCustomThemeFromUrl,
  parseImportedCustomTheme,
  syncCustomThemeStyleTag,
} from "./custom-theme.ts";
import type { ImportedCustomTheme } from "./custom-theme.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createResponse(
  body: string,
  options: {
    body?: ReadableStream<Uint8Array> | null;
    headers?: HeadersInit;
    status?: number;
    url?: string;
  } = {},
) {
  return {
    ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
    status: options.status ?? 200,
    headers: new Headers(options.headers),
    body:
      options.body === undefined
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body));
              controller.close();
            },
          })
        : options.body,
    text: vi.fn(async () => body),
    url: options.url ?? "",
  } as unknown as Response;
}

function firstFetchCall(
  fetchImpl: typeof fetch,
): [string, { headers?: unknown; redirect?: unknown; signal?: unknown }] {
  const call = vi.mocked(fetchImpl).mock.calls[0] as
    | [string, { headers?: unknown; redirect?: unknown; signal?: unknown }]
    | undefined;
  if (!call) {
    throw new Error("expected fetch call");
  }
  return call;
}

describe("custom theme import helpers", () => {
  it("keeps imported theme labels on a UTF-16 boundary", () => {
    const parsed = parseImportedCustomTheme({
      ...createImportedTheme(),
      label: `${"a".repeat(79)}🚀tail`,
    });

    expect(parsed?.label).toBe("a".repeat(79));
  });

  it("fetches tweakcn themes with bounded no-redirect requests", async () => {
    const response = createResponse(JSON.stringify(createTweakcnPayload()));
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    const imported = await importCustomThemeFromUrl(
      "https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z",
      fetchImpl,
    );

    expect(imported.label).toBe("Light Green");
    expect(imported.sourceUrl).toBe("https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z");
    expect(imported.light.bg).toBe("oklch(0.98 0.01 120)");
    expect(imported.dark.bg).toBe("oklch(0.12 0.04 265)");
    expect(imported.light["font-body"]).toBe("Inter, system-ui, sans-serif");
    expect(imported.dark["accent-hover"]).toBe("color-mix(in srgb, var(--accent) 82%, white 18%)");
    const fetchMock = vi.mocked(fetchImpl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOptions] = firstFetchCall(fetchImpl);
    expect(fetchUrl).toBe("https://tweakcn.com/r/themes/cmlhfpjhw000004l4f4ax3m7z");
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    expect(fetchOptions).toEqual({
      headers: { accept: "application/json" },
      redirect: "error",
      signal: fetchOptions.signal,
    });
  });

  it("rejects oversized tweakcn theme responses before parsing", async () => {
    const response = createResponse("{}", {
      headers: { "content-length": "200001" },
    });
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(
      importCustomThemeFromUrl("https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z", fetchImpl),
    ).rejects.toThrow("too large");
  });

  it("rejects tweakcn theme responses without a bounded body stream", async () => {
    const response = createResponse(JSON.stringify(createTweakcnPayload()), { body: null });
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(
      importCustomThemeFromUrl("https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z", fetchImpl),
    ).rejects.toThrow("unreadable theme payload");
    expect(response["text"]).not.toHaveBeenCalled();
  });

  it("rejects redirected tweakcn import responses", async () => {
    const response = createResponse(JSON.stringify(createTweakcnPayload()), {
      url: "https://example.com/r/themes/cmlhfpjhw000004l4f4ax3m7z",
    });
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(
      importCustomThemeFromUrl("https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z", fetchImpl),
    ).rejects.toThrow("Unexpected redirect");
  });

  it("parses stored imported themes and rejects malformed records", () => {
    const imported = createImportedTheme();

    const parsed = parseImportedCustomTheme(imported);
    if (!parsed) {
      throw new Error("Expected imported custom theme to parse");
    }
    expect(parsed.themeId).toBe("cmlhfpjhw000004l4f4ax3m7z");
    expect(parseImportedCustomTheme({ ...imported, themeId: "claude" })?.themeId).toBe("claude");
    expect(parseImportedCustomTheme({ ...imported, light: {} })).toBeNull();
  });
});
