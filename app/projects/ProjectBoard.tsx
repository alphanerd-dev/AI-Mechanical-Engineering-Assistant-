"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, Clock3, FolderKanban, Plus, Sparkles, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { isEngineeringRoleRequiredFailure } from "../../src/auth/http-error-classification";
import { buildProjectBriefReview, getProjectAssistantHref } from "../../src/projects/project-brief-review.js";
import { summarizeProjectStatuses } from "../../src/projects/project-dashboard";

type Project = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
};

type ApiBody = { projects?: Project[]; project?: Project; error?: string; code?: string; workspaceInitialized?: boolean; warning?: string };

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  const Icon = status === "BLOCKED" ? AlertTriangle : status === "COMPLETE" ? CheckCircle2 : CircleDot;
  const label = status === "BLOCKED" ? "Blocked" : status === "COMPLETE" ? "Complete" : "Active";
  const variant = status === "BLOCKED" ? "warning" : status === "COMPLETE" ? "success" : "info";
  return <Badge variant={variant}><Icon size={11} aria-hidden="true" />{label}</Badge>;
}

function isEngineeringRoleAuthorizationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const details = error as Error & { status?: unknown; code?: unknown };
  return isEngineeringRoleRequiredFailure(details.status, details.code);
}

async function apiBody(response: Response): Promise<ApiBody> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof body.error === "string" ? body.error : "Workspace request failed."), { status: response.status, code: body.code });
  return body as ApiBody;
}

