import {pushed} from './portal.js';

export const AREA_CODES={M:'2',B:'3',R:'4'};
export function permissionControls(doc) {
  const controls=[...doc.querySelectorAll('input[type="checkbox"][name]')].filter(el=>/^[MBR]_.+_(visualiza|incluir|alterar|excluir)_chk$/.test(el.name));
  const seen=new Set();
  return controls.map(el=>{if(seen.has(el.name))throw new Error('Controle de permissão duplicado.');seen.add(el.name);return {name:el.name,checked:el.checked,disabled:el.disabled,area:AREA_CODES[el.name[0]]};});
}
export function ids(value) {
  const values=Array.isArray(value)?value:[value];
  return [...new Set(values.flatMap(v=>String(v??'').split(',')).map(v=>v.trim()).filter(Boolean))].map(v=>{if(!/^[1-9]\d*$/.test(v))throw new Error('Lista de IDs inválida.');return v;}).sort((a,b)=>Number(a)-Number(b));
}
export const sameIds=(a,b)=>JSON.stringify(ids(a))===JSON.stringify(ids(b));
export function readTeamDocument(doc,team) {
  const form=doc.querySelector('form[name="tabelaForm"]');if(!form)throw new Error('Formulário da equipe indisponível.');
  const params=new URLSearchParams(),meta=new Map();
  for(const el of form.querySelectorAll('input[name],select[name],textarea[name]')){
    if(el.disabled||['button','submit','reset','image','file','password'].includes(el.type))continue;
    meta.set(el.name,{multiple:el.tagName==='SELECT'&&el.multiple});
    if(['checkbox','radio'].includes(el.type)&&!el.checked)continue;
    if(el.tagName==='SELECT')for(const option of el.selectedOptions)params.append(el.name,option.value);
    else params.append(el.name,el.value);
  }
  const actual=params.get('equipeValue.idEquipe')||params.get('idEquipe'),record=params.get('idRegistro')||params.get('equipeValue.idRegistro');
  if(String(actual)!==String(team.teamId)||String(record)!==String(team.recordId)||params.get('idTabela')?.toUpperCase()!==team.tableName)throw new Error('A equipe ou a área retornada diverge da solicitada.');
  const names=[...meta.keys()],resolve=(exact,re)=>names.find(n=>n===exact)||names.find(n=>re.test(n));
  const memberField=resolve('idAgentesEquipe',/agente.*equipe|equipe.*agente/i),viewerField=resolve('idUsuariosVisualizacao',/usuario.*visual|visual.*usuario/i);
  if(!memberField||!viewerField)throw new Error('Não foi possível confirmar os dois papéis da equipe.');
  const script=[...doc.querySelectorAll('script')].map(el=>el.textContent).join('\n');
  const available=ids([...pushed(script,'idUsuarios'),...[...form.querySelectorAll('option[value]')].map(el=>el.value).filter(v=>/^[1-9]\d*$/.test(v))]);
  const brand=(selectId,field)=>{const select=doc.getElementById(selectId);if(select?.options.length)params.set(field,[...select.options].map(o=>o.value).join(','));};
  brand('marcas','marcasNaoSelecionadas');brand('marcasSelecionadas','marca');
  return {params,meta,memberField,viewerField,members:ids(params.getAll(memberField)),viewers:ids(params.getAll(viewerField)),available};
}
export function teamBody(current,team,targetId,desired) {
  const body=new URLSearchParams(current.params);
  const replace=(field,before,on)=>{const after=ids([...before.filter(id=>id!==String(targetId)),...(on?[String(targetId)]:[])]);body.delete(field);if(current.meta.get(field)?.multiple){for(const id of after)body.append(field,id);if(!after.length)body.append(field,'');}else body.set(field,after.join(','));return after;};
  const members=replace(current.memberField,current.members,desired.member),viewers=replace(current.viewerField,current.viewers,desired.viewer);
  body.set('modo','EDICAO');body.set('acao','ALTERANDO');body.set('abaAtiva',body.get('abaAtiva')||'0');body.set('idEquipe',String(team.teamId));body.set('equipeValue.idEquipe',String(team.teamId));body.set('idRegistro',String(team.recordId));body.set('idTabela',team.tableName);
  return {body,members,viewers};
}
