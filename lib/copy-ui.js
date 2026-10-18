import {copyClient} from './access-copy.js';
import {text} from './data.js';
const $=id=>document.getElementById(id),esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=v=>[v.member?'Membro':'',v.viewer?'Visualizador':''].filter(Boolean).join(' + ')||'Sem vínculo';
export function initializeCopyUI({selection,task,notify,download,onUpdated}) {
  let plan=null,report=null,applying=false;
  const invalidate=()=>{plan=null;$('copy-preview').hidden=true;$('copy-confirm').value='';$('copy-apply').disabled=true;};
  const reset=()=>{invalidate();report=null;$('copy-result').hidden=true;$('copy-progress').textContent='';};
  const scopes=()=>Object.fromEntries(['permissions','profile','companies','teams'].map(k=>[k,$('copy-'+k).checked]));
  const lock=on=>{for(const id of ['user-a','user-b','compare','copy-direction','copy-mode','copy-permissions','copy-profile','copy-companies','copy-teams','clear','copy-prepare'])$(id).disabled=on;};
  const handle=(id,fn,event='click')=>$(id).addEventListener(event,async()=>{try{await fn();}catch(error){notify(error.message,true);}});
  const name=u=>`${u.name} · ${u.login} (ID ${u.id})`;
  function renderPlan(){
    const p=plan;$('copy-preview').hidden=false;$('copy-result').hidden=true;$('copy-confirm').value='';$('copy-apply').disabled=true;
    $('copy-summary').innerHTML=`<h3>${esc(name(p.source))} → ${esc(name(p.target))}</h3><p>${p.mode==='mirror'?'Espelhar: lojas e equipes adicionais do destino serão retiradas quando indicado abaixo.':'Somar: lojas e equipes adicionais do destino serão mantidas.'} O perfil e os estados das permissões selecionados serão copiados da referência.</p><div class="copy-cards"><div><strong>${p.scopes.profile?(p.profileChange?'Trocar perfil':'Perfil já igual'):'Perfil preservado'}</strong><span>${esc(p.before.group)} → ${esc(p.expected.group)}</span></div><div><strong>${p.permissionChanges.length} estados de permissão diferentes</strong><span>${p.scopes.permissions?'Copia os estados dos controles nativos, incluindo as restrições.':'Permissões não selecionadas.'}</span></div><div><strong>${p.addedCompanies.length} lojas a incluir · ${p.removedCompanies.length} a retirar</strong><span>Incluir: ${esc(p.addedCompanies.join(', ')||'nenhuma')}<br>Retirar: ${esc(p.removedCompanies.join(', ')||'nenhuma')}</span></div><div><strong>${p.teamChanges.length} equipes com alteração</strong><span>Membro e visualizador conferidos separadamente.</span></div></div><p class="copy-note">Esta operação tem várias etapas e pode terminar parcialmente. Baixe a cópia dos acessos atuais antes de aplicar. As demais informações do cadastro pertencem ao destino.</p>`;
    $('copy-team-preview').innerHTML=p.teamChanges.length?`<div class="table-wrap"><table><thead><tr><th>Equipe</th><th>No destino agora</th><th>Após a cópia</th></tr></thead><tbody>${p.teamChanges.map(t=>`<tr><td>${esc(t.teamName)}<small>${esc(t.company)}</small></td><td>${esc(role(t.before))}</td><td>${esc(role(t.after))}</td></tr>`).join('')}</tbody></table></div>`:'';
    $('copy-permission-preview').innerHTML=p.permissionChanges.length?`<details><summary>Ver ${p.permissionChanges.length} estados de permissão que serão copiados</summary><div class="table-wrap"><table><thead><tr><th>Permissão</th><th>No destino agora</th><th>Após a cópia</th></tr></thead><tbody>${p.permissionChanges.map(r=>`<tr><td>${esc(r.label)}<small>${esc(r.id)}</small></td><td>${r.b?'Ativado':'Desativado'}</td><td>${r.a?'Ativado':'Desativado'}</td></tr>`).join('')}</tbody></table></div></details>`:'';
    $('copy-confirm-label').textContent=`Para aplicar em ${p.target.login} (ID ${p.target.id}), digite ${p.confirmation}`;
    $('copy-apply').textContent=`Aplicar em ${p.target.login} (ID ${p.target.id})`;
    $('copy-backup-check').checked=false;
  }
  function renderReport(){
    if(!report)return;$('copy-result').hidden=false;
    const latest=[...new Map(report.steps.map(step=>[step.name,step])).values()];
    $('copy-result-body').innerHTML=`<h3>${report.ok?'Cópia conferida no Syonet':report.partial?'Cópia interrompida: confira o destino':'Cópia bloqueada antes da gravação'}</h3><p>${esc(name(report.source))} → ${esc(name(report.target))}</p>${report.error?`<p class="copy-error">${esc(report.error)}</p>`:''}${report.warnings.map(w=>`<p class="copy-error">${esc(w)}</p>`).join('')}<p>${report.ok?'A releitura confirmou o perfil, as lojas, os estados de permissão e os papéis de equipe selecionados.':report.partial?'Algumas etapas podem ter sido aplicadas. Consulte o relatório e releia o destino antes de preparar outra cópia. Não há repetição nem desfazimento automáticos.':'Nenhuma etapa de gravação de acesso foi iniciada.'}</p><ol>${latest.map(s=>`<li>${esc(s.name)} — ${esc({ENVIANDO:'enviando',RECEBIDO_AGUARDANDO_VERIFICACAO:'resposta recebida; conferindo',VERIFICADO:'confirmado',INTERROMPIDO_CONFERIR_ESTADO:'interrompido; conferir estado',BLOQUEADO_ANTES_DE_GRAVAR:'bloqueado'}[s.status]||s.status)}</li>`).join('')}</ol>`;
  }
  function updateApply(){ $('copy-apply').disabled=applying||!plan||$('copy-confirm').value.trim()!==plan.confirmation||!$('copy-backup-check').checked; }
  for(const id of ['user-a','user-b','copy-direction','copy-mode','copy-permissions','copy-profile','copy-companies','copy-teams'])handle(id,invalidate,'change');
  handle('copy-confirm',updateApply,'input');handle('copy-backup-check',updateApply,'change');
  handle('copy-prepare',()=>task($('copy-prepare'),async signal=>{
    invalidate();lock(true);
    try{const picked=selection();if(!picked.online)throw new Error('A cópia exige dois usuários consultados online. Busque a referência e o destino no Syonet; arquivos e demonstração servem apenas para comparação.');
      const [a,b]=$('copy-direction').value==='ab'?[picked.a,picked.b]:[picked.b,picked.a];
      plan=await copyClient.prepare(a.id,b.id,{signal,scopes:scopes(),mode:$('copy-mode').value},message=>{$('copy-progress').textContent=message;});
      if(signal.aborted){invalidate();return;}renderPlan();$('copy-progress').textContent='Prévia pronta. Confira o destino e as mudanças abaixo.';
    }finally{lock(false);}
  }));
  handle('copy-backup',()=>{if(!plan)throw new Error('Prepare a cópia primeiro.');download(`syonet-acessos-antes-${plan.target.id}-${Date.now()}.json`,JSON.stringify({version:1,createdAt:plan.createdAt,source:plan.source,target:plan.target,before:plan.before,reference:plan.reference,scopes:plan.scopes,mode:plan.mode,nota:'Cópia dos acessos para conferência e recuperação manual. Não contém senha nem permite restauração automática.'},null,2),'application/json');});
  handle('copy-report',()=>{if(!report)throw new Error('Ainda não há relatório.');download(`syonet-copia-${report.target.id}-${Date.now()}.json`,JSON.stringify(report,null,2),'application/json');});
  handle('copy-apply',async()=>{try{await task($('copy-apply'),async()=>{
    if(!plan||$('copy-confirm').value.trim()!==plan.confirmation||!$('copy-backup-check').checked)throw new Error('Confira a prévia, baixe os acessos atuais e confirme o destino.');
    const approved=plan,confirmation=$('copy-confirm').value;plan=null;applying=true;lock(true);$('copy-apply').disabled=true;
    try{report=await copyClient.apply(approved,confirmation,{onProgress:message=>{$('copy-progress').textContent=message;},onReport:r=>{report=r;}});renderReport();$('copy-preview').hidden=true;$('copy-progress').textContent=report.ok?'Aplicação concluída e conferida.':'Aplicação encerrada. Confira o relatório.';notify(report.ok?'A cópia foi aplicada e conferida.':report.error||'Confira os avisos do relatório.',!report.ok||report.warnings.length>0);await onUpdated(approved.target.id);}
    finally{applying=false;lock(false);$('copy-apply').disabled=true;}
  });}finally{updateApply();}});
  window.addEventListener('beforeunload',event=>{if(applying){event.preventDefault();event.returnValue='';}});
  return {invalidate,reset,isApplying:()=>applying};
}
