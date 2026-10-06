import {CADExecutionRequest,CADExecutionResult,CADWorkerExecutor} from '../cad/execution.js';

export interface CADWorkerTransport {
  run(request:CADExecutionRequest):Promise<CADExecutionResult>;
}

export class Build123dWorkerExecutor implements CADWorkerExecutor {
  constructor(private readonly transport:CADWorkerTransport){}
  execute(request:CADExecutionRequest):Promise<CADExecutionResult>{
    if(request.backend!=='build123d')
      return Promise.resolve({success:false,backend:request.backend,warnings:[],error:'Build123d executor received an unsupported backend.'});
    return this.transport.run(request);
  }
}