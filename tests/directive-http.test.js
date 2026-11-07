const http = require('http');
const crypto = require('crypto');
const {createDirectiveHttp} = require('../agents/directive-http');
const {createHealthServer} = require('../agents/health-server');
const secret='worker-integration-test-secret-at-least-32-bytes';
let server,url,execute;
beforeEach(async()=>{
 execute=jest.fn(async task=>({success:true,action:task.action}));
 server=createHealthServer(()=>({}),createDirectiveHttp(execute,{secret}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 url=`http://127.0.0.1:${server.address().port}/directives`;
});
afterEach(()=>new Promise(resolve=>server.close(resolve)));
async function call(data,{bad=false}={}){
 const body=JSON.stringify(data);const signature='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-dispatch-sig':bad?'bad':signature},body});
 return {status:r.status,body:await r.json()};
}
const payload=()=>({directive_id:'worker-test-'+crypto.randomUUID(),action:'agent_inventory',issued_at:Math.floor(Date.now()/1000)});
test('signed request invokes only the bounded handler, duplicate is not executed twice',async()=>{
 const p=payload();const first=await call(p);expect(first.status).toBe(200);expect(first.body.status).toBe('completed');
 expect((await call(p)).body).toEqual(first.body);expect(execute).toHaveBeenCalledTimes(1);
 expect((await call({...p,action:'readiness_check'})).status).toBe(409);
});
test('invalid signatures, expired requests and writes are denied',async()=>{
 expect((await call(payload(),{bad:true})).status).toBe(403);
 expect((await call({...payload(),issued_at:0})).status).toBe(403);
 expect((await call({...payload(),action:'send_invoice'})).status).toBe(422);
 expect(execute).not.toHaveBeenCalled();
});
test('oversized and unknown request fields are denied',async()=>{
 expect((await call({...payload(),url:'https://example.com'})).status).toBe(422);
 expect((await call({...payload(),extra:'x'.repeat(5000)})).status).toBe(413);
 expect(execute).not.toHaveBeenCalled();
});
test('execution failure is explicit and cannot be replayed',async()=>{
 execute.mockRejectedValueOnce(new Error('secret error message'));
 const p=payload();const r=await call(p);expect(r.body.status).toBe('failed');expect(JSON.stringify(r.body)).not.toContain('secret error');
 await call(p);expect(execute).toHaveBeenCalledTimes(1);
});
