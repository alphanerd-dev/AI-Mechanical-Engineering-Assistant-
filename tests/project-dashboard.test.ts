import { describe, expect, it } from "vitest";
import { filterProjectIndex, summarizeProjectStatuses } from "../src/projects/project-dashboard";

const projects = [
  { id: "p-1", name: "Pump redesign", stage: "mechanical_design", status: "ACTIVE" as const },
  { id: "p-2", name: "Compressor housing", stage: "static_analysis", status: "BLOCKED" as const },
  { id: "p-3", name: "Shaft sizing", stage: "calculations", status: "COMPLETE" as const },
];

describe("persisted project dashboard data", () => {
  it("counts persisted statuses without inferring run or approval state", () => {
    expect(summarizeProjectStatuses(projects)).toEqual({ all: 3, active: 1, blocked: 1, complete: 1 });
    expect(summarizeProjectStatuses([])).toEqual({ all: 0, active: 0, blocked: 0, complete: 0 });
  });

  it("filters by case-insensitive project name and status without mutating source order", () => {
    expect(filterProjectIndex(projects, "PUMP", "ALL").map(project => project.id)).toEqual(["p-1"]);
    expect(filterProjectIndex(projects, "", "BLOCKED").map(project => project.id)).toEqual(["p-2"]);
    expect(filterProjectIndex(projects, "static", "ALL").map(project => project.id)).toEqual(["p-2"]);
    expect(filterProjectIndex(projects, "", "ALL").map(project => project.id)).toEqual(["p-1", "p-2", "p-3"]);
  });
});
