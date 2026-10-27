import Link from "next/link";
import CadWorkspace from "./CadWorkspace";

export default async function CadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (projectId === "demo") return <div className="shell">
    <nav className="topbar"><Link href="/projects/demo">← Demo project</Link><span>CAD / DEMO</span><span className="projectState projectState-blocked">SANDBOX</span></nav>
    <header className="moduleHead"><p className="eyebrow">DEMO SANDBOX</p><h1>CAD pipeline</h1><p className="muted">This example project is not registered in Supabase, so it cannot create durable CAD models or execution records.</p></header>
    <section className="panel"><strong>To run the real CAD workflow</strong><p>Create a registered project from the home page. CAD generation will remain disabled until the trusted worker runtime, independent validator, artifact storage and server-only database writer pass readiness checks.</p><Link className="button" href="/">Create a real project</Link></section>
  </div>;
  return <div className="shell">
    <nav className="topbar">
      <Link href={`/projects/${projectId}`}>← Project</Link>
      <span>CAD / {projectId}</span>
      <span className="pill">V2.1.6</span>
    </nav>
    <header className="moduleHead">
      <div>
        <p className="eyebrow">ENGINEERING CORE · CAD</p>
        <h1>Geometry pipeline</h1>
        <p className="muted">Generate a bounded CAD part, validate the actual BREP independently, then store immutable evidence and project-scoped artifacts. Geometric verification does not approve the engineering design.</p>
      </div>
    </header>
    <CadWorkspace projectId={projectId} />
  </div>;
}
