import { describe, expect, it } from "vitest";
import { getWorkspaceNavigation, isWorkspaceItemActive } from "../src/ui/workspace-navigation.js";

describe("workspace navigation", () => {
  it("keeps the home screen as workspace overview and points new users to the demo assistant", () => {
    const state = getWorkspaceNavigation("/");
    expect(state.pageTitle).toBe("Workspace overview");
    expect(state.projectId).toBeUndefined();
    expect(state.globalItems.find((item) => item.id === "assistant")?.href).toBe("/projects/demo/engineering");
    expect(state.projectItems).toHaveLength(0);
  });

  it("extracts a stable project ID and produces project-scoped routes", () => {
    const state = getWorkspaceNavigation("/projects/5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001/cad");
    expect(state.projectId).toBe("5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001");
    expect(state.projectLabel).toBe("Project 5B2D2CF0");
    expect(state.pageTitle).toBe("CAD workspace");
    expect(state.projectItems.find((item) => item.id === "cad")?.href).toBe("/projects/5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001/cad");
  });

  it("treats authentication routes separately from the workspace shell", () => {
    expect(getWorkspaceNavigation("/login").isAuthRoute).toBe(true);
    expect(getWorkspaceNavigation("/signup").isAuthRoute).toBe(true);
    expect(getWorkspaceNavigation("/projects/demo/engineering").isAuthRoute).toBe(false);
  });

  it("marks only the selected workspace destination as active", () => {
    const state = getWorkspaceNavigation("/");
    const overview = state.globalItems.find((item) => item.id === "overview")!;
    const projects = state.globalItems.find((item) => item.id === "projects")!;
    expect(isWorkspaceItemActive("/", overview)).toBe(true);
    expect(isWorkspaceItemActive("/", projects)).toBe(false);
    expect(isWorkspaceItemActive("/", projects, "#projects")).toBe(true);
  });

  it("labels the demo project rather than presenting it as persisted user data", () => {
    const state = getWorkspaceNavigation("/projects/demo");
    expect(state.projectLabel).toBe("Demo sandbox");
    expect(state.projectItems.find((item) => item.id === "project-overview")?.href).toBe("/projects/demo");
  });
});
