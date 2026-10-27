import Link from "next/link";
import RequirementsWorkspace from "./RequirementsWorkspace";

export default async function RequirementsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <div className="shell">
    <nav className="topbar"><Link href={`/projects/${projectId}`}>← Project</Link><span>REQUIREMENTS / {projectId === "demo" ? "DEMO" : "WORKSPACE"}</span><span className="pill">PERSISTED REGISTER</span></nav>
    <header className="moduleHead"><p className="eyebrow">ENGINEERING GATE</p><h1>Requirements</h1><p className="muted">Define constraints, priorities, units and verification methods before design approval.</p></header>
    <RequirementsWorkspace projectId={projectId} />
  </div>;
}
