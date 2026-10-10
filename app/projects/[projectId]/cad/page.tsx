import Link from "next/link";
import CadWorkspace from "./CadWorkspace";

export default async function CadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <main className="shell">
    <nav className="topbar">
      <Link href={`/projects/${projectId}`}>← Project</Link>
      <span>CAD / {projectId}</span>
      <span className="pill">V2.1.6</span>
    </nav>
    <header className="moduleHead">
      <div>
        <p className="eyebrow">ENGINEERING CORE · CAD</p>
        <h1>Geometry pipeline</h1>
        <p className="muted">Generate a bounded CAD part, validate the actual BREP independently, then store immutable evidence and project-scoped artifacts.</p>
      </div>
    </header>
    <CadWorkspace projectId={projectId} />
  </main>;
}
