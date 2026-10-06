import {EngineeringConstraint} from "./types.js";

export type ConstraintSolveStatus="SOLVED"|"INFEASIBLE"|"INCOMPLETE";
export interface ConstraintSolveVariable{name:string;unit:string;lower:number;upper:number;initialValue?:number;}
export interface ConstraintSolveRequest{constraints:EngineeringConstraint[];variables:ConstraintSolveVariable[];knownValues?:Record<string,number>;}
export interface ConstraintSolveResult{status:ConstraintSolveStatus;solution?:Record<string,number>;residuals?:Record<string,number>;message:string;method:"GAUSSIAN_ELIMINATION"|"BOUND_PROPAGATION";}
export type DesignSpaceObjective={expression:string;direction:"MINIMIZE"|"MAXIMIZE";};
export interface DesignSpaceVariable extends ConstraintSolveVariable{step:number;}
export interface DesignSpaceRequest{constraints:EngineeringConstraint[];variables:DesignSpaceVariable[];objective?:DesignSpaceObjective;maxSamples?:number;}
export interface DesignSpaceResult{status:"SOLVED"|"NO_FEASIBLE_POINT"|"INCOMPLETE";best?:Record<string,number>;objectiveValue?:number;feasibleSamples:number;samplesEvaluated:number;message:string;}

type Linear={coefficients:Record<string,number>;constant:number};
type Relation="<="|">="|"=";

