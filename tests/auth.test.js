import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,constants} from 'node:crypto';
import {encryptLogin,authenticateLogin} from '../lib/auth.js';
import {createLoginManager} from '../lib/login-manager.js';
import {createSessionFetch} from '../lib/session-fetch.js';
const origin='https://disbrava.syonet.com';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
test('criptografia usa RSA-OAEP SHA-1 nativo, UTF-8 e aleatoriedade; aceita SPKI e PKCS1',async()=>{
 for(const type of ['spki','pkcs1']){
  const pem=keys.publicKey.export({type,format:'pem'}),a=await encryptLogin(pem,'QA.TESTE','fictícia-123'),b=await encryptLogin(pem,'QA.TESTE','fictícia-123');assert.notEqual(a,b);
  const clear=privateDecrypt({key:keys.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},Buffer.from(a,'base64')).toString('utf8');assert.deepEqual(JSON.parse(clear),{usuario:'QA.TESTE',senha:'fictícia-123',plataforma:'SYONET_WEB'});
 }
});
test('chave inválida e credenciais grandes são recusadas sem enviar autenticação',async()=>{
 await assert.rejects(encryptLogin('sem chave','QA','teste'),/chave pública/);await assert.rejects(encryptLogin(keys.publicKey.export({type:'spki',format:'pem'}),'QA','x'.repeat(1000)),/tamanho/);
});
function authFixture({actual='QA.TESTE',error=false}={}){
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('PUB_PEM'))return new Response(JSON.stringify({valor:keys.publicKey.export({type:'spki',format:'pem'})}));if(url.includes('validarLogonUsuario'))return new Response(error?'{"erro":"credenciais recusadas"}':'{}');if(url.endsWith('/api/sessao/usuario'))return new Response(JSON.stringify({idUsuario:90001,nomeLogin:actual,nome:'Conta',sobrenome:'Fictícia',senha:'não deve sair'}));return new Response('login');};
 return {fetcher,calls};
}
test('outro login sempre é autenticado e só retorna a identidade pedida; senha não vai em texto',async()=>{
 const f=authFixture(),user=await authenticateLogin({username:' qa.teste ',password:'fictícia-123',fetcher:f.fetcher});assert.deepEqual(user,{id:'90001',login:'QA.TESTE',name:'Conta Fictícia'});const post=f.calls.filter(c=>c.options.method==='POST');assert.equal(post.length,1);assert.equal(post[0].url,origin+'/portal/validarLogonUsuario.do?opcaoAtualizacao');assert.ok(!post[0].options.body.includes('fictícia-123'));assert.equal(post[0].options.authLogin,true);
});
test('senha errada e sessão de outro usuário não liberam a conta anterior',async()=>{
 for(const options of [{actual:'CONTA.ANTERIOR'},{error:true}]){const f=authFixture(options);await assert.rejects(authenticateLogin({username:'QA.TESTE',password:'fictícia-123',fetcher:f.fetcher}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);}
 const f=authFixture();await assert.rejects(authenticateLogin({username:'QA.TESTE',password:'',fetcher:f.fetcher}));assert.equal(f.calls.length,0);
});
function managerFixture({allowed=true,existingPrivate=false,failLogin=false,closedAfterLogin=false}={}){
 const calls=[],tabs=new Map([[1,{id:1,incognito:false,url:origin+'/portal/acessaSistema.do'}]]);if(existingPrivate)tabs.set(2,{id:2,incognito:true,url:origin+'/api/sessao/usuario'});
 const extension={runtime:{id:'qa'},extension:{isAllowedIncognitoAccess:async()=>allowed},windows:{create:async options=>{calls.push({type:'create',options});tabs.set(3,{id:3,incognito:true,url:origin+'/portal/app.do?modulo=login'});return {id:30,tabs:[tabs.get(3)]};}},tabs:{query:async()=>[...tabs.values()],get:async id=>{if(!tabs.has(id))throw new Error('closed');return tabs.get(id);},remove:async id=>{calls.push({type:'remove',id});tabs.delete(id);},update:async(id,options)=>{calls.push({type:'update',id});if(closedAfterLogin){tabs.delete(id);throw new Error('closed');}Object.assign(tabs.get(id),options);},sendMessage:async()=>({version:1,ready:false})}};
 const transport=createSessionFetch({extension,storage:null});
 const authenticate=async options=>{calls.push({type:'login',username:options.username});assert.equal(options.fetcher.binding().tabId,3);assert.equal(options.fetcher.binding().incognito,true);if(failLogin)throw new Error('Recusado');return {id:'90001',login:'QA.TESTE',name:'Conta Fictícia'};};
 const manager=createLoginManager({extension,transport,authenticate});return {manager,transport,tabs,calls,extension};
}
test('login alternativo abre janela anônima, fixa a conta e mantém a aba normal',async()=>{
 const f=managerFixture(),r=await f.manager.login({username:'QA.TESTE',password:'fictícia-123'});assert.equal(r.mode,'other');assert.equal(r.incognito,true);assert.equal(r.tabId,3);assert.equal(f.calls.find(c=>c.type==='create').options.incognito,true);assert.ok(f.tabs.has(1));assert.ok(!f.calls.some(c=>c.id===1));assert.equal(r.user.login,'QA.TESTE');
 await f.manager.disconnect();assert.ok(f.tabs.has(1));assert.ok(!f.tabs.has(3));assert.equal(f.transport.binding().mode,'other');assert.equal(f.transport.binding().user,undefined);
});
test('sem autorização anônima ou com outra sessão privada, não autentica nem troca a conta normal',async()=>{
 for(const options of [{allowed:false},{existingPrivate:true}]){const f=managerFixture(options);await assert.rejects(f.manager.login({username:'QA.TESTE',password:'fictícia-123'}));assert.ok(!f.calls.some(c=>c.type==='login'||c.type==='create'));assert.equal(f.transport.binding().mode,'other');assert.ok(f.tabs.has(1));}
});
test('falha de login fecha só a aba privada criada e permanece desconectado',async()=>{
 const f=managerFixture({failLogin:true});await assert.rejects(f.manager.login({username:'QA.TESTE',password:'fictícia-123'}));assert.equal(f.transport.binding().mode,'other');assert.equal(f.transport.binding().user,undefined);assert.ok(!f.tabs.has(3));assert.ok(f.tabs.has(1));
});
test('voltar à conta normal requer escolha explícita e encerra apenas a aba privada própria',async()=>{
 const f=managerFixture();await f.manager.login({username:'QA.TESTE',password:'fictícia-123'});await f.manager.useCurrent();assert.deepEqual(f.transport.binding(),{mode:'current'});assert.ok(!f.tabs.has(3));assert.ok(f.tabs.has(1));
});
test('fechar a aba alternativa bloqueia consultas sem buscar outra conta como alternativa',async()=>{
 const f=managerFixture();await f.manager.login({username:'QA.TESTE',password:'fictícia-123'});f.tabs.delete(3);let query=0;f.extension.tabs.query=async()=>{query++;return [...f.tabs.values()];};await assert.rejects(f.transport(origin+'/api/grupo'),/Entre novamente/);assert.equal(query,0);assert.equal(f.transport.binding().mode,'other');
});
test('janela fechada imediatamente após login não deixa estado conectado',async()=>{
 const f=managerFixture({closedAfterLogin:true});await assert.rejects(f.manager.login({username:'QA.TESTE',password:'fictícia-123'}),/fechada/);assert.equal(f.transport.binding().user,undefined);assert.ok(f.tabs.has(1));
});
test('metadados restauram a escolha e jamais guardam senha, chave ou cookie',()=>{
 let saved;const storage={getItem:()=>saved,setItem:(k,v)=>saved=v},a=createSessionFetch({storage,extension:{runtime:{id:'qa'}}});a.select({mode:'other',tabId:3,incognito:true,password:'SEGREDO',cookie:'COOKIE',user:{id:90001,login:'QA.TESTE',name:'Conta',senha:'SEGREDO'}});assert.ok(!saved.includes('SEGREDO'));assert.ok(!saved.includes('COOKIE'));const b=createSessionFetch({storage,extension:{runtime:{id:'qa'}}});assert.equal(b.binding().user.login,'QA.TESTE');assert.equal(b.binding().incognito,true);
});
