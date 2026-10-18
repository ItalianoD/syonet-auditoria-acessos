import {ORIGIN} from '../config.js';
import {authenticateLogin} from './auth.js';
import {sessionFetch,createSessionFetch} from './session-fetch.js';
const TYPE='SYONET_AUDIT_SESSION_V1';
const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Cancelado','AbortError');};
export function createLoginManager({extension=globalThis.chrome,transport=sessionFetch,authenticate=authenticateLogin,makeTransport=createSessionFetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}={}){
  const info=()=>transport.binding();
  async function closeOwned(binding){
    if(!binding.owned||!binding.incognito||!Number.isInteger(binding.tabId))return;
    const tab=await extension?.tabs.get(binding.tabId).catch(()=>null);
    if(tab?.incognito&&String(tab.url||'').startsWith(ORIGIN+'/portal/'))await extension.tabs.remove(binding.tabId).catch(()=>{});
  }
  async function disconnect(){const old=info();transport.select({mode:'other'});await closeOwned(old);}
  async function useCurrent(){const old=info();transport.select({mode:'current'});await closeOwned(old);}
  async function chooseOther(){if(info().mode==='current')transport.select({mode:'other'});}
  async function waitBridge(tabId,signal){
    const end=now()+25000;
    while(now()<end){cancelled(signal);
      const tab=await extension.tabs.get(tabId).catch(()=>null);if(!tab)throw new Error('A janela de autenticação foi fechada.');
      if(tab.status!=='loading')try{const pong=await extension.tabs.sendMessage(tabId,{type:TYPE,action:'ping'},{frameId:0});if(pong?.version===1)return;}catch{}
      await wait(250);
    }
    throw new Error('A conexão de login não carregou. Recarregue a extensão e a aba do Syonet. No modo separado, confira Permitir em modo anônimo nos detalhes da extensão.');
  }
  async function login({username,password,signal}){
    if(!String(username||'').trim()||!password)throw new Error('Informe login e senha.');
    if(!extension?.runtime?.id)throw new Error('Instale a extensão no Chrome ou Edge para autenticar. A prévia local não realiza login real.');
    const old=info();transport.select({mode:'other'});await closeOwned(old);cancelled(signal);
    let tabId=null,owned=false;
    try{
        if(!await extension.extension.isAllowedIncognitoAccess())throw new Error('Para manter as contas separadas, abra os detalhes desta extensão em chrome://extensions ou edge://extensions e ative Permitir em modo anônimo/InPrivate. Depois tente entrar novamente.');
        const privateTabs=(await extension.tabs.query({url:ORIGIN+'/*'})).filter(t=>t.incognito);
        if(privateTabs.length)throw new Error('Já há Syonet aberto no modo anônimo/InPrivate. As janelas anônimas compartilham a sessão entre si. Feche essas abas antes de iniciar outra conta separada.');
        const window=await extension.windows.create({url:ORIGIN+'/portal/app.do?modulo=login',incognito:true,type:'popup',focused:false,width:1050,height:760});
        tabId=window.tabs?.[0]?.id??(await extension.tabs.query({windowId:window.id}))[0]?.id;owned=true;
        if(!Number.isInteger(tabId))throw new Error('Não foi possível abrir a aba separada de autenticação.');
      await waitBridge(tabId,signal);cancelled(signal);
      const binding={mode:'auth',tabId,incognito:true,owned},temporary=makeTransport({extension,storage:null});temporary.select(binding);
      const user=await authenticate({username,password,fetcher:temporary,origin:ORIGIN,signal});password='';cancelled(signal);
      transport.select({...binding,mode:'other',user});
      // A janela tem utilidade como sessão do site e para fluxos adicionais nativos.
      // O painel permanece vinculado ao mesmo tabId, inclusive após a navegação.
      try{await extension.tabs.update(tabId,{url:ORIGIN+'/portal/acessaSistema.do'});await waitBridge(tabId,signal);}catch(error){if(signal?.aborted)throw error;const tab=await extension.tabs.get(tabId).catch(()=>null);if(!tab)throw new Error('A janela separada foi fechada durante a autenticação. Entre novamente.');/* sessão validada; uma recarga lenta será conferida na próxima consulta */}
      return info();
    }catch(error){transport.select({mode:'other'});if(owned&&Number.isInteger(tabId))await closeOwned({tabId,owned,incognito:true});throw error;}
    finally{password='';}
  }
  const locked=fn=>async(...args)=>{
    if(!globalThis.navigator?.locks)return fn(...args);
    return navigator.locks.request('syonet-access-copy',{ifAvailable:true},lock=>{if(!lock)throw new Error('Há uma alteração de acesso em andamento. Aguarde o relatório antes de trocar de conta.');return fn(...args);});
  };
  return {info,login:locked(login),disconnect:locked(disconnect),useCurrent:locked(useCurrent),chooseOther};
}
export const loginManager=createLoginManager();
