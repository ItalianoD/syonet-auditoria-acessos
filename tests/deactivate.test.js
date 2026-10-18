import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeactivateClient} from '../lib/deactivate.js';
import {accessWrite} from '../lib/access-write.js';
function fixture(){
 const profile={idUsuario:101,nome:'Ana',sobrenome:'Silva Souza',nomeLogin:'ANA.SILVA',ativo:true,empresas:[1,2],idEmpresa:1,idGrupo:'GRUPO',email:'exemplo@example.invalid'},dependencies={listaEventos:[],listaTipoEventos:[],listaAreasGerente:[],listaAgendas:[],listaEquipes:[{empresa:1}],listaEquipesVisualizacao:[{empresa:2}]},history={idUsuario:101,ultimoLogin:'2026-06-01T10:00:00-03:00',evidencia:{historicoDisponivel:true}},writes=[],state={sessionId:999,companies:[{idEmpresa:1},{idEmpresa:2}],date:new Date('2026-10-17T15:00:00-03:00'),ignore:false,fail:false};
 const f={profile,dependencies,history,writes,state,now:()=>state.date,readUser:async()=>structuredClone(profile),readAuditUser:async()=>structuredClone(history),request:async path=>({json:path==='/api/sessao/usuario'?{idUsuario:state.sessionId}:path==='/api/sessao/usuario/empresa'?state.companies:dependencies}),write:async(operation,id,payload)=>{writes.push({operation,id,payload});if(state.fail)throw new Error('Tempo esgotado; resultado incerto');if(!state.ignore)Object.assign(profile,payload);}};
 return f;
}
test('prévia não grava; aplicação inativa no sistema preservando cadastro e vínculos',async()=>{
 const f=fixture(),client=createDeactivateClient(f),before=structuredClone(f.profile),p=await client.prepare('101',30);assert.equal(f.writes.length,0);assert.equal(p.target.name,'Ana Silva Souza');assert.equal(p.confirmation,'INATIVAR 101');
 const r=await client.apply(p,p.confirmation);assert.equal(r.ok,true,r.error);assert.deepEqual(f.profile,{...before,ativo:false});assert.equal(f.writes.length,1);assert.equal(f.writes[0].operation,'deactivate');assert.equal(f.dependencies.listaEquipes.length,1);
 await assert.rejects(client.apply(p,p.confirmation),/nova prévia/);assert.equal(f.writes.length,1);
});
test('conta própria, outra loja inacessível, conta inativa e histórico insuficiente são bloqueados',async()=>{
 const cases=[f=>f.state.sessionId=101,f=>f.state.companies=[{idEmpresa:1}],f=>f.profile.ativo=false,f=>f.history.evidencia.historicoDisponivel=false,f=>f.history.ultimoLogin=null,f=>f.history.ultimoLogin='2026-10-17',f=>f.history.ultimoLogin='2027-01-01'];
 for(const change of cases){const f=fixture();change(f);await assert.rejects(createDeactivateClient(f).prepare('101',30));assert.equal(f.writes.length,0);}
});
test('leads, distribuição, gerência, agendas e consulta incompleta bloqueiam antes da gravação',async()=>{
 for(const key of ['listaEventos','listaTipoEventos','listaAreasGerente','listaAgendas']){const f=fixture();f.dependencies[key].push({empresa:2});await assert.rejects(createDeactivateClient(f).prepare('101',30),/pendências/);assert.equal(f.writes.length,0);}
 const f=fixture();delete f.dependencies.listaEquipes;await assert.rejects(createDeactivateClient(f).prepare('101',30),/incompleta/);
});
test('acesso recente, mudança de cadastro, nova pendência ou prévia vencida bloqueiam a aplicação',async()=>{
 for(const change of [f=>f.history.ultimoLogin='2026-10-17',f=>f.profile.nome='Mudou',f=>f.dependencies.listaEventos.push({empresa:2}),f=>f.state.date=new Date('2026-10-17T15:06:00-03:00')]){
  const f=fixture(),c=createDeactivateClient(f),p=await c.prepare('101',30);change(f);const r=await c.apply(p,p.confirmation);assert.equal(r.ok,false);assert.equal(r.attempted,false);assert.equal(f.writes.length,0);
 }
});
test('confirmação, identidade e plano não emitido não permitem gravar',async()=>{
 const f=fixture(),c=createDeactivateClient(f),p=await c.prepare('101',30);await assert.rejects(c.apply(p,'INATIVAR 102'));await assert.rejects(c.apply({...p},p.confirmation));f.profile.idUsuario=102;const r=await c.apply(p,p.confirmation);assert.equal(r.attempted,false);assert.equal(f.writes.length,0);
});
test('HTTP sem alteração e falha de rede são resultados não confirmados, sem repetição',async()=>{
 for(const mode of ['ignore','fail']){const f=fixture();f.state[mode]=true;const c=createDeactivateClient(f),p=await c.prepare('101',30),r=await c.apply(p,p.confirmation);assert.equal(r.ok,false);assert.equal(r.attempted,true);assert.equal(f.writes.length,1);await assert.rejects(c.apply(p,p.confirmation));}
});
test('writer usa PATCH nativo e exige id e ativo false',async()=>{
 let sent;const fetcher=async(url,options)=>{sent={url,...options};return new Response('{}');};
 await accessWrite('deactivate','101',{idUsuario:101,ativo:false},{fetcher});assert.equal(sent.method,'PATCH');assert.match(sent.url,/\/api\/usuario\/101$/);assert.equal(JSON.parse(sent.body).ativo,false);
 await assert.rejects(accessWrite('deactivate','101',{idUsuario:102,ativo:false},{fetcher}));await assert.rejects(accessWrite('deactivate','101',{idUsuario:101,ativo:true},{fetcher}));
});
