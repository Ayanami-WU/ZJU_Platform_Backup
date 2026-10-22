#!/usr/bin/env python3
"""按共享基线进行双向同步；所有写入使用条件版本，冲突保留双方，删除留本机恢复副本。"""
from pathlib import Path
import datetime as dt
import fcntl
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(os.environ.get('FILES_SYNC_STATE', str(Path.home()/'Library/Application Support/AI生态文件同步')))
ROOT = Path(os.environ.get('FILES_SYNC_ROOT', str(Path.home()/'Desktop/AI生态')))
URL = os.environ.get('FILES_SYNC_URL', 'https://files.tuotuzju.com').rstrip('/')
BASE.mkdir(parents=True,exist_ok=True)
lock=(BASE/'运行锁').open('a')
try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError: raise SystemExit(0)
STATUS=BASE/'同步状态.json'
JOURNAL=BASE/'轻量同步基线.json'
now=lambda:dt.datetime.now().astimezone().isoformat()


def save(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2));temp.chmod(0o600);temp.replace(path)


def read(path,default):
    return json.loads(path.read_text()) if path.exists() else default


def hidden(name):
    return (name in {'.DS_Store','.git','__pycache__','管理员登录.txt'} or name.startswith(('.sync_','~$'))
            or name.endswith(('.pyc','.sqlite','.sqlite-wal','.sqlite-shm')))


def path_for(name):
    if not isinstance(name,str) or '\\' in name or '\x00' in name or any(p in ('','.','..') or hidden(p) for p in name.split('/')):
        raise RuntimeError('服务器返回无效路径')
    path=ROOT/name
    if not path.resolve().is_relative_to(ROOT.resolve()) or any(p.is_symlink() for p in (path,*path.parents) if p.is_relative_to(ROOT)):
        raise RuntimeError('同步路径存在符号链接')
    return path


def sha(path):
    before=path.stat()
    with path.open('rb') as f:value=hashlib.file_digest(f,'sha256').hexdigest()
    after=path.stat()
    if (before.st_size,before.st_mtime_ns,before.st_ino)!=(after.st_size,after.st_mtime_ns,after.st_ino):
        raise RuntimeError('本地文件正在修改，稍后重试')
    return value


def snapshot():
    files={};dirs=set()
    for parent,children,names in os.walk(ROOT,followlinks=False):
        children[:]=[n for n in children if not hidden(n) and not (Path(parent)/n).is_symlink()]
        rel=Path(parent).relative_to(ROOT).as_posix()
        if rel=='核心层【管理】/协作系统/数据':
            children[:]=[];continue
        if rel!='.':dirs.add(rel)
        for name in names:
            path=Path(parent)/name
            if not hidden(name) and not path.is_symlink() and path.is_file():files[path.relative_to(ROOT).as_posix()]=sha(path)
    return files,dirs


def request(route,body=None,method=None,headers=None):
    if isinstance(body,dict):body=json.dumps(body,ensure_ascii=False).encode()
    req=urllib.request.Request(URL+route,data=body,method=method,headers={'Authorization':'Bearer '+TOKEN,**(headers or {})})
    try:return urllib.request.urlopen(req,timeout=180)
    except urllib.error.HTTPError as e:
        # Do not persist filenames or authentication material in the diagnostic log.
        raise RuntimeError('服务器操作未完成，HTTP '+str(e.code)) from None


def api(route,body=None):
    with request(route,body) as r:return json.load(r)


def preserve(path):
    if not path.is_file():return
    target=BASE/'本机恢复副本'/dt.datetime.now().strftime('%Y%m%d_%H%M%S')/path.relative_to(ROOT)
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():target=target.with_name(target.name+'.'+os.urandom(3).hex())
    shutil.copy2(path,target)


def download(name,expected,local_hash):
    path=path_for(name)
    # Download and verify completely before changing any local file.
    fd,tempname=tempfile.mkstemp(dir=BASE,prefix='download-')
    temp=Path(tempname)
    try:
        value=hashlib.sha256()
        with os.fdopen(fd,'wb') as out,request('/api/file?'+urllib.parse.urlencode({'path':name})) as response:
            while chunk:=response.read(256*1024):out.write(chunk);value.update(chunk)
            out.flush();os.fsync(out.fileno())
        if value.hexdigest()!=expected:raise RuntimeError('远程文件已变化，稍后重试')
        if (sha(path) if path.exists() else None)!=local_hash:raise RuntimeError('下载期间本地文件已修改，稍后重试')
        preserve(path);path.parent.mkdir(parents=True,exist_ok=True);os.replace(temp,path)
    finally:temp.unlink(missing_ok=True)


