"""在临时资料目录验证认证、条件写入、恢复与真实双向同步，不使用正式资料。"""
import base64
import hashlib
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

SOURCE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('files_server',SOURCE/'server.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


class SystemTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.base=Path(cls.temp.name)
        cls.root=cls.base/'remote';cls.root.mkdir();cls.state=cls.base/'state';cls.local=cls.base/'local';cls.local.mkdir()
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        cls.origin=f'http://127.0.0.1:{port}';cls.token=secrets.token_urlsafe(32)
        auth=cls.base/'auth.json';auth.write_text(json.dumps({'username':'yq','password_hash':module.secret_hash('test-only-password'),'sync_token_hash':hashlib.sha256(cls.token.encode()).hexdigest()}))
        env={**os.environ,'FILES_ROOT':str(cls.root),'FILES_STATE':str(cls.state),'FILES_AUTH':str(auth),'FILES_ORIGIN':cls.origin,'FILES_PORT':str(port)}
        cls.process=subprocess.Popen([sys.executable,str(SOURCE/'server.py')],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        for _ in range(100):
            try:urllib.request.urlopen(cls.origin+'/health',timeout=.2);break
            except (OSError,urllib.error.URLError):time.sleep(.05)
        else:raise RuntimeError('test server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate();cls.process.wait(timeout=5);cls.process.stdout.close();cls.temp.cleanup()

    def req(self,path,body=None,method=None,auth=True,headers=None):
        if isinstance(body,dict):body=json.dumps(body).encode()
        request=urllib.request.Request(self.origin+path,data=body,method=method,headers={**({'Authorization':'Bearer '+self.token} if auth else {}),**(headers or {})})
        try:
            with urllib.request.urlopen(request,timeout=10) as response:return response.status,response.read(),dict(response.headers)
        except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)

    def put(self,name,data,expected='missing'):
        return self.req('/api/file?'+urllib.parse.urlencode({'path':name}),data,'PUT',headers={'If-Match':expected})

    def sync(self):
        env={**os.environ,'FILES_SYNC_ROOT':str(self.local),'FILES_SYNC_STATE':str(self.base/'client'),'FILES_SYNC_URL':self.origin,'FILES_SYNC_TOKEN':self.token}
        result=subprocess.run([sys.executable,str(SOURCE/'sync.py')],env=env,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,(result.stderr,(self.base/'client/同步状态.json').read_text()))

    def test_01_auth_and_csrf(self):
        self.assertEqual(self.req('/api/files',auth=False)[0],401)
        self.assertEqual(self.req('/api/login',{'username':'yq','password':'test-only-password'},auth=False)[0],403)
        code,body,headers=self.req('/api/login',{'username':'yq','password':'test-only-password'},auth=False,headers={'Origin':self.origin})
        self.assertEqual(code,200);csrf=json.loads(body)['csrf'];cookie=headers['Set-Cookie'].split(';')[0]
        self.assertIn('HttpOnly',headers['Set-Cookie']);self.assertIn('SameSite=Strict',headers['Set-Cookie'])
        self.assertEqual(self.req('/api/folders',{'path':'forbidden'},auth=False,headers={'Cookie':cookie,'Origin':self.origin})[0],403)
        self.assertEqual(self.req('/api/folders',{'path':'登录测试'},auth=False,headers={'Cookie':cookie,'Origin':self.origin,'X-CSRF-Token':csrf})[0],200)

    def test_02_versions_and_delete(self):
        code,body,_=self.put('文档/测试.txt',b'first');self.assertEqual(code,200);old=json.loads(body)['hash']
        self.assertEqual(self.put('文档/测试.txt',b'wrong')[0],409)
        code,body,_=self.put('文档/测试.txt',b'second',old);self.assertEqual(code,200);second=json.loads(body)['hash']
        _,body,_=self.req('/api/history?'+urllib.parse.urlencode({'path':'文档/测试.txt'}));record=json.loads(body)['items'][0]
        self.assertEqual(self.req('/api/restore',{'id':record['id'],'hash':second})[0],200)
        self.assertEqual(self.req('/api/file?'+urllib.parse.urlencode({'path':'文档/测试.txt'}))[1],b'first')
        self.assertEqual(self.req('/api/delete',{'path':'文档/测试.txt','hash':old})[0],200)
        _,body,_=self.req('/api/history');record=next(r for r in json.loads(body)['items'] if r['path']=='文档/测试.txt')
        self.assertEqual(self.req('/api/restore',{'id':record['id'],'hash':'missing'})[0],200)
        code,body,headers=self.req('/api/file?'+urllib.parse.urlencode({'path':'文档/测试.txt'}),headers={'Range':'bytes=1-3'})
        self.assertEqual((code,body),(206,b'irs'))

    def test_03_paths_and_links(self):
        for name in ['../auth.json','/etc/passwd','a/../auth.json','.git/config','.sync_fake.db','x\\y','a//b','~$临时.docx']:
            self.assertEqual(self.put(name,b'bad')[0],400,name)
        (self.root/'link').symlink_to(self.base)
        self.assertEqual(self.put('link/outside.txt',b'bad')[0],400)
        (self.root/'link').unlink()
        code,_,_=self.put('预览.html',b'<script>alert(1)</script>');self.assertEqual(code,200)
        _,_,headers=self.req('/api/file?'+urllib.parse.urlencode({'path':'预览.html','download':'0'}))
        self.assertIn('attachment',headers['Content-Disposition'])
        self.assertEqual(self.req('/api/shares',{'path':'预览.html','password':'short'})[0],400)
        code,body,_=self.req('/api/shares',{'path':'预览.html','password':'long-share-password'});self.assertEqual(code,200)
        path=urllib.parse.urlsplit(json.loads(body)['url']).path
        self.assertEqual(self.req(path,auth=False)[0],200)
        self.assertEqual(self.req(path,b'password=wrong','POST',auth=False)[0],403)
        self.assertEqual(self.req(path,b'password=long-share-password','POST',auth=False)[0],200)
        _,body,_=self.req('/api/shares');record=json.loads(body)['items'][0]
        self.req('/api/revoke-share',{'token':record['token']})
        self.assertEqual(self.req(path,auth=False)[0],404)

    def test_04_real_sync(self):
        (self.local/'本地.txt').write_text('local-one');(self.local/'~$不上传.docx').write_text('lock')
        self.sync();self.assertEqual((self.root/'本地.txt').read_text(),'local-one')
        self.assertFalse((self.root/'~$不上传.docx').exists())
        self.assertEqual((self.local/'文档/测试.txt').read_text(),'first')
        self.put('远程.txt','remote-one'.encode());self.sync();self.assertEqual((self.local/'远程.txt').read_text(),'remote-one')
        old=hashlib.sha256(b'local-one').hexdigest();self.put('本地.txt',b'web-new',old)
        (self.local/'本地.txt').write_text('local-new');self.sync()
        self.assertEqual((self.local/'本地.txt').read_text(),'web-new')
        conflict=list(self.local.glob('本地（同步冲突_*）.txt'));self.assertEqual(len(conflict),1);self.assertEqual(conflict[0].read_text(),'local-new')
        self.assertTrue((self.root/conflict[0].name).exists())
        (self.local/'远程.txt').unlink();self.sync();self.assertFalse((self.root/'远程.txt').exists())
        checksum=hashlib.sha256(b'web-new').hexdigest();self.req('/api/delete',{'path':'本地.txt','hash':checksum});self.sync()
        self.assertFalse((self.local/'本地.txt').exists());self.assertTrue(list((self.base/'client/本机恢复副本').rglob('本地.txt')))
        self.sync();self.assertFalse((self.root/'本地.txt').exists())


if __name__=='__main__':unittest.main(verbosity=2)
