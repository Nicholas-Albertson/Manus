import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://taskflowos.netlify.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Taskflow — Autonomous Planning Agent",
    template: "%s · Taskflow",
  },
  description:
    "Taskflow breaks your request into steps, executes them with tools, verifies each result, and delivers a consolidated answer.",
  applicationName: "Taskflow",
  keywords: ["AI agent", "autonomous agent", "task automation", "LangGraph", "planning agent"],
  openGraph: {
    title: "Taskflow — Autonomous Planning Agent",
    description:
      "An autonomous agent that plans, executes with tools, verifies, and delivers a result.",
    type: "website",
    url: siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
