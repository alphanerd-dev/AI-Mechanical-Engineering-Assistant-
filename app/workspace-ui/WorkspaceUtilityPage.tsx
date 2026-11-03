"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, BookOpen, Bot, Calculator, CheckCircle2, CircleDot, ClipboardList, DraftingCompass, FileText, Settings2, ShieldCheck, UserRound } from "lucide-react";

type UtilityPage = "templates" | "activity" | "profile" | "ai" | "engineering";
type Project = { id: string; name: string; stage: string; status: string; revision: number; updated_at: string };
type FeedItem = { id: string; projectId: string; projectName: string; action: string; actor: string; timestamp: string };

const templateCards = [
  { title: "Mechanical design study", category: "DESIGN", description: "Capture objective, requirements, loads, material assumptions and verification criteria before committing to a design.", steps: ["Define operating envelope", "Record loading and boundary conditions", "Choose candidate materials", "Plan verification and evidence"], icon: DraftingCompass },
  { title: "Rotating machinery assessment", category: "MACHINE SYSTEMS", description: "Structure a shaft, bearing, coupling or gear-train assessment around traceable inputs and calculation records.", steps: ["Record power and speed", "Map support and loading arrangement", "Check material and fatigue assumptions", "Review deterministic calculations"], icon: Calculator },
  { title: "Maintenance reliability investigation", category: "RELIABILITY", description: "Organise a failure investigation, maintenance evidence and corrective-action reasoning without assuming the root cause.", steps: ["Describe failure symptoms", "Capture service and maintenance history", "List plausible mechanisms", "Define inspections and evidence"], icon: Activity },
  { title: "Manufacturing process review", category: "MANUFACTURING", description: "Review process routes, equipment constraints, quality checks and opportunities for process improvement.", steps: ["Define output and takt requirements", "Map the existing process", "Record quality and resource constraints", "Set measurable improvement criteria"], icon: ClipboardList },
];

function ProjectStatusInline({ status }: { status: string }) {
  const Icon = status === "BLOCKED" ? AlertTriangle : status === "COMPLETE" ? CheckCircle2 : CircleDot;
  const tone = status === "BLOCKED" ? "warning" : status === "COMPLETE" ? "success" : "info";
  return <span className="moduleState" data-tone={tone}><Icon size={10} aria-hidden="true" />{readable(status)}</span>;
}
\nfunction readable(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time not recorded" : date.toLocaleString();
}

export default function WorkspaceUtilityPage({ page }: { page: UtilityPage }) {
  if (page === "templates") return <TemplatesPage />;
  if (page === "activity") return <ActivityPage />;
  if (page === "profile") return <SettingsPage page="profile" />;
  if (page === "ai") return <SettingsPage page="ai" />;
  return <SettingsPage page="engineering" />;
}

function PageHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className="shell utilityPageHeader"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="utilityLead">{detail}</p></div></header>;
}
function TemplatesPage() {
  return <div className="shell utilityPage">
    <PageHeader eyebrow="WORKSPACE LIBRARY" title="Engineering templates" detail="Structured starting points for common engineering workflows. Templates provide a checklist and do not create project records or run calculations." />
    <div className="utilityTemplateGrid">{templateCards.map((item) => {
      const Icon = item.icon;
      return <article className="utilityTemplateCard" key={item.title}>
        <div className="utilityTemplateTop"><span className="utilityTemplateIcon"><Icon size={18} /></span><span className="utilityCategory">{item.category}</span></div>
        <h2>{item.title}</h2><p>{item.description}</p>
        <ul>{item.steps.map((step) => <li key={step}>{step}</li>)}</ul>
        <Link href="/projects" className="moduleTextLink">Start with a project <ArrowRight size={13} /></Link>
      </article>;
    })}</div>
    <div className="moduleNotice"><BookOpen size={15} /><span>These starter checklists are guidance only. Persisted project templates, reusable organisation libraries and automatic template-to-project provisioning are not yet implemented.</span></div>
  </div>;
}
function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/projects", { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.projects)) throw new Error(typeof body.error === "string" ? body.error : "Workspace projects could not be loaded.");
        const recent = (body.projects as Project[]).slice(0, 8);
        setProjects(recent);
        const workspaces = await Promise.all(recent.map(async (project) => {
          const result = await fetch("/api/projects/" + encodeURIComponent(project.id) + "/workspace", { cache: "no-store", signal: controller.signal });
          if (!result.ok) return [] as FeedItem[];
          const payload = await result.json().catch(() => ({}));
          const events = Array.isArray(payload.snapshot?.project?.events) ? payload.snapshot.project.events : [];
          return events.map((event: { id: string; action: string; actor: string; timestamp: string }) => ({
            id: event.id, projectId: project.id, projectName: project.name, action: event.action, actor: event.actor, timestamp: event.timestamp
          })) as FeedItem[];
        }));
        if (controller.signal.aborted) return;
        setFeed(workspaces.flat().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 40));
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "Workspace activity could not be loaded.");
        setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <div className="shell utilityPage">
    <PageHeader eyebrow="WORKSPACE MONITOR" title="Recent activity" detail="Project event records from the currently accessible workspaces. This is not the full authorisation audit log." />
    {status === "loading" && <div className="moduleLoading"><Activity size={16} className="moduleSpin" />Loading project events…</div>}
    {status === "error" && <div className="moduleError" role="alert">{message}</div>}
    {status === "ready" && <div className="moduleTwoColumn">
      <section className="modulePanel"><header className="modulePanelHeader"><div><h2>Latest recorded events</h2><p>{feed.length} event records across {projects.length} recent projects</p></div></header>
        {feed.length === 0 ? <div className="moduleEmptyState"><Activity size={24} /><strong>No project events found</strong><p>Saved requirements changes, calculations and project actions will appear when recorded in a project workspace.</p></div> : <div className="moduleTimeline">{feed.map((item) => <article className="moduleTimelineItem" key={item.projectId + item.id}><span className="moduleTimelineDot" /><div><div className="moduleTimelineHead"><strong>{readable(item.action)}</strong><small>{dateLabel(item.timestamp)}</small></div><p>{item.projectName} · {item.actor}</p><Link href={"/projects/" + item.projectId + "/history"} className="moduleTextLink">Open project history <ArrowRight size={12} /></Link></div></article>)}</div>}
      </section>
      <section className="modulePanel"><header className="modulePanelHeader"><div><h2>Recent projects</h2><p>Ordered by latest project update</p></div></header>
        {projects.length === 0 ? <p className="moduleSmallNote">No accessible projects were returned.</p> : <div className="moduleSimpleList">{projects.map((project) => <Link className="moduleListRow moduleListLink" href={"/projects/" + project.id} key={project.id}><span className="utilityProjectIcon"><FileText size={15} /></span><div><strong>{project.name}</strong><small><ProjectStatusInline status={project.status} /> · R{project.revision}</small></div><span className="moduleSmallNote">{dateLabel(project.updated_at)}</span></Link>)}</div>}
      </section>
    </div>}
  </div>;
}
function SettingsPage({ page }: { page: "profile" | "ai" | "engineering" }) {
  const config = {
    profile: { eyebrow: "ACCOUNT", title: "Profile settings", detail: "Account identity and profile preferences.", icon: UserRound, items: ["Authentication is handled by the connected sign-in provider.", "Profile editing and organisation membership controls are not exposed by the current settings API.", "No profile changes are written from this screen."] },
    ai: { eyebrow: "MODEL CONFIGURATION", title: "AI configuration", detail: "Provider and model configuration boundaries for the engineering assistant.", icon: Bot, items: ["The chat provider and model are selected by server-side deployment configuration.", "Provider API keys remain on the server and are not displayed in the browser.", "Client requests cannot override the provider, model or tool configuration.", "Per-user model preferences and provider testing are not yet persisted."] },
    engineering: { eyebrow: "ENGINEERING PREFERENCES", title: "Engineering defaults", detail: "Units, standards and engineering assumptions used across project workflows.", icon: Settings2, items: ["Project requirements retain their own stated values and units.", "Global unit-system preferences and standards-library selection are not yet persisted.", "Safety factors, design codes and material allowables must be explicit within the applicable calculation inputs.", "No default is silently applied to a deterministic calculation."] },
  }[page];
  const Icon = config.icon;
  return <div className="shell utilityPage">
    <PageHeader eyebrow={config.eyebrow} title={config.title} detail={config.detail} />
    <section className="utilitySettingsPanel"><div className="utilitySettingsIcon"><Icon size={22} /></div><div><h2>Current configuration boundary</h2><p>The existing application exposes limited server-backed configuration. This screen does not pretend that unsupported settings have been saved.</p></div></section>
    <div className="utilityBoundaryList">{config.items.map((item) => <div className="utilityBoundaryItem" key={item}><ShieldCheck size={16} /><p>{item}</p></div>)}</div>
    {page === "ai" && <div className="moduleNotice"><Bot size={15} /><span>Model/provider changes are an administrator/deployment concern in this release. A future editable UI must persist typed preferences securely and validate the selected provider before reporting success.</span></div>}
    {page === "engineering" && <div className="moduleNotice"><Settings2 size={15} /><span>Do not use a global unit preference as a substitute for dimensional validation on engineering inputs.</span></div>}
    <Link href="/" className="button secondaryButton utilityBackLink">Return to workspace</Link>
  </div>;
}
