import {
  resolveSessionKey,
  type SessionCapability,
  type SessionScopeHost,
} from "../../lib/sessions/index.ts";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MAIN_KEY,
  isUiGlobalSessionKey,
  normalizeAgentId,
  normalizeSessionKeyForUiComparison,
  resolveUiConfiguredMainKey,
  resolveUiDefaultAgentId,
  resolveUiSelectedGlobalAgentId,
} from "../../lib/sessions/session-key.ts";

const pendingChatPickerPatches = new WeakMap<SessionCapability, Map<string, Promise<boolean>>>();

type ChatPickerPatchHost = SessionScopeHost & { sessions: SessionCapability };

function resolveChatPickerPatchKey(
  host: ChatPickerPatchHost,
  sessionKey: string,
  agentId?: string,
): string {
  const normalizedKey = normalizeSessionKeyForUiComparison(sessionKey);
  const match = /^agent:([^:]+):(.*)$/u.exec(normalizedKey);
  const body = match?.[2] ?? normalizedKey;
  const isGlobal = isUiGlobalSessionKey(sessionKey);
  const isMainAlias = [DEFAULT_MAIN_KEY, resolveUiConfiguredMainKey(host)].includes(
    body.toLowerCase(),
  );
  const defaultAgentId = resolveUiDefaultAgentId(host);
  const parsedAgentId = match?.[1];
  // Match the Gateway's legacy default-main remap only when the live agent
  // catalog proves that "main" is not a real agent.
  const isLegacyDefaultMainAlias =
    isMainAlias &&
    normalizeAgentId(parsedAgentId ?? "") === DEFAULT_AGENT_ID &&
    defaultAgentId !== DEFAULT_AGENT_ID &&
    host.agentsList?.agents != null &&
    !host.agentsList.agents.some(
      (candidate) => normalizeAgentId(candidate.id) === DEFAULT_AGENT_ID,
    );
  // Main aliases share the literal global store only in global session scope.
  const isGlobalMain = host.agentsList?.scope
    ? host.agentsList.scope === "global"
    : isUiGlobalSessionKey(resolveSessionKey(DEFAULT_MAIN_KEY, host.hello));
  const resolvedAgentId =
    (isLegacyDefaultMainAlias ? defaultAgentId : agentId?.trim() || parsedAgentId) ||
    (isGlobal ? resolveUiSelectedGlobalAgentId(host) : defaultAgentId);
  const settingsKey =
    isGlobal || (isMainAlias && isGlobalMain) ? "global" : isMainAlias ? DEFAULT_MAIN_KEY : body;
  return `agent:${normalizeAgentId(resolvedAgentId)}:${settingsKey}`;
}

export function getPendingChatPickerPatch(
  host: ChatPickerPatchHost,
  sessionKey: string,
  agentId?: string,
): Promise<boolean> | undefined {
  const patchKey = resolveChatPickerPatchKey(host, sessionKey, agentId);
  return pendingChatPickerPatches.get(host.sessions)?.get(patchKey);
}

export function trackPendingChatPickerPatch(
  host: ChatPickerPatchHost,
  sessionKey: string,
  patchPromise: Promise<boolean>,
) {
  const pendingBySession =
    pendingChatPickerPatches.get(host.sessions) ?? new Map<string, Promise<boolean>>();
  pendingChatPickerPatches.set(host.sessions, pendingBySession);
  const patchKey = resolveChatPickerPatchKey(host, sessionKey);
  const previous = pendingBySession.get(patchKey);
  // Aggregate every picker patch across the shared capability; overlapping
  // Gateway handlers can overtake pane-local or latest-only tracking.
  const pending = Promise.all([previous ?? true, patchPromise]).then(
    ([previousReady, patchReady]) => previousReady && patchReady,
  );
  pendingBySession.set(patchKey, pending);
  void pending.finally(() => {
    if (pendingBySession.get(patchKey) === pending) {
      pendingBySession.delete(patchKey);
    }
  });
}
