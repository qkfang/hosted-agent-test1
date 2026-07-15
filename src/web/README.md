# Slogan Workflow Web UI (CopilotKit + AG-UI)

A web UI that talks to the multi-agent **slogan workflow** (writer → legal reviewer →
formatter) over the [AG-UI protocol](https://docs.ag-ui.com/).

This uses **Architecture A** from the
[foundry-hosted-agent-copilotkit](https://github.com/github/awesome-copilot/blob/main/skills/foundry-hosted-agent-copilotkit/SKILL.md)
skill: an **in-process AG-UI endpoint**. A small FastAPI service reconstructs the same
Agent Framework workflow that the hosted agent serves over the *responses* protocol and
re-exposes it over AG-UI. **The deployed hosted agent in
[`src/agent-framework-workflows-responses`](../agent-framework-workflows-responses/) is
not touched.**

```
Browser ──▶ Next.js CopilotKit runtime ──▶ AG-UI backend (FastAPI) ──▶ MAF workflow ──▶ Foundry model
  (react)      /api/copilotkit (SSE)            :8000 /  (SSE)         writer→legal→formatter
```

## Layout

| Path | What it is |
| --- | --- |
| [`backend/server.py`](backend/server.py) | FastAPI service exposing the workflow over AG-UI via `add_agent_framework_fastapi_endpoint`. |
| [`frontend/app/api/copilotkit/route.ts`](frontend/app/api/copilotkit/route.ts) | CopilotKit runtime; registers an `HttpAgent` pointed at the backend. |
| [`frontend/app/page.tsx`](frontend/app/page.tsx) | The chat UI (`<CopilotKit>` + `<CopilotChat>`). |

The agent name `slogan_workflow` must stay identical in the runtime `agents` key and the
`<CopilotKit agent=...>` prop — that is the single most common wiring bug.

## Prerequisites

- Python 3.10+ and `az login` (the backend authenticates to Foundry with
  `DefaultAzureCredential`)
- Node.js 20+
- A Foundry project endpoint and a deployed model

## 1. Run the AG-UI backend

```powershell
cd src/web/backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install --pre -r requirements.txt   # --pre: agent-framework-ag-ui is a pre-release

Copy-Item .env.example .env              # then edit .env
#   FOUNDRY_PROJECT_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
#   AZURE_AI_MODEL_DEPLOYMENT_NAME=<your-deployment>

az login
python server.py                         # serves AG-UI at http://localhost:8000/
```

Smoke-test the raw AG-UI stream (optional):

```powershell
curl -N -X POST http://localhost:8000/ `
  -H "Content-Type: application/json" `
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"1","role":"user","content":"a fun electric SUV"}],"tools":[],"context":[],"state":{},"forwardedProps":{}}'
```

You should see `RUN_STARTED`, streaming `TEXT_MESSAGE_CONTENT`, then `RUN_FINISHED` events.

## 2. Run the CopilotKit frontend

In a second terminal:

```powershell
cd src/web/frontend
npm install
Copy-Item .env.local.example .env.local  # AGUI_BACKEND_URL=http://localhost:8000/
npm run dev                              # http://localhost:3000
```

Open http://localhost:3000 and ask for a slogan.

## Notes

- The browser only ever calls the Next.js runtime (`/api/copilotkit`); the Foundry
  endpoint and credentials are never exposed to the client.
- CopilotKit and `@ag-ui/client` are pre-1.0 and their APIs churn between minor
  versions. `package.json` pins them to `latest`; if `ExperimentalEmptyAdapter` or a
  hook name has moved, check the installed `@copilotkit/*` TypeScript declarations and
  the [CopilotKit MAF docs](https://docs.copilotkit.ai/microsoft-agent-framework).
- To add human-in-the-loop approvals or shared state later, wrap the agent with
  `AgentFrameworkAgent(agent=..., require_confirmation=True)` in `server.py` and add the
  matching CopilotKit hooks — see the skill's `references/patterns.md` and
  `references/hitl.md`.
