import Link from "next/link";

const modules = [
  ["Requirements", "Define constraints, priorities, units and verification methods.", "/projects/demo/requirements"],
  ["Analysis", "Run engineering calculations and expose assumptions.", "/projects/demo/analysis"],
  ["CAD", "Generate, validate and manage geometry through provider adapters.", "/projects/demo/cad"],
  ["Validation", "Track evidence, checks, tests and human approval gates.", "/projects/demo/validation"],
];

export default function HomePage() {
  return <main className="shell">
    <header className="hero">
      <div><p className="eyebrow">AI MECHANICAL R&D ENGINEER</p><h1>Engineering Workspace</h1><p className="muted">Problem → Requirements → Analysis → CAD → Simulation → Manufacturing → Test → Validation.</p></div>
      <Link className="button" href="/projects/demo">Open project</Link>
    </header>
    <section className="grid">{modules.map(([title, body, href]) => <Link className="card" href={href} key={title}><span className="tag">MODULE</span><h2>{title}</h2><p>{body}</p><span className="arrow">Open →</span></Link>)}</section>
    <section className="status"><div><span className="dot" /> Core online</div><div>Provider routing: ready</div><div>Evidence model: enabled</div><div>Autonomy: Collaborator</div></section>
  </main>;
}
