import {CapabilityRegistry} from "./capabilities/registry.js";
import {CapabilityRouter} from "./capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "./capabilities/catalog.js";
import {MockCADProvider} from "./providers/mock-cad.js";
import {NumericalAnalysisProvider} from "./providers/numerical.js";
import {UnitComputationProvider} from "./providers/computation-units.js";
import {EngineeringAgent} from "./core/agent.js";

const registry=new CapabilityRegistry();
registry.registerCatalog(ENGINEERING_CAPABILITIES);
registry.register(new NumericalAnalysisProvider());
registry.register(new UnitComputationProvider());
registry.register(new MockCADProvider());

const router=new CapabilityRouter(registry);
const agent=new EngineeringAgent(router);
const result=agent.start("Design a shaft that transmits 5 kW at 1500 rpm.");

console.log(JSON.stringify(result,null,2));
