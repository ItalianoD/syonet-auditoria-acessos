import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDate,parseFile,parseCSV,csv,normalizeUser,inactivity,arrayFrom,at} from '../lib/data.js';
import {compareUsers,permissionRows} from '../lib/permissions.js';
import {humanizeLog} from '../lib/logs.js';
import {safePath,request,directoryIds} from '../lib/api.js';
import {pushed,parsePortalPermissions} from '../lib/portal.js';
const now=new Date('2026-10-17T18:00:00Z');
test('inatividade respeita limite estrito, conta desativada e ausência de data',()=>{
 const users=[
  {id:1,ativo:true,ultimoLogin:'2026-09-17T18:00:00Z'},
  {id:2,ativo:true,ultimoLogin:'2026-09-17T17:59:59Z'},
  {id:3,ativo:true},{id:4,ativo:false,ultimoLogin:'2020-01-01'},
  {id:5,ativo:true,ultimoLogin:'2026-10-18'}, {id:6,ativo:true,ultimoLogin:'31/02/2026'}
 ].map(u=>normalizeUser(u));
 const rows=inactivity(users,30,now),byId=id=>rows.find(r=>r.id===String(id));
 assert.equal(byId(1).review,false);assert.equal(byId(2).review,true);
 assert.equal(byId(3).status,'Sem data de acesso');assert.equal(byId(4).review,false);
 assert.equal(byId(5).status,'Data no futuro');assert.equal(byId(6).status,'Data inválida');
 assert.throws(()=>inactivity(users,0,now));
});
test('datas brasileiras usam UTC-03, epochs em segundos e milissegundos',()=>{
 assert.equal(parseDate('17/10/2026 15:00').toISOString(),now.toISOString());
 assert.equal(parseDate('2026-10-17 15:00').toISOString(),now.toISOString());
 assert.equal(parseDate(now.getTime()/1000).toISOString(),now.toISOString());
 assert.equal(parseDate(now.getTime()).toISOString(),now.toISOString());
 for(const date of ['31/02/2026','2026-13-01','ontem',true,'01/02/26'])assert.equal(parseDate(date),null);
});
test('CSV com aspas, ponto e vírgula, UTF-8 e quebra de linha',()=>{
 const rows=parseFile('\uFEFFidUsuario;nome;ativo\r\n1;"João; Teste";false\r\n2;"Duas\nlinhas";true','u.csv');
 assert.equal(rows[0].nome,'João; Teste');assert.equal(normalizeUser(rows[0]).active,false);assert.equal(rows[1].nome,'Duas\nlinhas');
 assert.throws(()=>parseCSV('id;nome\n1;"sem fim'));assert.throws(()=>parseCSV('id;id\n1;2'));assert.throws(()=>parseCSV('id;nome\n1'));assert.throws(()=>parseFile(''));
});
test('JSONL e envelopes de API usam estrutura explícita',()=>{
 assert.equal(parseFile('{"id":1}\n{"id":2}','x.jsonl').length,2);assert.throws(()=>parseFile('{"id":1}\n{erro}','x.jsonl'));
 assert.equal(arrayFrom({data:{items:[1,2]}},'data.items').length,2);assert.throws(()=>arrayFrom({data:'não é lista'}));
 assert.equal(at({a:{b:0}},'a.b'),0);assert.equal(at({},'__proto__.x'),undefined);
});
test('mapeamento preserva estado desconhecido e campo de origem da data',()=>{
 const u=normalizeUser({codigo:3,detalhe:{acesso:'17/10/2026'},situacao:'talvez'},{id:'codigo',last:'detalhe.acesso',active:'situacao'});
 assert.equal(u.lastField,'detalhe.acesso');assert.equal(u.active,null);assert.equal(u.id,'3');assert.throws(()=>normalizeUser({nome:'sem ID'}));
});
const permission=(codigo,permitido)=>({codigo,permitido,categoria:'Menu',escopo:9});
const user=(id,permissoes,extra={})=>normalizeUser({idUsuario:id,nome:'Usuário '+id,permissoes,...extra});
test('comparação distingue permitir, negar e desconhecido por código e escopo',()=>{
 const c=compareUsers(user(1,[permission('A',true),permission('B',false),permission('C',true)]),user(2,[permission('A',false),permission('B',true)]));
 assert.deepEqual(c.rows.map(r=>r.status),['Somente A','Somente B','Não confirmado']);assert.equal(c.complete,false);
 const d=compareUsers(user(1,[permission('A',true)]),user(2,[permission('A',true)]));assert.equal(d.complete,true);
 assert.throws(()=>compareUsers(user(1,[]),user(1,[])));
});
test('perfil igual sem matriz não comprova acessos iguais; ausência de lojas é desconhecida',()=>{
 const c=compareUsers(user(1,undefined,{idGrupo:'TI'}),user(2,undefined,{idGrupo:'TI'}));assert.equal(c.complete,false);assert.equal(c.groupEqual,true);assert.equal(c.companiesKnown,false);
 const d=compareUsers(user(1,[],{empresas:[9,7]}),user(2,[],{empresas:[9]}));assert.deepEqual(d.onlyA,['7']);
 assert.equal(permissionRows({permissoes:[{codigo:'A',permitido:'talvez'}]}).available,false);
 const ambiguous=compareUsers(user(1,[permission('A',true),permission('A',false)]),user(2,[permission('A',false)]));assert.equal(ambiguous.rows[0].status,'Não confirmado');assert.equal(ambiguous.complete,false);
});
test('logs preservam valores false e zero e não inventam ações desconhecidas',()=>{
 const l=humanizeLog({usuario:'Ana',acao:'UPDATE',idEmpresa:9,dataHora:now.toISOString(),campo:'ativo',valorAnterior:false,valorNovo:0});
 assert.match(l.phrase,/de false para 0/);assert.equal(l.recognized,true);
 const u=humanizeLog({acao:'X_CUSTOM'});assert.equal(u.recognized,false);assert.match(u.phrase,/não reconhecida/);
 const sensitive=humanizeLog({acao:'UPDATE',campo:'senha',valorAnterior:'segredo1',valorNovo:'segredo2',token:'segredo3'});
 assert.ok(!JSON.stringify(sensitive).includes('segredo'));assert.match(sensitive.phrase,/oculto/);
});
test('CSV exportado neutraliza fórmulas de planilha',()=>{
 const out=csv([{key:'nome',label:'Nome'}],[{nome:'=HYPERLINK("x")'},{nome:'  +cmd'},{nome:'Ana; Maria'}]);
 assert.ok(out.includes("'=HYPERLINK"));assert.ok(out.includes("'  +cmd"));assert.ok(out.includes('"Ana; Maria"'));
});
test('cliente permanece na origem esperada e usa GET, cookies, timeout e detecção de login',async()=>{
 for(const path of ['https://exemplo.com/api/x','//exemplo.com/api/x','/api/../logout','/portal/excluir.do','/api/x#y','/portal/usuario.do?modo=APLICAR_PERMISSOES','/api/x?acao=GRAVAR'])assert.throws(()=>safePath(path));
 let options;const fetcher=async(url,o)=>{options=o;assert.equal(new URL(url).origin,'https://disbrava.syonet.com');return new Response('[1]',{status:200});};
 assert.deepEqual((await request('/api/grupo',{fetcher})).json,[1]);assert.equal(options.method,'GET');assert.equal(options.credentials,'include');assert.equal(options.redirect,'manual');
 await assert.rejects(request('/api/grupo',{fetcher:async()=>new Response('<form action="validarLogonUsuario">',{status:200})}),/Sessão expirada/);
 await assert.rejects(request('/api/grupo',{fetcher:async()=>new Response('',{status:403})}),/HTTP 403/);
 const controller=new AbortController();controller.abort();await assert.rejects(request('/api/grupo',{signal:controller.signal,fetcher}),{name:'AbortError'});
});
test('parser de literais não executa scripts e exige matriz consistente',()=>{
 const script="idObjeto.push('M_USUARIO'); permissaoObjeto.push('1010'); idObjetosMenus.push('M_USUARIO'); descObjetosMenus.push('Usu\\u00e1rio');";
 assert.deepEqual(pushed(script,'idObjeto'),['M_USUARIO']);
 const doc={querySelectorAll:()=>[{textContent:script}]},p=parsePortalPermissions(doc);
 assert.equal(p.length,4);assert.deepEqual(p.map(r=>r.permitido),[true,false,true,false]);assert.equal(p[0].descricao,'Usuário · Visualizar');
 assert.throws(()=>parsePortalPermissions({querySelectorAll:()=>[{textContent:script+"idObjeto.push('X');"}]}));
 assert.deepEqual(directoryIds("idUsuarios.push('42');idUsuarios.push('42');"),['42']);
});
