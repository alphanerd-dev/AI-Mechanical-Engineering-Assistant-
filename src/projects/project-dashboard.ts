export type PersistedProjectStatus = "ACTIVE" | "BLOCKED" | "COMPLETE";
export type ProjectIndexFilter = "ALL" | PersistedProjectStatus;

export interface ProjectIndexItem {
  id: string;
  name: string;
  stage: string;
  status: PersistedProjectStatus;
}

export interface ProjectStatusCounts {
  all: number;
  active: number;
  blocked: number;
  complete: number;
}

/** Count only persisted project statuses; this does not imply run or approval state. */
export function summarizeProjectStatuses<T extends { status: PersistedProjectStatus }>(
  projects: readonly T[],
): ProjectStatusCounts {
  return projects.reduce<ProjectStatusCounts>((counts, project) => {
    counts.all += 1;
    if (project.status === "ACTIVE") counts.active += 1;
    if (project.status === "BLOCKED") counts.blocked += 1;
    if (project.status === "COMPLETE") counts.complete += 1;
    return counts;
  }, { all: 0, active: 0, blocked: 0, complete: 0 });
}

/** Pure filter for the persisted project index; preserves the API's newest-first ordering. */
export function filterProjectIndex<T extends ProjectIndexItem>(
  projects: readonly T[],
  query: string,
  filter: ProjectIndexFilter,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  return projects.filter(project => {
    const matchesStatus = filter === "ALL" || project.status === filter;
    const matchesQuery = !normalized ||
      `${project.name} ${project.stage} ${project.id}`.toLocaleLowerCase().includes(normalized);
    return matchesStatus && matchesQuery;
  });
}
