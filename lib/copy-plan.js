import {normalizeUser} from './data.js';
import {compareUsers} from './permissions.js';
import {sameIds,ids} from './native-forms.js';

export const teamKey=t=>`${t.teamId}:${t.recordId}:${t.tableName}`;
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
export const stable=value=>JSON.stringify(sorted(value));
export function accessState(snapshot) {
  const u=snapshot.user,p=snapshot.portal;
  return {id:String(u.idUsuario),login:String(u.nomeLogin||''),active:u.ativo,group:String(u.idGrupo||''),companies:ids(u.empresas),defaultCompany:String(u.idEmpresa||''),
    permissions:p.permissoes,controls:p.controlesPermissao,
    teams:snapshot.teams.map(t=>({key:teamKey(t),member:t.members.includes(String(u.idUsuario)),viewer:t.viewers.includes(String(u.idUsuario))})).sort((a,b)=>a.key.localeCompare(b.key))};
}
export function buildCopyPlan(source,target,options) {
  const scopes={permissions:true,profile:true,companies:true,teams:true,...options.scopes},mode=options.mode||'add';
  if(!Object.values(scopes).some(Boolean))throw new Error('Selecione pelo menos um tipo de acesso.');
  if(!['add','mirror'].includes(mode))throw new Error('Modo de cópia inválido.');
  const a=source.user,b=target.user;
  if(String(a.idUsuario)===String(b.idUsuario))throw new Error('A referência e o destino devem ser pessoas diferentes.');
  if(a.ativo!==true||b.ativo!==true)throw new Error('Referência e destino precisam estar ativos para esta cópia.');
  if(!a.nomeLogin||!b.nomeLogin)throw new Error('Os logins dos dois usuários devem estar confirmados.');
  const before=accessState(target),reference=accessState(source),companies=scopes.companies?(mode==='mirror'?reference.companies:ids([...before.companies,...reference.companies])):before.companies;
  const group=scopes.profile?String(a.idGrupo||''):String(b.idGrupo||'');if(scopes.profile&&!group)throw new Error('Grupo de referência não confirmado.');
  const defaultCompany=scopes.companies&&mode==='mirror'?reference.defaultCompany:before.defaultCompany;
  if(scopes.companies&&(!companies.length||!companies.includes(defaultCompany)))throw new Error('Empresa padrão inválida para as lojas planejadas.');
  let permissionChanges=[],controls=[];
  if(scopes.permissions){
    const comparison=compareUsers(normalizeUser(source.portal),normalizeUser(target.portal));
    if(!comparison.complete||!comparison.rows.length)throw new Error('As matrizes de permissões precisam estar completas.');
    const ca=source.portal.controlesPermissao,cb=target.portal.controlesPermissao;
    if(!ca?.length||!cb?.length)throw new Error('Controles nativos de permissão ausentes.');
    const targetControls=new Map(cb.map(c=>[c.name,c]));
    if(ca.length!==cb.length||ca.some(c=>!targetControls.has(c.name)))throw new Error('Os cadastros possuem controles de permissão diferentes.');
    controls=ca.map(c=>({...c}));
    if(ca.some(c=>targetControls.get(c.name).checked!==c.checked&&(c.disabled||targetControls.get(c.name).disabled)))throw new Error('Há permissões bloqueadas para edição nesta sessão.');
    const mutableBases=new Set(ca.map(c=>c.name.replace(/_(visualiza|incluir|alterar|excluir)_chk$/,'')));
    permissionChanges=comparison.rows.filter(r=>r.a!==r.b);
    if(permissionChanges.some(r=>!mutableBases.has(r.id.replace(/:(Visualizar|Incluir|Alterar|Excluir)$/, ''))))throw new Error('Há objetos diferentes sem edição pela aba Permissões. A cópia foi bloqueada antes de gravar.');
    const changedBases=new Set(ca.filter(c=>targetControls.get(c.name).checked!==c.checked).map(c=>c.name.replace(/_(visualiza|incluir|alterar|excluir)_chk$/,'')));
    if(permissionChanges.some(r=>!changedBases.has(r.id.replace(/:(Visualizar|Incluir|Alterar|Excluir)$/, ''))))throw new Error('Há estados diferentes sem um controle editável correspondente. A cópia foi bloqueada antes de gravar.');
  }
  const targetTeams=new Map(target.teams.map(t=>[teamKey(t),t])),changes=[];
  if(scopes.teams){
    if(source.teams.length!==target.teams.length||source.teams.some(t=>!targetTeams.has(teamKey(t))))throw new Error('Catálogo de equipes inconsistente.');
    for(const team of source.teams){const dest=targetTeams.get(teamKey(team)),from={member:team.members.includes(String(a.idUsuario)),viewer:team.viewers.includes(String(a.idUsuario))},old={member:dest.members.includes(String(b.idUsuario)),viewer:dest.viewers.includes(String(b.idUsuario))};
      const desired=mode==='mirror'?from:{member:old.member||from.member,viewer:old.viewer||from.viewer};
      if((desired.member||desired.viewer)&&team.companyId!=null&&!companies.includes(String(team.companyId)))throw new Error(`A equipe ${team.teamName} exige a loja ${team.companyId}. Inclua a cópia de lojas.`);
      if(old.member!==desired.member||old.viewer!==desired.viewer)changes.push({teamId:team.teamId,recordId:team.recordId,tableName:team.tableName,companyId:team.companyId,company:team.company,teamName:team.teamName,before:old,after:desired});
    }
  }
  const removedCompanies=before.companies.filter(id=>!companies.includes(id));
  return {createdAt:new Date().toISOString(),source:{id:String(a.idUsuario),login:a.nomeLogin,name:[a.nome,a.sobrenome].filter(Boolean).join(' ')||a.nomeLogin},target:{id:String(b.idUsuario),login:b.nomeLogin,name:[b.nome,b.sobrenome].filter(Boolean).join(' ')||b.nomeLogin},
    scopes,mode,before,reference,expected:{group,companies,defaultCompany,controls,permissions:scopes.permissions?source.portal.permissoes:target.portal.permissoes},
    profileChange:group!==String(b.idGrupo||''),addedCompanies:companies.filter(id=>!before.companies.includes(id)),removedCompanies,permissionChanges,teamChanges:changes,
    sourceFingerprint:stable(reference),targetFingerprint:stable(before),confirmation:`APLICAR ${b.idUsuario}`};
}
export function assertFresh(plan,source,target) {
  if(Date.now()-new Date(plan.createdAt).getTime()>10*60*1000)throw new Error('A prévia expirou. Prepare a cópia novamente.');
  if(stable(accessState(source))!==plan.sourceFingerprint||stable(accessState(target))!==plan.targetFingerprint)throw new Error('Os acessos mudaram desde a prévia. Prepare a cópia novamente. Nenhuma gravação foi iniciada.');
}
export function patchTarget(current,plan,companies=plan.expected.companies) {
  if(String(current.idUsuario)!==plan.target.id||current.nomeLogin!==plan.target.login||current.ativo!==true)throw new Error('O cadastro de destino mudou.');
  const copy={...current};
  if(plan.scopes.profile)copy.idGrupo=plan.expected.group;
  if(plan.scopes.companies){copy.empresas=ids(companies).map(Number);copy.idEmpresa=Number(companies.includes(plan.expected.defaultCompany)?plan.expected.defaultCompany:current.idEmpresa);}
  return copy;
}
