import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slogan Workflow — CopilotKit + Hosted Agent (AG-UI / invocations)",
  description:
    "CopilotKit frontend talking directly to a Foundry hosted agent that serves AG-UI over the invocations protocol.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
