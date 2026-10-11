import Link from "next/link";
import AnalysisWorkspace from "./AnalysisWorkspace";

export default async function AnalysisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <main className="shell">
    <nav className="topbar"><Link href={`/projects/${projectId}`}>← Project</Link><span>ANALYSIS / {projectId === "demo" ? "DEMO" : "WORKSPACE"}</span><span className="pill">DETERMINISTIC CORE</span></nav>
    <header className="moduleHead"><p className="eyebrow">ANALYSIS ENGINE</p><h1>Engineering analysis</h1><p className="muted">Deterministic providers calculate; the engineering core records assumptions and distinguishes calculation from verification.</p></header>
    <AnalysisWorkspace projectId={projectId} />
  </main>;
}
