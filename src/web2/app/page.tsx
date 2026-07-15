"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

// Must match the `agents` key registered in app/api/copilotkit/route.ts.
const AGENT_NAME = "slogan_workflow";

export default function Home() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={AGENT_NAME}>
      <main
        style={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            padding: "20px 24px 12px",
            borderBottom: "1px solid rgba(128,128,128,0.25)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20 }}>Slogan Workshop</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.7 }}>
            Talking to a Foundry <strong>hosted agent</strong> that serves AG-UI
            itself over the invocations protocol (writer → legal reviewer →
            formatter).
          </p>
        </header>

        <div style={{ flex: 1, minHeight: 0 }}>
          <CopilotChat
            labels={{
              title: "Slogan Workshop",
              initial:
                "Give me a topic and I'll craft a polished, legally-reviewed slogan. " +
                'Try: "an affordable, fun-to-drive electric SUV".',
            }}
            className="h-full"
          />
        </div>
      </main>
    </CopilotKit>
  );
}
