import {parsePortalHTML,parseListDocument} from '../lib/portal.js';
import {readTeamDocument,teamBody,permissionControls} from '../lib/native-forms.js';
const output=document.getElementById('results'),lines=[];
function check(value,message){if(!value)throw new Error(message);lines.push('OK · '+message);}
try {
const fixture=`<form><input name="usuarioValue.idUsuario" value="123"><input name="usuarioValue.nome" value="Pessoa fictícia"><input name="usuarioValue.ativo" type="checkbox" checked><select name="usuarioValue.idGrupo"><option selected>TI</option></select></form>
<div id="popup-log-acessos"><table><tr><th>IP</th><th>Data Acesso</th><th>Data Saída</th></tr><tr><td></td><td>01/10/2026 10:00</td><td>18/10/2026 17:00</td></tr><tr><td></td><td>17/10/2026 15:00</td><td></td></tr></table></div>
<script>idObjeto.push('M_USUARIO');permissaoObjeto.push('1010');idObjetosMenus.push('M_USUARIO');descObjetosMenus.push('Usuário');<\/script>`;
const profile=parsePortalHTML(fixture,123);
check(profile.ultimoLogin==='2026-10-17T18:00:00.000Z','Extrai o maior horário de entrada, sem confundir com a saída');
check(profile.ativo===true && profile.idGrupo==='TI','Lê situação e grupo do cadastro');
check(profile.permissoes.length===4 && profile.permissoes[2].permitido===true,'Extrai os quatro bits da matriz');
let failed=false;try{parsePortalHTML(fixture,999);}catch{failed=true;}check(failed,'Recusa cadastro de outro usuário');
const empty=fixture.replace(/<div id="popup-log-acessos">[\s\S]*?<\/div>/,'');check(parsePortalHTML(empty,123).ultimoLogin===null,'Histórico ausente permanece desconhecido');
const fallback=fixture.replace('value="123"','').replace('<script>',"<script>var idUsuario = '123';");check(parsePortalHTML(fallback,123).idUsuario===123,'Aceita o ID declarado como literal quando o campo vem vazio');
let inconsistent=false;try{parsePortalHTML(fixture.replace('<script>',"<script>var idUsuario = '999';"),123);}catch{inconsistent=true;}check(inconsistent,'Recusa divergência entre o ID do formulário e o ID declarado');
const doc=new DOMParser().parseFromString(`<table><tr id="123" onclick="doHighLight('','123');editar('123')"><td>Pessoa</td></tr><tr onclick="editar('456')"><td>Pessoa B</td></tr><tr onclick="salvar('789')"><td>Não é usuário</td></tr></table>`,'text/html');
check(JSON.stringify(parseListDocument(doc))==='["123","456"]','Lê somente os IDs de navegação da lista de usuários');
const teamDoc=new DOMParser().parseFromString(`<form name="tabelaForm"><input name="equipeValue.idEquipe" value="42"><input name="idRegistro" value="31"><input name="idTabela" value="AREA"><input name="idAgentesEquipe" value="100,200"><select name="idUsuariosVisualizacao" multiple><option value="200" selected>Pessoa A</option><option value="300" selected>Pessoa B</option><option value="100">Destino</option></select><input name="equipeValue.nome" value="Equipe fictícia"></form><script>idUsuarios.push('100');<\/script>`,'text/html'),team={teamId:42,recordId:31,tableName:'AREA'};
const current=readTeamDocument(teamDoc,team),change=teamBody(current,team,'100',{member:false,viewer:true});
check(JSON.stringify(change.members)==='["200"]'&&JSON.stringify(change.viewers)==='["100","200","300"]','Altera somente os papéis do destino, preservando terceiros');
check(change.body.get('equipeValue.nome')==='Equipe fictícia'&&change.body.getAll('idUsuariosVisualizacao').length===3,'Preserva os dados da equipe e o envio de seleção múltipla');
let wrongTeam=false;try{readTeamDocument(teamDoc,{...team,teamId:99});}catch{wrongTeam=true;}check(wrongTeam,'Recusa formulário que pertence a outra equipe');
const controls=permissionControls(new DOMParser().parseFromString('<input name="M_TESTE_visualiza_chk" type="checkbox" checked disabled><input name="usuarioValue.ativo" type="checkbox" checked>','text/html'));
check(controls.length===1&&controls[0].checked&&controls[0].disabled&&controls[0].area==='2','Distingue permissão editável de campos comuns e reconhece bloqueios');
lines.push('\n'+lines.length+' verificações concluídas.');output.textContent=lines.join('\n');document.title='OK · Leitores do portal';
}catch(error){output.textContent=lines.join('\n')+'\nFALHA · '+error.message;document.title='FALHA · Leitores do portal';}
