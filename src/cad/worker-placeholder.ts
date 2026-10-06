import {CADWorkerExecutor} from './execution.js';
export const CAD_WORKER_PLACEHOLDER:CADWorkerExecutor={
  async execute(request){return {success:false,backend:request.backend,warnings:['No real CAD worker runtime is configured.'],error:'CAD worker runtime is not configured.'};}
};