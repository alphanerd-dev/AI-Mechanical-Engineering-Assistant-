import {describe,expect,it} from "vitest";
import {ConsensusResearchProvider} from "../src/research/consensus-provider.js";
import {ControlledWebResearchProvider} from "../src/research/web-provider.js";

describe("research providers",()=>{
  it("normalizes academic results without coupling the core to an API",async()=>{
    const provider=new ConsensusResearchProvider({search:async()=>[{id:"p1",title:"Shaft fatigue",url:"https://example.org/p1",text:"Fatigue and stress concentration matter.",year:2023}],fetch:async()=>({title:"Shaft fatigue",url:"https://example.org/p1"})});
    const result=await provider.search({id:"r1",question:"shaft fatigue",maxSources:1});
    expect(result.sources[0].sourceClass).toBe("PEER_REVIEWED");
    expect(result.findings[0].sourceIds).toContain("consensus:p1");
  });

  it("keeps web evidence at candidate status",async()=>{
    const provider=new ControlledWebResearchProvider({search:async()=>[{url:"https://example.org",title:"Engineering source",domain:"example.org"}]});
    const result=await provider.search({id:"r2",question:"shaft material",maxSources:1});
    expect(result.findings[0].informationStatus).toBe("ASSUMED");
  });
});
