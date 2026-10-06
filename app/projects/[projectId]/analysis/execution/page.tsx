import Link from "next/link";

export default function ExecutionPage() {
  return <main className="shell">
    <Link href="/projects/demo/analysis">← Analysis</Link>
    <header className="moduleHead">
      <p className="eyebrow">EXECUTION LAYER</p>
      <h1>Engineering jobs</h1>
      <p className="muted">Calculations are represented as jobs so future Python, CAD and FEA workers can use the same contract.</p>
    </header>
    <section className="panel">
      <div className="evidence"><div><b>ANALYSIS.SHAFT_TORQUE</b><small>typescript-safe</small></div><strong>READY</strong></div>
      <div className="evidence"><div><b>PYTHON WORKER</b><small>isolated process / container</small></div><strong>PLANNED</strong></div>
      <div className="evidence"><div><b>CAD WORKER</b><small>build123d / CadQuery</small></div><strong>PLANNED</strong></div>
      <div className="evidence"><div><b>FEA WORKER</b><small>PyMechanical / Ansys</small></div><strong>PLANNED</strong></div>
    </section>
    <section className="panel" style={{marginTop:16}}>
      <h2>Safety boundary</h2>
      <p>Model-generated source will never be evaluated directly inside the Next.js process. Workers will receive an explicit job, run inside an isolated environment, and return validated artifacts.</p>
    </section>
  </main>;
}
