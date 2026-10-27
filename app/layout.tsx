import type { Metadata } from "next";
import WorkspaceShell from "../components/WorkspaceShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge — AI Mechanical Engineering Assistant",
  description: "A project-centered engineering workspace for controlled calculations, CAD workflows, validation, and evidence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkspaceShell>{children}</WorkspaceShell></body></html>;
}
