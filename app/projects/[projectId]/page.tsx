import Link from "next/link";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <main className="shell">
    <nav className="topbar"><Link href="/">← Workspace</Link><span>PROJECT / {projectId}</span><span className="pill">ACTIVE</span></nav>
    <header className="projectHead"><div><p className="eyebrow">ENGINEERING PROJECT</p><h1>Shaft Design Benchmark</h1><p className="muted">5 kW · 1500 rpm · preliminary mechanical design</p></div><div><div className="actions"><Link className="button" href={`/projects/${projectId}/engineering`}>Engineering interaction</Link><Link className="button secondaryButton" href={`/projects/${projectId}/research`}>Research verification</Link></div></div></header>
    <section className="metrics"><Metric label="Stage" value="PRELIMINARY ANALYSIS" /><Metric label="Requirements" value="0 / 4 verified" /><Metric label="Open questions" value="5" /><Metric label="Risks" value="2 unresolved" /></section>
    <section className="columns"><div className="panel"><h2>Engineering timeline</h2><Timeline /></div><div className="panel"><h2>Capability status</h2><Status name="ANALYSIS.SHAFT_TORQUE" status="VERIFIED" /><Status name="ANALYSIS.SHAFT_SIZE" status="PILOT" /><Status name="CAD.CREATE_PART" status="EXPERIMENTAL" /><Status name="CAD.VALIDATE_GEOMETRY" status="EXPERIMENTAL" /><Status name="ANALYSIS.STATIC_STRUCTURAL" status="EXPERIMENTAL" /></div></section>
  </main>;
}
function Metric({label,value}:{label:string;value:string}) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function Status({name,status}:{name:string;status:string}) { return <div className="statusRow"><span>{name}</span><b>{status}</b></div>; }
function Timeline(){return <ol className="timeline"><li><b>Problem captured</b><span>5 kW at 1500 rpm</span></li><li><b>Torque calculated</b><span>31.83 N·m</span></li><li><b>Design gate</b><span>Awaiting load arrangement, material and allowable stress</span></li><li className="pending"><b>CAD generation</b><span>Blocked until critical inputs are resolved</span></li></ol>;}
