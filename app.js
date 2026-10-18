import {arrayFrom,parseFile,normalizeUser,inactivity,csv,text} from './lib/data.js';
import {humanizeLog} from './lib/logs.js';
import {compareUsers} from './lib/permissions.js';
import {scanDirectory,request,readList,searchUsers,readAuditUser} from './lib/api.js';
import {demoUsers,demoLogs} from './lib/demo.js';
import {initializeCopyUI} from './lib/copy-ui.js';
import {initializeDeactivateUI} from './lib/deactivate-ui.js';
import {companyIds} from './lib/directory.js';
import {initializeAuthUI} from './lib/auth-ui.js';

const $=id=>document.getElementById(id), SIZE=20;
let users=[],logs=[],comparison=null,userPage=0,logPage=0,source='Sem dados',logSource='',scope='',snapshot=new Date(),controller=null,busy=false,liveIds=new Set();
let copyUI=null,deactivateUI=null,authUI=null,coverage=[];
const userCompanies=u=>companyIds([...(Array.isArray(u.companies)?u.companies:u.companies?[u.companies]:[]),...(u.raw._lojasConsultadas||[])]);
const fold=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const escape=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message,error=false) {$('notice').hidden=false;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function mapping() {return Object.fromEntries(['id','name','login','active','last','company','group'].map(key=>[key,$('map-'+key).value.trim()]).filter(([,v])=>v));}
function renderHeader() {const label=!$('logs').hidden?(logSource||'Sem logs'):source;$('mode').textContent=label;$('mode').className='badge'+(label.toUpperCase().startsWith('DEMONSTRAÇÃO')?' warn':label.includes('Syonet')?' ok':'');}
function setMode(mode) {source=mode;renderHeader();}
function resetComparison() {comparison=null;copyUI?.invalidate();deactivateUI?.invalidate();$('comparison').className='panel empty';$('comparison').textContent='Use Comparar para visualizar as diferenças ou prepare uma cópia abaixo.';}
function loadUsers(rows,label,description,online=false) {
  if(rows.length>20000) throw new Error('Limite de 20.000 usuários por arquivo. Divida o arquivo antes de importar.');
  const normalized=rows.map((r,i)=>{try{return normalizeUser(r,online?{}:mapping());}catch(e){throw new Error(`Registro ${i+1}: ${e.message}`);}});
  const keys=normalized.map(u=>u.id?'id:'+u.id:'login:'+u.login.toUpperCase());
  if(new Set(keys).size!==keys.length) throw new Error('Há usuários repetidos no arquivo. Remova duplicações para evitar contagens incorretas.');
  coverage=[];renderCoverage();users=normalized;renderCompanyFilter();userPage=0;snapshot=new Date();scope=description;liveIds=new Set(online?users.map(u=>u.id):[]);$('user-a').value='';$('user-b').value='';setMode(label);resetComparison();renderUsers();renderOptions();
}
function renderCompanyFilter(){const selected=$('company-filter').value;const ids=companyIds(users.flatMap(userCompanies));$('company-filter').replaceChildren(new Option('Todas as lojas',''));$('company-filter').options[0].value='all';for(const id of ids)$('company-filter').add(new Option(coverage.find(c=>c.id===id)?.name||'Loja '+id,id));$('company-filter').value=ids.includes(selected)?selected:'all';}
function renderCoverage(){
  $('coverage').hidden=!coverage.length;const complete=coverage.filter(c=>c.ok).length;
  $('coverage-title').textContent='Cobertura por loja: '+complete+'/'+coverage.length+' consultadas'+(complete<coverage.length?' — CONSULTA PARCIAL':'');
  $('coverage-body').innerHTML='<table><thead><tr><th>Loja</th><th>Usuários na loja</th><th>Consulta</th></tr></thead><tbody>'+coverage.map(c=>'<tr><td>'+escape(c.name)+'<small>ID '+escape(c.id)+'</small></td><td>'+(c.ok?c.count:'—')+'</td><td>'+escape(c.ok?'Concluída':c.error)+'</td></tr>').join('')+'</tbody></table><p>Uma pessoa em várias lojas é contada uma vez na lista principal. As contagens por loja podem se sobrepor. Lojas sem autorização na sessão não podem ser consultadas.</p>';
}
function renderOptions() {
  for(const id of ['user-a','user-b']) {const selected=$(id).value;$(id).replaceChildren(new Option('Selecione um usuário',''));
    users.forEach((u,i)=>$(id).add(new Option(`${u.name} · ${u.login||'Login não informado'}`,String(i))));$(id).value=selected;}
}
function userRows() {
  const q=fold($('user-search').value.trim()),filter=$('status-filter').value,company=$('company-filter').value;
  const all=inactivity(users,Number($('days').value),snapshot);
  return {all,filtered:all.filter(u=>(!q||fold(`${u.name} ${u.login} ${u.id}`).includes(q))&&(company==='all'||userCompanies(u).includes(company))&&(filter==='all'||filter==='review'&&u.review||filter==='unknown'&&['Sem data de acesso','Data inválida','Data no futuro'].includes(u.status)||filter==='disabled'&&u.active===false))};
}
function renderUsers() {
  let all,filtered;try {({all,filtered}=userRows());}catch(e){notify(e.message,true);return;}
  $('count-total').textContent=all.length;$('count-review').textContent=all.filter(u=>u.review).length;
  $('count-unknown').textContent=all.filter(u=>['Sem data de acesso','Data inválida','Data no futuro'].includes(u.status)).length;$('count-disabled').textContent=all.filter(u=>u.active===false).length;
  userPage=Math.max(0,Math.min(userPage,Math.ceil(filtered.length/SIZE)-1));
  $('scope').textContent=scope||'Conecte ao Syonet, importe um arquivo ou explore os dados fictícios.';
  const page=filtered.slice(userPage*SIZE,(userPage+1)*SIZE);
  $('users-body').innerHTML=page.map(u=>`<tr><td><div class="user-cell"><span class="avatar">${escape(u.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase())}</span><div><strong>${escape(u.name)}</strong><small>${escape(u.login||'Sem login')} · ID ${escape(u.id||'não informado')}</small></div></div></td><td class="store-cell">${escape(u.raw._lojasNomes||userCompanies(u).map(id=>coverage.find(c=>c.id===id)?.name||'Loja '+id).join(' · ')||'Não informado')}</td><td>${escape(u.group||'Não informado')}</td><td>${escape(u.lastFormatted)}</td><td>${u.days===null?'—':escape(u.days)}</td><td><span class="badge ${u.review?'warn':u.status==='Dentro do limite'?'ok':'neutral'}">${escape(u.status)}</span>${u.active===null?'<small>Situação ativa não confirmada</small>':''}${u.raw._avisosConsulta?.length?'<small class="query-warning">'+escape(u.raw._avisosConsulta.join(' '))+'</small>':''}</td><td>${u.review&&u.active===true&&liveIds.has(u.id)?'<button class="danger-outline" data-deactivate="'+escape(u.id)+'">Inativar…</button>':u.active===false?'Já inativo':u.review?'Consulte online para inativar':'—'}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty"><strong>Nenhum usuário nesta seleção</strong><p>Importe uma lista, consulte o Syonet ou ajuste os filtros para começar a revisão.</p></div></td></tr>';
  $('users-info').textContent=`${filtered.length?userPage*SIZE+1:0}–${Math.min((userPage+1)*SIZE,filtered.length)} de ${filtered.length} usuários`;
  $('prev').disabled=userPage===0;$('next').disabled=(userPage+1)*SIZE>=filtered.length;
}
function filteredLogs() {const q=$('log-search').value.toLocaleLowerCase('pt-BR');return logs.filter(l=>(!q||l.phrase.toLocaleLowerCase('pt-BR').includes(q))&&($('log-filter').value==='all'||!l.recognized));}
function renderLogs() {
  const filtered=filteredLogs();logPage=Math.max(0,Math.min(logPage,Math.ceil(filtered.length/SIZE)-1));
  $('log-list').innerHTML=filtered.slice(logPage*SIZE,(logPage+1)*SIZE).map(l=>`<article class="log-row"><div class="log-meta"><span class="badge ${l.recognized?'ok':'warn'}">${l.recognized?'Ação reconhecida':'Conferir registro'}</span><span>#${escape(l.id)} · ${escape(l.date||'Data não informada')}</span></div><p>${escape(l.phrase)}</p><details><summary>Ver registro de origem (campos sensíveis filtrados)</summary><pre>${escape(JSON.stringify(l.raw,null,2))}</pre></details></article>`).join('')||'<div class="empty"><strong>Nenhum log carregado nesta seleção</strong><p>Importe registros estruturados ou configure uma fonte de consulta.</p></div>';
  $('logs-info').textContent=`${filtered.length?logPage*SIZE+1:0}–${Math.min((logPage+1)*SIZE,filtered.length)} de ${filtered.length} registros`;
  $('logs-prev').disabled=logPage===0;$('logs-next').disabled=(logPage+1)*SIZE>=filtered.length;
}
function loadLogs(rows,label) {if(rows.length>50000)throw new Error('Limite de 50.000 logs por arquivo. Divida o arquivo.');logs=rows.map((r,i)=>humanizeLog(r,i));logSource=label;logPage=0;$('log-scope').textContent=`${label} · ${logs.length} registros. Os textos foram montados a partir dos campos recebidos.`;renderHeader();renderLogs();}
function download(name,content,type='text/csv;charset=utf-8') {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
const stamp=()=>new Date().toISOString().slice(0,10);
async function task(button,fn) {
  if(busy) throw new Error('Aguarde a consulta atual terminar.');busy=true;controller=new AbortController();
  const label=button.textContent;button.disabled=true;authUI?.setBusy(true);
  try {await fn(controller.signal);} catch(error) {controller?.abort();throw error;} finally {button.disabled=false;button.textContent=label;busy=false;controller=null;authUI?.setBusy(false);}
}
function on(id,fn,event='click') {$(id).addEventListener(event,async e=>{try{await fn(e);}catch(error){notify(error.name==='AbortError'?'Consulta cancelada.':error.message,true);}});}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==button.dataset.tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b===button));history.replaceState(null,'','#'+button.dataset.tab);window.scrollTo(0,0);renderHeader();
}));
function currentTab() {const id=location.hash.slice(1);document.querySelector(`[data-tab="${['inatividade','logs','comparador','fontes'].includes(id)?id:'inatividade'}"]`).click();}
currentTab();
on('demo',()=>{if(busy)throw new Error('Aguarde a consulta atual.');loadUsers(demoUsers(),'DEMONSTRAÇÃO · Dados fictícios','Dados fictícios gerados para explorar a interface. Não representam contas da Disbrava.');loadLogs(demoLogs(),'Demonstração fictícia');notify('Demonstração carregada. Para usar dados reais, consulte o Syonet ou importe um arquivo.');});
function clearPanelData(){copyUI?.reset();deactivateUI?.reset();coverage=[];renderCoverage();users=[];logs=[];logSource='';liveIds.clear();snapshot=new Date();scope='';renderCompanyFilter();setMode('Sem dados');resetComparison();renderUsers();renderOptions();renderLogs();$('log-scope').textContent='Importe JSON, JSONL ou CSV.';$('notice').hidden=true;$('session-status').textContent='';if($('auth-password'))$('auth-password').value='';}
on('clear',()=>{if(copyUI?.isApplying()||deactivateUI?.isApplying())throw new Error('A aplicação está em andamento. Aguarde o relatório antes de limpar os dados.');controller?.abort();clearPanelData();notify('Dados removidos desta aba. A conta de conexão selecionada foi mantida.');});
for(const id of ['user-search','status-filter','company-filter','days'])on(id,()=>{userPage=0;renderUsers();},['status-filter','company-filter'].includes(id)?'change':'input');
on('prev',()=>{userPage--;renderUsers();});on('next',()=>{userPage++;renderUsers();});
for(const id of ['log-search','log-filter'])on(id,()=>{logPage=0;renderLogs();},id==='log-filter'?'change':'input');
on('logs-prev',()=>{logPage--;renderLogs();});on('logs-next',()=>{logPage++;renderLogs();});
for(const kind of ['users','logs'])on(kind+'-file',async e=>{
  if(busy)throw new Error('Aguarde a consulta atual.');const file=e.target.files[0];if(!file)return;
  try {if(file.size>10*1024*1024)throw new Error('Arquivo maior que 10 MB. Divida o arquivo.');const parsed=parseFile(await file.text(),file.name),rows=arrayFrom(parsed,$(kind+'-list').value.trim());
    if(kind==='users')loadUsers(rows,'Arquivo local',`Arquivo: ${file.name} · Cobertura conforme os registros importados.`);else loadLogs(rows,`Arquivo: ${file.name}`);
    notify(`${rows.length} registros importados de ${file.name}.`);
  }finally{e.target.value='';}
},'change');
on('scan',()=>task($('scan'),async signal=>{
  if(source.startsWith('DEMONSTRAÇÃO')) {users=[];logs=[];logSource='';liveIds.clear();renderUsers();renderOptions();renderLogs();resetComparison();}
  deactivateUI?.invalidate();copyUI?.invalidate();
  let result;
  try{result=await scanDirectory({signal,onProgress:(done,total,phase)=>{$('scan').textContent=`Consultando ${phase} ${done}/${total}…`;}});}
  catch(error){if(error.coverage){coverage=error.coverage;renderCoverage();}throw error;}
  if(signal.aborted)return;
  loadUsers(result.users.map(u=>u.raw),'Syonet · todas as lojas',result.scope,true);coverage=result.coverage;renderCoverage();renderCompanyFilter();renderUsers();
  const missing=coverage.filter(c=>!c.ok),partial=missing.length||result.failures.length;
  notify(`Consulta concluída: ${users.length} usuários únicos. ${coverage.filter(c=>c.ok).length}/${coverage.length} lojas consultadas. ${result.failures.length} cadastros com avisos.`+(missing.length?' Consulta parcial; confira as lojas que falharam em Cobertura por loja.':''),!!partial);
}));
on('users-custom',()=>task($('users-custom'),async signal=>{const path=$('users-path').value.trim();if(!path)throw new Error('Informe a rota personalizada.');const {rows}=await readList(path,$('users-list').value.trim(),{signal});if(signal.aborted)return;loadUsers(rows,'Syonet · lista personalizada',`Uma resposta de ${path.split('?')[0]}. Cobertura de lojas e paginação não confirmada.`);notify('Lista personalizada carregada. Use Consultar todas as lojas para a varredura por loja.');}));
on('coverage-export',()=>{if(!coverage.length)throw new Error('Consulte todas as lojas primeiro.');download(`syonet-cobertura-${stamp()}.csv`,csv([{key:'id',label:'ID da loja'},{key:'name',label:'Loja'},{key:'count',label:'Usuários (contagens podem se sobrepor)'},{key:'ok',label:'Consulta concluída'},{key:'error',label:'Falha'}],coverage));});

