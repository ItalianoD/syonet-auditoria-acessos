import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectoryClient} from '../lib/directory.js';
import {normalizeUser} from '../lib/data.js';
function fixture({failedCompany=false,failedHistory=false,failedProfile=false,paged=false}={}){
 const calls=[],users={101:{idUsuario:101,nome:'Ana',sobrenome:'Silva Souza',nomeLogin:'ANA.SILVA',ativo:true,empresas:[1,2]},102:{idUsuario:102,nome:'Bruno',sobrenome:'Oliveira',nomeLogin:'BRUNO',ativo:false,empresas:[2]}};
 const request=async path=>{calls.push(path);if(path==='/api/sessao/usuario/empresa')return {json:[{idEmpresa:1,nomeFantasia:'Loja Um'},{idEmpresa:2,nomeFantasia:'Loja Dois'}]};
  if(path==='/api/usuario?idEmpresa=1')return {json:[{idUsuario:101,nome:'101',ativo:true,lastLogin:'2020-01-01'}]};
  if(path==='/api/usuario?idEmpresa=2'){if(failedCompany)throw new Error('Loja indisponível');const content=Object.values(users);return {json:paged?{content,totalElements:30,totalPages:3,last:false}:content};}throw new Error(path);};
 return {calls,users,request,readUser:async id=>{if(failedProfile)throw new Error('Cadastro indisponível');return structuredClone(users[id]);},readAuditUser:async id=>{if(failedHistory&&id==='101')throw new Error('Histórico indisponível');return {idUsuario:Number(id),ultimoLogin:'2026-06-01T10:00:00-03:00',evidencia:{historicoDisponivel:true}};}};
}
test('consulta cada loja e inclui ativos e inativos sem duplicar usuários compartilhados',async()=>{
 const f=fixture(),r=await createDirectoryClient(f).scan();assert.equal(r.users.length,2);assert.equal(r.total,2);assert.deepEqual(r.coverage.map(c=>c.count),[1,2]);assert.ok(r.coverage.every(c=>c.ok));assert.equal(r.users.find(u=>u.id==='102').active,false);assert.deepEqual(r.users.find(u=>u.id==='101').raw._lojasConsultadas,['1','2']);assert.equal(r.users[0].name,'Ana Silva Souza');assert.equal(r.users[0].login,'ANA.SILVA');assert.ok(r.users[0].raw._lojasNomes.includes('Loja Dois'));assert.ok(!f.calls.some(p=>p.includes('listaUsuario')||p.includes('sessao/empresa')));
});
test('falha de histórico mantém usuário e nome completo, com data desconhecida e aviso',async()=>{
 const r=await createDirectoryClient(fixture({failedHistory:true})).scan(),u=r.users.find(u=>u.id==='101');assert.equal(r.users.length,2);assert.equal(u.name,'Ana Silva Souza');assert.equal(u.lastLogin,null);assert.equal(r.failures.length,1);assert.match(u.raw._avisosConsulta[0],/Histórico/);
});
test('falha no cadastro preserva identidade da lista e falha por loja indica cobertura parcial',async()=>{
 const r=await createDirectoryClient(fixture({failedProfile:true})).scan();assert.equal(r.users.length,2);assert.ok(r.failures.every(f=>f.error.includes('Cadastro')));assert.equal(r.users.find(u=>u.id==='102').name,'Bruno Oliveira');
 const partial=await createDirectoryClient(fixture({failedCompany:true})).scan();assert.equal(partial.coverage[1].ok,false);assert.equal(partial.users.length,1);assert.match(partial.scope,/1\/2/);
});
test('resposta paginada inesperada não é marcada como lista completa',async()=>{
 const r=await createDirectoryClient(fixture({paged:true})).scan();assert.equal(r.coverage[1].ok,false);assert.match(r.coverage[1].error,/paginação/);
});
test('falha em todas as lojas preserva o relatório de cobertura e as rotas de erro',async()=>{
 const f=fixture(),base=f.request;f.request=async path=>{if(path.startsWith('/api/usuario?'))throw Object.assign(new Error('HTTP 404 em '+path),{status:404,path});return base(path);};
 await assert.rejects(createDirectoryClient(f).scan(),error=>{assert.equal(error.coverage.length,2);assert.ok(error.coverage.every(c=>!c.ok));assert.match(error.coverage[0].error,/idEmpresa=1/);return true;});
});
test('cancelar e perder sessão interrompem a consulta em vez de declarar sucesso parcial',async()=>{
 const f=fixture(),c=new AbortController();c.abort();await assert.rejects(createDirectoryClient(f).scan({signal:c.signal}),{name:'AbortError'});
 const g=fixture();g.readUser=async()=>{throw new Error('Sessão expirada');};await assert.rejects(createDirectoryClient(g).scan(),/Sessão expirada/);
});
test('nome completo tem prioridade e sobrenome não se repete; IDs não viram nomes',()=>{
 assert.equal(normalizeUser({idUsuario:1,nome:'Ana',sobrenome:'Silva',nomeVisualizacao:'1',nomeLogin:'ANA'}).name,'Ana Silva');
 assert.equal(normalizeUser({idUsuario:1,nome:'Ana Silva',sobrenome:'Silva'}).name,'Ana Silva');
 assert.equal(normalizeUser({idUsuario:1,nome:'Ana',sobrenome:'Silva',nomeCompleto:'Ana Maria Silva'}).name,'Ana Maria Silva');
 assert.equal(normalizeUser({idUsuario:1,nome:'1',nomeLogin:'ANA'}).name,'Nome não informado');
});
