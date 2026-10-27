export interface ProjectBriefReview {
  projectName: string;
  objective: string;
  scopeSummary: string;
  assumptions: string[];
  successCriteria: string;
  artifactStatus: string;
  disclaimer: string;
}

/**
 * Produces a transparent review summary from user-entered project details.
 * It does not call an AI model, invent engineering inputs, or create artifacts.
 */
export function buildProjectBriefReview(name: string, problemStatement: string): ProjectBriefReview {
  const projectName = name.trim() || "Untitled project";
  const objective = problemStatement.trim();
  return {
    projectName,
    objective: objective || "No problem statement supplied.",
    scopeSummary: objective
      ? "Initial scope is limited to the problem statement you supplied. Detailed requirements, operating constraints, and acceptance criteria are not yet captured."
      : "No problem statement was supplied. The project can be created, but define the objective and constraints before requesting an engineering operation.",
    assumptions: [
      "No engineering assumptions have been entered at project creation.",
      "No numerical inputs, boundary conditions, or acceptance criteria have been inferred."
    ],
    successCriteria: "Not defined yet. Add measurable acceptance criteria in Requirements before accepting an engineering result.",
    artifactStatus: "No artifacts are created or promised during project setup. Artifacts appear only when a supported engineering workflow produces them.",
    disclaimer: "This is a summary of your inputs, not an AI-generated brief, design recommendation, validation result, or engineering approval."
  };
}
