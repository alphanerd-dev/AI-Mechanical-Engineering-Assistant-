import type { Metadata } from "next";
import AuthNavigation from "../components/AuthNavigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engineering Workspace",
  description: "AI-native, evidence-driven engineering workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthNavigation />{children}</body></html>;
}
