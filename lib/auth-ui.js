import {loginManager} from './login-manager.js';
const $=id=>document.getElementById(id);
export function initializeAuthUI({task,notify,resetData,manager=loginManager}){
  let busy=false;
  const source=()=>manager.info().mode==='current'?'current':'other';
  function render(){
    const b=manager.info(),other=b.mode!=='current';$('auth-source').value=source();$('auth-fields').hidden=!other;
    const label=!other?'Conta da aba normal':b.user?`${b.user.login} · sessão separada`:'Outro login · desconectado';
    $('account-label').textContent=label;$('account-label').title=b.user?`${b.user.name} · ID ${b.user.id}`:label;
    $('auth-status').textContent=b.user?`Conectado: ${b.user.name} · ${b.user.login} · ID ${b.user.id}. As operações usarão esta conta e suas lojas autorizadas.`:other?'Entre para consultar. O painel não usará automaticamente a conta das abas normais.':'As operações usarão a sessão aberta nas abas normais do Syonet. Recarregue essa aba após atualizar a extensão.';
    $('auth-disconnect').hidden=!b.user;$('auth-submit').textContent=b.user?'Entrar com outra conta':'Entrar com este login';
  }
  const handle=(id,fn,event='click')=>$(id).addEventListener(event,async e=>{try{await fn(e);}catch(error){notify(error.name==='AbortError'?'Autenticação cancelada.':error.message,true);}finally{render();}});
  handle('account-open',()=>{document.querySelector('[data-tab="fontes"]').click();$('auth-panel').scrollIntoView({behavior:'smooth',block:'start'});});
  handle('auth-source',async()=>{if(busy){$('auth-source').value=source();throw new Error('Aguarde a operação atual antes de trocar de conta.');}resetData();$('auth-password').value='';if($('auth-source').value==='current')await manager.useCurrent();else await manager.chooseOther();},'change');
  handle('auth-form',async e=>{
    e.preventDefault();await task($('auth-submit'),async signal=>{
      const username=$('auth-username').value.trim();let password=$('auth-password').value;$('auth-password').value='';
      resetData();$('auth-status').textContent='Autenticando a conta informada…';
      try{const binding=await manager.login({username,password,signal});notify(`Conta confirmada: ${binding.user.login}. Consulte os usuários novamente para usar as lojas e permissões dessa conta.`);}finally{password='';$('auth-password').value='';}
    });
  },'submit');
  handle('auth-disconnect',()=>task($('auth-disconnect'),async()=>{resetData();$('auth-password').value='';await manager.disconnect();notify('Painel desconectado da conta escolhida. Para usar a sessão normal, selecione essa opção explicitamente.');}));
  render();
  return {render,setBusy:value=>{busy=value;for(const id of ['auth-source','auth-username','auth-password','auth-submit','auth-disconnect'])$(id).disabled=value;}};
}
