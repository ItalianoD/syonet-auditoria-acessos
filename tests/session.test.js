import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {createSessionFetch} from '../lib/session-fetch.js';
import {request} from '../lib/api.js';
const TYPE='SYONET_AUDIT_SESSION_V1',origin='https://disbrava.syonet.com';
async function fixture({sessionLogin='QA.TESTE'}={}){
 const calls=[],sender={id:'test-extension',url:'chrome-extension://test-extension/app.html'},state={ignore:false};let listener;
 const runtime={id:sender.id,getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:l=>listener=l}};
 vm.runInNewContext(await fs.readFile(new URL('../session-bridge.js',import.meta.url),'utf8'),{URL,URLSearchParams,AbortController,setTimeout,clearTimeout,location:{origin,href:origin+'/portal/acessaSistema.do'},chrome:{runtime},fetch:async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('/api/sessao/usuario')?JSON.stringify({idUsuario:90001,nomeLogin:sessionLogin}):'[{"idUsuario":90001,"nome":"Exemplo","nomeLogin":"EXEMPLO"}]');}});
 const dispatch=(message,from=sender)=>new Promise(resolve=>{const pending=listener(message,from,resolve);if(!pending&&from!==sender)resolve(undefined);});
 const extension={runtime,tabs:{query:async()=>[{id:7,url:origin+'/portal/acessaSistema.do',active:true}],sendMessage:async(id,message,options)=>{assert.equal(id,7);assert.equal(options.frameId,0);return dispatch(message);}}};
 return {calls,sender,dispatch,extension,state};
}
test('cliente usa a aba autenticada, com JSON explícito e cookies da mesma origem',async()=>{
 const f=await fixture(),fetcher=createSessionFetch({extension:f.extension,uuid:()=>crypto.randomUUID()}),r=await request('/api/usuario?idEmpresa=9',{fetcher});assert.equal(r.json[0].idUsuario,90001);assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,origin+'/api/usuario?idEmpresa=9');assert.equal(f.calls[0].options.credentials,'same-origin');assert.equal(f.calls[0].options.headers.accept,'application/json');assert.equal(f.calls[0].options.redirect,'manual');
});
test('ponte recusa mensagens da página e de outras extensões, caminhos externos e ações em GET',async()=>{
 const f=await fixture(),base={type:TYPE,action:'request',requestId:'test',method:'GET',path:'/api/grupo',body:null};
 assert.equal(await f.dispatch(base,{id:'outra',url:'chrome-extension://outra/app.html'}),undefined);assert.equal(await f.dispatch(base,{id:f.sender.id,url:origin+'/portal/app.do'}),undefined);
 for(const path of ['//externo.invalid/api/test','/api/../logout','/portal/usuario.do?acao=ALTERANDO','/portal/usuario.do?modo=APLICAR_PERMISSOES']){const r=await f.dispatch({...base,path});assert.ok(r.error,path);}
 assert.equal(f.calls.length,0);
});
test('ponte restringe gravações aos fluxos existentes e valida a identidade do cadastro',async()=>{
 const f=await fixture(),base={type:TYPE,action:'request',requestId:'test',method:'PATCH',path:'/api/usuario/90002',body:JSON.stringify({idUsuario:90002,ativo:false})};
 const ok=await f.dispatch(base);assert.equal(ok.status,200);assert.equal(f.calls[0].options.method,'PATCH');
 for(const change of [{method:'DELETE'},{path:'/api/usuario'},{body:'{"idUsuario":90001}'},{path:'/api/sessao/empresa',method:'POST',body:'{"idEmpresa":0}'}])assert.ok((await f.dispatch({...base,requestId:crypto.randomUUID(),...change})).error);
 assert.equal(f.calls.length,1);
});
test('sem aba ou sem ponte, instrui F5 sem retornar uma lista vazia',async()=>{
 const f=await fixture();f.extension.tabs.query=async()=>[];await assert.rejects(createSessionFetch({extension:f.extension})(origin+'/api/grupo'),/RECARREGUE/);
 const g=await fixture();g.extension.tabs.sendMessage=async()=>{throw new Error('Receiving end does not exist');};await assert.rejects(createSessionFetch({extension:g.extension})(origin+'/api/grupo'),/F5/);
});
test('perder a aba durante gravação não repete a chamada e avisa resultado incerto',async()=>{
 const f=await fixture();let sent=0;const original=f.extension.tabs.sendMessage;f.extension.tabs.sendMessage=async(id,m,options)=>{if(m.action==='request'){sent++;throw new Error('closed');}return original(id,m,options);};
 await assert.rejects(createSessionFetch({extension:f.extension})(origin+'/api/usuario/90002',{method:'PATCH',body:'{"idUsuario":90002,"ativo":false}'}),/resultado é incerto/);assert.equal(sent,1);
});
test('cancelamento é encaminhado à aba e interrompe a promessa sem repetição',async()=>{
 const f=await fixture(),controller=new AbortController(),messages=[];f.extension.tabs.sendMessage=async(id,m)=>{messages.push(m);if(m.action==='ping')return {version:1,ready:true};if(m.action==='cancel')return {received:true};queueMicrotask(()=>controller.abort());return new Promise(()=>{});};
 await assert.rejects(createSessionFetch({extension:f.extension})(origin+'/api/grupo',{method:'GET',signal:controller.signal}),{name:'AbortError'});assert.equal(messages.filter(m=>m.action==='request').length,1);assert.equal(messages.filter(m=>m.action==='cancel').length,1);
});
test('fora da extensão, prévia e testes mantêm fetch local',async()=>{
 let called=0;const fetcher=createSessionFetch({extension:null,fetcher:async()=>{called++;return new Response('{}');}});assert.equal((await fetcher('http://localhost/api/x')).ok,true);assert.equal(called,1);
});
test('API solicita somente JSON, portal solicita HTML e erro informa rota e status',async()=>{
 let headers;const fetcher=async(url,options)=>{headers=options.headers;return new Response('{}');};
 await request('/api/usuario?idEmpresa=9',{fetcher});assert.equal(headers.Accept,'application/json');
 await request('/portal/ajax.do?tipoObjeto=PESQUISARUSUARIOS&login=teste',{fetcher});assert.equal(headers.Accept,'application/json');assert.equal(headers['X-Requested-With'],'XMLHttpRequest');
 await request('/portal/usuario.do?modo=EDICAO&idUsuario=90001',{fetcher});assert.equal(headers.Accept,'text/html');
 await assert.rejects(request('/api/usuario?idEmpresa=9',{fetcher:async()=>new Response('',{status:404})}),error=>{assert.equal(error.status,404);assert.equal(error.path,'/api/usuario?idEmpresa=9');assert.match(error.message,/idEmpresa=9/);return true;});
});
test('antes de ler ou gravar, a ponte confere a identidade da conta alternativa',async()=>{
 const f=await fixture(),base={type:TYPE,action:'request',requestId:'test',method:'PATCH',path:'/api/usuario/90002',body:'{"idUsuario":90002,"ativo":false}',expectedUser:{id:'90001',login:'QA.TESTE'}};
 const r=await f.dispatch(base);assert.equal(r.status,200);assert.equal(f.calls[0].url,origin+'/api/sessao/usuario');assert.equal(f.calls[1].options.method,'PATCH');
 const wrong=await fixture({sessionLogin:'OUTRA.CONTA'}),blocked=await wrong.dispatch(base);assert.match(blocked.error,/não pertence/);assert.equal(wrong.calls.length,1);assert.equal(wrong.calls[0].options.method,'GET');
});
test('login nativo exige payload criptografado e flag explícita da autenticação',async()=>{
 const f=await fixture(),base={type:TYPE,action:'request',requestId:'test',method:'POST',path:'/portal/validarLogonUsuario.do?opcaoAtualizacao',body:'Y2lwaGVydGV4dA==',authLogin:true};
 assert.equal((await f.dispatch(base)).status,200);
 assert.ok((await f.dispatch({...base,requestId:'plain',body:'{"senha":"teste"}'})).error);
 assert.ok((await f.dispatch({...base,requestId:'flag',authLogin:false})).error);
 assert.equal(f.calls.length,1);
});
test('conta normal ignora abas anônimas, mesmo se estiverem prontas',async()=>{
 const f=await fixture();let used;f.extension.tabs.query=async()=>[{id:8,incognito:true,url:origin+'/portal/acessaSistema.do'},{id:7,incognito:false,url:origin+'/portal/acessaSistema.do'}];const original=f.extension.tabs.sendMessage;f.extension.tabs.sendMessage=async(id,m,options)=>{used=id;return original(id,m,options);};await createSessionFetch({extension:f.extension,storage:null})(origin+'/api/grupo');assert.equal(used,7);
});
