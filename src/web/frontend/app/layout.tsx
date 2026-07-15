import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slogan Workflow — CopilotKit + AG-UI",
  description:
    "CopilotKit frontend talking to a Microsoft Agent Framework workflow over the AG-UI protocol.",
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
