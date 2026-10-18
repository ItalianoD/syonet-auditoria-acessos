import {ORIGIN} from '../config.js';
import {sessionFetch} from './session-fetch.js';

// Escritas ficam isoladas das consultas: cópia de acessos e inativação confirmada.
export async function accessWrite(operation,id,payload,{fetcher=sessionFetch}={}) {
  if(!/^[1-9]\d*$/.test(String(id)))throw new Error('ID de gravação inválido.');
  let path,method='POST',body,contentType;
  if(operation==='profile'||operation==='deactivate'){
    if(String(payload?.idUsuario)!==String(id))throw new Error('O payload não pertence ao destino.');
    if(operation==='deactivate'&&payload.ativo!==false)throw new Error('A operação exige situação inativa.');
    path=`/api/usuario/${id}`;method='PATCH';body=JSON.stringify(payload);contentType='application/json';
  }else if(operation==='session'){
    if(Number(payload?.idEmpresa)!==Number(id))throw new Error('Empresa de sessão inválida.');
    path='/api/sessao/empresa';body=JSON.stringify({idEmpresa:Number(id)});contentType='application/json';
  }else if(operation==='permissions'){
    if(!(payload instanceof URLSearchParams)||payload.get('idUsuario')!==String(id)||payload.get('usuarioValue.idUsuario')!==String(id)||payload.get('modo')!=='APLICAR_PERMISSOES'||!['2','3','4'].includes(payload.get('idTipoObjeto')))throw new Error('Envio de permissões inválido.');
    for(const key of payload.keys())if(!['idUsuario','usuarioValue.idUsuario','modo','acao','abaAtiva','idTipoObjeto'].includes(key)&&!/^[MBR]_.+_(visualiza|incluir|alterar|excluir)_chk$/.test(key))throw new Error('Campo inesperado no envio de permissões.');
    path='/portal/usuario.do';body=payload.toString();contentType='application/x-www-form-urlencoded; charset=UTF-8';
  }else if(operation==='team'){
    if(!(payload instanceof URLSearchParams)||payload.get('equipeValue.idEquipe')!==String(id)||payload.get('acao')!=='ALTERANDO'||payload.get('modo')!=='EDICAO')throw new Error('Envio de equipe inválido.');
    path='/portal/detalhesEquipeTabela.do';body=payload.toString();contentType='application/x-www-form-urlencoded; charset=UTF-8';
  }else throw new Error('Operação de gravação desconhecida.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetcher(ORIGIN+path,{method,credentials:'include',cache:'no-store',redirect:'manual',signal:controller.signal,headers:{'Content-Type':contentType,'Custom-Charset-Response':'UTF-8',Accept:path.startsWith('/api/')?'application/json':'text/html'},body});
    if(response.type==='opaqueredirect'||[301,302,303,307,308,401].includes(response.status))throw new Error('Sessão ou redirecionamento inesperado durante a gravação.');
    if(!response.ok)throw new Error(`Gravação recusada pelo Syonet (HTTP ${response.status}).`);
    const source=await response.text();let json=null;try{json=JSON.parse(source);}catch{}
    if(json?.erro||json?.error||/modulo=login|validarLogonUsuario/.test(source))throw new Error('O Syonet não confirmou a gravação.');
    return {status:response.status,json};
  }catch(error){if(error.name==='AbortError')throw new Error('A gravação excedeu 30 segundos. O resultado é incerto; releia o cadastro antes de tentar novamente.');throw error;}finally{clearTimeout(timer);}
}
