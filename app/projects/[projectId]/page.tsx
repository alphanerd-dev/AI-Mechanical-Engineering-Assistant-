import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modules = [
  ["Requirements", "Persist requirements, units, assumptions and verification methods.", "requirements"],
  ["Analysis", "Run deterministic calculations and record calculation evidence.", "analysis"],
  ["CAD", "Generate geometry only through the configured trusted worker and validator.", "cad"],
  ["Validation", "Inspect completeness gates, runtime readiness and recorded evidence.", "validation"],
] as const;

type ProjectSnapshot = {
  project?: {
    requirements?: Array<{ status?: string; priority?: string }>;
    assumptions?: string[];
    openQuestions?: string[];
    unresolvedRisks?: string[];
    events?: Array<{ action?: string; timestamp?: string }>;
  };
};

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (projectId === "demo") return <DemoProjectPage />;
  if (!UUID.test(projectId)) notFound();

  let db: Awaited<ReturnType<typeof createClient>>;
  try { db = await createClient(); } catch { notFound(); }
  const { data: project, error } = await db
    .from("engineering_projects")
    .select("id,name,stage,status,revision,created_at,updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) notFound();

  const { data: workspaceRow } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot,saved_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const snapshot = (workspaceRow?.snapshot ?? {}) as ProjectSnapshot;
  const state = snapshot.project ?? {};
  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  const events = Array.isArray(state.events) ? state.events : [];
  const mustCount = requirements.filter((item) => item.priority === "MUST").length;
  const calculations = events.filter((event) => event.action?.startsWith("ANALYSIS.")).length;

  return <main className="shell projectOverview">
    <nav className="topbar"><Link href="/">← All projects</Link><span>PROJECT / {project.id.slice(0, 8)}</span><span className={`projectState projectState-${String(project.status).toLowerCase()}`}>{project.status}</span></nav>
    <header className="projectHead"><div><p className="eyebrow">PERSISTED ENGINEERING PROJECT</p><h1>{project.name}</h1><p className="muted">{project.stage.replaceAll("_", " ")} · Revision {workspaceRow?.revision ?? 0} · Updated {new Date(project.updated_at).toLocaleString()}</p></div><div className="actions"><Link className="button" href={`/projects/${projectId}/requirements`}>Define requirements</Link><Link className="button secondaryButton" href={`/projects/${projectId}/engineering`}>Engineering interaction</Link></div></header>
    <section className="metrics">
      <div className="metric"><span>Requirements</span><strong>{requirements.length}</strong></div>
      <div className="metric"><span>MUST requirements</span><strong>{mustCount}</strong></div>
      <div className="metric"><span>Open questions</span><strong>{state.openQuestions?.length ?? 0}</strong></div>
      <div className="metric"><span>Calculations recorded</span><strong>{calculations}</strong></div>
    </section>
    <section className="panel projectPrinciples"><strong>Execution boundary</strong><p>AI may propose. Deterministic providers execute. Validation decides. Evidence proves. Requirements and calculations in this project remain unapproved until the relevant verification and human-review gates are satisfied.</p></section>
    <section className="grid">{modules.map(([title, description, slug]) => <Link className="card" href={`/projects/${projectId}/${slug}`} key={slug}><span className="tag">PROJECT MODULE</span><h2>{title}</h2><p>{description}</p><span className="arrow">Open →</span></Link>)}</section>
    <section className="columns">
      <div className="panel"><p className="eyebrow">PROJECT STATE</p><h2>Assumptions</h2>{!state.assumptions?.length ? <p className="muted">No assumptions recorded. Add them in Requirements and keep them distinct from measured facts.</p> : <ul className="workspaceSimpleList">{state.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>
      <div className="panel"><p className="eyebrow">NEXT DECISIONS</p><h2>Open questions and risks</h2>{!state.openQuestions?.length && !state.unresolvedRisks?.length ? <p className="muted">No open questions or risks recorded yet.</p> : <ul className="workspaceSimpleList">{[...(state.openQuestions ?? []).map((item) => `Question: ${item}`), ...(state.unresolvedRisks ?? []).map((item) => `Risk: ${item}`)].map((item, index) => <li key={index}>{item}</li>)}</ul>}<Link className="button secondaryButton" href={`/projects/${projectId}/validation`}>Review gates and evidence</Link></div>
    </section>
    <section className="panel"><p className="eyebrow">AUDIT TIMELINE</p><h2>Latest workspace events</h2>{events.length === 0 ? <p className="muted">Project created. New requirements, calculations and validation checks will be recorded here.</p> : <div className="evidenceList">{[...events].reverse().slice(0, 8).map((event, index) => <div className="readinessCheck" key={`${event.action}-${event.timestamp}-${index}`}><span className="projectState">{event.action ?? "WORKSPACE_EVENT"}</span><div><strong>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "Timestamp unavailable"}</strong><p>Recorded event; inspect Validation for evidence and gate details.</p></div></div>)}</div>}</section>
  </main>;
}

function DemoProjectPage() {
  return <main className="shell">
    <nav className="topbar"><Link href="/">← All projects</Link><span>PROJECT / DEMO</span><span className="projectState projectState-blocked">SANDBOX</span></nav>
    <header className="projectHead"><div><p className="eyebrow">ILLUSTRATIVE SANDBOX</p><h1>Shaft Design Benchmark</h1><p className="muted">Example: 5 kW · 1500 rpm. This sample is not a registered project and its data may reset.</p></div><Link className="button" href="/">Create a real project</Link></header>
    <section className="projectNotice projectNoticeWarning"><strong>Demo data only</strong><p>Use this area to explore the interface. Create a registered project from the home page for durable state, role-scoped database access and project evidence.</p></section>
    <section className="grid">{modules.map(([title, description, slug]) => <Link className="card" href={`/projects/demo/${slug}`} key={slug}><span className="tag">DEMO</span><h2>{title}</h2><p>{description}</p><span className="arrow">Open →</span></Link>)}<Link className="card" href="/projects/demo/reasoning"><span className="tag">DEMO</span><h2>Reasoning workbench</h2><p>Explore task reasoning in ephemeral demo mode.</p><span className="arrow">Open →</span></Link></section>
  </main>;
}
