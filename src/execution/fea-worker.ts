import {FEAStaticStructuralRequest,FEAStaticStructuralResult} from "../fea/types.js";
import {validateStaticStructuralRequest} from "../fea/validation.js";

export interface FEAWorkerTransport{
  run(request:FEAStaticStructuralRequest):Promise<FEAStaticStructuralResult>;
}

export interface FEAWorkerExecutionResult{
  success:boolean;
  result?:FEAStaticStructuralResult;
  error?:string;
}

export class CalculixWorkerExecutor{
  constructor(private readonly transport:FEAWorkerTransport){}

  async execute(request:FEAStaticStructuralRequest):Promise<FEAWorkerExecutionResult>{
    const errors=validateStaticStructuralRequest(request);
    if(errors.length) return {success:false,error:errors.join(" ")};
    try{
      return {success:true,result:await this.transport.run(request)};
    }catch(error){
      return {success:false,error:error instanceof Error?error.message:"CalculiX worker transport failed"};
    }
  }
}
