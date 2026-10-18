import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './copy-fixture.js';
import {createCopyClient} from '../lib/access-copy.js';
import {buildCopyPlan,patchTarget} from '../lib/copy-plan.js';
import {accessWrite} from '../lib/access-write.js';
const options={mode:'add',scopes:{permissions:true,profile:true,companies:true,teams:true}};
test('preparar a cópia não grava; os quatro escopos aparecem na prévia',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',options);
 assert.equal(f.calls.filter(c=>c.method==='WRITE').length,0);assert.equal(p.profileChange,true);assert.deepEqual(p.addedCompanies,['9']);assert.deepEqual(p.removedCompanies,[]);assert.equal(p.permissionChanges.length,8);assert.equal(p.teamChanges.length,3);assert.equal(p.confirmation,'APLICAR 90002');
});
test('somar copia o perfil, os estados e os dois papéis, preservando adicionais e terceiros',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',options),beforeRef=structuredClone(f.users[90001]);
 const report=await client.apply(p,p.confirmation);assert.equal(report.ok,true,report.error);assert.equal(f.users[90002].idGrupo,'REFERENCIA');assert.deepEqual(f.users[90002].empresas,[7,9]);assert.equal(f.users[90002].idEmpresa,7);
 assert.deepEqual(f.permissions[90002],f.permissions[90001]);assert.deepEqual(f.users[90001],beforeRef);assert.equal(f.users[90002].email,'destino@example.invalid');assert.equal(f.users[90002].idTipo,'FUNCIONARIO');
 assert.ok(f.teams.get('165').members.includes('90002'));assert.ok(f.teams.get('165').members.includes('90009'));assert.ok(f.teams.get('381').viewers.includes('90002'));assert.ok(f.teams.get('301').members.includes('90002'));assert.equal(f.session,7);
});
test('espelhar retira equipes antes de remover a loja e iguala a empresa padrão',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',{...options,mode:'mirror'}),report=await client.apply(p,p.confirmation);
 assert.equal(report.ok,true,report.error);assert.deepEqual(f.users[90002].empresas,[9]);assert.equal(f.users[90002].idEmpresa,9);assert.ok(!f.teams.get('301').members.includes('90002'));assert.ok(f.teams.get('301').members.includes('90009'));assert.equal(f.session,7);
 const writes=f.calls.filter(c=>c.method==='WRITE'),teamRemoval=writes.findIndex(c=>c.operation==='team'&&c.id==='301'),companyRemoval=writes.findIndex(c=>c.operation==='profile'&&c.payload.empresas.length===1);assert.ok(teamRemoval>=0&&companyRemoval>teamRemoval);
});
test('confirmação incorreta e alvo igual não iniciam gravação',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',options);
 await assert.rejects(client.apply(p,'APLICAR 90001'),/Digite APLICAR 90002/);await assert.rejects(client.prepare('90001','90001',options));assert.equal(f.calls.filter(c=>c.method==='WRITE').length,0);
});
test('prévia vencida ou alterada é bloqueada antes de gravar',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',options);f.permissions[90002][0]=true;
 const report=await client.apply(p,p.confirmation);assert.equal(report.ok,false);assert.equal(report.partial,false);assert.match(report.error,/mudaram/);assert.equal(f.calls.filter(c=>c.method==='WRITE').length,0);
 const g=fixture(),client2=createCopyClient(g),expired=await client2.prepare('90001','90002',options);expired.createdAt='2020-01-01';const r=await client2.apply(expired,expired.confirmation);assert.equal(r.partial,false);assert.match(r.error,/expirou/);assert.equal(g.calls.filter(c=>c.method==='WRITE').length,0);
});
test('falha de gravação interrompe sem repetição e informa aplicação parcial',async()=>{
 const f=fixture({failOperation:'permissions'}),client=createCopyClient(f),p=await client.prepare('90001','90002',options),report=await client.apply(p,p.confirmation);
 assert.equal(report.ok,false);assert.equal(report.partial,true);assert.equal(f.calls.filter(c=>c.operation==='permissions').length,1);assert.equal(f.calls.filter(c=>c.operation==='team').length,0);assert.equal(f.users[90002].idGrupo,'REFERENCIA');
});
test('HTTP de sucesso sem alteração confirmada interrompe a cópia',async()=>{
 const f=fixture({ignorePermissions:true}),client=createCopyClient(f),p=await client.prepare('90001','90002',options),report=await client.apply(p,p.confirmation);
 assert.equal(report.ok,false);assert.equal(report.partial,true);assert.match(report.error,/não confirmou/);assert.equal(f.calls.filter(c=>c.operation==='permissions').length,1);assert.equal(f.calls.filter(c=>c.operation==='team').length,0);
});
test('contas inativas, matrizes parciais e objetos sem edição impedem a prévia',async()=>{
 const f=fixture(),client=createCopyClient(f);f.users[90002].ativo=false;await assert.rejects(client.prepare('90001','90002',options),/ativos/);assert.equal(f.calls.filter(c=>c.method==='WRITE').length,0);
 const g=fixture(),c=createCopyClient(g),s=await c.snapshots('90001','90002',options);s.source.portal.permissoes=undefined;assert.throws(()=>buildCopyPlan(s.source,s.target,options),/completas/);
 const z=fixture(),snap=await createCopyClient(z).snapshots('90001','90002',options);const row={codigo:'OBJETO:Visualizar',categoria:'Objeto',escopo:'Cadastro do usuário',permitido:true};snap.source.portal.permissoes.push(row);snap.target.portal.permissoes.push({...row,permitido:false});assert.throws(()=>buildCopyPlan(snap.source,snap.target,options),/sem edição/);
});
test('mudança inesperada em dado pessoal é detectada depois da gravação',async()=>{
 const f=fixture(),original=f.write,client=createCopyClient({...f,write:async(...args)=>{await original(...args);if(args[0]==='profile')f.users[90002].nome='ALTERADO FORA DO ESCOPO';}}),p=await client.prepare('90001','90002',options),report=await client.apply(p,p.confirmation);
 assert.equal(report.ok,false);assert.equal(report.partial,true);assert.match(report.error,/campo nome/);assert.equal(f.calls.filter(c=>c.operation==='permissions').length,0);
});
test('diferença nos demais participantes interrompe as próximas equipes',async()=>{
 const f=fixture(),original=f.write,client=createCopyClient({...f,write:async(...args)=>{await original(...args);if(args[0]==='team'&&args[1]==='165')f.teams.get('165').members.push('90010');}}),p=await client.prepare('90001','90002',options),report=await client.apply(p,p.confirmation);
 assert.equal(report.ok,false);assert.equal(report.partial,true);assert.match(report.error,/demais participantes/);assert.equal(f.calls.filter(c=>c.operation==='team').length,1);assert.equal(f.session,7);
});
test('o envio preserva a identidade do destino e restringe as rotas e campos de escrita',async()=>{
 const f=fixture(),client=createCopyClient(f),p=await client.prepare('90001','90002',options),patched=patchTarget(f.users[90002],p);
 assert.equal(patched.idUsuario,90002);assert.equal(patched.nomeLogin,'DEST.TESTE');assert.equal(patched.email,'destino@example.invalid');
 let sent;const fetcher=async(url,o)=>{sent={url,...o};return new Response('{}',{status:200});};
 await accessWrite('profile','90002',patched,{fetcher});assert.equal(sent.method,'PATCH');assert.match(sent.url,/\/api\/usuario\/90002$/);assert.equal(sent.credentials,'include');
 await assert.rejects(accessWrite('profile','90001',patched,{fetcher}));
 await assert.rejects(accessWrite('delete','90002',{}, {fetcher}));
 const invalid=new URLSearchParams({idUsuario:'90002','usuarioValue.idUsuario':'90002',modo:'APLICAR_PERMISSOES',idTipoObjeto:'2',senha:'x'});await assert.rejects(accessWrite('permissions','90002',invalid,{fetcher}),/Campo inesperado/);
});
