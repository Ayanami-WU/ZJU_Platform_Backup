#!/usr/bin/env python3
"""AI生态文件库。仅绑定本机，由 Caddy 终结 HTTPS；资料与应用状态分开存放。"""
import contextlib
import datetime as dt
import fcntl
import hashlib
import hmac
import html
import http.cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath
import secrets
import shutil
import sqlite3
import threading
import time
from urllib.parse import parse_qs, quote, unquote, urlsplit

BASE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get('FILES_ROOT', '/srv/aiecology-files/data')).resolve()
STATE = Path(os.environ.get('FILES_STATE', '/srv/aiecology-files/state')).resolve()
ORIGIN = os.environ.get('FILES_ORIGIN', 'https://files.tuotuzju.com').rstrip('/')
MAX_FILE = 512 * 1024 * 1024
MUTEX = threading.RLock()
HASH_CACHE = {}
FAILURES = {}
AUTH_LOCK = threading.Lock()
AUTH_SLOTS = threading.BoundedSemaphore(2)


class Error(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def secret_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def verify(password, encoded):
    try:
        return hmac.compare_digest(secret_hash(password, encoded.split(':')[0]), encoded)
    except (ValueError, TypeError):
        return False


def db():
    con = sqlite3.connect(STATE / 'files.sqlite', timeout=30)
    con.row_factory = sqlite3.Row
    return con


@contextlib.contextmanager
def write_lock():
    with MUTEX:
        with (STATE / 'write.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield


def hidden(name):
    return (name in {'.DS_Store', '.git', '__pycache__', '管理员登录.txt'} or
            name.startswith(('.sync_', '~$')) or name.endswith(('.pyc', '.sqlite', '.sqlite-wal', '.sqlite-shm')))


def safe_path(value, root_ok=False):
    if not isinstance(value, str) or '\x00' in value or '\\' in value:
        raise Error(400, '文件路径无效')
    parts = value.split('/') if value else []
    if any(p in ('', '.', '..') or hidden(p) for p in parts):
        raise Error(400, '文件路径无效')
    if '核心层【管理】/协作系统/数据' in value:
        raise Error(400, '运行数据不属于资料库')
    if not parts and not root_ok:
        raise Error(400, '请选择具体文件或文件夹')
    target = ROOT.joinpath(*parts)
    cursor = ROOT
    for part in parts:
        cursor /= part
        if cursor.is_symlink():
            raise Error(400, '不支持符号链接')
    if not target.resolve().is_relative_to(ROOT):
        raise Error(400, '文件路径无效')
    return target


def digest(path):
    stat = path.stat()
    signature = (stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
    cached = HASH_CACHE.get(str(path))
    if cached and cached[0] == signature:
        return cached[1]
    with path.open('rb') as f:
        value = hashlib.file_digest(f, 'sha256').hexdigest()
    # A changing file must never enter the cache under its old attributes.
    after = path.stat()
    if signature != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        raise Error(409, '文件正在变化，请重试')
    HASH_CACHE[str(path)] = (signature, value)
    return value


def walk():
    for parent, dirs, files in os.walk(ROOT, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not hidden(d) and not (Path(parent) / d).is_symlink())
        rel_parent = Path(parent).relative_to(ROOT).as_posix()
        if rel_parent == '核心层【管理】/协作系统/数据':
            dirs[:] = []
            continue
        for name in files:
            p = Path(parent) / name
            if not hidden(name) and not p.is_symlink() and p.is_file():
                yield p


def entry(path):
    stat = path.stat()
    directory = path.is_dir()
    return dict(path=path.relative_to(ROOT).as_posix(), name=path.name, directory=directory,
                size=0 if directory else stat.st_size, modified=stat.st_mtime,
                hash=None if directory else digest(path))


def check_match(path, expected):
    current = digest(path) if path.is_file() else 'missing'
    if expected is None:
        raise Error(428, '请刷新后重试，操作需要文件版本')
    if current != expected.strip('"'):
        raise Error(409, '文件已被别人修改，请刷新后再操作')


def remember(path, kind='version', group_id=None):
    value = digest(path)
    target = STATE / 'objects' / value
    if not target.exists():
        temp = STATE / 'tmp' / secrets.token_hex(16)
        shutil.copyfile(path, temp)
        os.replace(temp, target)
    with db() as con:
        cur = con.execute('INSERT INTO history(path,hash,size,kind,created,group_id) VALUES(?,?,?,?,?,?)',
                          (path.relative_to(ROOT).as_posix(), value, path.stat().st_size, kind, time.time(), group_id))
        return cur.lastrowid


def initialize():
    ROOT.mkdir(parents=True, exist_ok=True)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ('tmp', 'objects'):
        (STATE / name).mkdir(exist_ok=True, mode=0o700)
    with db() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript('''
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, csrf TEXT, expires REAL);
        CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, path TEXT, hash TEXT, size INTEGER,
          kind TEXT, created REAL, group_id TEXT, restored INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS shares(token TEXT PRIMARY KEY, path TEXT, password TEXT, expires REAL);
        CREATE INDEX IF NOT EXISTS history_path ON history(path,created);
        ''')
    credentials = os.environ.get('CREDENTIALS_DIRECTORY')
    auth_path = Path(credentials) / 'auth.json' if credentials else Path(os.environ['FILES_AUTH'])
    return json.loads(auth_path.read_text())


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'Files'

    def log_message(self, fmt, *args):
        # URLs may contain private filenames or share tokens; keep them out of service logs.
        if hasattr(self, '_status') and self._status >= 500:
            print('request_failed', self._status, flush=True)

    def send(self, status=200, data=None, headers=None, mime='application/json; charset=utf-8'):
        body = data if isinstance(data, bytes) else json.dumps(data or {}, ensure_ascii=False).encode()
        self._status = status
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def body(self, limit=65536):
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            raise Error(400, '请求长度无效')
        if not 0 <= length <= limit:
            raise Error(413, '请求过大')
        data = self.rfile.read(length)
        if len(data) != length:
            raise Error(400, '上传未完成')
        return data

    def json_body(self):
        try:
            value = json.loads(self.body())
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, UnicodeDecodeError):
            raise Error(400, '请求内容无效')

    def auth(self, mutate=False):
        header = self.headers.get('Authorization', '')
        if header.startswith('Bearer '):
            hashed = hashlib.sha256(header[7:].encode()).hexdigest()
            if hmac.compare_digest(hashed, self.server.auth['sync_token_hash']):
                return {'csrf': '', 'sync': True}
        cookies = http.cookies.SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            token = cookies['files_session'].value
        except (KeyError, http.cookies.CookieError):
            raise Error(401, '请先登录')
        with db() as con:
            session = con.execute('SELECT * FROM sessions WHERE token=? AND expires>?',
                                  (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
        if session is None:
            raise Error(401, '登录已过期，请重新登录')
        if mutate:
            if self.headers.get('Origin') != ORIGIN or not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
                raise Error(403, '请求校验失败，请刷新后重试')
        return dict(session)

    def rate_limit(self):
        # Caddy overwrites this header; the listener is bound to loopback.
        address = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[-1].strip()
        with AUTH_LOCK:
            now = time.time()
            for key in list(FAILURES):
                if FAILURES[key][0] < now - 900:
                    del FAILURES[key]
            start, count = FAILURES.get(address, (now, 0))
            if count >= 12:
                raise Error(429, '尝试次数过多，请十五分钟后重试')
            if len(FAILURES) > 10000:
                raise Error(429, '请求过多，请稍后再试')
            FAILURES[address] = (start, count + 1)
        return address

    def download(self, path, attachment=True):
        if not path.is_file():
            raise Error(404, '文件不存在')
        file = path.open('rb')
        try:
            size = os.fstat(file.fileno()).st_size
            start, end, status = 0, max(size - 1, 0), 200
            part = self.headers.get('Range')
            if part and size:
                try:
                    if not part.startswith('bytes=') or ',' in part:
                        raise ValueError()
                    left, right = part[6:].split('-')
                    if left:
                        start = int(left)
                        end = min(int(right), size - 1) if right else size - 1
                    else:
                        start = max(0, size - int(right))
                        end = size - 1
                    if not 0 <= start <= end < size:
                        raise ValueError()
                    status = 206
                except ValueError:
                    self.send(416, {'error': '范围无效'}, {'Content-Range': f'bytes */{size}'})
                    return
            mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            safe_inline = mime in {'application/pdf','image/png','image/jpeg','image/gif','image/webp','image/avif','text/plain','text/markdown'}
            if not safe_inline:
                attachment = True
                mime = 'application/octet-stream'
            self._status = status
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(end - start + 1 if size else 0))
            self.send_header('Content-Disposition', ("attachment" if attachment else "inline") + "; filename*=UTF-8''" + quote(path.name))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('ETag', '"' + digest(path) + '"')
            if status == 206:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            if self.command == 'HEAD':
                return
            file.seek(start)
            remaining = end - start + 1 if size else 0
            while remaining:
                chunk = file.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        finally:
            file.close()

    def handle_request(self):
        parsed = urlsplit(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)
        param = lambda name, default='': query.get(name, [default])[0]
        method = self.command
        if method in ('GET', 'HEAD') and route in ('/', '/login', '/apps/dashboard/', '/app.js', '/app.css'):
            filename = {'/app.js':'app.js','/app.css':'app.css'}.get(route, 'index.html')
            data = (BASE / 'web' / filename).read_bytes()
            self.send(data=data, mime=mimetypes.guess_type(filename)[0] + '; charset=utf-8')
            return
        if method == 'GET' and route == '/health':
            self.send(data={'ok': True, 'service': 'aiecology-files'})
            return
        if method == 'POST' and route == '/api/login':
            if self.headers.get('Origin') != ORIGIN:
                raise Error(403, '请求来源无效')
            address = self.rate_limit()
            body = self.json_body()
            if not AUTH_SLOTS.acquire(blocking=False):
                raise Error(429, '登录处理中，请稍后重试')
            try:
                correct = verify(str(body.get('password', '')), self.server.auth['password_hash'])
            finally:
                AUTH_SLOTS.release()
            if str(body.get('username', '')) != self.server.auth['username'] or not correct:
                raise Error(401, '账号或密码不正确')
            with AUTH_LOCK:
                FAILURES.pop(address, None)
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            with db() as con:
                con.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
                con.execute('INSERT INTO sessions VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), csrf, time.time()+604800))
            cookie = f'files_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800'
            if ORIGIN.startswith('https:'):
                cookie += '; Secure'
            self.send(data={'username': self.server.auth['username'], 'csrf': csrf}, headers={'Set-Cookie': cookie})
            return
        # Public links expose only a selected file, after password verification.
        if route.startswith('/s/'):
            token = unquote(route[3:])
            with db() as con:
                share = con.execute('SELECT * FROM shares WHERE token=? AND expires>?',
                                    (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            if not share:
                raise Error(404, '分享已过期或被取消')
            path = safe_path(share['path'])
            if method == 'GET':
                body = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                        '<link rel="stylesheet" href="/app.css"><title>文件分享 · AI生态</title><main class="login-panel">'
                        '<span class="eyebrow">AI生态 · 文件分享</span><h1>' + html.escape(path.name) + '</h1>'
                        '<form method="post"><label>提取密码<input type="password" name="password" required autocomplete="off"></label>'
                        '<button class="primary">下载文件</button></form></main></html>')
                self.send(data=body.encode(), mime='text/html; charset=utf-8')
                return
            if method == 'POST':
                self.rate_limit()
                password = parse_qs(self.body().decode()).get('password', [''])[0]
                if not AUTH_SLOTS.acquire(blocking=False):
                    raise Error(429, '请求过多，请稍后重试')
                try:
                    correct = verify(password, share['password'])
                finally:
                    AUTH_SLOTS.release()
                if not correct:
                    raise Error(403, '提取密码不正确')
                self.download(path)
                return
        session = self.auth(method not in ('GET', 'HEAD'))
        if method == 'GET' and route == '/api/me':
            self.send(data={'username': self.server.auth['username'], 'csrf': session['csrf']})
        elif method == 'POST' and route == '/api/logout':
            with db() as con:
                con.execute('DELETE FROM sessions WHERE token=?', (session.get('token'),))
            self.send(headers={'Set-Cookie': 'files_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})
        elif method == 'GET' and route == '/api/files':
            path = safe_path(param('path'), root_ok=True)
            search = param('q').casefold().strip()
            if search:
                values = [entry(p) for p in walk() if search in p.name.casefold()][:1000]
            else:
                if not path.is_dir():
                    raise Error(404, '文件夹不存在')
                values = [entry(p) for p in path.iterdir() if not hidden(p.name) and not p.is_symlink()]
            values.sort(key=lambda e: (not e['directory'], e['name'].casefold()))
            self.send(data={'items': values, 'path': param('path')})
        elif method == 'GET' and route == '/api/manifest':
            with write_lock():
                files = {p.relative_to(ROOT).as_posix(): dict(hash=digest(p), size=p.stat().st_size) for p in walk()}
                dirs = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_dir() and not p.is_symlink() and all(not hidden(n) for n in p.relative_to(ROOT).parts))
            self.send(data={'files': files, 'directories': dirs})
        elif method in ('GET','HEAD') and route == '/api/file':
            self.download(safe_path(param('path')), param('download') != '0')
        elif method == 'PUT' and route == '/api/file':
            path = safe_path(param('path'))
            if self.headers.get('Transfer-Encoding'):
                raise Error(400, '上传需要指定长度')
            length = int(self.headers.get('Content-Length', '-1'))
            if not 0 <= length <= MAX_FILE:
                raise Error(413, '单个文件上限为 512 MB')
            if shutil.disk_usage(STATE).free < length + 256 * 1024 * 1024:
                raise Error(507, '服务器剩余空间不足')
            temp = STATE / 'tmp' / secrets.token_hex(16)
            try:
                remaining, value = length, hashlib.sha256()
                with temp.open('xb') as stream:
                    while remaining:
                        chunk = self.rfile.read(min(1024*256, remaining))
                        if not chunk:
                            raise Error(400, '上传未完成')
                        stream.write(chunk); value.update(chunk); remaining -= len(chunk)
                    stream.flush(); os.fsync(stream.fileno())
                with write_lock():
                    check_match(path, self.headers.get('If-Match'))
                    if path.exists() and not path.is_file():
                        raise Error(409, '这里已有同名文件夹')
                    if path.exists():
                        remember(path)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(temp, path)
                self.send(data={'hash': value.hexdigest(), 'path': param('path')})
            finally:
                temp.unlink(missing_ok=True)
        elif method == 'POST' and route == '/api/folders':
            path = safe_path(self.json_body().get('path'))
            with write_lock():
                if path.exists() and not path.is_dir():
                    raise Error(409, '这里已有同名文件')
                path.mkdir(parents=True, exist_ok=True)
            self.send()
        elif method == 'POST' and route == '/api/move':
            body = self.json_body()
            source, target = safe_path(body.get('from')), safe_path(body.get('to'))
            with write_lock():
                if not source.exists():
                    raise Error(404, '文件不存在')
                if source.is_file():
                    check_match(source, body.get('hash'))
                if target.exists() or target.is_relative_to(source):
                    raise Error(409, '目标已有同名文件，或移动位置无效')
                target.parent.mkdir(parents=True, exist_ok=True)
                source.rename(target)
            self.send()
        elif method == 'POST' and route == '/api/delete':
            body = self.json_body(); path = safe_path(body.get('path'))
            with write_lock():
                if not path.exists():
                    raise Error(404, '文件不存在')
                if path.is_file():
                    check_match(path, body.get('hash'))
                    remember(path, 'trash'); path.unlink()
                else:
                    if session.get('sync'):
                        # The synchronizer may only remove empty directories.
                        try: path.rmdir()
                        except OSError: raise Error(409, '文件夹不为空')
                    else:
                        group = secrets.token_hex(16)
                        children = list(path.rglob('*'))
                        if any(p.is_symlink() for p in children):
                            raise Error(400, '文件夹含符号链接，无法删除')
                        for p in children:
                            if p.is_file(): remember(p, 'trash', group)
                        with db() as con:
                            con.execute('INSERT INTO history(path,kind,created,group_id,size) VALUES(?,?,?,?,0)',
                                        (body['path'], 'trashdir', time.time(), group))
                        shutil.rmtree(path)
            self.send()
        elif method == 'GET' and route == '/api/history':
            with db() as con:
                if param('path'):
                    rows = con.execute('SELECT * FROM history WHERE path=? ORDER BY id DESC LIMIT 100', (param('path'),)).fetchall()
                else:
                    rows = con.execute("SELECT * FROM history WHERE kind IN ('trash','trashdir') AND restored=0 ORDER BY id DESC LIMIT 500").fetchall()
            self.send(data={'items': [dict(r) for r in rows]})
        elif method == 'POST' and route == '/api/restore':
            body = self.json_body()
            with write_lock():
                with db() as con:
                    row = con.execute('SELECT * FROM history WHERE id=?', (body.get('id'),)).fetchone()
                if row is None:
                    raise Error(404, '恢复记录不存在')
                path = safe_path(row['path'])
                if row['kind'] == 'trashdir':
                    if path.exists(): raise Error(409, '原位置已有同名文件夹，请先改名')
                    path.mkdir(parents=True)
                    with db() as con:
                        rows = con.execute("SELECT * FROM history WHERE group_id=? AND kind='trash'", (row['group_id'],)).fetchall()
                    for child in rows:
                        target = safe_path(child['path']);target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(STATE / 'objects' / child['hash'], target)
                    with db() as con: con.execute('UPDATE history SET restored=1 WHERE group_id=?', (row['group_id'],))
                else:
                    check_match(path, body.get('hash'))
                    if path.exists(): remember(path)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    temp = STATE / 'tmp' / secrets.token_hex(16)
                    shutil.copyfile(STATE / 'objects' / row['hash'], temp);os.replace(temp, path)
                    with db() as con: con.execute('UPDATE history SET restored=1 WHERE id=?', (row['id'],))
            self.send()
        elif method == 'POST' and route == '/api/shares':
            body = self.json_body();path = safe_path(body.get('path'))
            if not path.is_file(): raise Error(400, '请选择具体文件分享')
            password = str(body.get('password', ''))
            if len(password) < 10: raise Error(400, '提取密码至少十位')
            token = secrets.token_urlsafe(32)
            with db() as con:
                con.execute('INSERT INTO shares VALUES(?,?,?,?)',
                            (hashlib.sha256(token.encode()).hexdigest(), body['path'], secret_hash(password), time.time()+604800))
            self.send(data={'url': ORIGIN+'/s/'+token, 'expires': time.time()+604800})
        elif method == 'GET' and route == '/api/shares':
            with db() as con:
                rows = con.execute('SELECT token,path,expires FROM shares WHERE expires>? ORDER BY expires DESC', (time.time(),)).fetchall()
            self.send(data={'items': [dict(r) for r in rows]})
        elif method == 'POST' and route == '/api/revoke-share':
            body = self.json_body()
            with db() as con: con.execute('DELETE FROM shares WHERE token=?', (body.get('token'),))
            self.send()
        else:
            raise Error(404, '页面不存在')

    def dispatch(self):
        self.connection.settimeout(120)
        try:
            self.handle_request()
        except Error as e:
            self.close_connection = True
            self.send(e.status, {'error': e.message})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except (FileNotFoundError, NotADirectoryError):
            self.close_connection = True
            self.send(404, {'error': '文件不存在，请刷新后重试'})
        except (ValueError, IsADirectoryError):
            self.close_connection = True
            self.send(400, {'error': '请求无效'})
        except Exception as e:
            self.close_connection = True
            print('request_error', type(e).__name__, flush=True)
            self.send(500, {'error': '操作失败，请稍后重试'})

    do_GET = do_POST = do_PUT = do_HEAD = dispatch


class Server(ThreadingHTTPServer):
    """Bound concurrent connections so slow clients cannot create unlimited threads."""
    daemon_threads = True
    request_queue_size = 32

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(24)
        super().__init__(*args, **kwargs)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


if __name__ == '__main__':
    os.umask(0o077)
    auth = initialize()
    server = Server(('127.0.0.1', int(os.environ.get('FILES_PORT', '18081'))), Handler)
    server.auth = auth
    print('AI ecology files ready', flush=True)
    server.serve_forever()
