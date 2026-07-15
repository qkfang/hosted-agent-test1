# Slogan Workflow Web UI — Architecture B (hosted agent serves AG-UI)

A CopilotKit web UI that talks **directly** to the Foundry **hosted agent**, which now
serves the AG-UI protocol from its own container under Foundry's `invocations` protocol.

This is **Architecture B** from the
[foundry-hosted-agent-copilotkit](https://github.com/github/awesome-copilot/blob/main/skills/foundry-hosted-agent-copilotkit/SKILL.md)
skill. Unlike [`../web`](../web/) (Architecture A, a separate local AG-UI service), here
there is **no separate backend** — the deployed agent in
[`../agent-framework-workflows-responses`](../agent-framework-workflows-responses/) *is*
the AG-UI backend.

```
Browser ──▶ Next.js CopilotKit runtime ──▶ Hosted agent /invocations (AG-UI, SSE) ──▶ workflow ──▶ model
  (react)      /api/copilotkit                (Foundry-managed compute)         writer→legal→formatter
                  │
                  └─ attaches an Entra bearer token (server-side) for deployed endpoints
```

## What changed on the agent

The hosted agent was switched from the **responses** protocol to **invocations + AG-UI**:

| File | Change |
| --- | --- |
| [`../agent-framework-workflows-responses/main.py`](../agent-framework-workflows-responses/main.py) | Serves AG-UI via `add_agent_framework_fastapi_endpoint(app, agent, "/invocations")` on port 8088 instead of `ResponsesHostServer`. |
| [`../agent-framework-workflows-responses/agent.yaml`](../agent-framework-workflows-responses/agent.yaml) | `protocol: invocations` (2.0.0). |
| [`../agent-framework-workflows-responses/agent.manifest.yaml`](../agent-framework-workflows-responses/agent.manifest.yaml) | `protocol: invocations` (2.0.0). |
| [`../agent-framework-workflows-responses/requirements.txt`](../agent-framework-workflows-responses/requirements.txt) | Adds `agent-framework-ag-ui` (pre-release); drops `agent-framework-foundry-hosting`. |
| [`../agent-framework-workflows-responses/Dockerfile`](../agent-framework-workflows-responses/Dockerfile) | `pip install --pre` (the AG-UI package is pre-release). |

> The Foundry agent name (`agent-framework-workflows-responses`) is unchanged so the
> `azure.yaml` service and infra keep working. Only its protocol changed.

## Prerequisites

- Node.js 20+
- Azure CLI logged in (`az login`) — required for both the local agent run and the
  Entra token the frontend attaches to deployed endpoints
- The Azure Developer CLI with the AI agent extension (`azd`)

## 1. Run the hosted agent locally

`azd ai agent run` runs the **real** hosted-agent container locally (default port 8088)
against your provisioned Foundry project — there is no mock.

```powershell
cd d:\repo\hosted-agent-test1
azd ai agent run                 # serves AG-UI at http://localhost:8088/invocations
```

Smoke-test the raw AG-UI stream (optional):

```powershell
curl -N -X POST http://localhost:8088/invocations `
  -H "Content-Type: application/json" `
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"1","role":"user","content":"a fun electric SUV"}],"tools":[],"context":[],"state":{},"forwardedProps":{}}'
```

You should see `RUN_STARTED`, streaming `TEXT_MESSAGE_CONTENT`, then `RUN_FINISHED`.

## 2. Run the frontend

```powershell
cd src/web2
npm install
Copy-Item .env.local.example .env.local
npm run dev                       # http://localhost:3000
```

With the defaults, `AGUI_BACKEND_URL=http://localhost:8088/invocations` and
`AGUI_USE_ENTRA_AUTH=false` — the local agent needs no token. Open
http://localhost:3000 and ask for a slogan.

## Pointing at the deployed agent

After `azd deploy` creates a new agent version, target it from the frontend by editing
`.env.local`:

```dotenv
AGUI_BACKEND_URL=https://<account>.services.ai.azure.com/api/projects/<project>/agents/agent-framework-workflows-responses/endpoint/protocols/invocations
AGUI_USE_ENTRA_AUTH=true
```

With `AGUI_USE_ENTRA_AUTH=true`, the runtime route
([`app/api/copilotkit/route.ts`](app/api/copilotkit/route.ts)) uses
`DefaultAzureCredential` to fetch a token for the `https://ai.azure.com/.default`
audience and attaches it as `Authorization: Bearer …` — the browser never sees the token
or calls Foundry directly. Do **not** send an `x-ms-user-isolation-key` header to a
deployed agent; it derives isolation from the Entra identity and rejects that header.

## Notes

- The agent name `slogan_workflow` must stay identical in the runtime `agents` key and
  the `<CopilotKit agent=...>` prop — that is the most common wiring bug.
- CopilotKit and `@ag-ui/client` are pre-1.0; `package.json` pins them to `latest`. If
  `ExperimentalEmptyAdapter` has been renamed in your installed version, adjust
  `app/api/copilotkit/route.ts` — check the installed `@copilotkit/*` TypeScript
  declarations.
- TypeScript "cannot find module" errors are expected until you run `npm install`.
