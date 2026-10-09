import Link from "next/link";
import ReasoningWorkbench from "./ReasoningWorkbench";

export default async function ReasoningPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <main className="shell">
    <nav className="topbar">
      <Link href={`/projects/${projectId}`}>← Project</Link>
      <span>REASONING / {projectId}</span>
      <Link href={`/projects/${projectId}/engineering`}>Engineering interaction →</Link>
    </nav>
    <header className="projectHead">
      <div>
        <p className="eyebrow">AI-NATIVE ENGINEERING WORKSPACE</p>
        <h1>Reasoning workbench</h1>
        <p className="muted">Create a task, select a pinned reasoning framework, resolve required inputs, and generate an advisory record under the existing Engineering Core authority boundary.</p>
      </div>
    </header>
    <ReasoningWorkbench projectId={projectId} />
  </main>;
}
