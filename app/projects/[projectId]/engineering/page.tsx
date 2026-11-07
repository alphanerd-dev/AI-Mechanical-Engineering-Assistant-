import EngineeringWorkspace from "./EngineeringWorkspace";
import styles from "./EngineeringPage.module.css";

export default async function EngineeringPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <div className={styles.page}>
      <h1 className={styles.visuallyHidden}>Engineering interaction</h1>
      <EngineeringWorkspace key={projectId} projectId={projectId} />
    </div>
  );
}
