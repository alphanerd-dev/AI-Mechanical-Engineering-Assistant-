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
  plannedItems: string[];
}

function projectIdentifier(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1] || segments[1] === "new") return undefined;
  return segments[1];
}

function titleFromPath(pathname: string): string {
  if (pathname === "/") return "Workspace overview";
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const titles: Record<string, string> = {
    projects: "Projects",
    login: "Sign in",
    signup: "Create account",
    requirements: "Requirements",
    engineering: "Engineering assistant",
    reasoning: "Reasoning workbench",
    research: "Research verification",
    analysis: "Analysis",
    cad: "CAD workspace",
    validation: "Validation and evidence",
    execution: "Run review",
    demo: "Project overview",
  };
  if (titles[segment]) return titles[segment];
  if (pathname.split("/").filter(Boolean).length === 2 && pathname.startsWith("/projects/")) return "Project overview";
  return "Engineering workspace";
}

export function getWorkspaceNavigation(pathnameInput: string | null | undefined): WorkspaceNavigationState {
  const pathname = pathnameInput || "/";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  const isAuthRoute = first === "login" || first === "signup";
  const projectId = projectIdentifier(pathname);
  const assistantProjectId = projectId ?? "demo";
  const projectPrefix = "/projects/" + assistantProjectId;

  const globalItems: WorkspaceNavItem[] = [
    { id: "overview", label: "Overview", href: "/", icon: "layout-dashboard", description: "Workspace and recent projects" },
    { id: "projects", label: "Projects", href: "/projects", icon: "folder-kanban", description: "Browse and create projects" },
    { id: "assistant", label: "AI assistant", href: projectPrefix + "/engineering", icon: "bot", description: projectId ? "Project-scoped conversation" : "Open the illustrative demo assistant" },
  ];

  const projectItems: WorkspaceNavItem[] = projectId ? [
    { id: "project-overview", label: "Project overview", href: projectPrefix, icon: "panels-top-left", description: "Status, decisions and open questions" },
    { id: "requirements", label: "Requirements", href: projectPrefix + "/requirements", icon: "clipboard-list", description: "Scope, assumptions and verification" },
    { id: "reasoning", label: "Reasoning workbench", href: projectPrefix + "/reasoning", icon: "brain-circuit", description: "Structured problem reasoning" },
    { id: "analysis", label: "Analysis", href: projectPrefix + "/analysis", icon: "calculator", description: "Deterministic calculations and runs" },
    { id: "cad", label: "CAD", href: projectPrefix + "/cad", icon: "drafting-compass", description: "Geometry and validation state" },
    { id: "validation", label: "Validation", href: projectPrefix + "/validation", icon: "shield-check", description: "Readiness gates and evidence" },
    { id: "research", label: "Research", href: projectPrefix + "/research", icon: "search", description: "Source-backed technical research" },
  ] : [];

  return {
    pathname,
    isAuthRoute,
    projectId,
    projectLabel: projectId === "demo" ? "Demo sandbox" : projectId ? "Project " + projectId.slice(0, 8).toUpperCase() : undefined,
    pageTitle: titleFromPath(pathname),
    globalItems,
    projectItems,
    plannedItems: ["Engineering templates", "Activity", "Files and artifacts", "FEA results", "P&ID / PFD", "Reports", "History and revisions", "Project settings"],
  };
}

export function isWorkspaceItemActive(pathname: string, item: WorkspaceNavItem, hash = ""): boolean {
  if (item.id === "overview") return pathname === "/";
  if (item.id === "projects") return pathname === "/projects" || (pathname === "/" && hash === "#projects");
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  // A section remains active on its real nested destinations (for example, analysis/execution).
  if (item.id !== "assistant" && item.id !== "projects" && item.id !== "overview") {
    return pathname.startsWith(item.href + "/");
  }
  return false;
}
