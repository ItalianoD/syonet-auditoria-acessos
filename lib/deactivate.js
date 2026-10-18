import {request,readUser,readAuditUser} from './api.js';
import {accessWrite} from './access-write.js';
import {normalizeUser,inactivity} from './data.js';
import {companyIds} from './directory.js';
import {stable} from './copy-plan.js';
const checks={listaEventos:'eventos/leads',listaTipoEventos:'distribuição de tipos de evento',listaAreasGerente:'responsabilidade por áreas',listaAgendas:'agendas',listaEquipes:'equipes',listaEquipesVisualizacao:'visualização de equipes'};
export function createDeactivateClient(deps={}){
  const get=deps.request||request,user=deps.readUser||readUser,portal=deps.readAuditUser||readAuditUser,write=deps.write||accessWrite,now=deps.now||(()=>new Date());
  const issued=new WeakMap(),consumed=new WeakSet();
  const json=async(path,options)=>{const r=await get(path,options);if(r.json===null)throw new Error('Consulta de segurança não retornou JSON.');return r.json;};
  async function inspect(id,days,options={}){
    if(!/^[1-9]\d*$/.test(String(id)))throw new Error('ID de usuário inválido.');
    const [profile,history,session,companies,dependencies]=await Promise.all([
      user(id,options),portal(id,{...options,includePermissions:false,includeCompanies:false}),json('/api/sessao/usuario',options),json('/api/sessao/usuario/empresa',options),json(`/portal/ajax.do?tipoObjeto=PERMITE_RETIRAR_EMPRESA_USUARIO&idUsuario=${id}`,options)
    ]);
    if(String(profile.idUsuario)!==String(id)||String(history.idUsuario)!==String(id))throw new Error('Identidade do cadastro não confirmada.');
    if(!session?.idUsuario)throw new Error('Não foi possível identificar o usuário da sessão.');
    if(String(session.idUsuario)===String(id))throw new Error('Não é permitido inativar o usuário da própria sessão.');
    if(profile.ativo!==true)throw new Error('A conta não está confirmada como ativa. Consulte novamente.');
    const target=normalizeUser(profile);
    if(!target.login||target.name==='Nome não informado')throw new Error('Nome completo e login precisam estar confirmados antes da inativação.');
    if(!Array.isArray(profile.empresas)||!profile.empresas.length||!Array.isArray(companies))throw new Error('Lojas do usuário não confirmadas.');
    const assigned=companyIds(profile.empresas),authorized=companyIds(companies);
    if(!assigned.length||assigned.some(c=>!authorized.includes(c)))throw new Error('A sessão precisa ter acesso a todas as lojas do usuário para inativá-lo.');
    if(!history.evidencia?.historicoDisponivel)throw new Error('Histórico indisponível. A inativação exige um último acesso confirmado.');
    const activity=inactivity([{...target,lastLogin:history.ultimoLogin}],Number(days),now())[0];
    if(!activity.review)throw new Error('O último acesso não confirma inatividade acima do limite escolhido.');
    const links={};
    for(const [key,label] of Object.entries(checks)){
      if(!Array.isArray(dependencies?.[key]))throw new Error(`Verificação incompleta de ${label}. Confira no Syonet antes de inativar.`);
      links[key]=dependencies[key].length;
      // Inativar o cadastro preserva seus acessos e vínculos. Pendências operacionais
      // exigem tratamento no próprio Syonet, antes de desligar o acesso.
      if(!['listaEquipes','listaEquipesVisualizacao'].includes(key)&&dependencies[key].length)throw new Error(`Inativação bloqueada: há pendências de ${label}. Resolva-as no Syonet e prepare novamente.`);
    }
    return {profile,history,target:{id:target.id,name:target.name,login:target.login},activity,links,assigned,sessionId:String(session.idUsuario)};
  }
  const signature=s=>stable({profile:s.profile,lastLogin:s.history.ultimoLogin,links:s.links,assigned:s.assigned,sessionId:s.sessionId});
  async function prepare(id,days,options){
    const current=await inspect(id,days,options),plan={target:current.target,days:Number(days),elapsed:current.activity.days,lastLogin:current.history.ultimoLogin,companies:current.assigned,links:current.links,createdAt:now().toISOString(),confirmation:`INATIVAR ${id}`};
    issued.set(plan,{signature:signature(current),id:String(id),days:Number(days),created:now().getTime(),confirmation:plan.confirmation});return plan;
  }
  async function applyInternal(plan,confirmation){
    const saved=issued.get(plan);
    if(!saved||consumed.has(plan))throw new Error('Prepare uma nova prévia antes de inativar.');
    if(confirmation.trim()!==saved.confirmation)throw new Error(`Digite ${saved.confirmation} para confirmar.`);
    consumed.add(plan);
    const report={target:plan.target,startedAt:now().toISOString(),ok:false,attempted:false,steps:[],note:'Somente a situação ativa do cadastro é alterada. Perfil, lojas, permissões e equipes são mantidos.'};
    try{
      if(now().getTime()-saved.created>5*60*1000)throw new Error('A prévia expirou. Prepare novamente.');
      const fresh=await inspect(saved.id,saved.days);
      if(signature(fresh)!==saved.signature)throw new Error('O cadastro, a sessão ou o último acesso mudou. Prepare novamente.');
      report.steps.push('Cadastro, último acesso, lojas e pendências relidos antes de gravar.');
      report.attempted=true;await write('deactivate',saved.id,{...fresh.profile,ativo:false});
      const after=await user(saved.id);
      if(String(after.idUsuario)!==saved.id||after.ativo!==false)throw new Error('O Syonet não confirmou a conta inativa. Reconsulte antes de tentar novamente.');
      for(const key of ['nome','sobrenome','nomeLogin','email','idGrupo','idEmpresa','empresas'])if(stable(fresh.profile[key])!==stable(after[key]))throw new Error(`A conta está inativa, mas o campo ${key} mudou durante a operação. Confira o cadastro no Syonet.`);
      report.ok=true;report.steps.push('Releitura do Syonet confirmou ativo = false.');
    }catch(error){report.error=error.message;}
    report.finishedAt=now().toISOString();return report;
  }
  async function apply(plan,confirmation){
    if(!globalThis.navigator?.locks)return applyInternal(plan,confirmation);
    return navigator.locks.request('syonet-access-copy',{ifAvailable:true},lock=>{if(!lock)throw new Error('Outra alteração de acesso está em andamento nesta extensão.');return applyInternal(plan,confirmation);});
  }
  return {prepare,apply};
}
export const deactivateClient=createDeactivateClient();
