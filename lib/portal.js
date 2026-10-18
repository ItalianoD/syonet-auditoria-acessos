import {parseDate} from './data.js';
import {permissionControls} from './native-forms.js';

export function decodeLiteral(value) {
  return value.replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\([\\'"nrt])/gi,(_,u,x,c)=>u?String.fromCharCode(parseInt(u,16)):x?String.fromCharCode(parseInt(x,16)):({n:'\n',r:'\r',t:'\t'}[c]??c));
}
// Apenas leitura de literais. Nunca executa scripts obtidos do portal.
export function pushed(source,name) {
  const pattern=new RegExp('\\b'+name+'\\.push\\(\\s*([\'\"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1\\s*\\)','g');
  return [...source.matchAll(pattern)].map(m=>decodeLiteral(m[2]));
}
export function parsePortalPermissions(doc) {
  const source=[...doc.querySelectorAll('script:not([src])')].map(el=>el.textContent).join('\n');
  const ids=pushed(source,'idObjeto'),bits=pushed(source,'permissaoObjeto'),descriptions=new Map();
  for(const [idsName,descName] of [['idObjetosMenus','descObjetosMenus'],['idObjetosInterface','descObjetosInterface'],['idObjetosRelatorio','descObjetosRelatorio']]) {
    const codes=pushed(source,idsName),labels=pushed(source,descName);codes.forEach((id,i)=>descriptions.set(id,labels[i]||id));
  }
  if(!ids.length || ids.length!==bits.length || bits.some(v=>!/^[01]{4}$/.test(v)) || new Set(ids).size!==ids.length) throw new Error('Matriz de permissões ausente ou inconsistente no cadastro.');
  const permissions=[];
  ids.forEach((id,i)=>{
    const category=id.startsWith('M_')?'Menu':id.startsWith('B_')?'Interface':id.startsWith('R_')?'Relatório':'Objeto';
    ['Visualizar','Incluir','Alterar','Excluir'].forEach((action,j)=>permissions.push({codigo:`${id}:${action}`,categoria:category,descricao:`${descriptions.get(id)||id} · ${action}`,escopo:'Cadastro do usuário',permitido:bits[i][j]==='1'}));
  });
  return permissions;
}
export function parsePortalDocument(doc,expectedId,{includePermissions=true}={}) {
  const field=name=>doc.querySelector(`input[name="${name}"],select[name="${name}"]`);
  const value=name=>field(name)?.value;
  const scriptSource=[...doc.querySelectorAll('script:not([src])')].map(el=>el.textContent).join('\n');
  const declaredId=scriptSource.match(/\bvar\s+idUsuario\s*=\s*['"](\d+)['"]\s*;/)?.[1];
  const actual=value('usuarioValue.idUsuario')||value('idUsuario')||declaredId;
  if(declaredId && actual && String(declaredId)!==String(actual))throw new Error('O ID declarado na página diverge do formulário.');
  if(String(actual)!==String(expectedId)) throw new Error('O cadastro HTML retornado não corresponde ao usuário solicitado.');
  const history=doc.querySelector('#popup-log-acessos');
  const dates=history?[...history.querySelectorAll('tr')].map(tr=>parseDate(tr.querySelectorAll('td')[1]?.textContent.trim())).filter(Boolean):[];
  dates.sort((a,b)=>b-a);
  let permissions; let permissionError='';if(includePermissions)try {permissions=parsePortalPermissions(doc);}catch(error){permissionError=error.message;}
  const active=field('usuarioValue.ativo');
  const companies=doc.querySelector('select[name="m2"],select[name="empresasSelecionadas"],select[name="empresasUsuario"]');
  return {idUsuario:Number(actual),nome:value('usuarioValue.nome')||'',sobrenome:value('usuarioValue.sobrenome')||'',nomeLogin:value('usuarioValue.nomeLogin')||'',
    ativo:active?.type==='checkbox'?active.checked:undefined,idGrupo:value('usuarioValue.idGrupo')||value('idGrupo')||'',
    ...(companies?{empresas:[...companies.options].map(o=>o.value).filter(Boolean)}:{}),
    ultimoLogin:dates[0]?.toISOString()??null,permissoes:permissions,controlesPermissao:includePermissions?permissionControls(doc):undefined,
    evidencia:{fonte:'Cadastro e Histórico de Acessos do Syonet',historicoDisponivel:!!history,registrosDeAcesso:dates.length,erroPermissoes:permissionError}};
}
export function parsePortalHTML(source,id,options={},Parser=DOMParser) {return parsePortalDocument(new Parser().parseFromString(source,'text/html'),id,options);}
export function parseListDocument(doc) {
  return [...new Set([...doc.querySelectorAll('[onclick]')].map(el=>el.getAttribute('onclick')?.match(/\beditar\(['"](\d+)['"]\)/)?.[1]).filter(Boolean))];
}
