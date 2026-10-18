import {request,readUser,readAuditUser} from './api.js';
import {accessWrite} from './access-write.js';
import {TEAM_GROUPS} from './team-reference.js';
import {readTeamDocument,teamBody,ids,sameIds} from './native-forms.js';
import {buildCopyPlan,assertFresh,accessState,stable,teamKey,patchTarget} from './copy-plan.js';

const validId=v=>/^[1-9]\d*$/.test(String(v));
const teamPath=t=>`/portal/detalhesEquipeTabela.do?idEquipe=${t.teamId}&modo=EDICAO&idRegistro=${t.recordId}&idTabela=${t.tableName}`;
const companyIds=u=>ids((u.empresas||[]).map(v=>v&&typeof v==='object'?v.idEmpresa:v));
const protectedFields=['idUsuario','nomeLogin','nome','sobrenome','email','cgccpf','idTipo','descricao','idDepartamento','ativo'];
function assertIdentity(before,after){for(const key of protectedFields)if(Object.prototype.hasOwnProperty.call(before,key)&&stable(before[key])!==stable(after[key]))throw new Error(`O campo ${key} do destino mudou fora do escopo da cópia. Confira o cadastro.`);}
export function createCopyClient(deps={}) {
  const get=deps.request||request,write=deps.write||accessWrite,getUser=deps.readUser||readUser,getPortal=deps.readAuditUser||readAuditUser;
  const parseTeam=deps.parseTeam||((source,team)=>readTeamDocument(new DOMParser().parseFromString(source,'text/html'),team));
  const json=async(path,options)=>{const result=await get(path,options);if(result.json===null)throw new Error('A consulta de acesso não retornou JSON.');return result.json;};
  async function loadTeam(team,options){const {source}=await get(teamPath(team),options);return {...team,...parseTeam(source,team)};}
  async function catalog(companyList,options) {
    const groups=TEAM_GROUPS.filter(g=>g.companyId===null||companyList.includes(String(g.companyId))),known=new Map();
    if(companyList.some(id=>!groups.some(g=>String(g.companyId)===id)))throw new Error('Há lojas sem área de equipes configurada nesta extensão. Nenhuma cópia foi iniciada.');
    for(const g of groups)for(const [teamId,teamName] of g.teams)known.set(String(teamId),{teamId,teamName,recordId:g.recordId,tableName:g.tableName||'AREA',companyId:g.companyId,company:g.label});
    for(const g of groups.filter(g=>g.companyId!==null)){
      const list=await json(`/api/empresa/${g.companyId}/equipe`,options);if(!Array.isArray(list))throw new Error('Catálogo de equipes incompleto.');
      for(const row of list){
        if(!validId(row.idEquipe))throw new Error('Equipe sem ID no catálogo.');
        const teamId=Number(row.idEquipe),old=known.get(String(teamId)),recordId=Number(row.idRegistro??g.recordId),tableName=String(row.idTabela||'AREA').toUpperCase();
        if(old&&old.companyId!==g.companyId)throw new Error('Uma equipe foi retornada em áreas diferentes.');
        if(recordId!==g.recordId||tableName!=='AREA')throw new Error('Uma equipe nova exige conferência da área antes da cópia.');
        known.set(String(teamId),{teamId,teamName:row.descricaoEquipe||row.descricao||old?.teamName||`Equipe ${teamId}`,recordId,tableName,companyId:g.companyId,company:g.label});
      }
    }
    return [...known.values()].sort((a,b)=>teamKey(a).localeCompare(teamKey(b)));
  }
  async function snapshots(sourceId,targetId,options={},onProgress=()=>{}) {
    if(!validId(sourceId)||!validId(targetId)||String(sourceId)===String(targetId))throw new Error('Escolha dois IDs de usuário diferentes.');
    onProgress('Lendo referência e destino…');
    const [a,b,pa,pb]=await Promise.all([getUser(sourceId,options),getUser(targetId,options),getPortal(sourceId,{...options,includeCompanies:false}),getPortal(targetId,{...options,includeCompanies:false})]);
    if(String(a.idUsuario)!==String(sourceId)||String(b.idUsuario)!==String(targetId)||String(pa.idUsuario)!==String(sourceId)||String(pb.idUsuario)!==String(targetId))throw new Error('Identidade do cadastro não confirmada.');
    a.empresas=companyIds(a).map(Number);b.empresas=companyIds(b).map(Number);
    const source={user:a,portal:{...pa,idGrupo:a.idGrupo,empresas:a.empresas},teams:[]},target={user:b,portal:{...pb,idGrupo:b.idGrupo,empresas:b.empresas},teams:[]};
    const scopes={companies:true,profile:true,permissions:true,teams:true,...options.scopes};
    if(scopes.companies||scopes.teams){
      const authorized=await json('/api/sessao/usuario/empresa',options);
      if(!Array.isArray(authorized))throw new Error('Lojas autorizadas da sessão não confirmadas.');
      const available=new Set(authorized.map(c=>String(c.idEmpresa)));
      if([...companyIds(a),...companyIds(b)].some(id=>!available.has(id)))throw new Error('A sessão não tem acesso a todas as lojas envolvidas.');
    }
    if(scopes.profile){const groups=await json('/api/grupo',options);if(!Array.isArray(groups)||!groups.some(g=>String(g.idGrupo)===String(a.idGrupo)&&g.ativo!==false))throw new Error('O perfil da referência não está disponível ou ativo nesta sessão.');}
    if(scopes.teams){
      const teams=await catalog(ids([...a.empresas,...b.empresas]),options);
      const loaded=[];let next=0,done=0;
      async function worker(){while(next<teams.length){const t=teams[next++];loaded.push(await loadTeam(t,options));onProgress(`Conferindo equipes ${++done}/${teams.length}…`);}}
      await Promise.all(Array.from({length:Math.min(3,teams.length)},worker));
      loaded.sort((a,b)=>teamKey(a).localeCompare(teamKey(b)));
      source.teams=loaded;target.teams=loaded;
      // O serviço nativo de equipes do usuário ajuda a detectar vínculos fora do catálogo conferido.
      for(const id of [sourceId,targetId]){const membership=await json(`/api/usuario/${id}/equipe`,options);if(!Array.isArray(membership)||membership.some(t=>!validId(t.idEquipe)||!loaded.some(l=>String(l.teamId)===String(t.idEquipe))))throw new Error('Há vínculo de equipe fora do catálogo validado ou a lista veio incompleta.');}
    }
    return {source,target};
  }
  async function removalCheck(targetId,removed,{allowPlannedTeams=false,...options}={}) {
    if(!removed.length)return;
    const data=await json(`/portal/ajax.do?tipoObjeto=PERMITE_RETIRAR_EMPRESA_USUARIO&idUsuario=${targetId}`,options);
    const keys=['listaEventos','listaTipoEventos','listaAreasGerente','listaEquipes','listaAgendas','listaEquipesVisualizacao'];
    for(const key of keys){if(!Array.isArray(data?.[key]))throw new Error('A validação de retirada de lojas está incompleta. Use o modo Somar ou confira o cadastro no Syonet.');
      if(allowPlannedTeams&&['listaEquipes','listaEquipesVisualizacao'].includes(key))continue;
      if(data[key].some(row=>!validId(row.empresa)||removed.includes(String(row.empresa))))throw new Error(`Retirada de loja bloqueada: há dependências em ${key}.`);
    }
  }
  async function prepare(sourceId,targetId,options,onProgress) {
    const snapshotsResult=await snapshots(sourceId,targetId,options,onProgress),plan=buildCopyPlan(snapshotsResult.source,snapshotsResult.target,options);
    await removalCheck(targetId,plan.removedCompanies,{...options,allowPlannedTeams:true});
    return plan;
  }
  async function applyInternal(plan,confirmation,{onProgress=()=>{},onReport=()=>{}}={}) {
    if(confirmation.trim()!==plan.confirmation)throw new Error(`Digite ${plan.confirmation} para confirmar o destino.`);
    const report={version:1,startedAt:new Date().toISOString(),source:plan.source,target:plan.target,scopes:plan.scopes,mode:plan.mode,before:plan.before,reference:plan.reference,steps:[],ok:false,warnings:[]};
    let originalCompany=null,selectedCompany=null,stage='Revalidação',attempted=false;
    const record=(name,status,details='')=>{report.steps.push({name,status,details,at:new Date().toISOString()});onReport(report);};
    const mutate=async(op,id,body,name)=>{stage=name;attempted=true;record(name,'ENVIANDO');await write(op,id,body);record(name,'RECEBIDO_AGUARDANDO_VERIFICACAO');};
    try{
      const fresh=await snapshots(plan.source.id,plan.target.id,{scopes:plan.scopes,mode:plan.mode},onProgress);assertFresh(plan,fresh.source,fresh.target);
      // Recalcula os alvos antes de confiar no plano guardado na interface.
      const rebuilt=buildCopyPlan(fresh.source,fresh.target,{scopes:plan.scopes,mode:plan.mode});
      if(stable(rebuilt.expected)!==stable(plan.expected)||stable(rebuilt.teamChanges)!==stable(plan.teamChanges))throw new Error('A prévia não corresponde mais aos alvos atuais. Prepare novamente.');
      await removalCheck(plan.target.id,plan.removedCompanies,{allowPlannedTeams:true});
      if(plan.teamChanges.length){const session=await json('/api/sessao/empresa');if(!validId(session.idEmpresa))throw new Error('Não foi possível guardar a empresa atual da sessão.');originalCompany=selectedCompany=String(session.idEmpresa);}
      const expanded=ids([...plan.before.companies,...plan.expected.companies]);
      if(plan.profileChange||!sameIds(expanded,plan.before.companies)){
        onProgress('Aplicando perfil e inclusão de lojas…');
        const current=await getUser(plan.target.id);await mutate('profile',plan.target.id,patchTarget(current,plan,expanded),'Perfil e inclusão de lojas');
        const after=await getUser(plan.target.id);
        assertIdentity(current,after);
        if(after.nomeLogin!==plan.target.login||after.ativo!==true||String(after.idGrupo)!==plan.expected.group||!sameIds(companyIds(after),expanded))throw new Error('Perfil ou lojas não foram confirmados após a gravação.');record(stage,'VERIFICADO');
      }
      if(plan.scopes.permissions){
        for(const area of ['2','3','4']){
          const live=await getPortal(plan.target.id,{includeCompanies:false}),expected=plan.expected.controls.filter(c=>c.area===area),actual=new Map(live.controlesPermissao?.map(c=>[c.name,c])||[]);
          if(expected.every(c=>actual.get(c.name)?.checked===c.checked))continue;
          if(live.controlesPermissao?.length!==plan.expected.controls.length||plan.expected.controls.some(c=>!actual.has(c.name))||expected.some(c=>actual.get(c.name).disabled))throw new Error('Os controles editáveis de permissão mudaram.');
          const body=new URLSearchParams({modo:'APLICAR_PERMISSOES',acao:'',abaAtiva:'4',idUsuario:plan.target.id,'usuarioValue.idUsuario':plan.target.id,idTipoObjeto:area});
          for(const c of live.controlesPermissao){const desired=plan.expected.controls.find(v=>v.name===c.name);if(!c.disabled&&(c.area===area?desired?.checked:c.checked))body.append(c.name,'on');}
          const areaLabel={'2':'Menu','3':'Interface','4':'Relatórios'}[area];
          onProgress(`Aplicando permissões de ${areaLabel}…`);await mutate('permissions',plan.target.id,body,`Permissões de ${areaLabel}`);
          const after=await getPortal(plan.target.id,{includeCompanies:false}),states=new Map(after.controlesPermissao?.map(c=>[c.name,c.checked])||[]);
          if(expected.some(c=>states.get(c.name)!==c.checked))throw new Error('A releitura não confirmou os controles de permissão.');record(stage,'VERIFICADO');
        }
      }
      for(const [index,change] of plan.teamChanges.entries()){
        onProgress(`Aplicando equipes ${index+1}/${plan.teamChanges.length}…`);
        if(change.companyId!=null&&String(change.companyId)!==selectedCompany){
          selectedCompany=String(change.companyId);
          await mutate('session',String(change.companyId),{idEmpresa:change.companyId},'Seleção temporária da empresa');
          const current=await json('/api/sessao/empresa');if(String(current.idEmpresa)!==String(change.companyId))throw new Error('A empresa da sessão não foi confirmada.');selectedCompany=String(change.companyId);record(stage,'VERIFICADO');
        }
        const current=await loadTeam(change),dest=plan.target.id,ref=plan.source.id;
        if(current.members.includes(dest)!==change.before.member||current.viewers.includes(dest)!==change.before.viewer)throw new Error('O vínculo do destino mudou durante a cópia.');
        const originalSource=fresh.source.teams.find(t=>teamKey(t)===teamKey(change));
        if(current.members.includes(ref)!==originalSource.members.includes(ref)||current.viewers.includes(ref)!==originalSource.viewers.includes(ref))throw new Error('A participação da referência mudou durante a cópia.');
        if((change.after.member&&!change.before.member||change.after.viewer&&!change.before.viewer)&&!current.available.includes(dest))throw new Error('O destino não está disponível para inclusão na equipe.');
        const {body,members,viewers}=teamBody(current,change,dest,change.after);await mutate('team',String(change.teamId),body,`Equipe ${change.teamName}`);
        const verified=await loadTeam(change);if(!sameIds(verified.members,members)||!sameIds(verified.viewers,viewers))throw new Error('O Syonet não confirmou a equipe ou houve diferença nos demais participantes.');record(stage,'VERIFICADO');
      }
      if(plan.removedCompanies.length){
        await removalCheck(plan.target.id,plan.removedCompanies);onProgress('Conferindo e retirando lojas adicionais…');
        await mutate('profile',plan.target.id,patchTarget(await getUser(plan.target.id),plan),'Retirada de lojas adicionais');
      }
      stage='Verificação final';onProgress('Relendo todos os acessos do destino…');
      const final=await snapshots(plan.source.id,plan.target.id,{scopes:plan.scopes,mode:plan.mode},onProgress),actual=accessState(final.target);
      assertIdentity(fresh.target.user,final.target.user);
      if(actual.login!==plan.target.login||actual.active!==true||actual.group!==plan.expected.group||!sameIds(actual.companies,plan.expected.companies)||actual.defaultCompany!==plan.expected.defaultCompany)throw new Error('O perfil ou as lojas finais não correspondem à prévia.');
      if(plan.removedCompanies.length)record('Retirada de lojas adicionais','VERIFICADO');
      if(plan.scopes.permissions&&stable(actual.permissions)!==stable(plan.expected.permissions))throw new Error('A matriz final de permissões não corresponde à referência.');
      if(plan.scopes.teams)for(const t of actual.teams){const ref=plan.reference.teams.find(v=>v.key===t.key),old=plan.before.teams.find(v=>v.key===t.key);if(!ref||!old)throw new Error('O catálogo mudou durante a cópia.');const expected=plan.mode==='mirror'?ref:{member:ref.member||old.member,viewer:ref.viewer||old.viewer};if(t.member!==expected.member||t.viewer!==expected.viewer)throw new Error('A participação final em equipes não corresponde à prévia.');}
      report.after=actual;report.ok=true;record(stage,'VERIFICADO');
    }catch(error){report.error=error.message;report.stage=stage;report.partial=attempted;record(stage,attempted?'INTERROMPIDO_CONFERIR_ESTADO':'BLOQUEADO_ANTES_DE_GRAVAR',error.message);}
    finally{
      if(originalCompany&&selectedCompany!==originalCompany){try{const session=await json('/api/sessao/empresa');if(String(session.idEmpresa)!==originalCompany){if(String(session.idEmpresa)!==selectedCompany)throw new Error('A empresa da sessão mudou em outra aba; a restauração automática foi suspensa.');await write('session',originalCompany,{idEmpresa:Number(originalCompany)});const restored=await json('/api/sessao/empresa');if(String(restored.idEmpresa)!==originalCompany)throw new Error('Empresa original não confirmada.');}record('Restaurar empresa da sessão','VERIFICADO');}catch(error){report.warnings.push(error.message);}}
      report.finishedAt=new Date().toISOString();onReport(report);
    }
    return report;
  }
  async function apply(plan,confirmation,options){
    if(!globalThis.navigator?.locks)return applyInternal(plan,confirmation,options);
    return navigator.locks.request('syonet-access-copy',{ifAvailable:true},lock=>{if(!lock)throw new Error('Outra cópia está em andamento em uma aba desta extensão. Aguarde o relatório dessa cópia.');return applyInternal(plan,confirmation,options);});
  }
  return {prepare,apply,snapshots};
}
export const copyClient=createCopyClient();
