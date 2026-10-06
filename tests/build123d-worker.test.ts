import {describe,it,expect} from 'vitest';
import {Build123dWorkerExecutor} from '../src/execution/build123d-worker.js';

describe('build123d worker boundary',()=>{
 it('accepts only the build123d backend',async()=>{
  const executor=new Build123dWorkerExecutor({async run(request){return {success:true,backend:request.backend,warnings:[]};}});
  const result=await executor.execute({id:'x',backend:'build123d',source:'# generated',filename:'part.py',timeoutMs:1000});
  expect(result.success).toBe(true);
 });
 it('rejects unsupported backend before transport',async()=>{
  let called=false;
  const executor=new Build123dWorkerExecutor({async run(){called=true;return {success:true,backend:'build123d',warnings:[]};}});
  const result=await executor.execute({id:'x',backend:'cadquery',source:'# generated',filename:'part.py',timeoutMs:1000});
  expect(result.success).toBe(false); expect(called).toBe(false);
 });
});