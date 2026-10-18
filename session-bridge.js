// Executado no mundo isolado da extensão, somente na aba do Syonet.
// Não há listeners de window.postMessage, acesso a senhas abertas ou envio de cookies.
(()=>{
  const TYPE='SYONET_AUDIT_SESSION_V1',pending=new Map();
  function validate(message){
    if(typeof message.path!=='string'||!message.path.startsWith('/')||message.path.startsWith('//')||/[\\\r\n#;]/.test(message.path))throw new Error('Caminho inválido na conexão com o Syonet.');
    const url=new URL(message.path,location.origin),method=message.method;
    if(url.origin!=='https://disbrava.syonet.com'||!/^\/(api|portal)\//.test(url.pathname))throw new Error('Destino fora do Syonet recusado.');
    if(method==='GET'){
      if(message.body!==null&&message.body!==undefined)throw new Error('Consulta GET não aceita corpo.');
      if(/salvar|save|excluir|delete|remover|inativar|desativar|logout|logoff|validarlogon|acessasistema/i.test(url.pathname+url.search))throw new Error('A consulta não pode alterar o sistema.');
      for(const [key,value] of url.searchParams){
        if(/^(acao|action|operacao|operation)$/i.test(key)&&value)throw new Error('A consulta não aceita ação.');
        if(/^(modo|mode)$/i.test(key)&&value&&!/^(EDICAO|CONSULTA|VISUALIZAR)$/i.test(value))throw new Error('Modo de consulta inválido.');
      }
    }else{
      if(url.search&&!(message.authLogin===true&&url.pathname==='/portal/validarLogonUsuario.do'&&url.search==='?opcaoAtualizacao'))throw new Error('Gravação não aceita parâmetros na URL.');
      if(message.authLogin===true&&method==='POST'&&url.pathname==='/portal/validarLogonUsuario.do'&&url.search==='?opcaoAtualizacao'&&typeof message.body==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(message.body)&&message.body.length<=4096){
        // Payload RSA-OAEP já criptografado pelo painel. Nunca recebe a senha aberta.
      }else if(method==='PATCH'&&/^\/api\/usuario\/[1-9]\d*$/.test(url.pathname)){
        const payload=JSON.parse(message.body);if(String(payload?.idUsuario)!==url.pathname.split('/').pop())throw new Error('ID do cadastro divergente.');
      }else if(method==='POST'&&url.pathname==='/api/sessao/empresa'){
        if(!Number.isSafeInteger(JSON.parse(message.body)?.idEmpresa)||JSON.parse(message.body).idEmpresa<=0)throw new Error('Empresa inválida.');
      }else if(method==='POST'&&url.pathname==='/portal/usuario.do'){
        const p=new URLSearchParams(message.body);
        if(p.get('modo')!=='APLICAR_PERMISSOES'||!['2','3','4'].includes(p.get('idTipoObjeto'))||!p.get('idUsuario')||p.get('idUsuario')!==p.get('usuarioValue.idUsuario'))throw new Error('Operação de permissões inválida.');
        for(const key of p.keys())if(!['idUsuario','usuarioValue.idUsuario','modo','acao','abaAtiva','idTipoObjeto'].includes(key)&&!/^[MBR]_.+_(visualiza|incluir|alterar|excluir)_chk$/.test(key))throw new Error('Campo inesperado de permissão.');
      }else if(method==='POST'&&url.pathname==='/portal/detalhesEquipeTabela.do'){
        const p=new URLSearchParams(message.body);if(p.get('modo')!=='EDICAO'||p.get('acao')!=='ALTERANDO'||!/^\d+$/.test(p.get('equipeValue.idEquipe')||''))throw new Error('Operação de equipe inválida.');
      }else throw new Error('Operação fora dos fluxos de acesso recusada.');
    }
    const headers={};for(const [key,value] of Object.entries(message.headers||{}))if(['accept','content-type','custom-charset-response','x-requested-with'].includes(key.toLowerCase()))headers[key]=String(value);
    return {url,method,headers};
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL(''))||message?.type!==TYPE)return false;
    if(message.action==='ping'){respond({version:1,ready:!/[?&]modulo=login|#\/login/.test(location.href)});return false;}
    if(message.action==='cancel'){pending.get(message.requestId)?.abort();respond({received:true});return false;}
    if(message.action!=='request')return false;
    let args;try{args=validate(message);if(typeof message.requestId!=='string'||pending.has(message.requestId))throw new Error('Identificador da chamada inválido.');}catch(e){respond({received:true,error:e.message});return false;}
    const controller=new AbortController();pending.set(message.requestId,controller);
    const timer=setTimeout(()=>controller.abort(),35000);
    const verifyIdentity=async()=>{
      if(!message.expectedUser)return;
      const response=await fetch(location.origin+'/api/sessao/usuario',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json','Custom-Charset-Response':'UTF-8'}});
      let actual;try{actual=await response.json();}catch{}
      if(!response.ok||String(actual?.idUsuario)!==String(message.expectedUser.id)||String(actual?.nomeLogin||'').trim().toUpperCase()!==String(message.expectedUser.login||'').trim().toUpperCase())throw new Error('A sessão não pertence mais à conta escolhida. Entre novamente; nenhuma operação solicitada foi enviada.');
    };
    verifyIdentity().then(()=>fetch(args.url.href,{method:args.method,headers:args.headers,body:args.method==='GET'?undefined:message.body,credentials:'same-origin',cache:'no-store',redirect:'manual',signal:controller.signal}))
      .then(async response=>respond({received:true,status:response.status,responseType:response.type,source:await response.text()}))
      .catch(e=>respond({received:true,error:e.name==='AbortError'?'A chamada na aba do Syonet foi cancelada ou excedeu o tempo limite.':e.message?.startsWith('A sessão não pertence')?e.message:'Falha de rede na aba do Syonet. Se era uma gravação, confira o cadastro antes de tentar novamente.',aborted:e.name==='AbortError'}))
      .finally(()=>{clearTimeout(timer);pending.delete(message.requestId);});
    return true;
  });
})();
