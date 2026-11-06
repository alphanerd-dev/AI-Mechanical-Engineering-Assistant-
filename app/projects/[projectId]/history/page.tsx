import ProjectModuleWorkspace from "../_components/ProjectModuleWorkspace";

export default async function ProjectModulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectModuleWorkspace projectId={projectId} module="history" />;
}
