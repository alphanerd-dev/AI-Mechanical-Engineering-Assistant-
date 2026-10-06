import {ExecutionRequest,ExecutionResult} from "./types.js";

export type QueueMessageStatus="QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED";

export interface ExecutionQueueMessage {
  id:string;
  request:ExecutionRequest;
  attempts:number;
  enqueuedAt:string;
}

export interface ExecutionQueue {
  enqueue(message:ExecutionQueueMessage):Promise<void>;
  dequeue():Promise<ExecutionQueueMessage|undefined>;
  acknowledge(id:string,result:ExecutionResult):Promise<void>;
  fail(id:string,error:string):Promise<void>;
}

/** In-memory contract implementation for tests; production should use a durable queue. */
export class InMemoryExecutionQueue implements ExecutionQueue {
  private readonly messages:ExecutionQueueMessage[]=[];
  private readonly completed=new Map<string,ExecutionResult>();
  private readonly failed=new Map<string,string>();

  async enqueue(message:ExecutionQueueMessage){this.messages.push(structuredClone(message));}
  async dequeue(){return this.messages.shift();}
  async acknowledge(id:string,result:ExecutionResult){this.completed.set(id,structuredClone(result));}
  async fail(id:string,error:string){this.failed.set(id,error);}
  getCompleted(id:string){return this.completed.get(id);}
  getFailed(id:string){return this.failed.get(id);}
}
