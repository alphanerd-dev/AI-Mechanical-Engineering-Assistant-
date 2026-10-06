import Link from "next/link";

export default async function ResearchPage({params}:{params:Promise<{projectId:string}>}){
  const {projectId}=await params;
  return <main className="shell">
    <nav className="topbar"><Link href={`/projects/${projectId}`}>← Project</Link><span>RESEARCH / VERIFICATION</span><span className="pill">GATED</span></nav>
    <header className="projectHead"><div><p className="eyebrow">RESEARCH ENGINE</p><h1>Evidence verification</h1><p className="muted">Candidate findings remain assumptions until an explicit verification method promotes them to verified evidence.</p></div></header>
    <section className="columns">
      <div className="panel"><h2>Verification gate</h2><div className="gateList">
        <Gate label="Source inspection" detail="Inspect the underlying source and provide its URI." />
        <Gate label="Independent calculation" detail="Reproduce the engineering result independently." />
        <Gate label="Manufacturer confirmation" detail="Confirm a component/material claim with the manufacturer." />
        <Gate label="Human review" detail="Engineer reviews the claim and supporting evidence." />
      </div></div>
      <div className="panel"><h2>State transitions</h2><div className="statusRow"><span>Academic/web result</span><b>ASSUMED</b></div><div className="statusRow"><span>Verification passed</span><b>VERIFIED</b></div><div className="statusRow"><span>Engineering memory</span><b>VERIFIED ONLY</b></div><p className="muted">Verification evidence can then be linked to project requirements and engineering events.</p></div>
    </section>
    <section className="panel"><h2>API boundary</h2><pre className="codeBlock">POST /api/research/verify{String.fromCharCode(10)}{String.fromCharCode(10)}Method examples: SOURCE_INSPECTION, INDEPENDENT_CALCULATION, MANUFACTURER_CONFIRMATION, HUMAN_REVIEW</pre><p className="muted">The UI is deliberately evidence-first. It does not silently upgrade research because a source looks authoritative.</p></section>
  </main>;
}
function Gate({label,detail}:{label:string;detail:string}){return <div className="statusRow"><span><strong>{label}</strong><br/><small className="muted">{detail}</small></span><b>AVAILABLE</b></div>;}
