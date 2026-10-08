import Link from "next/link";
import EngineeringInteraction from "./EngineeringInteraction";

export default async function EngineeringPage({params}:{params:Promise<{projectId:string}>}){
  const {projectId}=await params;
  return <main className="shell">
    <nav className="topbar">
      <Link href={`/projects/${projectId}`}>← Project</Link>
      <span>ENGINEERING / {projectId}</span>
      <span className="pill">ACTIVE</span>
    </nav>

    <header className="projectHead">
      <div>
        <p className="eyebrow">AI-NATIVE ENGINEERING WORKSPACE</p>
        <h1>Engineering interaction</h1>
        <p className="muted">State the task naturally. The workspace routes intent through the existing validated engineering core.</p>
      </div>
    </header>

    <EngineeringInteraction projectId={projectId} />
  </main>;
}