on('test-session',()=>task($('test-session'),async signal=>{const {json}=await request('/api/sessao/usuario/empresa',{signal});if(!Array.isArray(json))throw new Error('Resposta de sessão não reconhecida.');$('session-status').textContent=`Sessão respondeu: ${json.length} empresas disponíveis. A leitura de históricos depende da permissão do seu usuário.`;notify('Conexão com o Syonet verificada.');}));
on('logs-live',()=>task($('logs-live'),async signal=>{const path=$('logs-path').value.trim();if(!path)throw new Error('Informe a rota de logs em Fontes de dados ou importe um arquivo.');const {rows}=await readList(path,$('logs-list').value.trim(),{signal});loadLogs(rows,'Syonet · uma resposta da fonte configurada (pode ser parcial)');notify(`${rows.length} logs consultados.`);}));
on('remap',()=>{if(busy)throw new Error('Aguarde a consulta atual.');const ids=liveIds,previousCoverage=coverage;loadUsers(users.map(u=>u.raw),source,scope,source==='Syonet · todas as lojas');liveIds=ids;coverage=previousCoverage;renderCoverage();renderCompanyFilter();renderUsers();notify('Campos dos usuários reprocessados.');});
on('remote-search',()=>task($('remote-search'),async signal=>{
  const matches=await searchUsers($('remote-query').value,{signal});if(signal.aborted)return;
  if(source.startsWith('DEMONSTRAÇÃO')){users=[];logs=[];logSource='';liveIds.clear();renderLogs();}
  const valid=matches.filter(u=>/^\d+$/.test(u.id));
  for(const u of valid){const i=users.findIndex(old=>old.id===u.id);if(i>=0)users[i]=u;else users.push(u);liveIds.add(u.id);}
  setMode('Syonet · seleção para comparação');scope='Seleção adicionada por busca; esta lista não é uma varredura completa.';snapshot=new Date();coverage=[];renderCoverage();renderCompanyFilter();resetComparison();renderUsers();renderOptions();notify(`${valid.length} opções adicionadas. Escolha os dois usuários; os cadastros completos serão relidos ao comparar.`);
}));
on('compare',()=>task($('compare'),async signal=>{
  const ia=$('user-a').value,ib=$('user-b').value;if(ia===''||ib==='')throw new Error('Selecione os dois usuários.');if(ia===ib)throw new Error('Escolha dois usuários diferentes.');
  for(const i of [Number(ia),Number(ib)])if(liveIds.has(users[i].id)){const raw=await readAuditUser(users[i].id,{signal});if(signal.aborted)return;users[i]=normalizeUser({...users[i].raw,...raw});}
  comparison=compareUsers(users[Number(ia)],users[Number(ib)],$('permissions-path').value.trim()||'permissoes');renderComparison();renderUsers();
}));
function renderComparison() {
  const c=comparison;if(!c)return;
  const diffs=c.rows.filter(r=>r.status!=='Igual'),same=c.rows.length-diffs.length;
  $('comparison').className='panel';$('comparison').innerHTML=`<div class="comparison-intro"><h2>${escape(c.a.name)} <span class="slash">×</span> ${escape(c.b.name)}</h2><p><span class="badge ${c.complete?'ok':'warn'}">${c.complete?'Matriz recebida consistente':'Comparação parcial'}</span> ${diffs.filter(r=>r.status==='Somente A').length} permissões somente em A · ${diffs.filter(r=>r.status==='Somente B').length} somente em B · ${same} iguais.</p><p>Perfil A: <strong>${escape(c.a.group||'não informado')}</strong> · Perfil B: <strong>${escape(c.b.group||'não informado')}</strong>.<br>Lojas somente em A: ${escape(c.companiesKnown?c.onlyA.join(', ')||'nenhuma':'não confirmado')} · Lojas somente em B: ${escape(c.companiesKnown?c.onlyB.join(', ')||'nenhuma':'não confirmado')}.</p><p>Escopo: permissões registradas no cadastro consultado. Equipes, horários, regras de distribuição e políticas adicionais podem limitar o acesso efetivo.${c.warnings.length?' '+escape(c.warnings.join(' ')):''}</p></div><div class="table-wrap"><table><thead><tr><th>Permissão / código</th><th>Categoria / escopo</th><th>Usuário A</th><th>Usuário B</th><th>Resultado</th></tr></thead><tbody>${diffs.map(r=>`<tr><td><strong>${escape(r.label)}</strong><small>${escape(r.id)}</small></td><td>${escape(r.category)}<small>${escape(r.scope)}</small></td><td>${stateLabel(r.a)}</td><td>${stateLabel(r.b)}</td><td><span class="badge ${r.status==='Não confirmado'?'warn':'ok'}">${escape(r.status)}</span></td></tr>`).join('')||`<tr><td colspan="5"><div class="empty">${c.complete?'Nenhuma diferença na matriz recebida.':'Sem permissões detalhadas suficientes. Perfil e lojas são mostrados acima.'}</div></td></tr>`}</tbody></table></div>`;
}
function stateLabel(value) {return value===true?'Permitido':value===false?'Não permitido':'Não informado';}
on('users-export',()=>{const rows=userRows().filtered;if(!rows.length)throw new Error('Não há usuários para exportar.');download(`syonet-inatividade-${stamp()}.csv`,csv([{key:'id',label:'ID'},{key:'name',label:'Nome'},{key:'login',label:'Login'},{key:'stores',label:'Lojas'},{key:'warnings',label:'Avisos de consulta'},{key:'group',label:'Perfil'},{key:'active',label:'Ativo'},{key:'lastFormatted',label:'Último acesso'},{key:'lastField',label:'Campo de origem'},{key:'days',label:'Dias sem acesso'},{key:'status',label:'Situação'},{key:'limit',label:'Limite em dias'},{key:'source',label:'Fonte e cobertura'},{key:'snapshot',label:'Data da análise'}],rows.map(u=>({...u,stores:u.raw._lojasNomes||userCompanies(u).join(', '),warnings:(u.raw._avisosConsulta||[]).join(' '),limit:$('days').value,source:source+' · '+scope,snapshot:snapshot.toISOString()}))));});
on('logs-export',()=>{const rows=filteredLogs();if(!rows.length)throw new Error('Não há logs para exportar.');download(`syonet-logs-${stamp()}.csv`,csv([{key:'id',label:'ID'},{key:'actor',label:'Usuário'},{key:'date',label:'Data'},{key:'action',label:'Ação recebida'},{key:'company',label:'Loja'},{key:'phrase',label:'Descrição'},{key:'recognized',label:'Ação reconhecida'},{key:'source',label:'Origem'}],rows.map(r=>({...r,source:logSource}))));});
on('compare-export',()=>{if(!comparison)throw new Error('Execute uma comparação primeiro.');download(`syonet-comparacao-${stamp()}.json`,JSON.stringify({geradoEm:new Date().toISOString(),fonte:source,escopo:'Matriz do cadastro; não inclui regras externas, equipes ou horários.',...comparison},null,2),'application/json');});
copyUI=initializeCopyUI({task,notify,download,selection:()=>{
  const a=users[Number($('user-a').value)],b=users[Number($('user-b').value)];
  if($('user-a').value===''||$('user-b').value===''||!a||!b||a.id===b.id)throw new Error('Selecione dois usuários diferentes.');
  return {a,b,online:liveIds.has(a.id)&&liveIds.has(b.id)};
},onUpdated:async id=>{
  try{const index=users.findIndex(u=>u.id===id);if(index>=0){users[index]=normalizeUser({...users[index].raw,...await readAuditUser(id)});snapshot=new Date();renderUsers();renderOptions();resetComparison();}}
  catch{notify('A aplicação terminou, mas a lista do painel não foi atualizada. Confira o relatório e consulte novamente o Syonet.',true);}
}});
deactivateUI=initializeDeactivateUI({task,notify,download,selection:id=>{const u=users.find(u=>u.id===id);if(!u)throw new Error('Usuário não encontrado.');return {...u,online:liveIds.has(id)};},onUpdated:async(id,report)=>{
  const index=users.findIndex(u=>u.id===id);if(index<0)return;
  try{users[index]=normalizeUser({...users[index].raw,...await readAuditUser(id)});}catch{if(report.ok)users[index]=normalizeUser({...users[index].raw,ativo:false});notify('Confira o relatório; a atualização completa da lista falhou. Consulte novamente.',true);}
  snapshot=new Date();renderUsers();renderOptions();resetComparison();
}});
authUI=initializeAuthUI({task,notify,resetData:clearPanelData});
renderUsers();renderLogs();
