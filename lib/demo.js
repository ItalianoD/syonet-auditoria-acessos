export function demoUsers(now=new Date()) {
  const ago=days=>new Date(now-days*86400000).toISOString();
  const permission=(codigo,descricao,permitido)=>({codigo,categoria:'Menu',descricao,escopo:'9',permitido});
  const permissions=wide=>[permission('EVENTOS','Visualizar eventos',true),permission('RELATORIOS','Relatórios de gestão',wide),permission('CONFIGURAR_LOJA','Configurar loja',wide),permission('EXPORTAR','Exportar dados',false)];
  return [
    {idUsuario:90001,nome:'Ana',sobrenome:'Exemplo',nomeLogin:'ANA.DEMO',ativo:true,idGrupo:'GESTÃO',empresas:[9,7],ultimoLogin:ago(48),permissoes:permissions(true)},
    {idUsuario:90002,nome:'Bruno',sobrenome:'Exemplo',nomeLogin:'BRUNO.DEMO',ativo:true,idGrupo:'VENDAS',empresas:[9],ultimoLogin:ago(73),permissoes:permissions(false)},
    {idUsuario:90003,nome:'Carla',sobrenome:'Exemplo',nomeLogin:'CARLA.DEMO',ativo:true,idGrupo:'VENDAS',empresas:[9],ultimoLogin:ago(7),permissoes:permissions(false)},
    {idUsuario:90004,nome:'Diego',sobrenome:'Exemplo',nomeLogin:'DIEGO.DEMO',ativo:true,idGrupo:'TI',empresas:[9,7],ultimoLogin:null},
    {idUsuario:90005,nome:'Elisa',sobrenome:'Exemplo',nomeLogin:'ELISA.DEMO',ativo:false,idGrupo:'VENDAS',empresas:[7],ultimoLogin:ago(102)},
    {idUsuario:90006,nome:'Felipe',sobrenome:'Exemplo',nomeLogin:'FELIPE.DEMO',ativo:true,idGrupo:'GESTÃO',empresas:[7],ultimoLogin:ago(31),permissoes:permissions(true)}
  ];
}
export function demoLogs(now=new Date()) {
  return [
    {idLog:1,usuario:'Ana Exemplo',acao:'UPDATE',entidade:'Configuração da loja',idEmpresa:9,dataHora:new Date(now-86400000).toISOString(),campo:'Horário de atendimento',valorAnterior:'18:00',valorNovo:'19:00'},
    {idLog:2,usuario:'Bruno Exemplo',acao:'LOGIN',idEmpresa:9,dataHora:new Date(now-3600000).toISOString()},
    {idLog:3,usuario:'Carla Exemplo',acao:'CREATE',entidade:'Cadastro de usuário',idEmpresa:7,dataHora:new Date(now-172800000).toISOString()},
    {idLog:4,usuario:'Sistema de exemplo',acao:'ROTINA_X',entidade:'Integração',dataHora:now.toISOString()}
  ];
}
