'use strict';
const $ = id => document.getElementById(id);
let csrf = '', current = '', items = [], view = 'files', searchTimer, requestNumber = 0;
const node = (tag, text, cls) => { const n = document.createElement(tag); if(text !== undefined)n.textContent=text;if(cls)n.className=cls;return n; };
const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : bytes < 1073741824 ? `${(bytes/1048576).toFixed(1)} MB` : `${(bytes/1073741824).toFixed(2)} GB`;
const date = seconds => new Date(seconds*1000).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const url = (path, download=true) => `/api/file?${new URLSearchParams({path,download:download?'1':'0'})}`;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function api(path, options={}){
  const response=await fetch(path,{...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers}});
  const body=await response.json();
  if(!response.ok){if(response.status===401)login();throw new Error(body.error||'操作失败，请重试');}
  return body;
}
const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
function login(){ $('login').hidden=false;$('workspace').hidden=true;csrf=''; }
async function enter(data){csrf=data.csrf;$('login').hidden=true;$('workspace').hidden=false;await load();}
function modal(title){$('dialog-title').textContent=title;$('dialog-body').replaceChildren();if(!$('dialog').open)$('dialog').showModal();return $('dialog-body');}
function button(text,action,cls=''){const b=node('button',text,cls);b.onclick=()=>Promise.resolve(action()).catch(e=>status(e.message,true));return b;}
function crumbs(){const wrap=$('breadcrumbs');wrap.replaceChildren(button('全部文件',()=>navigate('')));let path='';for(const part of current.split('/').filter(Boolean)){path+=(path?'/':'')+part;const target=path;wrap.append(node('span','/'),button(part,()=>navigate(target)));}}
async function navigate(path){current=path;view='files';$('search').value='';await load();}
function active(){['all-files','trash','shares'].forEach((id,i)=>$(id).classList.toggle('active',['files','trash','shares'][i]===view));$('upload-button').hidden=$('new-folder').hidden=view!=='files';$('search').disabled=view!=='files';}
async function load(){
  const number=++requestNumber;active();status('正在读取…');
  try{
    if(view==='trash'){await trash();return;}
    if(view==='shares'){await shares();return;}
    $('page-title').textContent=current.split('/').pop()||'全部文件';crumbs();
    const q=$('search').value.trim();const data=await api('/api/files?'+new URLSearchParams({path:current,q}));
    if(number!==requestNumber)return;items=data.items;$('rows').replaceChildren();$('empty').hidden=items.length>0;$('table-wrap').hidden=false;
    for(const item of items){
      const tr=node('tr'),name=node('td'),label=node('div',undefined,'file-label');
      const ext=item.name.includes('.')?item.name.split('.').pop().toUpperCase().slice(0,5):'FILE';
      label.append(node('span',item.directory?'↗':ext,'file-icon'+(item.directory?' folder':'')));
      const text=node('div');text.append(button(item.name,()=>item.directory?navigate(item.path):preview(item),'file-name'));
      if(q)text.append(node('p',item.path,'file-path'));label.append(text);name.append(label);
      const time=node('td',date(item.modified),'date'),bytes=node('td',item.directory?'—':size(item.size),'size'),actions=node('td');
      const more=button('···',()=>menu(item),'row-action');more.setAttribute('aria-label',`操作 ${item.name}`);actions.append(more);tr.append(name,time,bytes,actions);$('rows').append(tr);
    }
    $('count').textContent=`${items.length} 项`;$('empty').textContent=q?'没有找到这个文件名。':'这个文件夹还没有资料。可以上传文件，或新建文件夹。';status('');
  }catch(e){status(e.message,true);}
}
function menu(item){
  const body=modal(item.name),list=node('div',undefined,'menu');
  if(!item.directory){
    list.append(button('打开 / 预览',()=>preview(item)),button('下载文件',()=>{location.href=url(item.path);$('dialog').close();}),button('历史版本',()=>history(item)),button('分享文件',()=>share(item)));
  }else list.append(button('打开文件夹',()=>{$('dialog').close();return navigate(item.path);}));
  list.append(button('重命名',async()=>{const name=prompt('新的名称',item.name);if(!name||name===item.name)return;if(/[\\/]/.test(name))throw new Error('名称不能包含斜线');const prefix=item.path.includes('/')?item.path.slice(0,item.path.lastIndexOf('/')+1):'';await post('/api/move',{from:item.path,to:prefix+name,hash:item.hash});$('dialog').close();await load();}),
    button('移动到其他文件夹',async()=>{const target=prompt('目标文件夹路径（从资料库根目录开始，留空表示根目录）',current);if(target===null)return;await post('/api/move',{from:item.path,to:(target?target.replace(/\/$/,'')+'/':'')+item.name,hash:item.hash});$('dialog').close();await load();}),
    button('移到回收站',async()=>{if(!confirm(`将「${item.name}」移到回收站？网页删除也会同步到负责人的电脑。`))return;await post('/api/delete',{path:item.path,hash:item.hash});$('dialog').close();await load();}));body.append(list);
}
async function preview(item){
  const body=modal(item.name),ext=item.name.split('.').pop().toLowerCase();
  if(['png','jpg','jpeg','gif','webp','avif'].includes(ext)){const image=node('img');image.src=url(item.path,false);image.alt=item.name;body.append(image);}
  else if(ext==='pdf'){const frame=node('iframe');frame.src=url(item.path,false);frame.title=item.name;body.append(frame);}
  else if(['txt','md','csv','json','py'].includes(ext)&&item.size<2*1048576){const r=await fetch(url(item.path,false));if(!r.ok)throw new Error('读取失败');body.append(node('pre',await r.text()));}
  else body.append(node('p','这类文件请下载后，用 Word、WPS 或相应软件打开。修改完成后上传到原位置，确认替换即可。'));
  body.append(button('下载文件',()=>{location.href=url(item.path);},'primary'));
}
async function history(item){
  const body=modal('历史版本 · '+item.name),data=await api('/api/history?'+new URLSearchParams({path:item.path}));
  body.append(node('p','恢复旧版本前，当前文件会自动保留为一个历史版本。'));
  if(!data.items.length)body.append(node('p','暂时没有旧版本。下次替换文件时会自动保存。'));
  for(const record of data.items){const row=node('div',undefined,'history-item'),label=node('div',date(record.created));label.append(node('small',size(record.size)));row.append(label,button('恢复此版本',async()=>{if(!confirm('确认恢复这个版本？'))return;await post('/api/restore',{id:record.id,hash:item.hash});$('dialog').close();await load();}));body.append(row);}
}
async function share(item){
  const body=modal('分享 · '+item.name);body.append(node('p','链接七天后过期。设置提取密码后，将链接和密码发给对方。'));
  const label=node('label','提取密码（至少十位）'),input=node('input');input.type='password';input.autocomplete='new-password';label.append(input);body.append(label);
  body.append(button('创建分享链接',async()=>{const data=await post('/api/shares',{path:item.path,password:input.value});body.replaceChildren(node('p','分享链接已创建，七天后过期。提取密码请单独发送。'));const output=node('input',undefined,'share-output');output.value=data.url;output.readOnly=true;body.append(output,button('复制链接',async()=>{await navigator.clipboard.writeText(data.url);status('链接已复制');},'primary'));},'primary'));
}
async function trash(){
  $('page-title').textContent='回收站';$('breadcrumbs').replaceChildren(node('span','误删的资料可以在这里恢复。'));$('rows').replaceChildren();
  const data=await api('/api/history');const records=data.items.filter(r=>!r.group_id||r.kind==='trashdir');
  for(const record of records){const tr=node('tr'),label=node('td');label.append(node('div',record.path,'file-name'));const action=node('td');action.append(button('恢复',async()=>{await post('/api/restore',{id:record.id,hash:'missing'});await load();}));tr.append(label,node('td',date(record.created),'date'),node('td',record.kind==='trashdir'?'文件夹':size(record.size),'size'),action);$('rows').append(tr);}
  $('empty').hidden=records.length>0;$('empty').textContent='回收站是空的。';$('count').textContent=`${records.length} 项`;status('');
}
async function shares(){
  $('page-title').textContent='分享记录';$('breadcrumbs').replaceChildren(node('span','取消分享后，原链接立即失效。'));$('rows').replaceChildren();
  const data=await api('/api/shares');
  for(const record of data.items){const tr=node('tr'),action=node('td');action.append(button('取消',async()=>{await post('/api/revoke-share',{token:record.token});await load();}));tr.append(node('td',record.path,'file-name'),node('td',date(record.expires)+' 到期','date'),node('td','—','size'),action);$('rows').append(tr);}
  $('empty').hidden=data.items.length>0;$('empty').textContent='暂无有效的分享链接。';$('count').textContent=`${data.items.length} 个分享`;status('');
}
async function upload(files){
  if(view!=='files')return;const list=Array.from(files);$('upload-button').disabled=true;
  try{for(let index=0;index<list.length;index++){
    const file=list[index],existing=items.find(i=>i.name===file.name),path=(current?current+'/':'')+file.name;
    if(existing&&!confirm(`「${file.name}」已存在，是否替换？旧文件会保留在历史版本中。`))continue;
    if(file.size>512*1048576)throw new Error('单个文件上限为 512 MB');
    await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url(path));xhr.setRequestHeader('X-CSRF-Token',csrf);xhr.setRequestHeader('If-Match',existing?existing.hash:'missing');xhr.upload.onprogress=e=>status(`正在上传 ${index+1}/${list.length} · ${file.name}${e.lengthComputable?' · '+Math.round(e.loaded/e.total*100)+'%':''}`);xhr.onerror=()=>reject(new Error('网络中断，请重新上传'));xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(new Error('上传失败，请重新登录后重试'));return;}xhr.status<300?resolve(data):reject(new Error(data.error||'上传失败'));};xhr.send(file);});
  }await load();status('上传完成');}catch(e){status(e.message,true);}finally{$('upload-button').disabled=false;$('upload-input').value='';}
}
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-button').disabled=true;$('login-error').textContent='';try{await enter(await post('/api/login',{username:$('username').value,password:$('password').value}));$('password').value='';}catch(e){$('login-error').textContent=e.message;}finally{$('login-button').disabled=false;}};
$('all-files').onclick=()=>navigate('');$('trash').onclick=()=>{view='trash';load();};$('shares').onclick=()=>{view='shares';load();};$('refresh').onclick=load;
$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(load,250);};
$('upload-button').onclick=()=>$('upload-input').click();$('upload-input').onchange=e=>upload(e.target.files);
$('new-folder').onclick=async()=>{const name=prompt('文件夹名称');if(!name)return;try{if(/[\\/]/.test(name))throw new Error('名称不能包含斜线');await post('/api/folders',{path:(current?current+'/':'')+name});await load();}catch(e){status(e.message,true);}};
$('logout').onclick=async()=>{try{await post('/api/logout',{});login();}catch(e){status(e.message,true);}};
$('close-dialog').onclick=()=>$('dialog').close();$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))$('dialog').close();});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();$('search').focus();}});
document.addEventListener('dragover',e=>{if(view==='files'&&!$('workspace').hidden){e.preventDefault();document.body.classList.add('drop-active');}});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('drop-active');});
document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('drop-active');if(!$('workspace').hidden)upload(e.dataTransfer.files);});
api('/api/me').then(enter).catch(login);
