export interface WorkspaceNavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  description?: string;
}
export interface WorkspaceNavigationState {
  pathname: string;
  isAuthRoute: boolean;
  projectId?: string;
  projectLabel?: string;
  pageTitle: string;
  globalItems: WorkspaceNavItem[];
  projectItems: WorkspaceNavItem[];
  engineeringItems: WorkspaceNavItem[];
  preferenceItems: WorkspaceNavItem[];
}
function projectIdentifier(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1] || segments[1] === "new") return undefined;
  return segments[1];
}
function titleFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments.at(-1) ?? "";
  const titles: Record<string, string> = {
    projects: "Projects", login: "Sign in", signup: "Create account",
    templates: "Engineering templates", activity: "Workspace activity",
    profile: "Profile settings", ai: "AI configuration",
    requirements: "Requirements", reasoning: "Reasoning workbench",
    research: "Research verification", analysis: "Analysis", execution: "Run review",
    cad: "CAD workspace", workbench: "Engineering workbench", fea: "FEA results",
    pid: "P&ID / PFD", calculations: "Calculations", files: "Files and artifacts",
    history: "Project history", revisions: "Revisions and approvals", reports: "Reports",
    settings: "Project settings", validation: "Validation and evidence", demo: "Project overview",
  };
  if (pathname === "/") return "Workspace overview";
  if (pathname.startsWith("/settings/")) return ({ profile: "Profile settings", ai: "AI configuration", engineering: "Engineering defaults" } as Record<string, string>)[segment] ?? "Settings";
  if (titles[segment]) return titles[segment];
  if (segment === "engineering" && segments[0] === "projects") return "Engineering assistant";
  if (segments.length === 2 && segments[0] === "projects") return "Project overview";
  return "Engineering workspace";
}
export function getWorkspaceNavigation(pathnameInput: string | null | undefined): WorkspaceNavigationState {
  const pathname = pathnameInput || "/";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  const isAuthRoute = first === "login" || first === "signup";
  const projectId = projectIdentifier(pathname);
  const projectPrefix = "/projects/" + (projectId ?? "demo");
  const globalItems: WorkspaceNavItem[] = [
    { id: "overview", label: "Overview", href: "/", icon: "layout-dashboard", description: "Workspace and recent projects" },
    { id: "projects", label: "Projects", href: "/projects", icon: "folder-kanban", description: "Browse and create projects" },
    { id: "assistant", label: "AI assistant", href: projectPrefix + "/engineering", icon: "bot", description: projectId ? "Project-scoped conversation" : "Open the illustrative demo assistant" },
    { id: "templates", label: "Templates", href: "/templates", icon: "book-open", description: "Engineering workflow starters" },
    { id: "activity", label: "Activity", href: "/activity", icon: "activity", description: "Recent workspace project activity" },
  ];
  const projectItems: WorkspaceNavItem[] = projectId ? [
    { id: "project-overview", label: "Overview", href: projectPrefix, icon: "panels-top-left", description: "Project state and next safe actions" },
    { id: "workbench", label: "Workbench", href: projectPrefix + "/workbench", icon: "box", description: "3D, analysis and project outputs" },
    { id: "files", label: "Files & artifacts", href: projectPrefix + "/files", icon: "files", description: "Saved project records and CAD identities" },
    { id: "history", label: "History", href: projectPrefix + "/history", icon: "history", description: "Recorded project events" },
    { id: "revisions", label: "Revisions", href: projectPrefix + "/revisions", icon: "git-branch", description: "Revision references and approvals" },
    { id: "reports", label: "Reports", href: projectPrefix + "/reports", icon: "file-text", description: "Export a traceable workspace snapshot" },
    { id: "project-settings", label: "Settings", href: projectPrefix + "/settings", icon: "settings", description: "Project identity and configuration" },
  ] : [];
  const engineeringItems: WorkspaceNavItem[] = projectId ? [
    { id: "requirements", label: "Requirements", href: projectPrefix + "/requirements", icon: "clipboard-list", description: "Scope, assumptions and verification" },
    { id: "reasoning", label: "Reasoning", href: projectPrefix + "/reasoning", icon: "brain-circuit", description: "Structured problem reasoning" },
    { id: "analysis", label: "Analysis", href: projectPrefix + "/analysis", icon: "calculator", description: "Deterministic calculations and runs" },
    { id: "cad", label: "CAD", href: projectPrefix + "/cad", icon: "drafting-compass", description: "Geometry and CAD identity registry" },
    { id: "fea", label: "FEA", href: projectPrefix + "/fea", icon: "chart-no-axes-combined", description: "Finite element analysis result records" },
    { id: "pid", label: "P&ID / PFD", href: projectPrefix + "/pid", icon: "workflow", description: "Process and instrumentation diagrams" },
    { id: "calculations", label: "Calculations", href: projectPrefix + "/calculations", icon: "sigma", description: "Saved deterministic calculation artifacts" },
    { id: "validation", label: "Validation", href: projectPrefix + "/validation", icon: "shield-check", description: "Readiness gates and evidence" },
    { id: "research", label: "Research", href: projectPrefix + "/research", icon: "search", description: "Source-backed technical research" },
  ] : [];
  const preferenceItems: WorkspaceNavItem[] = [
    { id: "profile-settings", label: "Profile", href: "/settings/profile", icon: "user-round", description: "Account and profile preferences" },
    { id: "ai-settings", label: "AI configuration", href: "/settings/ai", icon: "sliders-horizontal", description: "Model and provider configuration" },
    { id: "engineering-settings", label: "Engineering defaults", href: "/settings/engineering", icon: "settings-2", description: "Units, standards and engineering defaults" },
  ];
  return {
    pathname, isAuthRoute, projectId,
    projectLabel: projectId === "demo" ? "Demo sandbox" : projectId ? "Project " + projectId.slice(0, 8).toUpperCase() : undefined,
    pageTitle: titleFromPath(pathname), globalItems, projectItems, engineeringItems, preferenceItems,
  };
}
export function isWorkspaceItemActive(pathname: string, item: WorkspaceNavItem, hash = ""): boolean {
  if (item.id === "overview") return pathname === "/";
  if (item.id === "projects") return pathname === "/projects" || (pathname === "/" && hash === "#projects");
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  if (item.id !== "assistant" && item.id !== "projects" && item.id !== "overview" && item.href !== "/") {
    return pathname.startsWith(item.href + "/");
  }
  return false;
}