def upload(name,expected,local_hash):
    path=path_for(name)
    if sha(path)!=local_hash:raise RuntimeError('上传前文件已修改，稍后重试')
    with path.open('rb') as f:
        with request('/api/file?'+urllib.parse.urlencode({'path':name}),body=f,method='PUT',headers={'Content-Length':str(path.stat().st_size),'If-Match':expected or 'missing'}) as response:
            result=json.load(response)
    if result['hash']!=local_hash:raise RuntimeError('上传期间本地文件已修改，稍后重试')


def sync():
    if not ROOT.is_dir():raise RuntimeError('本地同步根目录不存在')
    baseline=read(JOURNAL,{'files':{},'directories':[]})
    remote=api('/api/manifest');remote_files={p:v['hash'] for p,v in remote['files'].items()}
    local,local_dirs=snapshot();base=baseline['files'];next_base=dict(base)
    if len(base)>20:
        for side,label in [(local,'本机'),(remote_files,'服务器')]:
            removed=set(base)-set(side)
            if len(removed)>10 and len(removed)>len(base)*.5:
                raise RuntimeError(label+'出现大批删除，已暂停同步，请核对目录')
    conflicts=0
    for name in sorted(set(base)|set(local)|set(remote_files)):
        path=path_for(name);old=base.get(name);left=local.get(name);right=remote_files.get(name)
        if left==right:
            result=left
        elif left==old:
            if right is None:
                if path.exists():
                    if sha(path)!=left:raise RuntimeError('本地文件正在修改，稍后重试')
                    preserve(path);path.unlink()
            else:download(name,right,left)
            result=right
        elif right==old:
            if left is None:api('/api/delete',{'path':name,'hash':right})
            else:upload(name,right,left)
            result=left
        else:
            # Both sides changed. Keep local edits as a visible conflict copy, then accept remote.
            if left is not None:
                suffix=dt.datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+os.urandom(3).hex()
                conflict=path.with_name(path.stem+'（同步冲突_'+suffix+'）'+path.suffix)
                if sha(path)!=left:raise RuntimeError('本地文件正在修改，稍后重试')
                shutil.copy2(path,conflict)
                conflict_name=conflict.relative_to(ROOT).as_posix()
                upload(conflict_name,None,left);next_base[conflict_name]=left
                conflicts+=1
            if right is not None:download(name,right,left)
            elif path.exists():preserve(path);path.unlink()
            result=right
        if result is None:next_base.pop(name,None)
        else:next_base[name]=result
        # Keep successful per-file decisions across a later request failure.
        save(JOURNAL,{'files':next_base,'directories':baseline.get('directories',[])})
    remote_dirs=set(remote['directories']);old_dirs=set(baseline.get('directories',[]))
    for directory in sorted(local_dirs|remote_dirs,key=lambda n:(n.count('/'),n)):
        path=path_for(directory)
        if directory not in old_dirs:
            if directory in local_dirs and directory not in remote_dirs:api('/api/folders',{'path':directory})
            elif directory in remote_dirs and not path.exists():path.mkdir(parents=True,exist_ok=True)
    remaining_dirs=local_dirs|remote_dirs
    for directory in sorted(old_dirs,key=lambda n:(-n.count('/'),n)):
        path=path_for(directory)
        if directory not in local_dirs and directory in remote_dirs and not path.exists():
            api('/api/delete',{'path':directory});remaining_dirs.discard(directory)
        elif directory not in remote_dirs and directory in local_dirs:
            try:path.rmdir();remaining_dirs.discard(directory)
            except OSError:pass
    save(JOURNAL,{'files':next_base,'directories':sorted(remaining_dirs)})
    return conflicts


previous=read(STATUS,{})
start=now();save(STATUS,{'state':'syncing','started_at':start,'last_success':previous.get('last_success'),'engine':'aiecology-files'})
try:
    TOKEN=os.environ.get('FILES_SYNC_TOKEN') or subprocess.check_output(['/usr/bin/security','find-generic-password','-s','ai-ecology-files-sync','-a','yq','-w'],text=True).strip()
    conflicts=sync()
    save(STATUS,{'state':'ok','started_at':start,'finished_at':now(),'last_success':now(),'conflicts':conflicts,'engine':'aiecology-files'})
except Exception as e:
    save(STATUS,{'state':'error','started_at':start,'finished_at':now(),'last_success':previous.get('last_success'),'error':str(e),'engine':'aiecology-files'})
    log=BASE/'同步记录.log'
    if log.exists() and log.stat().st_size>2*1024*1024:log.write_bytes(log.read_bytes()[-1024*1024:])
    with log.open('a') as stream:stream.write(now()+' '+type(e).__name__+'\n')
    raise SystemExit(1)
