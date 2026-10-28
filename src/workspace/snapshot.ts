import type { EngineeringWorkspaceSnapshot } from "./types.js";
import { validateEngineeringWorkspaceSnapshot } from "./validation.js";

export interface NewEngineeringProject {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
}

/** Build the canonical durable workspace shape used by project creation and lazy initialization. */
export function createEmptyEngineeringWorkspaceSnapshot(project: NewEngineeringProject): EngineeringWorkspaceSnapshot {
  const now = new Date().toISOString();
  const snapshot: EngineeringWorkspaceSnapshot = {
    schemaVersion: 1,
    id: project.id,
    name: project.name,
    project: {
      ...project,
      requirements: [],
      assumptions: [],
      openQuestions: [],
      unresolvedRisks: [],
      events: []
    },
    artifacts: [],
    taskGraph: {
      id: `task-graph-${project.id}`,
      projectId: project.id,
      revision: 1,
      tasks: []
    },
    revision: 1,
    savedAt: now
  };
  validateEngineeringWorkspaceSnapshot(snapshot);
  return snapshot;
}
