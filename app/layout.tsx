import type { Metadata, Viewport } from "next";
import WorkspaceShell from "../components/WorkspaceShell";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./module-workspace.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Forge — AI Mechanical Engineering Assistant",
  description: "A project-centered engineering workspace for controlled calculations, CAD workflows, validation, and evidence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}><body><WorkspaceShell>{children}</WorkspaceShell></body></html>;
}
