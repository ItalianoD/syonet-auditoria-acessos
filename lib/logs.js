import {pick,text,formatDate,own} from './data.js';
const FIELDS={actor:['usuario.nome','usuario.nomeLogin','nomeUsuario','nomeLogin','usuario','idUsuario','actor'],action:['acao','operacao','action','tipoAcao'],target:['entidade','tabela','recurso','target'],company:['empresa.nome','loja.nome','nomeEmpresa','nomeLoja','idEmpresa','loja','empresa'],date:['dataHora','data','timestamp','dataAlteracao'],field:['campo','field'],before:['valorAnterior','antes','oldValue'],after:['valorNovo','depois','newValue']};
const ACTIONS={UPDATE:'alterou',ALTERACAO:'alterou','ALTERAÇÃO':'alterou',ALTERAR:'alterou',EDIT:'alterou',INSERT:'criou',CREATE:'criou',INCLUSAO:'criou','INCLUSÃO':'criou',DELETE:'excluiu',EXCLUSAO:'excluiu','EXCLUSÃO':'excluiu',LOGIN:'efetuou login',LOGOUT:'encerrou a sessão'};
const sensitive=key=>/senha|password|token|secret|cookie|authorization|cpf|cgccpf/i.test(key);
export function redact(value,depth=0) {
  if(depth>12) return '[profundidade omitida]';
  if(Array.isArray(value)) return value.map(v=>redact(v,depth+1));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive(k)?'[oculto]':redact(v,depth+1)]));
  return value;
}
export function humanizeLog(raw,index=0,mapping={}) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) return {id:index+1,phrase:'Registro sem estrutura reconhecida.',recognized:false,raw:'[formato inválido]'};
  const get=key=>pick(raw,mapping[key]?[mapping[key]]:FIELDS[key]);
  const actor=text(get('actor').value)||'Usuário não informado', action=text(get('action').value), verb=ACTIONS[action.trim().toUpperCase()];
  const target=text(get('target').value),company=text(get('company').value),date=get('date').value,field=text(get('field').value);
  const before=get('before'),after=get('after');
  const safeValue=v=>sensitive(field)?'[oculto]':text(redact(v));
  let phrase=verb?`${actor} ${verb}`:`${actor}: ação não reconhecida (${action||'não informada'})`;
  if(target) phrase+=`${!verb||['LOGIN','LOGOUT'].includes(action.trim().toUpperCase())?' em ': ' '}${target}`;
  if(company) phrase+=` na loja ${company}`;
  phrase+=date?` em ${formatDate(date)}`:' em data não informada';
  if(field) phrase+=`. Campo ${field}`;
  if(before.key) phrase+=`; de ${safeValue(before.value)}`;
  if(after.key) phrase+=` para ${safeValue(after.value)}`;
  const safeRaw=redact(raw);
  // O campo pode conter o nome do segredo, enquanto o valor está em uma chave genérica.
  if(sensitive(field)) for(const k of [before.key,after.key]) if(k && own(safeRaw,k)) safeRaw[k]='[oculto]';
  return {id:raw.idLog??raw.id??index+1,actor,action,company,date:formatDate(date),phrase:phrase+'.',recognized:!!verb,raw:safeRaw};
}
