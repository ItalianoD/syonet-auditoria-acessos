import {TEAM_GROUPS} from '../lib/team-reference.js';
import {teamKey} from '../lib/copy-plan.js';
const clone=v=>structuredClone(v);
const codes=['M_TESTE','B_TESTE','R_TESTE'];
export function fixture({failOperation='',ignorePermissions=false}={}) {
  const users={90001:{idUsuario:90001,nomeLogin:'REF.TESTE',nome:'Referência',sobrenome:'Fictícia',email:'referencia@example.invalid',ativo:true,idGrupo:'REFERENCIA',empresas:[9],idEmpresa:9,idTipo:'AGENTE'},90002:{idUsuario:90002,nomeLogin:'DEST.TESTE',nome:'Destino',sobrenome:'Fictício',email:'destino@example.invalid',ativo:true,idGrupo:'DESTINO',empresas:[7],idEmpresa:7,idTipo:'FUNCIONARIO'}};
  const permissions={90001:[true,false,false],90002:[false,true,false]},teams=new Map(),calls=[];let session=7;
  for(const group of TEAM_GROUPS.filter(g=>[9,7,null].includes(g.companyId)))for(const [teamId,teamName] of group.teams)teams.set(String(teamId),{teamId,teamName,recordId:group.recordId,tableName:group.tableName||'AREA',companyId:group.companyId,company:group.label,members:teamId===165?['90001','90009']:teamId===301?['90002','90009']:teamId===370?['90001']:[],viewers:teamId===381?['90001']:[]});
  const portal=id=>{const u=clone(users[id]);return {...u,permissoes:codes.flatMap((code,i)=>['Visualizar','Incluir','Alterar','Excluir'].map(action=>({codigo:`${code}:${action}`,categoria:code[0]==='M'?'Menu':code[0]==='B'?'Interface':'Relatório',descricao:`${code} · ${action}`,escopo:'Cadastro do usuário',permitido:permissions[id][i]}))),controlesPermissao:codes.map((code,i)=>({name:`${code}_visualiza_chk`,checked:permissions[id][i],disabled:false,area:String(i+2)}))};};
  async function request(path){calls.push({method:'GET',path});const url=new URL(path,'https://fixture.invalid');let json=null,source='';
    if(path==='/api/sessao/usuario/empresa')json=[{idEmpresa:9},{idEmpresa:7}];
    else if(path==='/api/sessao/empresa')json={idEmpresa:session};
    else if(path==='/api/grupo')json=[{idGrupo:'REFERENCIA',ativo:true},{idGrupo:'DESTINO',ativo:true}];
    else if(/^\/api\/empresa\/\d+\/equipe/.test(path))json=[];
    else if(/^\/api\/usuario\/\d+\/equipe/.test(path)){const id=path.split('/')[3];json=[...teams.values()].filter(t=>t.members.includes(id)).map(t=>({idEquipe:t.teamId}));}
    else if(url.pathname==='/portal/detalhesEquipeTabela.do'){const team=teams.get(url.searchParams.get('idEquipe'));if(!team)throw new Error('Equipe não encontrada.');source=JSON.stringify(team);}
    else if(url.pathname==='/portal/ajax.do'&&url.searchParams.get('tipoObjeto')==='PERMITE_RETIRAR_EMPRESA_USUARIO'){const id=url.searchParams.get('idUsuario');json={listaEventos:[],listaTipoEventos:[],listaAreasGerente:[],listaEquipes:[...teams.values()].filter(t=>t.companyId!=null&&t.members.includes(id)).map(t=>({empresa:t.companyId})),listaAgendas:[],listaEquipesVisualizacao:[...teams.values()].filter(t=>t.companyId!=null&&t.viewers.includes(id)).map(t=>({empresa:t.companyId}))};}
    else throw new Error('Rota não simulada: '+path);
    return {json,source:source||JSON.stringify(json)};
  }
  const readUser=async id=>clone(users[id]),readAuditUser=async id=>portal(id);
  const parseTeam=source=>{const t=JSON.parse(source),params=new URLSearchParams({modo:'EDICAO',acao:'',idRegistro:String(t.recordId),idTabela:t.tableName,'equipeValue.idEquipe':String(t.teamId),idAgentesEquipe:t.members.join(','),idUsuariosVisualizacao:t.viewers.join(','),'equipeValue.nome':t.teamName});return {...t,params,meta:new Map([['idAgentesEquipe',{multiple:false}],['idUsuariosVisualizacao',{multiple:false}]]),memberField:'idAgentesEquipe',viewerField:'idUsuariosVisualizacao',available:['90001','90002','90009']};};
  async function write(operation,id,payload){calls.push({method:'WRITE',operation,id,payload:payload instanceof URLSearchParams?payload.toString():clone(payload)});if(operation===failOperation)throw new Error('Falha de gravação simulada.');
    if(operation==='profile'){if(String(payload.idUsuario)!==String(id)||String(id)!=='90002')throw new Error('Tentativa de alterar a referência.');users[id]=clone(payload);}
    else if(operation==='permissions'){if(!ignorePermissions){const index=Number(payload.get('idTipoObjeto'))-2;permissions[id][index]=payload.has(`${codes[index]}_visualiza_chk`);}}
    else if(operation==='session')session=Number(id);
    else if(operation==='team'){const team=teams.get(String(id));if(team.companyId!=null&&team.companyId!==session)throw new Error('Empresa da sessão incorreta.');team.members=(payload.get('idAgentesEquipe')||'').split(',').filter(Boolean);team.viewers=(payload.get('idUsuariosVisualizacao')||'').split(',').filter(Boolean);}
    return {status:200};
  }
  const htmlUser=id=>{const u=users[id];return `<form name="usuarioForm"><input name="usuarioValue.idUsuario" value="${id}"><input name="usuarioValue.nomeLogin" value="${u.nomeLogin}"><input name="usuarioValue.nome" value="${u.nome}"><input name="usuarioValue.sobrenome" value="${u.sobrenome}"><input type="checkbox" name="usuarioValue.ativo" checked><select name="usuarioValue.idGrupo"><option selected>${u.idGrupo}</option></select>${codes.map((code,i)=>`<input name="${code}_visualiza_chk" type="checkbox" ${permissions[id][i]?'checked':''}>`).join('')}</form><div id="popup-log-acessos"><table><tr><td></td><td>17/10/2026 10:00</td></tr></table></div><script>${codes.map((code,i)=>`idObjeto.push('${code}');permissaoObjeto.push('${permissions[id][i]?'1111':'0000'}');`).join('')}</script>`;};
  const htmlTeam=team=>`<form name="tabelaForm"><input name="equipeValue.idEquipe" value="${team.teamId}"><input name="idRegistro" value="${team.recordId}"><input name="idTabela" value="${team.tableName}"><input name="idAgentesEquipe" value="${team.members.join(',')}"><input name="idUsuariosVisualizacao" value="${team.viewers.join(',')}"><input name="equipeValue.nome" value="${team.teamName}"></form><script>idUsuarios.push('90001');idUsuarios.push('90002');idUsuarios.push('90009');</script>`;
  return {users,permissions,teams,calls,request,readUser,readAuditUser,parseTeam,write,htmlUser,htmlTeam,get session(){return session;}};
}
