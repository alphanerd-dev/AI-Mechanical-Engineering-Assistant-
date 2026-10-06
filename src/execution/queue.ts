import {ExecutionEngine} from "./executor.js";
import {ExecutionJob,ExecutionRequest} from "./types.js";

interface QueueEntry{
  request:ExecutionRequest;
  resolve:(job:ExecutionJob)=>void;
  reject:(error:unknown)=>void;
}

export interface ExecutionQueueOptions{
  concurrency?:number;
}

export class ExecutionQueue{
  private readonly concurrency:number;
  private active=0;
  private readonly pending:QueueEntry[]=[];
  private readonly activeIds=new Set<string>();

  constructor(private readonly engine:ExecutionEngine,options:ExecutionQueueOptions={}){
    const concurrency=options.concurrency??2;
    if(!Number.isInteger(concurrency)||concurrency<1){
      throw new Error("Execution queue concurrency must be a positive integer.");
    }
    this.concurrency=concurrency;
  }

  enqueue(request:ExecutionRequest):Promise<ExecutionJob>{
    if(this.activeIds.has(request.id)||this.pending.some(item=>item.request.id===request.id)){
      return Promise.reject(new Error(`Execution job is already queued or running: ${request.id}.`));
    }

    return new Promise<ExecutionJob>((resolve,reject)=>{
      this.pending.push({request,resolve,reject});
      this.pump();
    });
  }

  get(id:string):ExecutionJob|undefined{
    return this.engine.getJob(id);
  }

  queuedCount():number{
    return this.pending.length;
  }

  activeCount():number{
    return this.active;
  }

  private pump():void{
    while(this.active<this.concurrency&&this.pending.length>0){
      const entry=this.pending.shift()!;
      this.active++;
      this.activeIds.add(entry.request.id);
      void this.process(entry);
    }
  }

  private async process(entry:QueueEntry):Promise<void>{
    try{
      const job=await this.engine.run(entry.request);
      entry.resolve(job);
    }catch(error){
      entry.reject(error);
    }finally{
      this.active--;
      this.activeIds.delete(entry.request.id);
      this.pump();
    }
  }
}


export interface QueuedExecutionJob{
  id:string;
  request:ExecutionRequest;
  attempts:number;
  enqueuedAt:string;
}

export class InMemoryExecutionQueue{
  private readonly pending:QueuedExecutionJob[]=[];
  private readonly completed=new Map<string,ExecutionResult>();

  async enqueue(job:QueuedExecutionJob):Promise<void>{
    if(this.pending.some(item=>item.id===job.id)||this.completed.has(job.id)){
      throw new Error(`Execution job is already queued or completed: ${job.id}.`);
    }
    this.pending.push(structuredClone(job));
  }

  async dequeue():Promise<QueuedExecutionJob|undefined>{
    const job=this.pending.shift();
    return job?structuredClone(job):undefined;
  }

  async acknowledge(id:string,result:ExecutionResult):Promise<void>{
    if(this.completed.has(id)){
      throw new Error(`Execution job has already been acknowledged: ${id}.`);
    }
    this.completed.set(id,structuredClone(result));
  }

  getCompleted(id:string):ExecutionResult|undefined{
    const result=this.completed.get(id);
    return result?structuredClone(result):undefined;
  }
}
