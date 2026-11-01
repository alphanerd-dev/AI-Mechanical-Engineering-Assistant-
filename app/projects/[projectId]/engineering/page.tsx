import Link from "next/link";
import EngineeringChat from "../../../../components/EngineeringChat";
import EngineeringInteraction from "./EngineeringInteraction";

export default async function EngineeringPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const buildMarker = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local").slice(0, 7).toUpperCase();
  return <div className="shell">
    <nav className="topbar">
      <Link href={`/projects/${projectId}`}>← Project</Link>
      <span>ENGINEERING / {projectId}</span>
      <span className="pill">{projectId === "demo" ? `DEMO CHAT · BUILD ${buildMarker}` : "ACTIVE"}</span>
    </nav>

    <header className="projectHead">
      <div>
        <p className="eyebrow">{projectId === "demo" ? "DEMO SANDBOX · CONVERSATIONAL CHAT ONLY" : "AI-NATIVE ENGINEERING WORKSPACE"}</p>
        <h1>Engineering interaction</h1>
        <p className="muted">{projectId === "demo" ? "This demo uses the streaming assistant and tab-local history. Registered projects are required for deterministic tasks and durable project records." : "Explore the problem conversationally, then route executable work through the validated engineering core."}</p>
      </div>
    </header>

    <EngineeringChat projectId={projectId} />
    {projectId === "demo" ? (
      <p className="muted">Demo sandbox: conversational assistant only. Deterministic tasks and durable project history require a registered project.</p>
    ) : (
      <EngineeringInteraction projectId={projectId} />
    )}
  </div>;
}