export default function ProjectBoard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [roleRequired, setRoleRequired] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [name, setName] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const [createStage, setCreateStage] = useState<"details" | "review">("details");
  const [createOutcomeUncertain, setCreateOutcomeUncertain] = useState(false);
  const [projectListCheckedAfterUncertain, setProjectListCheckedAfterUncertain] = useState(false);
  const [allowRetryAfterUncertain, setAllowRetryAfterUncertain] = useState(false);
  const [possibleMatches, setPossibleMatches] = useState<Project[]>([]);
  const creationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const briefReview = buildProjectBriefReview(name, problemStatement);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const body = await apiBody(response);
    const nextProjects = Array.isArray(body.projects) ? body.projects : [];
    setProjects(nextProjects);
    setRoleRequired(false);
    setSignInRequired(false);
    setLoadingError("");
    return nextProjects;
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      fetch("/api/projects", { cache: "no-store" })
        .then(async (response) => {
          try { return await apiBody(response); }
          catch (error) {
            if (active && isEngineeringRoleAuthorizationError(error)) {
              setRoleRequired(true);
            }
            throw error;
          }
        })
        .then((body) => {
          if (active) {
            setSignInRequired(false);
            setProjects(Array.isArray(body.projects) ? body.projects : []);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          const status = error instanceof Error ? (error as Error & { status?: unknown }).status : undefined;
          if (status === 401) {
            setSignInRequired(true);
            setProjects([]);
            setLoadingError("");
            return;
          }
          setLoadingError(error instanceof Error ? error.message : "Projects could not be loaded.");
        })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, []);

  function useTaskPrompt() {
    const prompt = taskPrompt.trim();
    if (!prompt) return;
    setProblemStatement(prompt);
    setCreateStage("details");
    setCreateError("");
    document.getElementById("create-project")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reviewProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || roleRequired || signInRequired || name.trim().length < 2) return;
    setCreateError("");
    setNotice("");
    setCreateStage("review");
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || roleRequired || signInRequired || createStage !== "review" || (createOutcomeUncertain && !allowRetryAfterUncertain)) return;

    setCreating(true);
    setCreateError("");
    setNotice("");
    setCreateOutcomeUncertain(false);
    setAllowRetryAfterUncertain(false);
    setProjectListCheckedAfterUncertain(false);
    setPossibleMatches([]);
    try {
      const payload = { name: name.trim(), problemStatement: problemStatement.trim() };
      const fingerprint = JSON.stringify(payload);
      if (!creationAttempt.current || creationAttempt.current.fingerprint !== fingerprint) {
        creationAttempt.current = { fingerprint, key: globalThis.crypto.randomUUID() };
      }
      // Reuse this key after ambiguous transport failures. The server binds it to the exact
      // normalized payload and database uniqueness prevents concurrent duplicate project rows.
      const idempotencyKey = creationAttempt.current.key;
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(payload)
      });
      const body = await apiBody(response);
      if (!body.project) throw new Error("The API did not return the created project.");
      creationAttempt.current = null;
      if (body.warning) setNotice(body.warning);
      setName("");
      setProblemStatement("");
      setCreateStage("details");
      setCreateOutcomeUncertain(false);
      if (body.workspaceInitialized === false) {
        await refresh().catch(() => undefined);
        setNotice(body.warning ?? "Project created; workspace initialization needs a retry.");
      } else {
        router.push(getProjectAssistantHref(body.project.id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project creation failed.";
      const status = error && typeof error === "object" && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
      const outcomeUncertain = typeof status !== "number" || status >= 500;
      if (outcomeUncertain) {
        setCreateOutcomeUncertain(true);
        setAllowRetryAfterUncertain(false);
        setProjectListCheckedAfterUncertain(false);
        setPossibleMatches([]);
        setCreateError(message);
      } else {
        setCreateError(message);
      }
      if (isEngineeringRoleAuthorizationError(error)) setRoleRequired(true);
    } finally {
      setCreating(false);
    }
  }

  async function checkProjectListBeforeRetry() {
    setLoading(true);
    setLoadingError("");
    try {
      const latestProjects = await refresh();
      const exactName = name.trim().toLocaleLowerCase();
      const sameName = latestProjects.filter((project) => project.name.trim().toLocaleLowerCase() === exactName);
      setPossibleMatches(sameName);
      setProjectListCheckedAfterUncertain(true);
      setAllowRetryAfterUncertain(false);
      setNotice(sameName.length > 0
        ? `Found ${sameName.length} project(s) with this exact name. Open and inspect the matching project(s) below before deciding whether another project is needed.`
        : "The project list refreshed and no exact-name match is visible. Retrying this unchanged draft reuses its server idempotency key, so a repeated request will not create a second project. Editing the draft starts a new request.");
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "The project list could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  const sortedProjects = [...projects].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const recentProjects = sortedProjects.slice(0, 3);
  const projectCounts = summarizeProjectStatuses(projects);
  const suggestedProjects = sortedProjects.filter((project) => project.status !== "COMPLETE").slice(0, 3);
  const dashboardActions = (suggestedProjects.length ? suggestedProjects : sortedProjects.slice(0, 3)).map((project) => ({
    project,
    title: project.status === "BLOCKED" ? "Inspect blocked project" : project.status === "COMPLETE" ? "Open completed project" : "Continue project",
    description: project.status === "BLOCKED" ? "Inspect project status and available validation evidence" : "Return to the persisted project workspace",
    href: project.status === "BLOCKED" ? `/projects/${project.id}/validation` : `/projects/${project.id}`,
  }));

  return <div className="shell projectBoard workspaceOverview">
    <header className="workspaceViewHeader">
      <div>
        <p className="eyebrow">ENGINEERING OS</p>
        <h1>Workspace overview</h1>
        <p className="muted">Your engineering projects, project context and next safe actions in one place.</p>
      </div>
      <div className="workspaceViewActions">
        <Link className="button secondaryButton" href="/projects"><FolderKanban size={15} aria-hidden="true" />Browse projects</Link>
        <a className="button workspacePrimaryAction" href="#create-project"><Plus size={15} aria-hidden="true" />Create project</a>
      </div>
    </header>

    {roleRequired && <section className="projectNotice projectNoticeWarning" role="status">
      <strong>Engineering role required</strong>
      <p>Your session is valid, but the API did not find an authorized engineering role in this session. Sign out and sign in again to refresh your session. The sign-in service provisions standard <code>ENGINEER</code> access for accounts without a trusted role; if this message remains after signing in again, the platform administrator must inspect the user&apos;s trusted Supabase <code>app_metadata.engineering_roles</code>. User Metadata does not grant access.</p>
    </section>}

    <section className="workspaceLaunchPanel" aria-labelledby="workspace-launch-title">
      <div className="workspaceLaunchMain">
        <div className="workspaceLaunchTags">
          <Badge variant="default"><Sparkles size={12} aria-hidden="true" />AI-assisted engineering</Badge>
          <Badge variant="muted">Project-scoped conversations</Badge>
        </div>
        <p className="eyebrow">ENGINEERING TASK ENTRY</p>
        <h2 id="workspace-launch-title">What are we engineering today?</h2>
        <p>Describe the problem, operating conditions and constraints. Turn the prompt into a project brief first; AI guidance, deterministic execution and validation remain separate steps.</p>
        <div className="workspacePromptComposer">
          <label htmlFor="workspace-task-prompt">Engineering problem or task</label>
          <textarea
            id="workspace-task-prompt"
            value={taskPrompt}
            onChange={(event) => setTaskPrompt(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Describe the engineering problem, operating conditions, constraints or question…"
          />
          <div className="workspacePromptFooter">
            <span>Up to 2,000 characters · prefilled into the brief, saved only when the project is created</span>
            <div className="workspacePromptActions">
              <button type="button" className="button secondaryButton" onClick={useTaskPrompt} disabled={!taskPrompt.trim()}>Use this brief</button>
              <Link className="button workspacePrimaryAction" href="/assistant">Choose project for AI chat <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </div>
      <aside className="workspaceContinueCard" aria-label="Most recently updated project">
        {signInRequired ? <>
          <span className="eyebrow">PRIVATE WORKSPACE</span>
          <FolderKanban size={23} aria-hidden="true" />
          <h3>Sign in to continue</h3>
          <p>Your saved projects and revision history are available after sign-in.</p>
          <Link href="/login">Sign in <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </> : recentProjects[0] ? <>
          <div className="workspaceContinueTop"><span className="eyebrow">MOST RECENTLY UPDATED</span><ProjectStatusBadge status={recentProjects[0].status} /></div>
          <h3>{recentProjects[0].name}</h3>
          <p>{recentProjects[0].stage.replaceAll("_", " ")} · Revision {recentProjects[0].revision}</p>
          <div className="workspaceContinueMeta"><span>Last updated</span><strong>{new Date(recentProjects[0].updated_at).toLocaleString()}</strong></div>
          <Link href={`/projects/${recentProjects[0].id}`}>Open project <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </> : <>
          <span className="eyebrow">YOUR PROJECTS</span>
          <FolderKanban size={23} aria-hidden="true" />
          <h3>{loading ? "Loading persisted projects…" : "No project to continue"}</h3>
          <p>Create a project to establish durable engineering context and revision history.</p>
          <a href="#create-project">Create your first project <ArrowUpRight size={14} aria-hidden="true" /></a>
        </>}
      </aside>
    </section>

    <section className="workspaceMetricGrid" aria-label="Persisted project counts">
      <article className="workspaceMetricCard"><div><span>Persisted projects</span><FolderKanban size={16} aria-hidden="true" /></div><strong>{loading || signInRequired ? "—" : projectCounts.all}</strong><small>{signInRequired ? "Sign in to view project counts" : "Projects accessible to this account"}</small></article>
      <article className="workspaceMetricCard"><div><span>Active projects</span><Activity size={16} aria-hidden="true" /></div><strong>{loading || signInRequired ? "—" : projectCounts.active}</strong><small>{signInRequired ? "Sign in to view project counts" : "Project status: ACTIVE"}</small></article>
      <article className="workspaceMetricCard workspaceMetricWarning"><div><span>Blocked projects</span><AlertTriangle size={16} aria-hidden="true" /></div><strong>{loading || signInRequired ? "—" : projectCounts.blocked}</strong><small>{signInRequired ? "Sign in to view project counts" : "Requires project-level inspection"}</small></article>
      <article className="workspaceMetricCard workspaceMetricSuccess"><div><span>Completed projects</span><CheckCircle2 size={16} aria-hidden="true" /></div><strong>{loading || signInRequired ? "—" : projectCounts.complete}</strong><small>{signInRequired ? "Sign in to view project counts" : "Project status: COMPLETE"}</small></article>
    </section>

    <section className="workspaceDashboardSection" aria-labelledby="recent-projects-heading">
      <div className="workspaceSectionHeader">
        <div><h2 id="recent-projects-heading">Recent projects</h2><p>Resume work without losing project context.</p></div>
        <Link href="/projects">View all projects <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
      {loading && <p className="muted">Loading persisted projects…</p>}
      {!loading && signInRequired && <div className="workspaceAccessNotice" role="status"><span>Sign in to view your saved engineering projects.</span><Link href="/login">Sign in</Link></div>}
      {!loading && loadingError && <p className="projectError" role="alert">{loadingError}</p>}
      {!loading && !loadingError && !signInRequired && recentProjects.length === 0 && <div className="workspaceEmptyPanel"><FolderKanban size={22} aria-hidden="true" /><strong>No engineering projects yet</strong><p>Create a project, then add requirements and verification methods as the work develops. The demo sandbox remains separate.</p><a className="button" href="#create-project">Create a project <Plus size={14} aria-hidden="true" /></a></div>}
      <div className="workspaceRecentGrid">
        {recentProjects.map((project) => <Link className="workspaceRecentCard" href={`/projects/${project.id}`} key={project.id}>
          <div className="workspaceRecentCardTop"><span className="workspaceProjectIcon"><FolderKanban size={17} aria-hidden="true" /></span><ProjectStatusBadge status={project.status} /></div>
          <h3>{project.name}</h3>
          <p>{project.stage.replaceAll("_", " ")}</p>
          <div className="workspaceRecentCardMeta"><span>Revision {project.revision}</span><span>{new Date(project.updated_at).toLocaleDateString()}</span></div>
          <span className="workspaceRecentCardAction">Open project <ArrowUpRight size={14} aria-hidden="true" /></span>
        </Link>)}
      </div>
    </section>

    <section className="workspaceDashboardBottom">
      <section className="panel workspaceUpdatesPanel" aria-labelledby="workspace-updates-title">
        <div className="workspacePanelHeader"><div><h2 id="workspace-updates-title">Recently updated projects</h2><p>Derived from persisted project timestamps, not a detailed activity log.</p></div><Clock3 size={17} aria-hidden="true" /></div>
        {signInRequired ? <p className="muted">Sign in to view project activity.</p> : recentProjects.length === 0 ? <p className="muted">No project update timestamps are available yet.</p> : <div className="workspaceUpdateList">
          {recentProjects.map(project => <Link className="workspaceUpdateItem" href={`/projects/${project.id}`} key={project.id}>
            <span className="workspaceUpdateIcon"><Activity size={15} aria-hidden="true" /></span>
            <span><strong>Project record updated</strong><small>{project.name} · Revision {project.revision}</small></span>
            <time dateTime={project.updated_at}>{new Date(project.updated_at).toLocaleString()}</time>
          </Link>)}
        </div>}
      </section>

      <section className="panel workspaceActionsPanel" aria-labelledby="workspace-actions-title">
        <div className="workspacePanelHeader"><div><h2 id="workspace-actions-title">Suggested next actions</h2><p>Project-aware navigation only; nothing runs automatically.</p></div><Badge variant="muted">{dashboardActions.length} available</Badge></div>
        {signInRequired ? <div className="workspaceSuggestedAction"><span className="workspaceUpdateIcon"><FolderKanban size={15} aria-hidden="true" /></span><span><strong>Sign in to start an engineering project</strong><small>Saved workspaces and project actions are private to your account.</small></span><Link href="/login" aria-label="Sign in to view suggested actions"><ChevronRight size={16} /></Link></div> : dashboardActions.length === 0 ? <div className="workspaceSuggestedAction"><span className="workspaceUpdateIcon"><Plus size={15} aria-hidden="true" /></span><span><strong>Prepare an engineering brief</strong><small>Start a new project from a defined objective.</small></span><a href="#create-project" aria-label="Create an engineering project"><ChevronRight size={16} /></a></div> : dashboardActions.map(action => <Link className="workspaceSuggestedAction" href={action.href} key={action.project.id}>
          <span className="workspaceUpdateIcon">{action.project.status === "BLOCKED" ? <AlertTriangle size={15} aria-hidden="true" /> : <FolderKanban size={15} aria-hidden="true" />}</span>
          <span><strong>{action.title}</strong><small>{action.project.name} · {action.description}</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>)}
      </section>
    </section>

    <section className="panel projectCreatePanel workspaceCreatePanel" id="create-project" aria-labelledby="create-project-title">
      <div className="workspaceCreateIntro"><p className="eyebrow">NEW WORKSPACE</p><h2 id="create-project-title">Create an engineering project</h2><p className="muted">Capture the problem, review the initial brief, then explicitly confirm creation. Creating a project does not mean its design is approved.</p></div>
      <form className="projectForm" onSubmit={createStage === "details" ? reviewProject : createProject}>
        {signInRequired && <div className="workspaceAccessNotice" role="status"><span>Sign in before creating and saving an engineering project.</span><Link href="/login">Sign in</Link></div>}
        {createStage === "details" ? <>
          <p className="projectStepLabel">STEP 1 OF 2 · CAPTURE THE PROBLEM</p>
          <label className="projectField">Project name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="e.g. Pump impeller redesign" disabled={creating || roleRequired || signInRequired} />
          </label>
          <label className="projectField">Problem statement <span className="muted">(optional)</span>
            <textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} maxLength={2000} rows={4} placeholder="What needs to be improved, and under what constraints?" disabled={creating || roleRequired || signInRequired} />
          </label>
          {createError && <p className="projectError" role="alert">{createError}</p>}
          {notice && <p className="projectNoticeText" role="status">{notice}</p>}
          <div className="projectCreateActions"><span className="projectStepHint">You’ll review the inputs before anything is created.</span><button className="button workspacePrimaryAction" type="submit" disabled={creating || roleRequired || signInRequired || name.trim().length < 2}>Review project brief <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        </> : <>
          <p className="projectStepLabel">STEP 2 OF 2 · REVIEW BEFORE CREATION</p>
          <section className="projectBriefReview" aria-labelledby="project-brief-review-title">
            <div className="projectBriefReviewHeader"><div><p className="eyebrow">INPUT SUMMARY · NOT AI-GENERATED</p><h3 id="project-brief-review-title">{briefReview.projectName}</h3></div><span className="projectBriefReviewBadge">REVIEW ONLY</span></div>
            <div className="projectBriefReviewSection"><h4>Problem statement</h4><p>{briefReview.objective}</p></div>
            <div className="projectBriefReviewSection"><h4>Scope at creation</h4><p>{briefReview.scopeSummary}</p></div>
            <div className="projectBriefReviewGrid"><div className="projectBriefReviewSection"><h4>Assumptions and inputs</h4><ul>{briefReview.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="projectBriefReviewSection"><h4>Success criteria</h4><p>{briefReview.successCriteria}</p></div></div>
            <div className="projectBriefReviewSection"><h4>Artifacts</h4><p>{briefReview.artifactStatus}</p></div>
            <p className="projectBriefReviewDisclaimer">{briefReview.disclaimer}</p>
          </section>
          {createOutcomeUncertain && <section className="projectNotice projectNoticeWarning" role="alert" aria-live="assertive"><strong>Project creation outcome is unconfirmed</strong><p>{createError || "The server did not return a final confirmation."} The request may have created the project even though the client did not receive a confirmed response. A blind retry can create a duplicate; your draft has been preserved.</p><div className="projectCreateActions"><button className="button secondaryButton" type="button" onClick={() => void checkProjectListBeforeRetry()} disabled={loading || creating}>Refresh project list before retry</button>{projectListCheckedAfterUncertain && <button className="button secondaryButton" type="button" onClick={() => { setAllowRetryAfterUncertain(true); setCreateError(""); }} disabled={creating}>I reviewed the list; allow one retry</button>}</div>{possibleMatches.length > 0 && <div className="projectPossibleMatches"><strong>Projects with the same name</strong>{possibleMatches.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="projectPossibleMatch"><span>{project.name}</span><small>Revision {project.revision} · {project.status}</small></Link>)}</div>}{allowRetryAfterUncertain && <p className="projectCreateRiskNotice">Retry enabled after your acknowledgement. The unchanged draft reuses its server key; edits are treated as a new project-creation request.</p>}</section>}
          {!createOutcomeUncertain && createError && <p className="projectError" role="alert">{createError}</p>}
          {notice && <p className="projectNoticeText" role="status">{notice}</p>}
          <div className="projectCreateActions"><button className="button secondaryButton" type="button" onClick={() => { setCreateError(""); setNotice(""); setCreateStage("details"); }} disabled={creating || createOutcomeUncertain}>Edit inputs</button><button className="button workspacePrimaryAction" type="submit" disabled={creating || roleRequired || signInRequired || (createOutcomeUncertain && !allowRetryAfterUncertain)}>{creating ? "Creating project…" : createOutcomeUncertain ? "Retry creation (possible duplicate)" : "Create project & open workspace"}</button></div>
        </>}
      </form>
    </section>
    <p className="workspaceDataNote">Dashboard counts and update times come from the current persisted project list. They do not imply solver completion, validation, review or approval.</p>
  </div>;

}
