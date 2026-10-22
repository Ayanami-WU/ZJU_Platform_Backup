# AI生态资料库

网页入口：[files.tuotuzju.com](https://files.tuotuzju.com)。保留现有业务目录，支持按文件名搜索、上传下载、图片/PDF/文本预览、重命名与移动、回收站、历史版本、带提取密码的七天文件分享，以及负责人 Mac 的双向同步。Word、Excel、PPT 使用本机软件编辑后上传替换。

## 代码与资料

源码统一维护在网站仓库 `ZJU_Platform/文件系统/`，作为资料库网站的独立服务组件；AI生态目录只存放业务资料。Mac 同步程序安装到 Application Support，服务器源码部署到 `/opt/aiecology-files-lite`，两者均为运行副本。

- `server.py`：Python 标准库 HTTP 服务、SQLite 元数据、会话、文件操作和条件版本校验。仅监听 `127.0.0.1:18081`，由既有 Caddy 提供 HTTPS。
- `web/`：HTML、CSS、原生 JavaScript；无外部字体、CDN 或构建依赖。
- `sync.py`：Mac 每分钟执行；使用独立同步令牌、共享 SHA-256 基线及条件写入。冲突保留双方，本机被替换和删除的文件另留恢复副本。
- `backup.py`：短暂锁定写入，生成 SQLite 独立快照和文件硬链接快照，随即释放写锁，在后台压缩、核验并保留两个恢复点。所有覆盖写采用原子替换，快照指向的旧文件内容不随后续覆盖变化。
- `test_system.py`：临时目录中的集成测试；涵盖认证与 CSRF、路径限制、覆盖冲突、版本/回收站恢复、公开链接和真实双向同步。

业务资料不放进 Git。运行密钥只在 macOS 钥匙串和服务器加密 systemd Credentials 中。代码中不包含服务器账号、口令或同步令牌。

## 部署位置

服务器仍为私有登记中的拓途；源码 `/opt/aiecology-files-lite`，资料 `/srv/aiecology-files/data`，状态及历史对象 `/srv/aiecology-files/state`。主服务为 `aiecology-files-lite.service`，以独立低权限用户运行；限制内存 192 MB，绑定本机端口。系统每天北京时间 03:40 执行 `aiecology-files-lite-backup.timer`。

Mac 定时任务 `com.yq.aiecology.files`，同步根目录为 iCloud 桌面的 `AI生态` 文件夹（`~/Library/Mobile Documents/com~apple~CloudDocs/Desktop/AI生态`），通过 LaunchAgent 的 `FILES_SYNC_ROOT` 显式配置。同步程序、状态和恢复副本位于 `~/Library/Application Support/AI生态文件同步/`；`同步状态.json` 的 `ok`、`syncing`、`error` 分别表示最近成功、正在执行和本轮失败。失败不会把未确认的同步结果写成成功，下一轮重新核对。大批文件同时消失会暂停并报告错误。

单个文件上限 512 MB；暂不支持多人实时编辑 Office 文档、正文全文检索、多账号权限配置和整文件夹公开分享。分享链接仅针对选定文件，密码至少十位，七天过期，可随时取消。

## 验证与恢复

用 Python 3.12 或以上执行：

```sh
python3 test_system.py
node --check web/app.js
```

独立备份在 `/var/backups/aiecology-files-lite/`。恢复前停止 Mac 同步及服务，保留故障现场，核对 `manifest.json` 中两个文件的 SHA-256。将 `files.tar.gz` 中的 `data`、`state/objects` 还原到独立的 `/srv/aiecology-files` 恢复目录，将 `database.sqlite` 放为 `state/files.sqlite`；使用 SQLite `PRAGMA integrity_check` 核验，核对资料 SHA-256，恢复目录所有者后再启动。不要将旧 WAL/SHM 文件搭配恢复后的数据库。

Nextcloud 的旧数据、历史版本、回收站和原有独立备份仍作为切换前恢复材料保留，旧服务及其定时器停用。若要回退，必须先保留新版产生的文件变化，再恢复原代理配置、旧服务和旧同步；不能直接覆盖新版数据。
