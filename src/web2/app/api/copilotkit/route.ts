import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { DefaultAzureCredential } from "@azure/identity";
import { NextRequest } from "next/server";

// DefaultAzureCredential needs the Node.js runtime (not the Edge runtime).
export const runtime = "nodejs";

// This name MUST match the `agent` prop on <CopilotKit> in app/page.tsx.
const AGENT_NAME = "slogan_workflow";

// Foundry hosted-agent endpoints require an Entra token with the ai.azure.com audience.
// (The default cognitiveservices scope yields 401 "audience is incorrect".)
const FOUNDRY_SCOPE = "https://ai.azure.com/.default";

// Reuse one credential instance; it caches tokens internally.
const credential = new DefaultAzureCredential();

// Foundry's Invocations protocol binds a call to a hosted "session" (a sandbox with its
// own $HOME + /files state) via the `agent_session_id` query parameter, and returns the
// resolved id on the `x-agent-session-id` response header (PlatformHeaders.SessionId).
// The platform does NOT store conversation history for Invocations — the id only pins
// follow-up turns to the same sandbox. We map each CopilotKit conversation (threadId) to
// its session id so later turns reuse the same sandbox instead of getting a fresh one.
const SESSION_HEADER = "x-agent-session-id";
const sessionStore = new Map<string, string>();

// Custom fetch for the AG-UI HttpAgent: appends ?agent_session_id=<id> once known for the
// conversation, and captures the response header to reuse on subsequent turns.
// Note: process-scoped in-memory store — fine for local/dev and single-instance hosting;
// use a shared/distributed store (e.g. Redis) if you run multiple server instances.
const sessionPinningFetch = async (
  url: string,
  requestInit: RequestInit,
): Promise<Response> => {
  let threadId = "default";
  try {
    if (typeof requestInit.body === "string") {
      threadId = JSON.parse(requestInit.body)?.threadId ?? "default";
    }
  } catch {
    /* fall back to the default key */
  }

  const target = new URL(url);
  const known = sessionStore.get(threadId);
  if (known) target.searchParams.set("agent_session_id", known);

  const res = await fetch(target, requestInit);

  const resolved = res.headers.get(SESSION_HEADER);
  if (resolved) sessionStore.set(threadId, resolved);

  return res;
};

async function buildHeaders(): Promise<Record<string, string>> {
  // A local `azd ai agent run` on http://localhost:8088 needs no auth header.
  // Deployed endpoints do — set AGUI_USE_ENTRA_AUTH=true (see .env.local.example).
  if (process.env.AGUI_USE_ENTRA_AUTH !== "true") return {};
  const token = await credential.getToken(FOUNDRY_SCOPE);
  return token ? { Authorization: `Bearer ${token.token}` } : {};
}

export const POST = async (req: NextRequest) => {
  // Build the runtime per request so the bearer token is always fresh (Architecture B:
  // the HttpAgent points straight at the hosted agent's AG-UI /invocations endpoint).
  const runtime = new CopilotRuntime({
    // The cast bridges a known @ag-ui/client version skew: @copilotkit/runtime bundles
    // its own copy whose Message content-part types (binary) differ from this app's
    // top-level @ag-ui/client (image/audio). It's a type-only mismatch — runtime behavior
    // is identical. Target the runtime's exact expected `agents` type via ConstructorParameters.
    agents: {
      [AGENT_NAME]: new HttpAgent({
        url: process.env.AGUI_BACKEND_URL ?? "http://localhost:8088/invocations",
        headers: await buildHeaders(),
        fetch: sessionPinningFetch,
      }),
    } as unknown as NonNullable<
      ConstructorParameters<typeof CopilotRuntime>[0]
    >["agents"],
  });

  const serviceAdapter = new ExperimentalEmptyAdapter();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
