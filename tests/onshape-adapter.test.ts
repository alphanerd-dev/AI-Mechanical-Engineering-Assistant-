import {describe,it,expect} from "vitest";
import {OnshapeMcpProvider} from "../src/providers/onshape-adapter.js";

describe("Onshape MCP provider adapters",()=>{
  it("maps gpambrozio drawing creation to its provider tool",async()=>{
    const calls:string[]=[];
    const provider=new OnshapeMcpProvider("gpambrozio",{async call(toolName){calls.push(toolName);return {ok:true};}});
    const result=await provider.execute({capability:"CAD.CREATE_DRAWING",input:{documentId:"demo"},risk:"MEDIUM"});
    expect(result.success).toBe(true);
    expect(calls).toEqual(["onshape_create_drawing"]);
  });

  it("maps Casys drawing export to its provider tool",async()=>{
    const calls:string[]=[];
    const provider=new OnshapeMcpProvider("casys",{async call(toolName){calls.push(toolName);return {ok:true};}});
    await provider.execute({capability:"CAD.EXPORT_DRAWING",input:{documentId:"demo"},risk:"MEDIUM"});
    expect(calls).toEqual(["onshape_drawing_export"]);
  });
});