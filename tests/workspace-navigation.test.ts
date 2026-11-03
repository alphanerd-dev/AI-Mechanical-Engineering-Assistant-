import { describe, expect, it } from "vitest";
import { getWorkspaceNavigation, isWorkspaceItemActive } from "../src/ui/workspace-navigation.js";

describe("workspace navigation", () => {
  it("keeps the home screen as workspace overview and routes the global assistant through project selection", () => {
    const state = getWorkspaceNavigation("/");
    expect(state.pageTitle).toBe("Workspace overview");
    expect(state.projectId).toBeUndefined();
    expect(state.globalItems.find((item) => item.id === "assistant")?.href).toBe("/assistant");
    expect(state.projectItems).toHaveLength(0);
    expect(state.globalItems.map((item) => item.id)).toEqual(["overview", "projects", "assistant", "templates", "activity"]);
    expect(state.preferenceItems).toHaveLength(3);
  });

  it("shows the project-context entry route as the active global assistant destination", () => {
    const state = getWorkspaceNavigation("/assistant");
    const assistant = state.globalItems.find((item) => item.id === "assistant");
    expect(state.pageTitle).toBe("Choose project context");
    expect(assistant?.href).toBe("/assistant");
    expect(assistant ? isWorkspaceItemActive("/assistant", assistant) : false).toBe(true);
    expect(state.projectId).toBeUndefined();
  });

  it("extracts a stable project ID and produces project-scoped routes", () => {
    const state = getWorkspaceNavigation("/projects/5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001/cad");
    expect(state.projectId).toBe("5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001");
    expect(state.projectLabel).toBe("Project 5B2D2CF0");
    expect(state.pageTitle).toBe("CAD workspace");
    expect(state.engineeringItems.find((item) => item.id === "cad")?.href).toBe("/projects/5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001/cad");
    expect(state.projectItems.find((item) => item.id === "workbench")?.href).toBe("/projects/5b2d2cf0-7a5f-4a42-86c2-8b7d3e2e5001/workbench");
  });

  it("routes project workbench, FEA, P&ID, records and settings into the project context", () => {
    const prefix = "/projects/project-123";
    const state = getWorkspaceNavigation(prefix + "/fea");
    expect(state.engineeringItems.map((item) => item.href)).toContain(prefix + "/fea");
    expect(state.engineeringItems.map((item) => item.href)).toContain(prefix + "/pid");
    expect(state.projectItems.map((item) => item.href)).toContain(prefix + "/files");
    expect(state.projectItems.map((item) => item.href)).toContain(prefix + "/revisions");
    expect(state.projectItems.find((item) => item.id === "project-settings")?.href).toBe(prefix + "/settings");
    expect(isWorkspaceItemActive(prefix + "/fea", state.engineeringItems.find((item) => item.id === "fea")!)).toBe(true);
  });

  it("exposes global utility and preferences routes without leaking a project ID", () => {
    const state = getWorkspaceNavigation("/settings/ai");
    expect(state.projectId).toBeUndefined();
    expect(state.pageTitle).toBe("AI configuration");
    expect(state.globalItems.find((item) => item.id === "templates")?.href).toBe("/templates");
    expect(state.globalItems.find((item) => item.id === "activity")?.href).toBe("/activity");
    expect(state.preferenceItems.find((item) => item.id === "engineering-settings")?.href).toBe("/settings/engineering");
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
    expect(isWorkspaceItemActive("/projects", projects)).toBe(true);
    expect(isWorkspaceItemActive("/", projects, "#projects")).toBe(true);
  });

  it("keeps the analysis section active for its nested execution route", () => {
    const state = getWorkspaceNavigation("/projects/project-123/analysis/execution");
    const analysis = state.engineeringItems.find((item) => item.id === "analysis")!;
    expect(state.pageTitle).toBe("Run review");
    expect(isWorkspaceItemActive(state.pathname, analysis)).toBe(true);
  });

  it("labels the demo project rather than presenting it as persisted user data", () => {
    const state = getWorkspaceNavigation("/projects/demo");
    expect(state.projectLabel).toBe("Demo sandbox");
    expect(state.projectItems.find((item) => item.id === "project-overview")?.href).toBe("/projects/demo");
  });
});
