import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mechanical R&D Workspace",
  description: "AI-native mechanical engineering workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