function finite(n:unknown,name:string){if(typeof n!=="number"||!Number.isFinite(n))throw new Error(name+" must be finite");return n;}
function parseNumber(s:string){return Number(s);}
function parseLinearSide(raw:string,known:Set<string>):Linear{
  const text=raw.replace(/\s+/g,"");if(!text)return {coefficients:{},constant:0};
  const terms=text.match(/[+-]?[^+-]+/g);if(!terms)throw new Error("Invalid linear expression: "+raw);
  const coefficients:Record<string,number>={};let constant=0;
  for(const term of terms){
    if(/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(term)){constant+=parseNumber(term);continue;}
    const m=term.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\*?([A-Za-z_]\w*)$/);
    if(!m||!known.has(m[2]))throw new Error("Unsupported linear term: "+term);
    const a=m[1]===""||m[1]==="+"?1:m[1]==="-"?-1:parseNumber(m[1]);
    coefficients[m[2]]=(coefficients[m[2]]??0)+a;
  }
  return {coefficients,constant};
}
function parseRelation(expression:string,known:Set<string>){
  const compact=expression.replace(/\s+/g,"");const m=compact.match(/(<=|>=|=)/);
  if(!m||m.index===undefined)throw new Error("Constraint expression must contain =, <= or >=.");
  const rest=compact.slice(m.index+m[0].length);if(rest.match(/(?:<=|>=|=)/))throw new Error("Multiple constraint relations are not supported.");
  const left=parseLinearSide(compact.slice(0,m.index),known);const right=parseLinearSide(rest,known);const coefficients:Record<string,number>={...left.coefficients};
  for(const key of Object.keys(right.coefficients))coefficients[key]=(coefficients[key]??0)-right.coefficients[key];
  return {coefficients,constant:left.constant-right.constant,relation:m[0] as Relation};
}
function residual(linear:Linear,values:Record<string,number>){return Object.entries(linear.coefficients).reduce((s,[k,c])=>s+c*values[k],linear.constant);}
function checkRelation(r:number,relation:Relation){const eps=1e-9*Math.max(1,Math.abs(r));return relation==="="?Math.abs(r)<=eps:relation==="<="?r<=eps:r>=-eps;}
function gaussianSolve(matrix:number[][],rhs:number[],n:number){
  const a=matrix.map((row,i)=>[...row,rhs[i]]);let row=0;
  for(let col=0;col<n&&row<a.length;col++){
    let pivot=row;for(let r=row+1;r<a.length;r++)if(Math.abs(a[r][col])>Math.abs(a[pivot][col]))pivot=r;
    if(Math.abs(a[pivot][col])<1e-12)continue;[a[row],a[pivot]]=[a[pivot],a[row]];
    for(let r=row+1;r<a.length;r++){const f=a[r][col]/a[row][col];if(Math.abs(f)<1e-15)continue;for(let c=col;c<=n;c++)a[r][c]-=f*a[row][c];}
    row++;
  }
  for(let r=row;r<a.length;r++)if(a[r].slice(0,n).every(v=>Math.abs(v)<1e-12)&&Math.abs(a[r][n])>1e-9)return undefined;
  if(row<n)return undefined;
  const x=new Array<number>(n).fill(0);
  for(let r=row-1;r>=0;r--){
    let pivot=-1;for(let c=0;c<n;c++)if(Math.abs(a[r][c])>1e-12){pivot=c;break;}
    if(pivot<0)continue;let v=a[r][n];for(let c=pivot+1;c<n;c++)v-=a[r][c]*x[c];x[pivot]=v/a[r][pivot];
  }
  return x;
}
function validateConstraintUnits(constraints:EngineeringConstraint[],variables:ConstraintSolveVariable[],names:Set<string>){
  const unitByName=new Map(variables.map(v=>[v.name,v.unit]));
  for(const c of constraints)for(const name of c.variables){
    if(!names.has(name))return "Constraint references an unknown variable: "+name;
    if(!c.units?.[name])return "Constraint requires an explicit unit for "+name+".";
    if(c.units[name]!==unitByName.get(name))return "Constraint unit does not match variable unit for "+name+".";
  }
  return undefined;
}
export function solveEngineeringConstraints(request:ConstraintSolveRequest):ConstraintSolveResult{
  if(!Array.isArray(request.constraints)||!Array.isArray(request.variables)||request.variables.length===0)return {status:"INCOMPLETE",message:"Constraints and variables are required.",method:"GAUSSIAN_ELIMINATION"};
  const variables=[...request.variables];const names=new Set(variables.map(v=>v.name));if(names.size!==variables.length)return {status:"INCOMPLETE",message:"Variable names must be unique.",method:"GAUSSIAN_ELIMINATION"};
  const values:Record<string,number>={...(request.knownValues??{})};const findVariable=(name:string)=>variables.find(v=>v.name===name);
  for(const v of variables){
    try{finite(v.lower,v.name+".lower");finite(v.upper,v.name+".upper");if(v.lower>v.upper)throw new Error(v.name+" has invalid bounds.");if(v.initialValue!==undefined)finite(v.initialValue,v.name+".initialValue");}
    catch(e){return {status:"INCOMPLETE",message:String(e),method:"GAUSSIAN_ELIMINATION"}}
    if(!v.unit)return {status:"INCOMPLETE",message:"Each solve variable requires an explicit unit.",method:"GAUSSIAN_ELIMINATION"};
    if(values[v.name]!==undefined&&!Number.isFinite(values[v.name]))return {status:"INCOMPLETE",message:"Known values must be finite.",method:"GAUSSIAN_ELIMINATION"};
  }
  const unitError=validateConstraintUnits(request.constraints,variables,names);if(unitError)return {status:"INCOMPLETE",message:unitError,method:"GAUSSIAN_ELIMINATION"};
  const equalities:{c:Record<string,number>;constant:number}[]=[];const inequalities:{coefficients:Record<string,number>;constant:number;relation:Relation}[]=[];
  for(const c of request.constraints){
    try{
      if(c.kind==="BOUND"){
        if(c.variables.length!==1)return {status:"INCOMPLETE",message:"BOUND constraints must reference exactly one variable.",method:"BOUND_PROPAGATION"};
        if(c.lower!==undefined)finite(c.lower,c.id+".lower");if(c.upper!==undefined)finite(c.upper,c.id+".upper");
        if(c.lower===undefined&&c.upper===undefined)return {status:"INCOMPLETE",message:"BOUND constraints require lower and/or upper.",method:"BOUND_PROPAGATION"};
        if(c.lower!==undefined&&c.upper!==undefined&&c.lower>c.upper)return {status:"INCOMPLETE",message:"Constraint has invalid bounds.",method:"BOUND_PROPAGATION"};
        const name=c.variables[0];const known=values[name];if(known!==undefined&&((c.lower!==undefined&&known<c.lower)||(c.upper!==undefined&&known>c.upper)))return {status:"INFEASIBLE",message:"Known value violates a bound.",method:"BOUND_PROPAGATION"};
        continue;
      }
      const rel=parseRelation(c.expression,names);if(c.kind==="EQUALITY"||rel.relation==="=")equalities.push({c:rel.coefficients,constant:rel.constant});else inequalities.push({coefficients:rel.coefficients,constant:rel.constant,relation:rel.relation});
    }catch(e){return {status:"INCOMPLETE",message:String(e),method:"GAUSSIAN_ELIMINATION"}}
  }
  const unknown=variables.filter(v=>values[v.name]===undefined);
  if(unknown.length===0){
    for(const v of variables)if(values[v.name]<v.lower-1e-9||values[v.name]>v.upper+1e-9)return {status:"INFEASIBLE",message:"Known value violates variable bounds.",method:"BOUND_PROPAGATION"};
    for(const c of equalities)if(!checkRelation(residual({coefficients:c.c,constant:c.constant},values),"="))return {status:"INFEASIBLE",message:"Known values do not satisfy equality constraints.",method:"BOUND_PROPAGATION"};
    for(const c of inequalities)if(!checkRelation(residual({coefficients:c.coefficients,constant:c.constant},values),c.relation))return {status:"INFEASIBLE",message:"Known values do not satisfy inequality constraints.",method:"BOUND_PROPAGATION"};
    return {status:"SOLVED",solution:values,residuals:{},message:"All constraints satisfied by supplied values.",method:"BOUND_PROPAGATION"};
  }
  if(equalities.length!==unknown.length)return {status:"INCOMPLETE",message:"The deterministic solver requires one independent linear equality per unknown variable; use design-space exploration for bounded inequality systems.",method:"GAUSSIAN_ELIMINATION"};
  const index=new Map(unknown.map((v,i)=>[v.name,i]));const matrix:number[][]=[];const rhs:number[]=[];
  for(const eq of equalities){const row=unknown.map(v=>eq.c[v.name]??0);const knownContribution=Object.entries(eq.c).filter(([k])=>!index.has(k)).reduce((s,[k,c])=>s+c*(values[k]??0),0);matrix.push(row);rhs.push(-(eq.constant+knownContribution));}
  const solved=gaussianSolve(matrix,rhs,unknown.length);if(!solved)return {status:"INFEASIBLE",message:"Equality constraint system is singular or inconsistent.",method:"GAUSSIAN_ELIMINATION"};
  for(let i=0;i<unknown.length;i++)values[unknown[i].name]=solved[i];
  for(const v of variables)if(values[v.name]<v.lower-1e-9||values[v.name]>v.upper+1e-9)return {status:"INFEASIBLE",message:"Solved value violates variable bounds.",method:"GAUSSIAN_ELIMINATION"};
  for(const eq of equalities)if(!checkRelation(residual({coefficients:eq.c,constant:eq.constant},values),"="))return {status:"INFEASIBLE",message:"Solved values do not satisfy equality constraints.",method:"GAUSSIAN_ELIMINATION"};
  for(const c of inequalities)if(!checkRelation(residual({coefficients:c.coefficients,constant:c.constant},values),c.relation))return {status:"INFEASIBLE",message:"Solved values violate inequality constraints.",method:"GAUSSIAN_ELIMINATION"};
  const residuals:Record<string,number>={};for(const c of request.constraints){if(c.kind==="BOUND"){residuals[c.id]=0;continue}try{const r=parseRelation(c.expression,names);residuals[c.id]=residual({coefficients:r.coefficients,constant:r.constant},values)}catch{}}
  return {status:"SOLVED",solution:values,residuals,message:"Constraint system solved and all explicit bounds/inequalities satisfied.",method:"GAUSSIAN_ELIMINATION"};
}

