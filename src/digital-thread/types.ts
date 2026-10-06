export type DigitalThreadNodeKind="REQUIREMENT"|"SYSTEM"|"ARTIFACT"|"SIMULATION"|"MANUFACTURING"|"RESEARCH"|"CHANGE";
export type DigitalThreadRelation="DERIVES_FROM"|"IMPLEMENTS"|"SIMULATED_BY"|"MANUFACTURED_AS"|"CONVERTED_TO"|"VALIDATED_BY"|"SUPERSEDES";

export interface DigitalThreadNodeRef{
  kind:DigitalThreadNodeKind;
  id:string;
}

export interface DigitalThreadLink{
  id:string;
  projectId:string;
  from:DigitalThreadNodeRef;
  to:DigitalThreadNodeRef;
  relation:DigitalThreadRelation;
  evidenceIds?:string[];
  createdAt:string;
}

export class DigitalThreadGraph{
  private readonly links=new Map<string,DigitalThreadLink>();

  addLink(link:DigitalThreadLink):DigitalThreadLink{
    if(!link.id.trim()) throw new Error("Digital-thread link id is required.");
    if(!link.projectId.trim()) throw new Error("Digital-thread project id is required.");
    if(!link.from.id.trim()||!link.to.id.trim()) throw new Error("Digital-thread node ids are required.");
    if(link.from.kind===link.to.kind && link.from.id===link.to.id) throw new Error("A digital-thread link cannot point to itself.");
    if(this.links.has(link.id)) throw new Error(`Digital-thread link already exists: ${link.id}.`);
    const stored=structuredClone(link);
    this.links.set(stored.id,stored);
    return structuredClone(stored);
  }

  get(id:string):DigitalThreadLink|undefined{
    const link=this.links.get(id);
    return link?structuredClone(link):undefined;
  }

  all():DigitalThreadLink[]{
    return [...this.links.values()].map(link=>structuredClone(link));
  }

  linksFor(node:DigitalThreadNodeRef):DigitalThreadLink[]{
    return [...this.links.values()]
      .filter(link=>
        (link.from.kind===node.kind && link.from.id===node.id) ||
        (link.to.kind===node.kind && link.to.id===node.id))
      .map(link=>structuredClone(link));
  }
}
