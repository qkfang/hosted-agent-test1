# Copyright (c) Microsoft. All rights reserved.

"""AG-UI backend for the slogan workflow (Architecture A: in-process AG-UI endpoint).

This reconstructs the same ``writer -> legal_reviewer -> formatter`` Agent Framework
workflow that the hosted agent serves over the *responses* protocol, and re-exposes it
over the **AG-UI** protocol so a CopilotKit frontend can talk to it.

The deployed hosted agent is left completely untouched — this is a separate service.

Run locally:

    pip install --pre -r requirements.txt
    az login
    # FOUNDRY_PROJECT_ENDPOINT + AZURE_AI_MODEL_DEPLOYMENT_NAME must be set (see .env.example)
    python server.py

The AG-UI endpoint is then served at http://localhost:8000/ and the CopilotKit
runtime (Next.js frontend) points its HttpAgent at it.
"""

import os

from agent_framework import Agent, AgentExecutor, WorkflowBuilder
from agent_framework.foundry import FoundryChatClient
from agent_framework_ag_ui import add_agent_framework_fastapi_endpoint
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file (if present).
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

    # `last_agent` context mode: each agent only sees the previous agent's output.
    writer_executor = AgentExecutor(writer_agent, context_mode="last_agent")
    legal_executor = AgentExecutor(legal_agent, context_mode="last_agent")
    format_executor = AgentExecutor(format_agent, context_mode="last_agent")

    return (
        WorkflowBuilder(
            start_executor=writer_executor,
            # Only stream the final formatted result back to the UI.
            output_executors=[format_executor],
        )
        .add_edge(writer_executor, legal_executor)
        .add_edge(legal_executor, format_executor)
        .build()
        .as_agent()
    )


app = FastAPI(title="Slogan Workflow AG-UI Backend")

# The browser only ever talks to the Next.js CopilotKit runtime, which calls this
# service server-side. CORS is enabled for the dev origin so the endpoint can also be
# exercised directly (curl / a browser-based AG-UI client) during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the AG-UI protocol endpoint (SSE streaming) at the service root.
add_agent_framework_fastapi_endpoint(app, build_workflow_agent(), "/")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
    )
