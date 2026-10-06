import {CapabilityRegistry} from "./capabilities/registry.js";
import {CapabilityRouter} from "./capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "./capabilities/catalog.js";
import {MockCADProvider} from "./providers/mock-cad.js";
import {NumericalAnalysisProvider} from "./providers/numerical.js";
import {UnitComputationProvider} from "./providers/computation-units.js";
import {PythonComputationProvider} from "./providers/computation-python.js";
import {PythonWorkerClient} from "./execution/python-worker.js";
import {CrossValidationProvider} from "./providers/computation-cross-check.js";
import {EngineeringVerificationProvider} from "./providers/engineering-verification.js";
import {ManufacturingProvider} from "./providers/manufacturing.js";
import {MultibodyDynamicsProvider} from "./providers/dynamics.js";
import {RoboticsProvider} from "./providers/robotics.js";
import {SimulationComparisonProvider} from "./providers/simulation-comparison.js";
import {DigitalThreadProvider} from "./providers/digital-thread.js";
import {OdooPLMProvider} from "./providers/odoo-plm.js";
import {EngineeringOrchestratorProvider} from "./providers/orchestrator.js";
import {GmshProvider} from "./providers/gmsh.js";
import {CalculixProvider} from "./providers/calculix.js";
import {EngineeringAgent} from "./core/agent.js";

export * from "./state/persistence.js";
export * from "./artifacts/persistence.js";
export * from "./fea/index.js";

const registry=new CapabilityRegistry();
registry.registerCatalog(ENGINEERING_CAPABILITIES);
registry.register(new NumericalAnalysisProvider());
registry.register(new UnitComputationProvider());
const pythonWorkerClient:PythonWorkerClient={run:async()=>({success:false,outputs:{},warnings:["Python worker client is not configured for this entrypoint."],artifactIds:[]})};
registry.register(new PythonComputationProvider(pythonWorkerClient));
registry.register(new CrossValidationProvider());
registry.register(new EngineeringVerificationProvider());
registry.register(new ManufacturingProvider());
registry.register(new MockCADProvider());

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

registry.register(new MultibodyDynamicsProvider({
  simulate:async()=>{throw new Error("Multibody dynamics solver is not configured for this entrypoint.");}
}));
registry.register(new RoboticsProvider({
  convertCAD:async()=>{throw new Error("CAD-to-robotics converter is not configured for this entrypoint.");}
}));
registry.register(new SimulationComparisonProvider());
registry.register(new DigitalThreadProvider());
registry.register(new OdooPLMProvider({
  queryItem:async()=>undefined,
  createRevision:async()=>{throw new Error("Odoo PLM client is not configured for this entrypoint.");}
}));

const router=new CapabilityRouter(registry);
registry.register(new EngineeringOrchestratorProvider(router));

const agent=new EngineeringAgent(router);
const result=agent.start("Design a shaft that transmits 5 kW at 1500 rpm.");
console.log(JSON.stringify(result,null,2));
