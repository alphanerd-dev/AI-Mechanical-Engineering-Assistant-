import EngineeringChat from "../../../../components/EngineeringChat";
import EngineeringInteraction from "./EngineeringInteraction";
import styles from "./EngineeringPage.module.css";

export default async function EngineeringPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <div className={styles.page}>
      <h1 className={styles.visuallyHidden}>Engineering interaction</h1>
      <EngineeringChat projectId={projectId} />
      {projectId !== "demo" && (
        <details id="engineering-core-panel" className={styles.coreDetails}>
          <summary className={styles.coreSummary}>
            <span className={styles.coreTitle}>Engineering Core</span>
            <span className={styles.coreDescription}>Deterministic tasks · validation · evidence</span>
            <span className={styles.coreToggle} aria-hidden="true">⌄</span>
          </summary>
          <div className={styles.coreContent}>
            <EngineeringInteraction projectId={projectId} />
          </div>
        </details>
      )}
    </div>
  );
}
