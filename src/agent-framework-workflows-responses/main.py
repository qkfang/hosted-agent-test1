# Copyright (c) Microsoft. All rights reserved.

"""Dual-protocol hosted agent: Responses (``/responses``) + AG-UI (``/invocations``).

The same ``writer -> legal_reviewer -> formatter`` workflow is exposed over **two**
protocols from a single container (see agent.yaml -> protocols: responses + invocations):

* **Responses** (``POST /responses``) — the OpenAI-compatible contract the Foundry
  portal Agent Playground (and ``azd ai agent invoke``) speak. Served by
  ``ResponsesHostServer``, which also provides ``GET /readiness`` and graceful
  shutdown, satisfying the hosted-agent runtime contract.
* **AG-UI** (``POST /invocations``) — the streaming SSE contract the CopilotKit
  frontend (see ../web2) speaks via its AG-UI ``HttpAgent``. Served by the AG-UI
  FastAPI helper, mounted onto the Responses host.

Locally both run under ``azd ai agent run`` on port 8088; when deployed, Foundry
routes each declared protocol to its matching path on this container.
"""

import os

from agent_framework import Agent, AgentExecutor, WorkflowBuilder
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import add_agent_framework_fastapi_endpoint
from agent_framework_foundry_hosting import ResponsesHostServer
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv
from fastapi import FastAPI

# Load environment variables from .env file
load_dotenv()


def build_workflow_agent():
    """Build the multi-agent slogan workflow and expose it as a single agent."""
    client = FoundryChatClient(
        project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
        model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
        credential=DefaultAzureCredential(),
    )

    writer_agent = Agent(
        client=client,
        instructions=("You are an excellent slogan writer. You create new slogans based on the given topic."),
        name="writer",
    )

    legal_agent = Agent(
        client=client,
        instructions=(
            "You are an excellent legal reviewer. "
            "Make necessary corrections to the slogan so that it is legally compliant."
        ),
        name="legal_reviewer",
    )

    format_agent = Agent(
        client=client,
        instructions=(
            "You are an excellent content formatter. "
            "You take the slogan and format it in a cool retro style when printing to a terminal."
        ),
        name="formatter",
    )

    # Set the context mode to `last_agent` so that each agent only sees the output of the
    # previous agent instead of the full conversation history
    writer_executor = AgentExecutor(writer_agent, context_mode="last_agent")
    legal_executor = AgentExecutor(legal_agent, context_mode="last_agent")
    format_executor = AgentExecutor(format_agent, context_mode="last_agent")

    return (
        WorkflowBuilder(
            start_executor=writer_executor,
            # Limiting the output to only the final formatted result.
            # If this is not set, all intermediate results will be included in the output.
            output_executors=[format_executor],
        )
        .add_edge(writer_executor, legal_executor)
        .add_edge(legal_executor, format_executor)
        .build()
        .as_agent()
    )


_agui_app = FastAPI(title="Slogan Workflow AG-UI subapp (/invocations)")


# Foundry forwards the hosted agent's `invocations` protocol to /invocations on the
# container. add_agent_framework_fastapi_endpoint serves the AG-UI SSE stream there.
# This FastAPI app is mounted onto the Responses host below, so its single route is
# registered at the same path the CopilotKit frontend and web2 client POST to. A
# dedicated workflow-agent instance keeps this protocol isolated from the Responses one.
add_agent_framework_fastapi_endpoint(_agui_app, build_workflow_agent(), "/invocations")


# The Responses host is the base ASGI app. It serves the `responses` protocol at
# POST /responses (what the Foundry portal Agent Playground and `azd ai agent invoke`
# speak) and supplies GET /readiness plus graceful SIGTERM shutdown — the hosted-agent
# runtime contract — so no manual readiness handler is needed here. A second workflow
# agent instance backs it so its hosting-managed checkpoints never collide with AG-UI.
host = ResponsesHostServer(build_workflow_agent())

# Mount the AG-UI FastAPI subapp at the root. Starlette (AgentServerHost is a Starlette
# subclass) forwards the full request path to the mounted app, so the subapp's
# `/invocations` route matches exactly (no trailing-slash redirect). The host's own
# `/responses` and `/readiness` routes are registered first, so they take precedence;
# everything else falls through to the AG-UI subapp.
host.mount("/", _agui_app)

# Expose the complete dual-protocol ASGI app for `main:app`-style ASGI runners.
app = host


if __name__ == "__main__":
    # Bind all interfaces so the Foundry-managed gateway (and `azd ai agent run`) can
    # reach the container. Port 8088 matches the Dockerfile EXPOSE and azd's local port.
    # host.run() starts the SDK's ASGI server with the hosted-agent runtime contract.
    host.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8088")))
