"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isEngineeringRoleRequiredFailure } from "../../src/auth/http-error-classification";
import { buildProjectBriefReview, getProjectAssistantHref } from "../../src/projects/project-brief-review.js";

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
  const [createStage, setCreateStage] = useState<"details" | "review">("details");
  const [createOutcomeUncertain, setCreateOutcomeUncertain] = useState(false);
  const [projectListCheckedAfterUncertain, setProjectListCheckedAfterUncertain] = useState(false);
  const [allowRetryAfterUncertain, setAllowRetryAfterUncertain] = useState(false);
  const [possibleMatches, setPossibleMatches] = useState<Project[]>([]);
  const briefReview = buildProjectBriefReview(name, problemStatement);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const body = await apiBody(response);
    const nextProjects = Array.isArray(body.projects) ? body.projects : [];
    setProjects(nextProjects);
    setRoleRequired(false);
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
        .then((body) => { if (active) setProjects(Array.isArray(body.projects) ? body.projects : []); })
        .catch((error: unknown) => {
          if (active) setLoadingError(error instanceof Error ? error.message : "Projects could not be loaded.");
        })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, []);

  function reviewProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || roleRequired || name.trim().length < 2) return;
    setCreateError("");
    setNotice("");
    setCreateStage("review");
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || roleRequired || createStage !== "review" || (createOutcomeUncertain && !allowRetryAfterUncertain)) return;

    setCreating(true);
    setCreateError("");
    setNotice("");
    setCreateOutcomeUncertain(false);
    setAllowRetryAfterUncertain(false);
    setProjectListCheckedAfterUncertain(false);
    setPossibleMatches([]);
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
        : "The project list refreshed and no exact-name match is visible. This does not prove the original request did not create a project; only retry if you accept the remaining duplicate risk.");
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "The project list could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="shell projectBoard">
    <header className="hero">
      <div>
        <p className="eyebrow">AI-NATIVE ENGINEERING WORKSPACE</p>
        <h1>Engineering Workspace</h1>
        <p className="muted">Engineering outcomes, not engineering overhead. State the task; the workspace coordinates supported workflows and surfaces results, checks, evidence, and the next decision. Material gaps and unsupported tasks stay explicit.</p>
      </div>
      <div className="actions"><Link className="button secondaryButton" href="/projects/demo">Open demo sandbox</Link></div>
    </header>

    {roleRequired && <section className="projectNotice projectNoticeWarning" role="status">
      <strong>Engineering role required</strong>
      <p>Your session is valid, but the API did not find an authorized engineering role in this session. Sign out and sign in again to refresh your session. The sign-in service provisions standard <code>ENGINEER</code> access for accounts without a trusted role; if this message remains after signing in again, the platform administrator must inspect the user&apos;s trusted Supabase <code>app_metadata.engineering_roles</code>. User Metadata does not grant access.</p>
    </section>}

    <section className="projectBoardGrid">
      <section className="panel projectCreatePanel">
        <p className="eyebrow">NEW WORKSPACE</p>
        <h2>Create an engineering project</h2>
        <p className="muted">Start with a project name and an optional problem statement. Add detailed requirements as they become relevant. Creating a project does not mean its design is approved.</p>
        <form className="projectForm" onSubmit={createStage === "details" ? reviewProject : createProject}>
          {createStage === "details" ? <>
            <p className="projectStepLabel">STEP 1 OF 2 · CAPTURE THE PROBLEM</p>
            <label className="projectField">Project name
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="e.g. Pump impeller redesign" disabled={creating || roleRequired} />
            </label>
            <label className="projectField">Problem statement <span className="muted">(optional)</span>
              <textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} maxLength={2000} rows={4} placeholder="What needs to be improved, and under what constraints?" disabled={creating || roleRequired} />
            </label>
            {createError && <p className="projectError" role="alert">{createError}</p>}
            {notice && <p className="projectNoticeText" role="status">{notice}</p>}
            <div className="projectCreateActions">
              <span className="projectStepHint">You’ll review the inputs before anything is created.</span>
              <button className="button" type="submit" disabled={creating || roleRequired || name.trim().length < 2}>Review project brief</button>
            </div>
          </> : <>
            <p className="projectStepLabel">STEP 2 OF 2 · REVIEW BEFORE CREATION</p>
            <section className="projectBriefReview" aria-labelledby="project-brief-review-title">
              <div className="projectBriefReviewHeader">
                <div>
                  <p className="eyebrow">INPUT SUMMARY · NOT AI-GENERATED</p>
                  <h3 id="project-brief-review-title">{briefReview.projectName}</h3>
                </div>
                <span className="projectBriefReviewBadge">REVIEW ONLY</span>
              </div>
              <div className="projectBriefReviewSection">
                <h4>Problem statement</h4>
                <p>{briefReview.objective}</p>
              </div>
              <div className="projectBriefReviewSection">
                <h4>Scope at creation</h4>
                <p>{briefReview.scopeSummary}</p>
              </div>
              <div className="projectBriefReviewGrid">
                <div className="projectBriefReviewSection">
                  <h4>Assumptions and inputs</h4>
                  <ul>{briefReview.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div className="projectBriefReviewSection">
                  <h4>Success criteria</h4>
                  <p>{briefReview.successCriteria}</p>
                </div>
              </div>
              <div className="projectBriefReviewSection">
                <h4>Artifacts</h4>
                <p>{briefReview.artifactStatus}</p>
              </div>
              <p className="projectBriefReviewDisclaimer">{briefReview.disclaimer}</p>
            </section>

            {createOutcomeUncertain && <section className="projectNotice projectNoticeWarning" role="alert" aria-live="assertive">
              <strong>Project creation outcome is unconfirmed</strong>
              <p>{createError || "The server did not return a final confirmation."} The request may have created the project even though the client did not receive a confirmed response. A blind retry can create a duplicate; your draft has been preserved.</p>
              <div className="projectCreateActions">
                <button className="button secondaryButton" type="button" onClick={() => void checkProjectListBeforeRetry()} disabled={loading || creating}>Refresh project list before retry</button>
                {projectListCheckedAfterUncertain && <button className="button secondaryButton" type="button" onClick={() => { setAllowRetryAfterUncertain(true); setCreateError(""); }} disabled={creating}>I reviewed the list; allow one retry</button>}
              </div>
              {possibleMatches.length > 0 && <div className="projectPossibleMatches">
                <strong>Projects with the same name</strong>
                {possibleMatches.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="projectPossibleMatch">
                  <span>{project.name}</span><small>Revision {project.revision} · {project.status}</small>
                </Link>)}
              </div>}
              {allowRetryAfterUncertain && <p className="projectCreateRiskNotice">Retry enabled after your acknowledgement. A project may still be created twice if the original request completes later.</p>}
            </section>}

            {!createOutcomeUncertain && createError && <p className="projectError" role="alert">{createError}</p>}
            {notice && <p className="projectNoticeText" role="status">{notice}</p>}
            <div className="projectCreateActions">
              <button className="button secondaryButton" type="button" onClick={() => { setCreateError(""); setNotice(""); setCreateStage("details"); }} disabled={creating || createOutcomeUncertain}>Edit inputs</button>
              <button className="button" type="submit" disabled={creating || roleRequired || (createOutcomeUncertain && !allowRetryAfterUncertain)}>
                {creating ? "Creating project…" : createOutcomeUncertain ? "Retry creation (possible duplicate)" : "Create project & open workspace"}
              </button>
            </div>
          </>}
        </form>
      </section>

      <section className="projectListSection" id="projects">
        <div className="projectListHeader">
          <div><p className="eyebrow">PERSISTED PROJECTS</p><h2>Your engineering projects</h2></div>
          <button type="button" className="button secondaryButton" onClick={() => { setLoading(true); refresh().catch((error: unknown) => setLoadingError(error instanceof Error ? error.message : "Refresh failed.")).finally(() => setLoading(false)); }} disabled={loading}>Refresh</button>
        </div>
        {loading && <p className="muted">Loading projects…</p>}
        {!loading && loadingError && <p className="projectError" role="alert">{loadingError}</p>}
        {!loading && !loadingError && projects.length === 0 && <div className="projectEmptyState">
          <h3>No engineering projects yet</h3>
          <p className="muted">Create a project, then start with the problem you need to solve. Add specific requirements when they matter; the demo sandbox is separate and may reset.</p>
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
  </div>;
}
