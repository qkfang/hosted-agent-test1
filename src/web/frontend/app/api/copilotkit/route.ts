import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

// This name MUST match the `agent` prop on <CopilotKit> in app/page.tsx.
// Name drift between the two is the most common CopilotKit wiring bug.
export const AGENT_NAME = "slogan_workflow";

// Point the AG-UI HttpAgent at the FastAPI backend (../backend/server.py).
// The runtime calls this URL server-side, so the browser never touches it directly.
const runtime = new CopilotRuntime({
  agents: {
    [AGENT_NAME]: new HttpAgent({
      url: process.env.AGUI_BACKEND_URL ?? "http://localhost:8000/",
    }),
  },
});

// The agent itself drives the LLM (via the Agent Framework workflow), so the runtime
// needs no model of its own — the empty adapter just proxies AG-UI events.
const serviceAdapter = new ExperimentalEmptyAdapter();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
