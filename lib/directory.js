import {arrayFrom,normalizeUser,USER_FIELDS} from './data.js';
const validId=v=>/^[1-9]\d*$/.test(String(v));
const abort=signal=>{if(signal?.aborted)throw new DOMException('Cancelado','AbortError');};
const fatal=(error,signal)=>signal?.aborted||/Sessão expirada/.test(error.message);
export const companyIds=values=>[...new Set((Array.isArray(values)?values:values==null?[]:[values]).map(v=>String(v&&typeof v==='object'?v.idEmpresa:v)).filter(validId))].sort((a,b)=>Number(a)-Number(b));
export const companyLabel=c=>String(c.nomeFantasia||c.nomeEmpresa||c.descricaoEmpresa||c.descricao||c.razaoSocial||c.nome||`Loja ${c.idEmpresa}`);
// O mesmo serviço usado pela tela nova do Syonet, consultado loja por loja.
// Não usa a lista lateral, o filtro Ativos ou a empresa atual da sessão.
export function createDirectoryClient({request,readUser,readAuditUser}) {
  async function directory({signal,onProgress=()=>{}}={}) {
    const {json:available}=await request('/api/sessao/usuario/empresa',{signal});
    if(!Array.isArray(available)||!available.length||available.some(c=>!validId(c.idEmpresa)))throw new Error('Não foi possível confirmar todas as lojas autorizadas da sessão.');
    const companies=[...new Map(available.map(c=>[String(c.idEmpresa),c])).values()],coverage=[],records=new Map();
    for(const [index,company] of companies.entries()){
      abort(signal);const id=String(company.idEmpresa),entry={id,name:companyLabel(company),count:0,ok:false,error:''};
      try{
        const {json}=await request(`/api/usuario?idEmpresa=${id}`,{signal});
        const rows=arrayFrom(json);
        // Nunca chamar uma página isolada de consulta completa.
        if(!Array.isArray(json)&&(json.last===false||json.hasNext===true||Number(json.totalPages)>1||Number(json.totalElements??json.total)>rows.length))throw new Error('A lista retornou paginação inesperada; cobertura não confirmada.');
        if(rows.some(row=>!validId(row.idUsuario)))throw new Error('A loja retornou um cadastro sem ID válido.');
        for(const row of rows){const key=String(row.idUsuario),old=records.get(key)||{idUsuario:Number(key),_lojasConsultadas:[]};records.set(key,{...old,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),_lojasConsultadas:companyIds([...old._lojasConsultadas,id])});}
        entry.count=new Set(rows.map(r=>String(r.idUsuario))).size;entry.ok=true;
      }catch(error){if(fatal(error,signal))throw error;entry.error=error.message;}
      coverage.push(entry);onProgress(index+1,companies.length,'lojas');
    }
    if(!coverage.some(c=>c.ok))throw Object.assign(new Error('Nenhuma loja pôde ser consultada. '+coverage[0].error),{coverage});
    return {records:[...records.values()],coverage};
  }
  async function scan(options={}) {
    const {signal,onProgress=()=>{}}=options,{records,coverage}=await directory(options),users=[],failures=[];let next=0,done=0;
    async function worker(){while(next<records.length){
      abort(signal);const seed=records[next++];let raw={...seed},id=String(raw.idUsuario),errors=[];
      try{const profile=await readUser(id,{signal});raw={...raw,...profile};}catch(error){if(fatal(error,signal))throw error;errors.push('Cadastro: '+error.message);}
      for(const key of USER_FIELDS.last)delete raw[key];
      // Uma falha de histórico não elimina o cadastro da contagem.
      try{
        const portal=await readAuditUser(id,{signal,includePermissions:false,includeCompanies:false});
        for(const key of ['nome','sobrenome','nomeLogin'])if(!raw[key]&&portal[key])raw[key]=portal[key];
        raw.ultimoLogin=portal.ultimoLogin;raw.evidencia=portal.evidencia;
        if(!portal.evidencia?.historicoDisponivel)errors.push('Histórico de acessos indisponível.');
      }catch(error){if(fatal(error,signal))throw error;raw.ultimoLogin=null;raw.evidencia={historicoDisponivel:false};errors.push('Histórico: '+error.message);}
      raw._lojasConsultadas=seed._lojasConsultadas;
      const known=companyIds(raw.empresas??raw.idEmpresa),all=companyIds([...known,...raw._lojasConsultadas]);
      raw._lojasNomes=all.map(companyId=>coverage.find(c=>c.id===companyId)?.name||`Loja ${companyId}`).join(' · ');
      if(!normalizeUser(raw).login||normalizeUser(raw).name==='Nome não informado')errors.push('Nome completo ou login indisponível no cadastro.');
      raw._avisosConsulta=errors;users.push(normalizeUser(raw));if(errors.length)failures.push({id,error:errors.join(' ')});
      onProgress(++done,records.length,'usuários');
    }}
    await Promise.all(Array.from({length:Math.min(3,records.length)},worker));
    users.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.login.localeCompare(b.login,'pt-BR'));
    const completed=coverage.filter(c=>c.ok).length;
    return {users,failures,total:records.length,coverage,scope:`Todas as lojas autorizadas: ${completed}/${coverage.length} consultadas. Usuários ativos e inativos, sem duplicação por ID. ${failures.length} cadastros com avisos; falhas de histórico permanecem na lista.`};
  }
  return {directory,scan};
}
