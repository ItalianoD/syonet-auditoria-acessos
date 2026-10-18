import {at,bool,text} from './data.js';
// Uma permissão precisa de código estável e estado explícito. Ausência é desconhecida.
export function permissionRows(raw, path='permissoes') {
  const source=at(raw,path);
  if(source===undefined || source===null) return {available:false,entries:[],warnings:['Lista detalhada de permissões não informada.']};
  let rows;
  if(Array.isArray(source)) rows=source;
  else if(typeof source==='object') rows=Object.entries(source).map(([codigo,permitido])=>({codigo,permitido}));
  else return {available:false,entries:[],warnings:['Formato das permissões não reconhecido.']};
  const entries=[], warnings=[], keys=new Set(), ambiguous=new Set();
  for(const r of rows) {
    if(!r || typeof r!=='object' || Array.isArray(r)) {warnings.push('Permissão sem código e estado explícitos.');continue;}
    const id=text(r.codigo ?? r.idPermissao ?? r.id), category=text(r.categoria ?? r.category ?? 'Geral');
    const scope=text(r.escopo ?? r.idEmpresa ?? '*'), state=bool(r.permitido ?? r.habilitado ?? r.enabled ?? r.allow);
    if(!id || state===null) {warnings.push('Permissão com código ou estado ausente/inválido.');continue;}
    const key=JSON.stringify([category,id,scope]);
    if(keys.has(key)) {warnings.push(`Código duplicado: ${id} (${scope}).`);ambiguous.add(key);continue;}
    keys.add(key); entries.push({key,id,category,scope,label:text(r.descricao ?? r.nome ?? r.name ?? id),state});
  }
  return {available:warnings.length===0,entries:entries.filter(e=>!ambiguous.has(e.key)),warnings};
}
function companySet(value) {
  if(value===undefined || value===null || value==='') return null;
  const values=Array.isArray(value)?value:typeof value==='string'?value.split(/[,;|]/):[value];
  return new Set(values.map(v=>text(typeof v==='object'?v.idEmpresa??v.id:v).trim()).filter(Boolean));
}
export function compareUsers(a,b,path='permissoes') {
  if((a.id && a.id===b.id) || (!a.id && !b.id && a.login===b.login)) throw new Error('Escolha dois usuários diferentes.');
  const pa=permissionRows(a.raw,path), pb=permissionRows(b.raw,path), ma=new Map(pa.entries.map(p=>[p.key,p])), mb=new Map(pb.entries.map(p=>[p.key,p]));
  const rows=[];
  for(const key of new Set([...ma.keys(),...mb.keys()])) {
    const x=ma.get(key),y=mb.get(key),p=x??y;
    const status=!x || !y?'Não confirmado':x.state===y.state?'Igual':x.state?'Somente A':'Somente B';
    rows.push({...p,a:x?.state??null,b:y?.state??null,status});
  }
  const ca=companySet(a.companies), cb=companySet(b.companies);
  const onlyA=ca&&cb?[...ca].filter(v=>!cb.has(v)):[], onlyB=ca&&cb?[...cb].filter(v=>!ca.has(v)):[];
  return {a:{id:a.id,name:a.name,group:a.group},b:{id:b.id,name:b.name,group:b.group},rows,
    onlyA,onlyB,companiesKnown:ca!==null&&cb!==null,
    complete:pa.available&&pb.available&&rows.every(r=>r.status!=='Não confirmado'),
    warnings:[...new Set([...pa.warnings,...pb.warnings])],
    groupKnown:!!a.group&&!!b.group,groupEqual:!!a.group&&!!b.group&&a.group===b.group};
}
