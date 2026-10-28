import Link from "next/link";
import ValidationWorkspace from "./ValidationWorkspace";

export default async function ValidationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <div className="shell">
    <nav className="topbar"><Link href={`/projects/${projectId}`}>← Project</Link><span>VALIDATION / {projectId === "demo" ? "DEMO" : "WORKSPACE"}</span><span className="pill">EVIDENCE FIRST</span></nav>
    <header className="moduleHead"><p className="eyebrow">EVIDENCE & VALIDATION</p><h1>Validation and evidence</h1><p className="muted">Checks are persisted with the project. No success claim without evidence; a calculation is not the same as verification or approval.</p></header>
    <ValidationWorkspace projectId={projectId} />
  </div>;
}
