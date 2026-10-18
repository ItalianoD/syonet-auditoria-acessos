chrome.action.onClicked.addListener(async tab=>{
  const url=chrome.runtime.getURL('app.html');
  if(!tab?.incognito){await chrome.tabs.create({url});return;}
  // No modo spanning, a interface da extensão deve ficar na janela normal.
  const normal=(await chrome.windows.getAll({windowTypes:['normal']})).find(w=>!w.incognito);
  if(normal)await chrome.tabs.create({url,windowId:normal.id,active:true});
  else await chrome.windows.create({url,incognito:false,type:'normal',focused:true});
});
