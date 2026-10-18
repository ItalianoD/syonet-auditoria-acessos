export const own = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);
export const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export function at(obj, path) {
  if (!path) return obj;
  if (own(obj, path)) return obj[path];
  return String(path).split('.').reduce((o, key) => own(o, key) ? o[key] : undefined, obj);
}
export function pick(obj, keys) {
  for (const key of keys) { const value = at(obj, key); if (value !== undefined && value !== null && value !== '') return {key, value}; }
  return {key: '', value: undefined};
}
export function bool(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  if (['TRUE','1','SIM','S','ATIVO','ATIVA','HABILITADO','ENABLED','ALLOW','PERMITIDO'].includes(key)) return true;
  if (['FALSE','0','NAO','NÃO','N','INATIVO','INATIVA','DESABILITADO','DISABLED','DENY','NEGADO'].includes(key)) return false;
  return null;
}
// Datas sem fuso são interpretadas no fuso da operação (UTC-03:00), não no computador.
export function parseDate(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  if (typeof value === 'number' || /^\d{10}(?:\d{3})?$/.test(String(value))) {
    const number = Number(value); const d = new Date(number < 1e12 ? number * 1000 : number);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  let v = String(value).trim();
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) v = `${br[3]}-${br[2]}-${br[1]}T${br[4] || '00'}:${br[5] || '00'}:${br[6] || '00'}-03:00`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += 'T00:00:00-03:00';
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v)) v = v.replace(' ', 'T') + '-03:00';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(v)) return null;
  const [year, month, day] = v.slice(0,10).split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year,month,0)).getUTCDate()) return null;
  const d = new Date(v); return Number.isFinite(d.getTime()) ? d : null;
}
export const formatDate = value => { const date = parseDate(value); return date ? new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Araguaina',dateStyle:'short',timeStyle:'short'}).format(date) : 'Não informado'; };
export function parseCSV(source) {
  const sample = source.split(/\r?\n/)[0];
  const counts = [',',';','\t'].map(delimiter => ({delimiter, count:sample.split(delimiter).length}));
  const delimiter = counts.sort((a,b)=>b.count-a.count)[0].delimiter;
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0; i<source.length; i++) {
    const c=source[i];
    if (c === '"') { if (quoted && source[i+1] === '"') {cell += '"'; i++;} else if (quoted || !cell) quoted = !quoted; else throw new Error('Aspas inválidas no CSV.'); }
    else if (!quoted && c === delimiter) { row.push(cell); cell=''; }
    else if (!quoted && (c === '\n' || c === '\r')) { if (c==='\r' && source[i+1]==='\n') i++; row.push(cell); if(row.some(v=>v!=='')) rows.push(row); row=[]; cell=''; }
    else cell += c;
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.');
  row.push(cell); if(row.some(v=>v!=='')) rows.push(row);
  const headers = (rows.shift() || []).map(v=>v.trim());
  if (!headers.length || headers.some(v=>!v) || new Set(headers).size!==headers.length) throw new Error('CSV precisa de cabeçalhos únicos e preenchidos.');
  return rows.map((r,i)=>{ if(r.length!==headers.length) throw new Error(`Linha ${i+2}: quantidade de colunas diferente do cabeçalho.`); return Object.fromEntries(headers.map((h,j)=>[h,r[j]])); });
}
export function arrayFrom(value, path='') {
  const selected = at(value,path);
  if (Array.isArray(selected)) return selected;
  if (path) throw new Error(`O caminho ${path} não contém uma lista.`);
  for (const key of ['usuarios','logs','permissoes','content','items','data','registros']) if(Array.isArray(selected?.[key])) return selected[key];
  throw new Error('Esperava uma lista JSON. Informe o caminho da lista quando necessário.');
}
export function parseFile(source, name='') {
  const raw = source.replace(/^\uFEFF/,'').trim(); if(!raw) throw new Error('Arquivo vazio.');
  if (/\.jsonl$|\.ndjson$/i.test(name)) return raw.split(/\r?\n/).filter(v=>v.trim()).map((line,i)=>{try{return JSON.parse(line);}catch{throw new Error(`JSON inválido na linha ${i+1}.`);}});
  if (/^[\[{]/.test(raw)) { try { return JSON.parse(raw); } catch { throw new Error('JSON inválido. Para um objeto por linha, use a extensão .jsonl.'); } }
  return parseCSV(raw);
}
export function csv(columns, rows) {
  const escape = value => { let v=text(value); if (/^[\s]*[=+\-@]/.test(v)) v="'"+v; return '"'+v.replaceAll('"','""')+'"'; };
  return '\uFEFF'+[columns.map(c=>escape(c.label)).join(';'),...rows.map(row=>columns.map(c=>escape(row[c.key])).join(';'))].join('\r\n');
}
export const USER_FIELDS = {
  id:['idUsuario','id','usuarioId'], name:['nomeCompleto','fullName','nome','nomeVisualizacao','displayName'], login:['nomeLogin','login'],
  active:['ativo','active','status'], last:['ultimoLogin','dataUltimoLogin','ultimoAcesso','dataUltimoAcesso','lastLogin','lastLoginAt'],
  company:['empresas','lojas','idEmpresa'], group:['idGrupo','grupo','perfil']
};
export function normalizeUser(raw, mapping={}) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('Registro de usuário inválido.');
  const get = key => pick(raw,mapping[key] ? [mapping[key]] : USER_FIELDS[key]);
  const id=text(get('id').value), login=text(get('login').value);
  if(!id && !login) throw new Error('Usuário sem ID e sem login; confira o mapeamento.');
  const last=get('last'); let name=text(get('name').value);
  name=name.trim();
  if(!mapping.name && !raw.nomeCompleto && !raw.fullName && raw.nome && raw.sobrenome){
    const surname=String(raw.sobrenome).trim();
    if(surname&&!name.toLocaleLowerCase('pt-BR').endsWith(surname.toLocaleLowerCase('pt-BR')))name=(name+' '+surname).trim();
  }
  if(name===id||/^ID\s*\d+$/i.test(name))name='';
  const companies=get('company').value;
  return {id,login,name:name || 'Nome não informado',active:bool(get('active').value),lastLogin:last.value ?? null,lastField:last.key,
    companies:companies,group:text(get('group').value),raw};
}
export function inactivity(users, days=30, now=new Date()) {
  if(!Number.isInteger(Number(days)) || days<1 || days>3650) throw new Error('Informe de 1 a 3650 dias.');
  return users.map(u=>{
    const date=parseDate(u.lastLogin), elapsed=date ? (now-date)/86400000 : null;
    const status=u.active===false ? 'Conta inativa' : elapsed===null ? (u.lastLogin==null || u.lastLogin==='' ? 'Sem data de acesso' : 'Data inválida') : elapsed<0 ? 'Data no futuro' : elapsed>days ? 'Acima do limite' : 'Dentro do limite';
    return {...u,days:elapsed===null?null:Math.floor(elapsed),status,review:status==='Acima do limite',lastFormatted:formatDate(u.lastLogin)};
  }).sort((a,b)=>Number(b.review)-Number(a.review) || (b.days??-1)-(a.days??-1) || a.name.localeCompare(b.name,'pt-BR'));
}
