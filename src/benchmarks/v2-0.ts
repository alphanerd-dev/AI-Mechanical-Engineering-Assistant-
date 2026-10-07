import {createProject} from "../state/project.js";
import {getReadyTasks} from "../task-graph/ready.js";
import {EngineeringTask,EngineeringTaskGraph} from "../task-graph/types.js";
import {CapabilityRegistry} from "../capabilities/registry.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {NumericalAnalysisProvider} from "../providers/numerical.js";
import {TaskGraphExecutionProvider} from "../providers/task-execution.js";
import {SpecialistDelegationProvider} from "../providers/specialist-delegation.js";
import {BoundedAutonomyProvider} from "../providers/bounded-autonomy.js";
import {V2_0_1_CAPABILITIES} from "../capabilities/v2-0-1.js";
import {V2_0_2_CAPABILITIES} from "../capabilities/v2-0-2.js";
import {V2_0_4_CAPABILITIES} from "../capabilities/v2-0-4.js";
import {V2_0_5_CAPABILITIES} from "../capabilities/v2-0-5.js";
import {authorize} from "../auth/policy.js";
import {InMemoryAuditTrail,verifyAuditEvent} from "../audit/index.js";
import {createEngineeringMemorySnapshot} from "../memory/persistence.js";
import {BenchmarkCaseDefinition} from "./types.js";
import {runBenchmarkSuite} from "./runner.js";
import {produceEvidenceByProduct} from "../evidence/by-product.js";

const stamp="2026-10-07T00:00:00.000Z";

function project(){
  const value=createProject("V2.0 benchmark project");
  value.id="P-BENCH";
  return value;
}

function task(id:string="T-1",status:EngineeringTask["status"]="READY",overrides:Partial<EngineeringTask>={}):EngineeringTask{
  return {
    id,
    projectId:"P-BENCH",
    name:id,
    goal:"Benchmark engineering task",
    capability:"ANALYSIS.SHAFT_TORQUE",
    risk:"LOW",
    input:{powerKw:5,speedRpm:1500},
    status,
    createdAt:stamp,
    updatedAt:stamp,
    ...overrides
  };
}

function graph(tasks:EngineeringTask[]=[task()]):EngineeringTaskGraph{
  return {id:"TG-BENCH",projectId:"P-BENCH",revision:3,tasks};
}

function setupBoundedRouter():CapabilityRouter{
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_1_CAPABILITIES);
  registry.registerCatalog(V2_0_2_CAPABILITIES);
  registry.registerCatalog(V2_0_4_CAPABILITIES);
  registry.registerCatalog(V2_0_5_CAPABILITIES);
  registry.registerCatalog([
    {
      id:"ANALYSIS.SHAFT_TORQUE",
      domain:"analysis",
      purpose:"torque",
      inputs:["powerKw","speedRpm"],
      outputs:["torqueNm"],
      risk:"LOW",
      providers:["numerical-analysis"],
      status:"PILOT"
    },
    {
      id:"ANALYSIS.CRITICAL_BENCHMARK",
      domain:"analysis",
      purpose:"critical benchmark capability",
      inputs:[],
      outputs:[],
      risk:"CRITICAL",
      providers:["numerical-analysis"],
      status:"PILOT"
    }
  ]);
  registry.register(new NumericalAnalysisProvider());
  const router=new CapabilityRouter(registry);
  registry.register(new TaskGraphExecutionProvider(router));
  registry.register(new SpecialistDelegationProvider(registry));
  registry.register(new BoundedAutonomyProvider(router));
  return router;
}

