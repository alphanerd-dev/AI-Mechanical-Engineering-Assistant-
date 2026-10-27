import { describe, expect, it } from "vitest";
import { buildProjectBriefReview, getProjectAssistantHref } from "../src/projects/project-brief-review.js";

describe("project brief review", () => {
  it("summarizes only the submitted inputs and trims whitespace", () => {
    const review = buildProjectBriefReview("  Pump redesign  ", "  Reduce vibration under rated load.  ");
    expect(review.projectName).toBe("Pump redesign");
    expect(review.objective).toBe("Reduce vibration under rated load.");
    expect(review.scopeSummary).toContain("limited to the problem statement you supplied");
    expect(review.disclaimer).toContain("not an AI-generated brief");
  });

  it("keeps empty objective, assumptions, criteria and artifacts explicit", () => {
    const review = buildProjectBriefReview("Engine analysis", " ");
    expect(review.objective).toBe("No problem statement supplied.");
    expect(review.scopeSummary).toContain("No problem statement was supplied");
    expect(review.assumptions).toHaveLength(2);
    expect(review.assumptions.join(" ")).toContain("No numerical inputs");
    expect(review.successCriteria).toContain("Not defined yet");
    expect(review.artifactStatus).toContain("No artifacts are created or promised");
  });

  it("does not invent an AI output or treat review as approval", () => {
    const review = buildProjectBriefReview("Pump", "");
    expect(review.disclaimer).toContain("validation result, or engineering approval");
    expect(review.artifactStatus).not.toContain("CAD model generated");
  });

  it("opens the new project's assistant by stable ID, never by display name", () => {
    expect(getProjectAssistantHref("6e52d0b9-c54d-4412-bd1a-50818d401f42"))
      .toBe("/projects/6e52d0b9-c54d-4412-bd1a-50818d401f42/engineering");
  });

  it("refuses to create an unscoped assistant route", () => {
    expect(() => getProjectAssistantHref("  ")).toThrow("A project ID is required");
  });
});
