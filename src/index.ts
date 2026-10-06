import {CapabilityRegistry} from "./capabilities/registry.js";
import {CapabilityRouter} from "./capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "./capabilities/catalog.js";
import {MockCADProvider} from "./providers/mock-cad.js";
import {NumericalAnalysisProvider} from "./providers/numerical.js";
import {UnitComputationProvider} from "./providers/computation-units.js";
import {PythonComputationProvider} from "./providers/computation-python.js";
import {PythonWorkerClient} from "./execution/python-worker.js";
import {CrossValidationProvider} from "./providers/computation-cross-check.js";
import {EngineeringAgent} from "./core/agent.js";

const registry=new CapabilityRegistry();
registry.registerCatalog(ENGINEERING_CAPABILITIES);
registry.register(new NumericalAnalysisProvider());
registry.register(new UnitComputationProvider());
const pythonWorkerClient:PythonWorkerClient={run:async()=>({success:false,outputs:{},warnings:["Python worker client is not configured for this entrypoint."],artifactIds:[]})};
registry.register(new PythonComputationProvider(pythonWorkerClient));
registry.register(new CrossValidationProvider());
registry.register(new MockCADProvider());

const router=new CapabilityRouter(registry);
const agent=new EngineeringAgent(router);
const result=agent.start("Design a shaft that transmits 5 kW at 1500 rpm.");
console.log(JSON.stringify(result,null,2));
