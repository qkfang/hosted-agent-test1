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
export const AGENT_NAME = "slogan_workflow";

// Foundry hosted-agent endpoints require an Entra token with the ai.azure.com audience.
// (The default cognitiveservices scope yields 401 "audience is incorrect".)
const FOUNDRY_SCOPE = "https://ai.azure.com/.default";

// Reuse one credential instance; it caches tokens internally.
const credential = new DefaultAzureCredential();

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
    agents: {
      [AGENT_NAME]: new HttpAgent({
        url: process.env.AGUI_BACKEND_URL ?? "http://localhost:8088/invocations",
        headers: await buildHeaders(),
      }),
    },
  });

  const serviceAdapter = new ExperimentalEmptyAdapter();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
