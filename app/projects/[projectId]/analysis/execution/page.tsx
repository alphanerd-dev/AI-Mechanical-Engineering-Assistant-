import Link from "next/link";

export default async function ExecutionPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <div className="shell">
    <Link href={`/projects/${projectId}/analysis`}>← Analysis</Link>
    <header className="moduleHead">
      <p className="eyebrow">EXECUTION LAYER</p>
      <h1>Execution capabilities</h1>
      <p className="muted">
        This page reports the current execution integration boundaries. Project-scoped job history,
        retry controls and operator workflows are not yet exposed here.
      </p>
    </header>
    <section className="panel">
      <div className="evidence"><div><b>DETERMINISTIC CALCULATIONS</b><small>Typed engineering providers and validated outputs</small></div><strong>READY</strong></div>
      <div className="evidence"><div><b>CAD BUILD WORKER</b><small>Isolated build123d execution with independent OCCT validation in the CAD workflow</small></div><strong>INTEGRATED</strong></div>
      <div className="evidence"><div><b>PYTHON WORKER ADAPTER</b><small>Bounded worker client; deployment configuration and capability policy required</small></div><strong>IMPLEMENTED</strong></div>
      <div className="evidence"><div><b>CALCULIX FEA WORKER</b><small>Isolated benchmark worker; no project-level FEA submission or results workflow</small></div><strong>BENCHMARK ONLY</strong></div>
      <div className="evidence"><div><b>OPENFOAM 14 CFD WORKER</b><small>Isolated benchmark worker; no project-level CFD submission or results workflow</small></div><strong>BENCHMARK ONLY</strong></div>
      <div className="evidence"><div><b>DURABLE EXECUTION API</b><small>Feature-flagged server API; job list and operator controls are not exposed in this workspace</small></div><strong>GATED</strong></div>
      <div className="evidence"><div><b>MODEL-DIRECTED AGENT RUN JOURNAL</b><small>Schema migration prepared; API remains intentionally disabled pending worker, approval and recovery acceptance</small></div><strong>NOT ENABLED</strong></div>
    </section>
    <section className="panel" style={{marginTop:16}}>
      <h2>Safety boundary</h2>
      <p>
        AI proposes; deterministic systems execute; validation decides; evidence proves.
        A successful worker process is not engineering validation or human approval.
        FEA and CFD results must remain benchmark evidence until project geometry, materials,
        boundary conditions, mesh quality, solver configuration and independent checks are
        available in the user workflow.
      </p>
    </section>
  </div>;
}