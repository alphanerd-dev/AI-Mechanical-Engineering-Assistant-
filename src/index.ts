import {CapabilityRegistry} from "./capabilities/registry.js";
import {CapabilityRouter} from "./capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "./capabilities/catalog.js";
import {V1_20_CAPABILITIES} from "./capabilities/v1-20.js";
import {V1_21_CAPABILITIES} from "./capabilities/v1-21.js";
import {V1_22_CAPABILITIES} from "./capabilities/v1-22.js";
import {V1_23_CAPABILITIES} from "./capabilities/v1-23.js";
import {V1_24_CAPABILITIES} from "./capabilities/v1-24.js";
import {MockCADProvider} from "./providers/mock-cad.js";
import {NumericalAnalysisProvider} from "./providers/numerical.js";
import {UnitComputationProvider} from "./providers/computation-units.js";
import {PythonComputationProvider} from "./providers/computation-python.js";
import {PythonWorkerClient} from "./execution/python-worker.js";
import {CrossValidationProvider} from "./providers/computation-cross-check.js";
import {EngineeringVerificationProvider} from "./providers/engineering-verification.js";
import {ManufacturingProvider} from "./providers/manufacturing.js";
import {ManufacturingIntelligenceProvider} from "./providers/manufacturing-intelligence.js";
import {CAMBoundaryProvider} from "./providers/cam-boundary.js";
import {MultibodyDynamicsProvider} from "./providers/dynamics.js";
import {ChronoDynamicsProvider} from "./providers/dynamics-chrono.js";
import {PinocchioDynamicsProvider} from "./providers/dynamics-pinocchio.js";
import {DynamicsComparisonProvider} from "./providers/dynamics-comparison.js";
import {RoboticsProvider} from "./providers/robotics.js";
import {RoboticsRuntimeProvider} from "./providers/robotics-runtime.js";
import {SimulationComparisonProvider} from "./providers/simulation-comparison.js";
import {OpenModelicaProvider} from "./providers/openmodelica.js";
import {DigitalThreadProvider} from "./providers/digital-thread.js";
import {ProductModelProvider} from "./providers/product-model.js";
import {OdooPLMProvider} from "./providers/odoo-plm.js";
import {EngineeringOrchestratorProvider} from "./providers/orchestrator.js";
import {GmshProvider} from "./providers/gmsh.js";
import {CalculixProvider} from "./providers/calculix.js";
import {EngineeringAgent} from "./core/agent.js";
import {CADAnalysisProvider} from "./providers/cad-analysis.js";
import {ConstraintEngineeringProvider} from "./providers/constraint-engineering.js";
import {V2_0_1_CAPABILITIES} from "./capabilities/v2-0-1.js";
import {EngineeringWorkspaceProvider} from "./providers/workspace.js";
import {V2_0_2_CAPABILITIES} from "./capabilities/v2-0-2.js";
import {TaskGraphExecutionProvider} from "./providers/task-execution.js";
import {V2_0_4_CAPABILITIES} from "./capabilities/v2-0-4.js";
import {SpecialistDelegationProvider} from "./providers/specialist-delegation.js";
import {V2_0_5_CAPABILITIES} from "./capabilities/v2-0-5.js";
import {BoundedAutonomyProvider} from "./providers/bounded-autonomy.js";
import {V2_0_9_CAPABILITIES} from "./capabilities/v2-0-9.js";
import {V2_0_10_CAPABILITIES} from "./capabilities/v2-0-10.js";
import {V2_0_11_CAPABILITIES} from "./capabilities/v2-0-11.js";
import {V2_0_12_CAPABILITIES} from "./capabilities/v2-0-12.js";
import {EngineeringCompletionProvider} from "./providers/engineering-completion.js";
import {RiskAdaptiveExperienceProvider} from "./providers/experience.js";
import {EngineeringContextProvider} from "./providers/context.js";
import {V2_0_14_CAPABILITIES} from "./capabilities/v2-0-14.js";
import {V2_0_21_CAPABILITIES} from "./capabilities/v2-0-21.js";
import {AIEngineeringIntentProvider} from "./providers/ai-intent.js";
import {ElectricalAnalysisProvider} from "./providers/electrical.js";
import {ElectricalEngineeringCompletionProvider} from "./providers/electrical-completion.js";
import {createDefaultDeterministicEngineeringIntentInterpreter} from "./intent/deterministic.js";

// V1.15 project-state persistence remains available from ./state/persistence.js.
// V2 workspace persistence and V2.0 project-memory persistence are canonical root-level contracts.
export * from "./artifacts/persistence.js";
export * from "./memory/persistence.js";
export * from "./fea/index.js";
export * from "./cad/index.js";
export * from "./constraints/index.js";
export * from "./tolerance/index.js";
export * from "./manufacturing/index.js";
export * from "./product-model/index.js";
export * from "./dynamics/index.js";
export * from "./robotics/index.js";
export * from "./system-simulation/index.js";
export * from "./workspace/index.js";
export * from "./task-graph/index.js";
export * from "./reasoning-frameworks/index.js";
export * from "./agents/specialists.js";
export * from "./agents/runtime.js";
export * from "./agents/langgraph-adapter.js";
export * from "./orchestration/specialist-delegation.js";
export * from "./orchestration/bounded-autonomy.js";
export * from "./auth/index.js";
export * from "./audit/index.js";
export * from "./benchmarks/index.js";
export * from "./collaboration/index.js";
export * from "./completion/index.js";
export * from "./evidence/index.js";
export * from "./experience/index.js";
export * from "./experience/context.js";
export * from "./intent/index.js";

