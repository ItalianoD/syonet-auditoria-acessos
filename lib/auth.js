const concat=(...parts)=>{const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;};
const der=(tag,bytes)=>{const n=bytes.length,length=n<128?[n]:n<256?[0x81,n]:[0x82,n>>8,n&255];return concat(new Uint8Array([tag,...length]),bytes);};
export async function encryptLogin(publicKey,username,password,subtle=crypto.subtle){
  const match=String(publicKey).match(/-----BEGIN (RSA PUBLIC KEY|PUBLIC KEY)-----([\s\S]+?)-----END \1-----/);
  if(!match)throw new Error('O Syonet não forneceu uma chave pública válida.');
  let bytes=Uint8Array.from(atob(match[2].replace(/\s+/g,'')),c=>c.charCodeAt(0));
  if(match[1]==='RSA PUBLIC KEY')bytes=der(0x30,concat(new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]),der(3,concat(new Uint8Array([0]),bytes))));
  const key=await subtle.importKey('spki',bytes,{name:'RSA-OAEP',hash:'SHA-1'},false,['encrypt']);
  const clear=new TextEncoder().encode(JSON.stringify({usuario:username,senha:password,plataforma:'SYONET_WEB'}));
  if(clear.length>key.algorithm.modulusLength/8-42)throw new Error('Login e senha excedem o tamanho aceito pela chave do Syonet.');
  try{const encrypted=new Uint8Array(await subtle.encrypt({name:'RSA-OAEP'},key,clear));return btoa(String.fromCharCode(...encrypted));}finally{clear.fill(0);}
}
const loginEqual=(a,b)=>String(a||'').trim().toLocaleUpperCase('pt-BR')===String(b||'').trim().toLocaleUpperCase('pt-BR');
export async function authenticateLogin({username,password,fetcher,origin='https://disbrava.syonet.com',signal,encrypt=encryptLogin}){
  username=String(username||'').trim();password=String(password||'');
  if(!username||!password)throw new Error('Informe o login e a senha da conta que deseja usar.');
  const call=(path,options={})=>fetcher(origin+path,{credentials:'same-origin',cache:'no-store',redirect:'manual',signal,method:'GET',...options});
  try{
    const initial=await call('/portal/app.do?modulo=login',{headers:{Accept:'text/html'}});
    if(!initial.ok)throw new Error('Não foi possível iniciar a autenticação do Syonet.');
    const response=await call('/api/parametro/PUB_PEM',{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Não foi possível obter a chave pública do Syonet.');
    let publicKey;try{publicKey=JSON.parse(await response.text()).valor;}catch{throw new Error('Chave pública do Syonet indisponível.');}
    const encrypted=await encrypt(publicKey,username,password);password='';
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    // Sempre envia o login escolhido. Nunca aceita automaticamente a sessão anterior.
    const login=await call('/portal/validarLogonUsuario.do?opcaoAtualizacao',{method:'POST',headers:{'Content-Type':'text/html; charset=utf-8',Accept:'application/json'},body:encrypted,authLogin:true});
    const source=await login.text();let answer=null;try{answer=JSON.parse(source);}catch{}
    if(answer?.erro||answer?.error||answer?.msg||[400,401,403,429,500,502,503,504].includes(login.status))throw new Error('O Syonet recusou a autenticação. Confira as credenciais e eventuais requisitos de SSO ou autenticação adicional.');
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    const verify=await call('/api/sessao/usuario',{headers:{Accept:'application/json'}});let actual;
    try{actual=verify.ok?JSON.parse(await verify.text()):null;}catch{}
    if(!actual?.idUsuario||!loginEqual(actual.nomeLogin,username))throw new Error('A sessão retornada não pertence ao login informado. O painel permanece desconectado; nenhuma consulta foi liberada.');
    return {id:String(actual.idUsuario),login:String(actual.nomeLogin),name:[actual.nome,actual.sobrenome].filter(Boolean).join(' ').trim()||String(actual.nomeLogin)};
  }finally{password='';}
}