export const V2_0_BENCHMARK_CASES:readonly BenchmarkCaseDefinition[]=[
  {
    id:"v2-0-readiness-gate",
    name:"Task readiness requires dependencies and satisfied requirements",
    async run(){
      const state=project();
      state.requirements.push({id:"R-1",name:"Torque requirement",priority:"MUST",status:"SATISFIED"});
      const evaluations=getReadyTasks(
        graph([
          task("T-0","COMPLETED"),
          task("T-1","PROPOSED",{dependsOn:["T-0"],requiredRequirementIds:["R-1"]})
        ]),
        state
      );
      const evaluation=evaluations.find(item=>item.taskId==="T-1");
      if(!evaluation?.ready) throw new Error("Ready gate did not admit a task with complete prerequisites.");
      return {
        metrics:{readyTasks:1,dependencyCount:1},
        evidence:["Dependencies, requirement status and capability declaration were all satisfied."]
      };
    }
  },
  {
    id:"v2-0-bounded-execution",
    name:"Bounded autonomy executes only through the task-graph boundary",
    async run(){
      const router=setupBoundedRouter();
      const result=await router.execute({
        capability:"AGENT.RUN_BOUNDED",
        risk:"HIGH",
        input:{
          runId:"RUN-BENCH-1",
          taskGraph:graph(),
          actions:[{kind:"EXECUTE_TASK",taskId:"T-1",stage:"ANALYSIS",expectedGraphRevision:3}],
          limits:{maxSteps:5,maxTaskExecutions:5,maxDelegations:5,maxRisk:"HIGH",stopOnFailure:true},
          project:project()
        }
      });
      if(!result.success) throw new Error(result.error??"Bounded execution failed.");
      const report=result.output as {status:string;finalGraph:EngineeringTaskGraph;taskExecutions:number;evidenceIds:string[]};
      if(report.status!=="COMPLETED"||report.finalGraph.tasks[0].status!=="COMPLETED"||report.taskExecutions!==1)
        throw new Error("Bounded execution did not complete exactly one task through the task graph.");
      return {
        metrics:{taskExecutions:report.taskExecutions,finalRevision:report.finalGraph.revision},
        evidence:["Agent action was accepted only after task-graph validation and deterministic capability execution."]
      };
    }
  },
  {
    id:"v2-0-hard-risk-ceiling",
    name:"CRITICAL engineering work is rejected before execution",
    async run(){
      const router=setupBoundedRouter();
      const result=await router.execute({
        capability:"AGENT.RUN_BOUNDED",
        risk:"HIGH",
        input:{
          runId:"RUN-BENCH-2",
          taskGraph:graph([task("T-1","READY",{risk:"CRITICAL"})]),
          actions:[{kind:"EXECUTE_TASK",taskId:"T-1",stage:"ANALYSIS"}],
          limits:{maxSteps:5,maxTaskExecutions:5,maxDelegations:5,maxRisk:"HIGH",stopOnFailure:true},
          project:project()
        }
      });
      if(result.success||!result.error?.includes("risk exceeds the bounded agent policy"))
        throw new Error("CRITICAL work was not rejected by the bounded-autonomy ceiling.");
      return {
        metrics:{maximumAutonomousRisk:"HIGH",criticalExecutionCount:0},
        evidence:["The hard HIGH ceiling blocked CRITICAL task execution before the deterministic provider was reached."]
      };
    }
  },
  {
    id:"v2-0-specialist-scope",
    name:"Specialist delegation enforces explicit domain scope",
    async run(){
      const registry=new CapabilityRegistry();
      registry.registerCatalog(V2_0_1_CAPABILITIES);
      registry.registerCatalog(V2_0_4_CAPABILITIES);
      registry.registerCatalog([{
        id:"ANALYSIS.SHAFT_TORQUE",
        domain:"analysis",
        purpose:"torque",
        inputs:["powerKw","speedRpm"],
        outputs:["torqueNm"],
        risk:"LOW",
        providers:["analysis-provider"],
        status:"PILOT"
      }]);
      registry.register({id:"analysis-provider",capabilities:["ANALYSIS.SHAFT_TORQUE"],execute:async()=>({
        capability:"ANALYSIS.SHAFT_TORQUE",provider:"analysis-provider",success:true,output:{torqueNm:31.83}
      })});
      const router=new CapabilityRouter(registry);
      registry.register(new SpecialistDelegationProvider(registry));
      const result=await router.execute({
        capability:"AGENT.DELEGATE_SPECIALIST",
        risk:"HIGH",
        input:{taskGraph:graph(),taskId:"T-1",specialistId:"analysis",stage:"ANALYSIS"}
      });
      if(!result.success) throw new Error(result.error??"Specialist delegation failed.");
      const output=result.output as {delegation:{status:string;specialistId:string;taskId:string}};
      if(output.delegation.status!=="DELEGATED") throw new Error("Specialist task was not delegated.");
      return {
        metrics:{delegations:1,taskExecutions:0},
        evidence:["Named specialist was authorized by task capability domain without executing the task."]
      };
    }
  },
  {
    id:"v2-0-memory-fail-closed",
    name:"Project memory rejects unverified evidence",
    async run(){
      const state=project();
      const evidence={
        id:"E-UNVERIFIED",
        type:"CALCULATION" as const,
        claim:"Unverified benchmark claim",
        status:"ASSUMED" as const,
        timestamp:stamp
      };
      let rejected=false;
      try{
        createEngineeringMemorySnapshot(state,1,{[evidence.id]:evidence});
      }catch(error){
        rejected=error instanceof Error&&error.message.includes("only accepts VERIFIED evidence");
      }
      if(!rejected) throw new Error("Project memory accepted non-VERIFIED evidence.");
      return {
        metrics:{unverifiedEvidenceAccepted:0},
        evidence:["Engineering memory remains fail-closed at the VERIFIED evidence boundary."]
      };
    }
  },
  {
    id:"v2-0-evidence-by-product",
    name:"Validated execution automatically produces verified evidence",
    async run(){
      const state=project();
      const artifact={
        id:"ART-BENCH-EVIDENCE",
        kind:"CALCULATION_RESULT" as const,
        name:"Benchmark calculation result",
        backend:"benchmark",
        validationStatus:"PASS" as const,
        informationStatus:"CALCULATED" as const,
        evidenceIds:[],
        requirementIds:[],
        createdAt:stamp
      };
      const produced=produceEvidenceByProduct({
        project:state,
        artifacts:[artifact],
        validation:"PASS",
        drafts:[{
          id:"E-BENCH-EVIDENCE",
          type:"CALCULATION",
          claim:"Validated benchmark calculation.",
          method:"deterministic test method",
          value:{passed:true},
          artifactIds:[artifact.id]
        }],
        timestamp:stamp
      });
      if(!produced.emitted||produced.evidence.length!==1||produced.evidence[0].status!=="VERIFIED")
        throw new Error("Validated execution did not emit verified evidence.");
      if(!produced.artifacts[0].evidenceIds.includes(produced.evidence[0].id))
        throw new Error("Produced evidence was not linked back to its artifact.");

      const blocked=produceEvidenceByProduct({
        project:state,
        artifacts:[artifact],
        validation:"FAIL",
        drafts:[{
          id:"E-BENCH-BLOCKED",
          type:"CALCULATION",
          claim:"Blocked benchmark claim.",
          artifactIds:[artifact.id]
        }],
        timestamp:stamp
      });
      if(blocked.emitted||blocked.evidence.length!==0)
        throw new Error("Failed validation emitted evidence.");
      return {
        metrics:{verifiedEvidenceProduced:1,failedValidationEvidenceProduced:0},
        evidence:["Evidence was emitted as a validation-gated execution by-product and was blocked when validation failed."]
      };
    }
  },
  {
    id:"v2-0-authorization-deny",
    name:"Authorization denies unauthorized execution and out-of-scope projects",
    async run(){
      const agentDecision=authorize({
        identity:{subject:"agent-bench",roles:["AGENT"],authenticatedAt:stamp},
        permission:"TASK.EXECUTE",
        projectId:"P-BENCH"
      });
      const scopedDecision=authorize({
        identity:{subject:"engineer-bench",roles:["ENGINEER"],projectIds:["P-ALLOWED"],authenticatedAt:stamp},
        permission:"TASK.EXECUTE",
        projectId:"P-BENCH"
      });
      if(agentDecision.allowed||scopedDecision.allowed) throw new Error("Authorization boundary allowed an invalid execution request.");
      return {
        metrics:{unauthorizedExecutionGrants:0,projectScopeBypasses:0},
        evidence:["Deny-by-default role mapping and explicit project scope both held."]
      };
    }
  },
  {
    id:"v2-0-audit-integrity",
    name:"Audit history remains tamper-evident and verifiable",
    async run(){
      const trail=new InMemoryAuditTrail();
      const first=trail.append({timestamp:stamp,actor:{subject:"engineer-bench",actorType:"USER",roles:["ENGINEER"]},action:"TASK_EXECUTE",outcome:"SUCCESS",projectId:"P-BENCH"});
      trail.append({timestamp:"2026-10-07T00:00:01.000Z",actor:{subject:"agent-bench",actorType:"AGENT",roles:["AGENT"]},action:"AUTHORIZATION",outcome:"DENIED",projectId:"P-BENCH"});
      const captured={...first,reason:"tampered"};
      let tamperDetected=false;
      try{verifyAuditEvent(captured);}catch(error){
        tamperDetected=error instanceof Error&&error.message.includes("hash");
      }
      if(!tamperDetected) throw new Error("Audit event tampering was not detected.");
      trail.verify();
      return {
        metrics:{auditEvents:2,tamperDetections:1},
        evidence:["SHA-256 event verification detected mutation while the canonical chain remained valid."]
      };
    }
  }
];

export async function runV2BenchmarkSuite(){
  return runBenchmarkSuite("engineering-core-v2.0","2.0",V2_0_BENCHMARK_CASES);
}
