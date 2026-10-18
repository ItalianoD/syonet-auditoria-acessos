import {ORIGIN} from '../config.js';
const MESSAGE='SYONET_AUDIT_SESSION_V1';
export function createSessionFetch({extension=globalThis.chrome,fetcher=globalThis.fetch,uuid=()=>crypto.randomUUID(),storage=globalThis.sessionStorage}={}){
  let tabId=null,binding={mode:'current'};
  const clean=next=>({mode:next.mode,...(Number.isInteger(next.tabId)?{tabId:next.tabId}:{}),...(next.incognito===true?{incognito:true}:{}),...(next.owned===true?{owned:true}:{}),...(next.user?.id?{user:{id:String(next.user.id),login:String(next.user.login||''),name:String(next.user.name||'')}}:{})});
  try{const saved=JSON.parse(storage?.getItem('syonet-connection-v1')||'null');if(saved?.mode==='other')binding=clean(saved);}catch{}
  const persist=()=>{try{storage?.setItem('syonet-connection-v1',JSON.stringify(binding));}catch{}};
  async function connect(signal){
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    if(binding.mode!=='current'){
      if(!Number.isInteger(binding.tabId)||(binding.mode==='other'&&!binding.user?.id))throw new Error('Entre com o outro login antes de consultar. O painel não usará a conta da aba normal como alternativa.');
      const tab=await extension.tabs.get(binding.tabId).catch(()=>null);
      if(!tab||!String(tab.url||'').startsWith(ORIGIN+'/portal/')||Boolean(tab.incognito)!==Boolean(binding.incognito))throw new Error('A aba da conta escolhida foi fechada ou mudou. Entre novamente; a conta da aba normal não será usada.');
      return binding.tabId;
    }
    if(tabId!==null)return tabId;
    const tabs=await extension.tabs.query({url:ORIGIN+'/portal/*'});
    tabs.sort((a,b)=>Number((b.url||'').includes('/acessaSistema.do'))-Number((a.url||'').includes('/acessaSistema.do'))||Number(b.active)-Number(a.active));
    for(const tab of tabs){
      if(!Number.isInteger(tab.id)||tab.incognito)continue;
      try{const pong=await extension.tabs.sendMessage(tab.id,{type:MESSAGE,action:'ping'},{frameId:0});if(pong?.version===1&&pong.ready){tabId=tab.id;return tabId;}}catch{/* abas anteriores à instalação precisam de recarga */}
    }
    throw new Error('Abra o Syonet em uma aba deste navegador, faça login e RECARREGUE essa aba (F5). Depois tente novamente na extensão. A conexão usa a própria aba autenticada.');
  }
  const sessionFetch=async function sessionFetch(url,options={}){
    // Prévia HTTP e testes locais usam fetch comum. Na extensão, toda chamada
    // passa pela aba do Syonet, mantendo os cookies e o contexto do próprio site.
    if(!extension?.runtime?.id){if(binding.mode!=='current')throw new Error('O login alternativo exige a extensão instalada no Chrome ou Edge. A prévia local não usa outra conta.');return fetcher(url,options);}
    const parsed=new URL(url,ORIGIN);
    if(parsed.origin!==ORIGIN)throw new Error('Destino fora do Syonet recusado.');
    const id=await connect(options.signal),requestId=uuid();
    if(options.signal?.aborted)throw new DOMException('Cancelado','AbortError');
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,result)=>{if(settled)return;settled=true;options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
      const abort=()=>{extension.tabs.sendMessage(id,{type:MESSAGE,action:'cancel',requestId},{frameId:0}).catch(()=>{});finish(new DOMException('Cancelado','AbortError'));};
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted){abort();return;}
      extension.tabs.sendMessage(id,{type:MESSAGE,action:'request',requestId,path:parsed.pathname+parsed.search,method:options.method||'GET',headers:Object.fromEntries(new Headers(options.headers).entries()),body:options.body??null,authLogin:options.authLogin===true,expectedUser:binding.mode==='other'?binding.user:null},{frameId:0}).then(result=>{
        if(!result?.received){tabId=null;finish(new Error('A conexão com a aba do Syonet foi interrompida. Recarregue essa aba. Se era uma gravação, confira o cadastro antes de tentar novamente.'));return;}
        if(result.error){finish(result.aborted?new DOMException('Cancelado','AbortError'):new Error(result.error));return;}
        finish(null,{ok:result.status>=200&&result.status<300,status:result.status,type:result.responseType||'basic',text:async()=>result.source});
      }).catch(()=>{tabId=null;finish(new Error('Não foi possível receber a resposta da aba do Syonet. Mantenha-a aberta e recarregue-a. Se era uma gravação, o resultado é incerto; confira o cadastro antes de tentar novamente.'));});
    });
  };
  sessionFetch.select=next=>{if(!['current','other','auth'].includes(next?.mode))throw new Error('Modo de conexão inválido.');binding=clean(next);tabId=null;persist();};
  sessionFetch.binding=()=>structuredClone(binding);
  return sessionFetch;
}
export const sessionFetch=createSessionFetch();
