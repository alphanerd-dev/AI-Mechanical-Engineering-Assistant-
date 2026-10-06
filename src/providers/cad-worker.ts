import {CapabilityRequest,CapabilityResult} from '../core/types.js';
import {CADExecutionBackend,CADWorkerExecutor} from '../cad/execution.js';
import {CAD_WORKER_PLACEHOLDER} from '../cad/worker-placeholder.js';

export class CADWorkerProvider {
  readonly id='cad.worker';
  readonly capabilities=['CAD.EXECUTE_GENERATED_SOURCE','CAD.CREATE_PART'];
  readonly descriptor={id:this.id,domain:'cad' as const,status:'PILOT' as const,capabilities:this.capabilities,requires:['isolated CAD runtime']};
  constructor(private readonly executor:CADWorkerExecutor=CAD_WORKER_PLACEHOLDER){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(!this.capabilities.includes(request.capability)) return {capability:request.capability,provider:this.id,success:false,error:'Unsupported CAD worker capability'};
    const input=request.input;
    const backend=input.backend as CADExecutionBackend|undefined;
    const source=typeof input.source==='string'?input.source:undefined;
    const filename=typeof input.filename==='string'?input.filename:'generated.py';
    const timeoutMs=typeof input.timeoutMs==='number'?input.timeoutMs:30_000;
    if(!backend||!source) return {capability:request.capability,provider:this.id,success:false,error:'CAD worker requires backend and source.'};
    try {
      const execution=await this.executor.execute({id:`cad-job-${Date.now()}`,backend,source,filename,parameters:input.parameters as Record<string,unknown>|undefined,timeoutMs});
      return {capability:request.capability,provider:this.id,success:execution.success,output:{source,backend,filename,execution},error:execution.success?undefined:execution.error};
    } catch(error) { return {capability:request.capability,provider:this.id,success:false,error:String(error)}; }
  }
}