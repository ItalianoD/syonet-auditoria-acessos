import {ORIGIN} from '../config.js';
import {arrayFrom,normalizeUser} from './data.js';
import {parsePortalHTML} from './portal.js';
import {createDirectoryClient} from './directory.js';
import {sessionFetch} from './session-fetch.js';

export function safePath(path) {
  if(typeof path!=='string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n#]/.test(path)) throw new Error('Use um caminho relativo do Syonet, começando com /.');
  const url=new URL(path,ORIGIN);
  if(url.origin!==ORIGIN || !/^\/(api|portal)\//.test(url.pathname)) throw new Error('A consulta deve permanecer no Syonet.');
  if(/(?:salvar|save|excluir|delete|remover|inativar|desativar|logout|logoff|validarlogon|acessasistema)/i.test(url.pathname+url.search)) throw new Error('Rota de alteração ou autenticação não aceita para consulta.');
  for(const [key,value] of url.searchParams) {
    if(/^(acao|action|operacao|operation)$/i.test(key)&&value)throw new Error('A consulta não aceita parâmetros de ação.');
    if(/^(modo|mode)$/i.test(key)&&value&&!/^(EDICAO|CONSULTA|VISUALIZAR)$/i.test(value))throw new Error('Modo de consulta não reconhecido.');
  }
  return url.href;
}
export async function request(path,{signal,fetcher=sessionFetch}={}) {
  const controller=new AbortController();
  if(signal?.aborted) throw new DOMException('Consulta cancelada.','AbortError');
  const abort=()=>controller.abort(); signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,25000);
  try {
    const response=await fetcher(safePath(path),{method:'GET',credentials:'include',cache:'no-store',redirect:'manual',signal:controller.signal,
      headers:{Accept:path.startsWith('/api/')||path.startsWith('/portal/ajax.do')?'application/json':'text/html','Custom-Charset-Response':'UTF-8',...(path.startsWith('/portal/ajax.do')?{'X-Requested-With':'XMLHttpRequest'}:{})}});
    if(response.type==='opaqueredirect' || [301,302,303,307,308,401].includes(response.status)) throw new Error('Sessão expirada. Entre no Syonet em outra aba deste navegador.');
    if(!response.ok) throw Object.assign(new Error(`Syonet respondeu HTTP ${response.status} em ${path}. Verifique a sessão na aba do Syonet e o acesso à tela.`),{status:response.status,path});
    const source=await response.text();
    if(/modulo=login|validarLogonUsuario|name\s*=\s*["'](?:senha|password)["']/i.test(source)) throw new Error('Sessão expirada. Entre no Syonet em outra aba deste navegador.');
    let json=null; try {json=JSON.parse(source);} catch { /* HTML do portal */ }
    if(json?.erro || json?.error) throw new Error('O Syonet recusou a consulta. Verifique a sessão e as permissões.');
    return {source,json};
  } catch(error) {
    if(error.name==='AbortError' && !signal?.aborted) throw new Error('O Syonet não respondeu em 25 segundos. Tente novamente.');
    throw error;
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export async function readUser(id,options) {
  if(!/^\d+$/.test(String(id)) || Number(id)<=0) throw new Error('ID de usuário inválido.');
  const {json}=await request(`/api/usuario/${id}`,options);
  if(!json || String(json.idUsuario)!==String(id)) throw new Error(`O cadastro retornado não corresponde ao ID ${id}.`);
  return json;
}
export async function readAuditUser(id,options) {
  if(!/^\d+$/.test(String(id)) || Number(id)<=0) throw new Error('ID de usuário inválido.');
  const {source}=await request(`/portal/usuario.do?modo=EDICAO&idUsuario=${id}`,options);
  const profile=parsePortalHTML(source,id,{includePermissions:options?.includePermissions!==false});
  // As lojas são obtidas na API de cadastro quando a seleção HTML não estiver disponível.
  if(options?.includeCompanies!==false)try {const api=await readUser(id,options);for(const [key,value] of Object.entries(api))if(value!==null&&value!==undefined&&value!==''&&!['ultimoLogin','permissoes','controlesPermissao','evidencia'].includes(key))profile[key]=value;} catch(error) {if(options?.signal?.aborted || /Sessão expirada/.test(error.message)) throw error;profile.evidencia.avisoCadastro='Nome, lojas e dados complementares da API indisponíveis.';}
  return profile;
}
export async function searchUsers(query,options) {
  const q=query.trim(); if(!/^\d+$/.test(q)&&q.length<2) throw new Error('Digite pelo menos 2 caracteres ou um ID.');
  if(/^\d+$/.test(q)) return [normalizeUser(await readAuditUser(q,options))];
  const {records,coverage}=await directoryClient.directory(options);
  if(coverage.some(c=>!c.ok))throw new Error('A busca não alcançou todas as lojas. Use Consultar todas as lojas para conferir as falhas.');
  let next=0;
  async function hydrate(){while(next<records.length){const index=next++,row=records[index];records[index]={...row,...await readUser(row.idUsuario,options)};}}
  await Promise.all(Array.from({length:Math.min(3,records.length)},hydrate));
  const fold=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const matches=records.filter(r=>fold(`${normalizeUser(r).name} ${normalizeUser(r).login}`).includes(fold(q)));
  return matches.map(row=>normalizeUser(row));
}
export function directoryIds(source) {
  return [...new Set([...source.matchAll(/idUsuarios\.push\(\s*['"](\d+)['"]\s*\)/g)].map(m=>m[1]))];
}
const directoryClient=createDirectoryClient({request,readUser,readAuditUser});
export const scanDirectory=options=>directoryClient.scan(options);
export async function readList(path,listPath,options) {
  const {json}=await request(path,options); if(json===null) throw new Error('A rota retornou HTML. Informe uma consulta JSON ou importe um arquivo.');
  return {rows:arrayFrom(json,listPath),envelope:json};
}
