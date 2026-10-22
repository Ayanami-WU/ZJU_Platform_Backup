#!/usr/bin/env python3
"""短暂锁定写入建立硬链接快照，在锁外压缩，保留两份已核验恢复点。"""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import fcntl
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess

os.umask(0o077)
base=Path(os.environ.get('FILES_BACKUP_ROOT','/var/backups/aiecology-files-lite'));base.mkdir(parents=True,exist_ok=True)
lock=(base/'backup.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
state=Path(os.environ.get('FILES_STATE','/srv/aiecology-files/state'))
data=Path(os.environ.get('FILES_ROOT','/srv/aiecology-files/data'))
code=Path(os.environ.get('FILES_SOURCE','/opt/aiecology-files-lite'))
name=datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y%m%d_%H%M%S')
stage=base/(name+'.partial');stage.mkdir()
snapshot=stage/'snapshot';snapshot.mkdir()
with (state/'write.lock').open('a') as write_lock:
    fcntl.flock(write_lock,fcntl.LOCK_EX)
    source=sqlite3.connect(state/'files.sqlite');target=sqlite3.connect(stage/'database.sqlite')
    source.backup(target)
    assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    source.close();target.close()
    # All library overwrites use atomic replacement, so old inodes remain immutable.
    # A hard-link snapshot takes directory work only, without copying 1+ GB under the lock.
    shutil.copytree(data,snapshot/'data',copy_function=os.link)
    (snapshot/'state').mkdir()
    shutil.copytree(state/'objects',snapshot/'state/objects',copy_function=os.link)
shutil.copytree(code,snapshot/'aiecology-files-lite',ignore=shutil.ignore_patterns('__pycache__'))
subprocess.run(['nice','-n','15','tar','-I','gzip -1','-cf',str(stage/'files.tar.gz'),'-C',str(snapshot),'data','state/objects','aiecology-files-lite'],check=True)
shutil.rmtree(snapshot)
subprocess.run(['tar','-tzf',str(stage/'files.tar.gz')],stdout=subprocess.DEVNULL,check=True)
manifest={'kind':'aiecology-files-lite-v1','created':name,'sha256':{}}
for path in stage.iterdir():
    with path.open('rb') as stream:manifest['sha256'][path.name]=hashlib.file_digest(stream,'sha256').hexdigest()
(stage/'manifest.json').write_text(json.dumps(manifest,indent=2))
stage.rename(base/name)
completed=sorted(p for p in base.iterdir() if p.is_dir() and (p/'manifest.json').exists() and p.name.replace('_','').isdigit())
for previous in completed[:-2]:
    if json.loads((previous/'manifest.json').read_text()).get('kind')=='aiecology-files-lite-v1':shutil.rmtree(previous)
print('Backup verified',name)