export function exploreEngineeringDesignSpace(request:DesignSpaceRequest):DesignSpaceResult{
  if(!Array.isArray(request.variables)||request.variables.length===0)return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:"At least one bounded design-space variable is required."};
  const names=new Set(request.variables.map(v=>v.name));const maxSamples=request.maxSamples??10000;
  if(names.size!==request.variables.length)return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:"Design-space variable names must be unique."};
  if(maxSamples<=0||!Number.isInteger(maxSamples))return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:"maxSamples must be a positive integer."};
  for(const v of request.variables)if(!Number.isFinite(v.lower)||!Number.isFinite(v.upper)||v.lower>v.upper||!v.unit||!Number.isFinite(v.step)||v.step<=0)return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:"Each design-space variable requires finite bounds, unit and positive step."};
  const unitError=validateConstraintUnits(request.constraints,request.variables,names);if(unitError)return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:unitError};
  if(request.objective)try{parseLinearSide(request.objective.expression,names)}catch(e){return {status:"INCOMPLETE",feasibleSamples:0,samplesEvaluated:0,message:String(e)}}
  let samples=0,feasible=0,best:Record<string,number>|undefined,bestObjective:number|undefined;const assignment:Record<string,number>={};
  function visit(i:number){
    if(samples>=maxSamples)return;
    if(i===request.variables.length){
      samples++;
      for(const c of request.constraints){
        if(c.kind==="BOUND"){if(c.variables.length!==1)return;const v=assignment[c.variables[0]];if((c.lower!==undefined&&v<c.lower-1e-9)||(c.upper!==undefined&&v>c.upper+1e-9))return;}
        else{let rel;try{rel=parseRelation(c.expression,names)}catch{return}if(!checkRelation(residual({coefficients:rel.coefficients,constant:rel.constant},assignment),rel.relation))return;}
      }
      feasible++;
      const score=request.objective?residual(parseLinearSide(request.objective.expression,names),assignment):undefined;
      const better=!best||!request.objective?true:request.objective.direction==="MINIMIZE"?score! < (bestObjective as number):score! > (bestObjective as number);
      if(better){best={...assignment};bestObjective=score;}
      return;
    }
    const v=request.variables[i];const count=Math.floor((v.upper-v.lower)/v.step+1e-9)+1;
    for(let k=0;k<count&&samples<maxSamples;k++){assignment[v.name]=Math.min(v.upper,v.lower+k*v.step);visit(i+1)}
  }
  visit(0);
  if(samples>=maxSamples)return {status:"INCOMPLETE",feasibleSamples:feasible,samplesEvaluated:samples,message:"Design-space sample limit reached before exhaustive exploration."};
  if(!best)return {status:"NO_FEASIBLE_POINT",feasibleSamples:feasible,samplesEvaluated:samples,message:"No feasible point satisfies all explicit constraints."};
  return {status:"SOLVED",best,objectiveValue:bestObjective,feasibleSamples:feasible,samplesEvaluated:samples,message:"Deterministic bounded design-space exploration completed."};
}
