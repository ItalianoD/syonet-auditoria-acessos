import {deactivateClient} from './deactivate.js';
import {formatDate,text} from './data.js';
const $=id=>document.getElementById(id),esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initializeDeactivateUI({task,notify,download,selection,onUpdated}){
  let plan=null,report=null,applying=false;
  function invalidate(){plan=null;$('deactivate-preview').hidden=true;$('deactivate-confirm').value='';$('deactivate-apply').disabled=true;}
  function reset(){invalidate();report=null;$('deactivate-result').hidden=true;}
  const handle=(id,fn,event='click')=>$(id).addEventListener(event,async()=>{try{await fn();}catch(e){notify(e.name==='AbortError'?'Consulta cancelada.':e.message,true);}});
  $('users-body').addEventListener('click',async e=>{const button=e.target.closest('[data-deactivate]');if(!button)return;
    try{await task(button,async signal=>{
      invalidate();$('deactivate-result').hidden=true;
      const u=selection(button.dataset.deactivate);if(!u.online)throw new Error('Consulte o usuário online antes de inativar.');
      plan=await deactivateClient.prepare(u.id,Number($('days').value),{signal});if(signal.aborted){invalidate();return;}
      $('deactivate-summary').innerHTML=`<h2>Inativar ${esc(plan.target.name)}</h2><p><strong>${esc(plan.target.login)}</strong> · ID ${esc(plan.target.id)} · Lojas: ${esc(plan.companies.join(', '))}</p><p>Último acesso: <strong>${esc(formatDate(plan.lastLogin))}</strong> · ${plan.elapsed} dias sem acesso · limite: ${plan.days} dias.</p><p>O cadastro será marcado como inativo no Syonet. Perfil, lojas, permissões e vínculos de equipe serão mantidos. A inativação afeta o usuário em todas as lojas.</p><p>Pendências operacionais consultadas: nenhuma. Equipes registradas: ${plan.links.listaEquipes}; vínculos de visualização: ${plan.links.listaEquipesVisualizacao}.</p>`;
      $('deactivate-label').textContent=`Para confirmar ${plan.target.login}, digite ${plan.confirmation}`;
      $('deactivate-preview').hidden=false;$('deactivate-preview').scrollIntoView({behavior:'smooth',block:'center'});$('deactivate-confirm').focus();
    });}catch(e){notify(e.message,true);}
  });
  handle('deactivate-cancel',invalidate);
  handle('deactivate-confirm',()=>{$('deactivate-apply').disabled=!plan||applying||$('deactivate-confirm').value.trim()!==plan.confirmation;},'input');
  handle('deactivate-apply',async()=>{
    try{await task($('deactivate-apply'),async()=>{
      if(!plan)throw new Error('Prepare a inativação primeiro.');
      const approved=plan,confirmation=$('deactivate-confirm').value;plan=null;applying=true;
      try{
        report=await deactivateClient.apply(approved,confirmation);$('deactivate-preview').hidden=true;$('deactivate-result').hidden=false;
        $('deactivate-result-body').innerHTML=`<h2>${report.ok?'Inativação confirmada no Syonet':report.attempted?'Resultado exige conferência':'Inativação bloqueada'}</h2><p>${esc(report.target.name)} · ${esc(report.target.login)} · ID ${esc(report.target.id)}</p><p>${esc(report.ok?'A releitura confirmou a conta inativa.':report.error)}</p><p>${report.attempted&&!report.ok?'A gravação pode ter sido aplicada. Reconsulte o cadastro antes de tentar novamente.':'Perfil, lojas, permissões e equipes são mantidos.'}</p>`;
        notify(report.ok?'Usuário inativado e situação confirmada no Syonet.':report.error,!report.ok);await onUpdated(approved.target.id,report);
      }finally{applying=false;}
    });}finally{$('deactivate-apply').disabled=true;}
  });
  handle('deactivate-report',()=>{if(report)download(`syonet-inativacao-${report.target.id}-${Date.now()}.json`,JSON.stringify(report,null,2),'application/json');});
  handle('days',invalidate,'input');
  window.addEventListener('beforeunload',e=>{if(applying){e.preventDefault();e.returnValue='';}});
  return {invalidate,reset,isApplying:()=>applying};
}
