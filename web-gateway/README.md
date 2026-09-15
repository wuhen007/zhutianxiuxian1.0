# 公共网页网关

无尽网页采用“公共网关 + 世界聊天总机 + 各区服机器人”的中转方式。
网关在核心服务器常驻，负责页面、HTTP 会话和 API 转发；机器人只执行本区服玩法和存档操作。
默认 `relayEnabled: true` 时，机器人不再自动监听本机 3000 端口。
独立部署模式仍可设置 `relayEnabled: false`，此时保留原本的本机网页行为。

## 已支持的公共中转

- 无尽劫境：状态、聊天、选择与推进等操作。
- 沧澜星图：状态和行动。
- 调研问卷：状态和提交。
- 无尽问道的网页资源。

世界网页 `/world` 的本机会话尚未迁入这套协议，公共网关对其 API 返回明确的 503，不将请求误交给其他区服。

## 构建

在干净的仓库中执行，要求 Node.js 18.18+：

```sh
npm --prefix web-gateway ci --ignore-scripts
npm run build:web-gateway
```

默认输出 `dist/web-gateway`；输出存在时构建会停止，避免覆盖已有发布包。
也可指定一个新的目录：

```sh
node scripts/build-web-gateway.mjs /path/to/new-release
```

发布包只选取 Git 跟踪的运行模块、页面、静态数据及必要图片字体，不包含云崽主体、玩家存档、备份、Git 历史或运行身份。
包内 `release.json` 记录源码提交与逐文件校验值。

在发布包根目录安装锁定依赖：

```sh
npm ci --omit=dev --ignore-scripts
```

## 核心服务器部署

建议目录：

```text
/opt/zhutian-web/releases/<release>   只读程序
/opt/zhutian-web/current              当前版本软链接
/var/lib/zhutian-web                  网关独立身份
/etc/zhutian-web/gateway.env          环境配置
```

将 `gateway.env.example` 配置为 `/etc/zhutian-web/gateway.env`。
使用 `zhutian-web` 专用系统账号，并让其拥有 `/var/lib/zhutian-web`，身份目录权限设为 0700。
安装 `zhutian-web.service` 后由 systemd 托管进程。

网关需要独立 Redis 实例，不要与其他业务共用未隔离的会话数据库。
示例地址为 `redis://127.0.0.1:6381/0`，Redis 只监听回环地址。
建议持久化、限制内存、使用 `noeviction`，避免淘汰仍有效的会话。

首次启动会通过仓库配置的登记入口获得网关自己的区服身份。
也可通过 `WORLDCHAT_ENROLLMENT_TOKEN` 提供管理方的登记配置。
不要复制玩家区服的 `worldchat.json` 或 `installation.id` 作为网关身份。
更新程序时始终保留 `/var/lib/zhutian-web`，避免每次重启都重新登记。

## HTTPS 入口

复用核心服务器的 Caddy：

```caddyfile
endless.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

将域名解析到核心服务器，并将 `ENDLESS_WEB_PUBLIC_URL` 设置为完全一致的 HTTPS origin。
正常获取证书，不使用 `tls internal` 代替公共证书。
公网无需开放 3000 或 Redis 端口。
使用 Cloudflare Tunnel 时，连接器也必须安装在这台核心服务器，而非个人电脑。

世界聊天总机是单独进程：网关沿用现有中继协议，不需要覆盖或重启总机。
生产总机端口可能与示例默认值不同，按现行配置连接。
同机部署时可通过 `ZHUTIAN_WEB_RELAY_URL` 连接总机回环地址，避免内部 RPC 再绕行公网。

## 验收与运维

- `GET /healthz`：进程存活。
- `GET /readyz`：Redis 与世界聊天连接均就绪时返回 200，否则返回 503。
- `/endless`、脚本、样式与图片字体应全部返回 200。
- 无票据访问状态 API 返回 401；不生成匿名游戏会话。
- 使用两个真实区服各自生成的票据验证请求归属，不混用区服身份。
- 玩家票据由原区服的 `#无尽网页` 签发，不从服务器日志或缓存提取玩家票据。
- 中继中断时 API 返回 503，保留静态页面与健康检查入口。

切换前备份 DNS、代理配置和前一版本。先验收新网关，再切域名。
回滚时恢复旧代理配置和 `current` 链接，不删除身份、存档或 Redis 数据。
总机的网页中继会话仍是内存态；总机重启后玩家需要重新领取入口。

客户端升级插件后重启自己的机器人即可应用“不启动本地无尽网页”的新行为。
已经运行的旧进程仍可能保留本机监听，但公共域名不再指向这些端口。
