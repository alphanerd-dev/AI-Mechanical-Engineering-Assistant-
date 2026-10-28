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
    login: "Sign in",
    signup: "Create account",
    requirements: "Requirements",
    engineering: "Engineering assistant",
    reasoning: "Reasoning workbench",
    research: "Research verification",
    analysis: "Analysis",
    cad: "CAD workspace",
    validation: "Validation and evidence",
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
    { id: "overview", label: "Overview", href: "/", icon: "⌂", description: "Workspace and recent projects" },
    { id: "projects", label: "Projects", href: "/#projects", icon: "▦", description: "Browse and create projects" },
    { id: "assistant", label: "AI assistant", href: projectPrefix + "/engineering", icon: "✳", description: projectId ? "Project-scoped conversation" : "Open the illustrative demo assistant" },
  ];

  const projectItems: WorkspaceNavItem[] = projectId ? [
    { id: "project-overview", label: "Project overview", href: projectPrefix, icon: "◫", description: "Status, decisions and open questions" },
    { id: "requirements", label: "Requirements", href: projectPrefix + "/requirements", icon: "≡", description: "Scope, assumptions and verification" },
    { id: "reasoning", label: "Reasoning workbench", href: projectPrefix + "/reasoning", icon: "∴", description: "Structured problem reasoning" },
    { id: "analysis", label: "Analysis", href: projectPrefix + "/analysis", icon: "∑", description: "Deterministic calculations and runs" },
    { id: "cad", label: "CAD", href: projectPrefix + "/cad", icon: "◇", description: "Geometry and validation state" },
    { id: "validation", label: "Validation", href: projectPrefix + "/validation", icon: "✓", description: "Readiness gates and evidence" },
    { id: "research", label: "Research", href: projectPrefix + "/research", icon: "⌕", description: "Source-backed technical research" },
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
  if (item.id === "projects") return pathname === "/" && hash === "#projects";
  if (item.href === "/") return pathname === "/";
  return pathname === item.href;
}
