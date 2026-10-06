export type BOMStatus="DRAFT"|"READY";

export interface BOMComponentInput{
  partNumber:string;
  name:string;
  revision:string;
  quantity:number;
  unit:string;
  artifactId?:string;
}

export interface ManufacturingBOMItem{
  partNumber:string;
  name:string;
  revision:string;
  quantity:number;
  unit:string;
  artifactId?:string;
}

export interface ManufacturingBOM{
  id:string;
  projectId:string;
  revision:string;
  items:ManufacturingBOMItem[];
  status:BOMStatus;
}

export interface BOMValidation{
  status:"PASS"|"INCOMPLETE"|"FAIL";
  errors:string[];
  warnings:string[];
}

export interface BOMGenerationResult{
  status:"GENERATED"|"INCOMPLETE";
  bom?:ManufacturingBOM;
  validation:BOMValidation;
  message:string;
}

export function validateManufacturingBOM(bom:ManufacturingBOM):BOMValidation{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!bom.id.trim())errors.push("BOM id is required.");
  if(!bom.projectId.trim())errors.push("BOM projectId is required.");
  if(!bom.revision.trim())errors.push("BOM revision is required.");
  if(bom.items.length===0)errors.push("BOM must contain at least one item.");

  const keys=new Set<string>();
  for(const item of bom.items){
    if(!item.partNumber.trim())errors.push("Each BOM item requires a part number.");
    if(!item.name.trim())errors.push("BOM item "+(item.partNumber||"(unnamed)")+" requires a name.");
    if(!item.revision.trim())errors.push("BOM item "+(item.partNumber||"(unnamed)")+" requires a revision.");
    if(!Number.isFinite(item.quantity)||item.quantity<=0)errors.push("BOM item "+(item.partNumber||"(unnamed)")+" quantity must be positive and finite.");
    if(!item.unit.trim())errors.push("BOM item "+(item.partNumber||"(unnamed)")+" requires a quantity unit.");
    const key=item.partNumber+"::"+item.revision;
    if(keys.has(key))errors.push("Duplicate BOM item key: "+key+".");
    keys.add(key);
    if(!item.artifactId)warnings.push("BOM item "+item.partNumber+" has no linked artifact.");
  }

  return {status:errors.length?"FAIL":"PASS",errors,warnings};
}

export function generateManufacturingBOM(
  id:string,
  projectId:string,
  revision:string,
  components:BOMComponentInput[]
):BOMGenerationResult{
  if(!id.trim()||!projectId.trim()||!revision.trim()||components.length===0){
    return {
      status:"INCOMPLETE",
      validation:{status:"INCOMPLETE",errors:["BOM identity and at least one component are required."],warnings:[]},
      message:"BOM generation is incomplete."
    };
  }

  const aggregated=new Map<string,ManufacturingBOMItem>();
  for(const component of components){
    if(!component.partNumber.trim()||!component.name.trim()||!component.revision.trim()||
      !Number.isFinite(component.quantity)||component.quantity<=0||!component.unit.trim()){
      return {
        status:"INCOMPLETE",
        validation:{status:"INCOMPLETE",errors:["Every BOM component requires valid identity, quantity, and unit data."],warnings:[]},
        message:"BOM generation is incomplete."
      };
    }

    const key=component.partNumber+"::"+component.revision;
    const existing=aggregated.get(key);
    if(existing){
      if(existing.unit!==component.unit){
        return {
          status:"INCOMPLETE",
          validation:{status:"INCOMPLETE",errors:["Duplicate BOM component "+key+" uses incompatible quantity units."],warnings:[]},
          message:"BOM generation is incomplete."
        };
      }
      existing.quantity+=component.quantity;
      if(component.artifactId&&existing.artifactId&&component.artifactId!==existing.artifactId){
        return {
          status:"INCOMPLETE",
          validation:{status:"INCOMPLETE",errors:["Duplicate BOM component "+key+" references conflicting artifacts."],warnings:[]},
          message:"BOM generation is incomplete."
        };
      }
      if(component.artifactId)existing.artifactId=component.artifactId;
    }else{
      aggregated.set(key,{...component});
    }
  }

  const bom:ManufacturingBOM={
    id,
    projectId,
    revision,
    items:[...aggregated.values()].sort((a,b)=>a.partNumber.localeCompare(b.partNumber)||a.revision.localeCompare(b.revision)),
    status:"DRAFT"
  };
  const validation=validateManufacturingBOM(bom);
  if(validation.status!=="PASS")return {status:"INCOMPLETE",bom,validation,message:"Generated BOM did not pass structural validation."};
  bom.status="READY";
  return {status:"GENERATED",bom,validation,message:"BOM generated and structurally validated from explicit component inputs."};
}