const registry=new CapabilityRegistry();
registry.registerCatalog(ENGINEERING_CAPABILITIES);
registry.registerCatalog(V1_20_CAPABILITIES);
registry.registerCatalog(V1_21_CAPABILITIES);
registry.registerCatalog(V1_22_CAPABILITIES);
registry.registerCatalog(V1_23_CAPABILITIES);
registry.registerCatalog(V1_24_CAPABILITIES);
registry.registerCatalog(V2_0_1_CAPABILITIES);
registry.registerCatalog(V2_0_2_CAPABILITIES);
registry.registerCatalog(V2_0_4_CAPABILITIES);
registry.registerCatalog(V2_0_5_CAPABILITIES);
registry.registerCatalog(V2_0_9_CAPABILITIES);
registry.registerCatalog(V2_0_10_CAPABILITIES);
registry.registerCatalog(V2_0_11_CAPABILITIES);
registry.registerCatalog(V2_0_12_CAPABILITIES);
registry.registerCatalog(V2_0_14_CAPABILITIES);
registry.registerCatalog(V2_0_21_CAPABILITIES);
registry.register(new NumericalAnalysisProvider());
registry.register(new UnitComputationProvider());
const pythonWorkerClient:PythonWorkerClient={run:async()=>({success:false,outputs:{},warnings:["Python worker client is not configured for this entrypoint."],artifactIds:[]})};
registry.register(new PythonComputationProvider(pythonWorkerClient));
registry.register(new CrossValidationProvider());
registry.register(new EngineeringVerificationProvider());
registry.register(new ManufacturingProvider());
registry.register(new ManufacturingIntelligenceProvider());
registry.register(new CAMBoundaryProvider());
registry.register(new MockCADProvider());
registry.register(new CADAnalysisProvider());
registry.register(new ConstraintEngineeringProvider());
registry.register(new EngineeringWorkspaceProvider());
registry.register(new ProductModelProvider());

registry.register(new GmshProvider({
  generateMesh:async()=>({
    success:false,
    provider:"open.gmsh",
    providerVersion:"4.15.2",
    format:"CALCULIX_INP",
    elementType:"C3D4",
    nodeCount:0,
    elementCount:0,
    nodeSets:[],
    warnings:["Gmsh worker transport is not configured for this entrypoint."],
    error:"Gmsh worker transport is not configured for this entrypoint."
  })
}));

registry.register(new CalculixProvider({
  runStaticStructural:async()=>({
    analysis:"STATIC_STRUCTURAL",
    solver:"calculix",
    solverVersion:"2.20",
    converged:false,
    exitCode:-1,
    mesh:{nodeCount:0,elementCount:0,elementType:"C3D4"},
    artifacts:[],
    warnings:["CalculiX worker transport is not configured for this entrypoint."]
  })
}));

registry.register(new ChronoDynamicsProvider({
  simulate:async()=>{throw new Error("Project Chrono runtime is not configured for this entrypoint.");}
}));
registry.register(new PinocchioDynamicsProvider({
  inverseDynamics:async()=>{throw new Error("Pinocchio runtime is not configured for this entrypoint.");}
}));
registry.register(new DynamicsComparisonProvider());
registry.register(new RoboticsRuntimeProvider({
  load:async()=>{throw new Error("Robotics runtime is not configured for this entrypoint.");}
}));
registry.register(new MultibodyDynamicsProvider({
  simulate:async()=>{throw new Error("Multibody dynamics solver is not configured for this entrypoint.");}
}));
registry.register(new RoboticsProvider({
  convertCAD:async()=>{throw new Error("CAD-to-robotics converter is not configured for this entrypoint.");}
}));
registry.register(new SimulationComparisonProvider());
registry.register(new OpenModelicaProvider({
  simulate:async()=>{throw new Error("OpenModelica runtime is not configured for this entrypoint.");},
  coSimulate:async()=>{throw new Error("OpenModelica co-simulation runtime is not configured for this entrypoint.");}
}));
registry.register(new DigitalThreadProvider());
registry.register(new OdooPLMProvider({
  queryItem:async()=>undefined,
  createRevision:async()=>{throw new Error("Odoo PLM client is not configured for this entrypoint.");}
}));

const router=new CapabilityRouter(registry);
registry.register(new TaskGraphExecutionProvider(router));
registry.register(new SpecialistDelegationProvider(registry));
registry.register(new BoundedAutonomyProvider(router));
registry.register(new EngineeringOrchestratorProvider(router));
registry.register(new EngineeringCompletionProvider(router));
registry.register(new RiskAdaptiveExperienceProvider());
registry.register(new EngineeringContextProvider());
registry.register(new ElectricalAnalysisProvider());
registry.register(new ElectricalEngineeringCompletionProvider(router));
registry.register(new AIEngineeringIntentProvider(router,createDefaultDeterministicEngineeringIntentInterpreter()));

const agent=new EngineeringAgent(router);
const result=agent.start("Design a shaft that transmits 5 kW at 1500 rpm.");
console.log(JSON.stringify(result,null,2));
