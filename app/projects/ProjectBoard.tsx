"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isEngineeringRoleRequiredFailure } from "../../src/auth/http-error-classification";

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
  const [name, setName] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const body = await apiBody(response);
    setProjects(Array.isArray(body.projects) ? body.projects : []);
    setRoleRequired(false);
    setLoadingError("");
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
        .then((body) => { if (active) setProjects(Array.isArray(body.projects) ? body.projects : []); })
        .catch((error: unknown) => {
          if (active) setLoadingError(error instanceof Error ? error.message : "Projects could not be loaded.");
        })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), problemStatement: problemStatement.trim() })
      });
      const body = await apiBody(response);
      if (!body.project) throw new Error("The API did not return the created project.");
      if (body.warning) setNotice(body.warning);
      setName("");
      setProblemStatement("");
      if (body.workspaceInitialized === false) {
        await refresh().catch(() => undefined);
        setNotice(body.warning ?? "Project created; workspace initialization needs a retry.");
      } else {
        router.push(`/projects/${body.project.id}`);
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Project creation failed.");
      if (isEngineeringRoleAuthorizationError(error)) setRoleRequired(true);
    } finally {
      setCreating(false);
    }
  }

  return <main className="shell projectBoard">
    <header className="hero">
      <div>
        <p className="eyebrow">AI-NATIVE ENGINEERING WORKSPACE</p>
        <h1>Engineering Workspace</h1>
        <p className="muted">Capture the problem, define requirements, calculate with deterministic providers, then validate results with explicit evidence.</p>
      </div>
      <Link className="button secondaryButton" href="/projects/demo">Open demo sandbox</Link>
    </header>

    {roleRequired && <section className="projectNotice projectNoticeWarning" role="status">
      <strong>Engineering role required</strong>
      <p>Your session is valid, but the API did not find an authorized engineering role in this session. Sign out and sign in again to refresh your session. The sign-in service provisions standard <code>ENGINEER</code> access for accounts without a trusted role; if this message remains after signing in again, the platform administrator must inspect the user&apos;s trusted Supabase <code>app_metadata.engineering_roles</code>. User Metadata does not grant access.</p>
    </section>}

    <section className="projectBoardGrid">
      <section className="panel projectCreatePanel">
        <p className="eyebrow">NEW WORKSPACE</p>
        <h2>Create an engineering project</h2>
        <p className="muted">Project state and workspace snapshots are persisted in Supabase. Creating a project does not mean its design is approved.</p>
        <form className="projectForm" onSubmit={createProject}>
          <label className="projectField">Project name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="e.g. Pump impeller redesign" disabled={creating || roleRequired} />
          </label>
          <label className="projectField">Problem statement <span className="muted">(optional)</span>
            <textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} maxLength={2000} rows={4} placeholder="What needs to be improved, and under what constraints?" disabled={creating || roleRequired} />
          </label>
          {createError && <p className="projectError" role="alert">{createError}</p>}
          {notice && <p className="projectNoticeText" role="status">{notice}</p>}
          <button className="button" type="submit" disabled={creating || roleRequired || name.trim().length < 2}>{creating ? "Creating project…" : "Create project"}</button>
        </form>
      </section>

      <section className="projectListSection">
        <div className="projectListHeader">
          <div><p className="eyebrow">PERSISTED PROJECTS</p><h2>Your engineering projects</h2></div>
          <button type="button" className="button secondaryButton" onClick={() => { setLoading(true); refresh().catch((error: unknown) => setLoadingError(error instanceof Error ? error.message : "Refresh failed.")).finally(() => setLoading(false)); }} disabled={loading}>Refresh</button>
        </div>
        {loading && <p className="muted">Loading projects…</p>}
        {!loading && loadingError && <p className="projectError" role="alert">{loadingError}</p>}
        {!loading && !loadingError && projects.length === 0 && <div className="projectEmptyState">
          <h3>No engineering projects yet</h3>
          <p className="muted">Create a project to start recording requirements, calculations and validation events. The demo sandbox is separate and may reset.</p>
        </div>}
        <div className="projectCards">
          {projects.map((project) => <Link className="projectCard" href={`/projects/${project.id}`} key={project.id}>
            <div className="projectCardTop"><span className="tag">{project.stage.replaceAll("_", " ")}</span><span className={`projectState projectState-${project.status.toLowerCase()}`}>{project.status}</span></div>
            <h3>{project.name}</h3>
            <p className="muted">Updated {new Date(project.updated_at).toLocaleDateString()}</p>
            <div className="projectCardBottom"><span>Revision {project.revision}</span><span>Open workspace →</span></div>
          </Link>)}
        </div>
        <Link className="projectDemoLink" href="/projects/demo">Explore the demo sandbox (example data, not durable)</Link>
      </section>
    </section>
    <section className="status"><div><span className="dot" /> Application online</div><div>Persisted state: Supabase</div><div>CAD: gated by runtime readiness</div><div>Authority: role and project membership checks</div></section>
  </main>;
}
