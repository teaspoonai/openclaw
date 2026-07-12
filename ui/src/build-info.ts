// Compile-time identity for the Control UI artifact.
import {
  deriveControlUiBuildId,
  normalizeControlUiBranch,
  normalizeControlUiBuildId,
  normalizeControlUiBuildTimestamp,
  normalizeControlUiCommit,
} from "./build-info-normalizers.ts";

export type ControlUiBuildInfo = Readonly<{
  version: string | null;
  commit: string | null;
  builtAt: string | null;
  branch: string | null;
  dirty: boolean | null;
  buildId: string;
}>;

declare global {
  // Vite replaces this property with one object so the UI and service worker
  // share the exact artifact identity without separate compile-time constants.
  var OPENCLAW_CONTROL_UI_BUILD_INFO: ControlUiBuildInfo | undefined;
}

function normalizeControlUiBuildInfo(value: unknown): ControlUiBuildInfo {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const optionalString = (candidate: unknown) =>
    typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  const version = optionalString(record.version);
  const commit = normalizeControlUiCommit(record.commit);
  const builtAt = normalizeControlUiBuildTimestamp(record.builtAt);
  const metadata = { version, commit, builtAt };
  return {
    ...metadata,
    branch: normalizeControlUiBranch(record.branch),
    dirty: typeof record.dirty === "boolean" ? record.dirty : null,
    buildId: normalizeControlUiBuildId(record.buildId ?? deriveControlUiBuildId(metadata)),
  };
}

const injectedBuildInfo = globalThis.OPENCLAW_CONTROL_UI_BUILD_INFO;

export const CONTROL_UI_BUILD_INFO = normalizeControlUiBuildInfo(injectedBuildInfo);
