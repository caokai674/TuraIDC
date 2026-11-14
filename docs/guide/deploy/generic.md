# 部署指南

本文档说明如何将图拉云业务/财务系统部署到生产环境。

## 1. 环境要求

- Linux（推荐 Ubuntu 22.04+ / Debian 12）或 Windows Server
- PHP 8.3 +
- MySQL 8.0 +
- Redis 6.0 +
- Composer 2.x
- Node.js 20+（构建前端）
- Nginx（或任意静态服务器 + 反代）

> [!WARNING] 警告：对于 PHP 8.3 用户
> 请使用**已修补 [CVE-2026-109618](https://nvd.nist.gov/vuln/detail/cve-2026-109618) / [CVE-2026-109619](https://nvd.nist.gov/vuln/detail/cve-2026-109619) 的版本**
>
> 若无法立刻应用补丁，请将 `session.upload_progress.enabled=0` 写入 php.ini / FPM 池并重启全部 worker，并择日升级PHP

> [!TIP] 注意
> 该系统最低兼容MySQL 5.7.8。MySQL5.7 已 EOL，仅做兼容性支持。
>
> 使用 8.0 的 mysqldump 客户端备份 5.7 服务端时需增加 `--column-statistics=0`。
>
> **5.7 部署必须在 my.cnf 的 `mysqld` 段设置 `explicit_defaults_for_timestamp=ON`**

### 扩展与禁用函数

PHP 版本、扩展与禁用函数清单位于 `backend/app/Support/EnvironmentRequirements.php`

本文档不重复维护该清单。装完依赖后可自查：

```bash
cd backend
php artisan app:doctor          # 必选项：版本、必需扩展、禁用函数
php artisan app:doctor --all    # 附带列出建议安装但不阻断的扩展
```

> [!IMPORTANT] 注意
> 宝塔面板默认禁用 `putenv`、`proc_open`、`symlink`，导致 `.env` 读取与进程调用失败。
>
> 解除方式：宝塔 → 软件商店 → PHP → 禁用函数，删除这三个函数后重启 PHP，再使用 `php artisan app:doctor` 复核。

## 2. 准备代码

```bash
git clone https://github.com/25Cloud/TuraIDC TuraIDC
cd TuraIDC
```

## 3. 后端部署

### 3.1 安装依赖与配置

```bash
cd backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
```

编辑 `.env` 并确认如下内容：

```bash
APP_ENV=production
APP_DEBUG=false

# 地址分配
APP_URL=https://api.example.com
FRONTEND_URL=https://www.example.com
CLIENT_CONSOLE_URL=https://console.example.com
ADMIN_URL=https://admin.example.com

# 数据库配置
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=finance
DB_USERNAME=finance
DB_PASSWORD=你的强密码

# Redis配置
CACHE_STORE=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

> [!IMPORTANT] 注意
> `地址分配` 建议填入不同的域名，该内容将用于构建前端

### 3.2 初始化数据库

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE finance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# 导入结构
mysql -u root -p finance < database/schema/mysql-schema.sql
# 增量迁移
php artisan migrate --force
# 写入默认配置
php artisan db:seed --class=Database\\Seeders\\SettingsSeeder
```

### 3.3 创建超管账号

```bash
php artisan tinker
App\Models\AdminUser::create([
    'username' => 'admin',
    'password' => '你的强密码',
    'role_id'  => 1,
    'nickname' => '管理员',
    'status'   => 1,
]);
```

> [!TIP]
> 超管创建后，您可在管理后台继续创建其他角色/员工账号。

### 3.4 配置计划任务

将以下 `cron` 任务加入系统 crontab：

```bash
* * * * * cd /TuraIDC根目录/backend && php artisan schedule:run >> /dev/null 2>&1
```

> [!CAUTION] 警告：禁止配置多个Cron任务
> 禁止多次配置常驻 `queue:work`，否则可能形成双消费者；如需排查队列堆积，详见 [部署与调度指南](scheduling.md) 的手动消费命令。

### 3.5 缓存清理

```bash
php artisan config:cache
php artisan route:cache
php artisan event:cache
```

## 4. 前端构建

在根目录执行：

```bash
pnpm install --frozen-lockfile --shamefully-hoist
pnpm run build:frontends
```

| 前端       | 产物目录                         | 端口（开发） |
| ---------- | -------------------------------- | ------------ |
| 官网       | `frontend-user-v3-www/dist/`     | 5175         |
| 用户控制台 | `frontend-user-v4-console/dist/` | 5173         |
| 管理后台   | `frontend-admin-v3/dist/`        | 5174         |

发布时请将各自 `dist/` 内容部署到对应 Nginx 站点

## 5. Nginx 配置示例

### 后端

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    root /path/to/TuraIDC/backend/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_read_timeout 120s;
    }

    location ~ /\.(?!well-known).* { deny all; }
}
```

### 前端

三个前端使用同一套配置模板，替换 `server_name` 与 `root` 即可：

```nginx
server {
    listen 443 ssl http2;
    server_name www.example.com;

    root /path/to/TuraIDC/frontend-user-v3-www/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 前端站点 CSP 与点击劫持

由于前端为静态 HTML，CSP应由 Nginx 执行中间操作。

默认文件位于 `deploy/nginx/frontend-csp.conf`，复制进对应 `server {}` 即可，策略含义是：

| 策略                         | 说明                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `script-src 'unsafe-inline'` | 官网、控制台的首屏预热/品牌注入脚本和管理端为内联；静态托管时无 nonce 可用。脚本外移至 `/assets` 后可去掉。 |
| `script-src 'unsafe-eval'`   | 三端使用 vue-i18n 编译语言包（无预编译），去掉后会报错 `EvalError`。接入预编译后可去掉。                    |
| 极验域名                     | 管理与控制台的登录验证码；`gt4.js` 使用脚本标签加载验证库并埋点，仅放行 `static` 会在初始化阶段被拦截。     |
| `https://res.25y.cn`         | 人机验证适配脚本（Corptcha）的外网 SDK，由插件配置的 `script_url` 决定。                                    |
| `https://tdesign.gtimg.com`  | TDesign `t-icon` 默认 `loadDefaultIcons` 的 SVG 雪碧图。                                                    |
| `style-src 'unsafe-inline'`  | TDesign / Element Plus 运行时注入样式，首屏 splash 与验证码样式也是内联。                                   |
| `frame-src ... alipays:`     | 控制台充值页用隐藏 iframe 拉起支付宝 App。                                                                  |
| `frame-ancestors 'self'`     | 只允许同源页面嵌入（`dash.example.com` 等同域面板）。                                                       |

> [!WARNING] 警告：有关Nginx
> 在Nginx下，`add_header` 不会继承。
>
> 任一 `location` 里的 `add_header`（例如静态资源的 `Cache-Control`），都会导致该路径的`index.html` 无法使用策略，必须在该 `location` 内再贴一遍 CSP
>
> 建议存为 `snippets/frontend-csp-<端>.conf` ，然后再使用 `include`，避免出现错误。

> [!TIP] 自检
> 运行 `curl -sI https://console.example.com/ | grep -i content-security-policy` 以确认响应头存在；
>
> 若控制台出现 `Refused to load ...` 就是漏了来源，请按照上面的表格修补域名。

## 6. 进程守护（supervisor）

队列由调度器驱动，**无需**常驻；需要进程守护的是 VNC Relay（可选）。

### VNC Relay（可选，控制台远程桌面）

若启用 VNC 远程桌面功能，需运行 `vnc:relay` 进程，并将对外 WebSocket 路径（默认 `/ws/vnc`）反代到 `127.0.0.1:8100`：

```ini
[program:finance-vnc-relay]
directory=/path/to/TuraIDC/backend
command=php artisan vnc:relay --host=127.0.0.1 --port=8100
autostart=true
autorestart=true
user=www-data
```

也可使用 `php artisan app:serve --with-schedule` 同时托管多个服务，但生产环境应使用 PHP-FPM + cron + supervisor 拆分进程。

## 7. 备份

参考 `backend/scripts/backup_mysql.sh`（每日凌晨备份 MySQL 并保留 14 天）：

```bash
bash backend/scripts/backup_mysql.sh
```

建议同时备份：

- 数据库（`mysqldump --single-transaction --routines --triggers`）
- `backend/storage/app/private/`（上传文件、票据附件、日志归档）
- `backend/.env`（应用密钥与配置）

## 8. SEO 部署

官网是 Vue 单页应用，正文由 `SeoRenderService` 动态渲染注入。

完整伪静态规则见 [四端 Nginx 伪静态配置](../maintain/nginx-rules.md)，本节只列出各部署形态必须落位的部分与自检方法。

### 8.1 三种部署形态

| 部署形态        | 转发规则                                                                                       | 前端 shell 地址                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 宝塔 / Nginx    | [四端 Nginx 伪静态配置](../maintain/nginx-rules.md) 第 2 节 / [宝塔部署](bt-panel.md) 4.2 节   | 留空判定为 `file://TuraIDC工作目录/frontend-user-v3-www/dist/index.html`；也可显式填 `SEO_FRONTEND_SHELL_URL=file:///绝对路径/frontend-user-v3-www/dist/index.html` |
| Docker / 1Panel | 已内置，无需重复配置                                                                           | 默认 `http://frontends:8081/index.html`                                                                                                                             |
| 裸机部署        | [四端 Nginx 伪静态配置](../maintain/nginx-rules.md) 第 2 节 / [裸机部署](bare-metal.md) 7.2 节 | 同宝塔                                                                                                                                                              | 注意 API 站点强制 HTTPS 的跳转 |

### 8.2 环境变量

```bash
# 官网公开地址：canonical / sitemap / JSON-LD 都以它为准。
# 不填会退化成 API 域名，全站被规范化到非 HTML 端点。
SEO_SITE_URL=https://www.你的域名.com

# 前端 shell 模板地址。源码部署留空即自动判定为 file:// 直读同机构建产物；
# 容器部署留空即用 compose 内部网络地址。只有自定义路径时才需要显式填写。
# SEO_FRONTEND_SHELL_URL=file:///www/wwwroot/你的项目/frontend-user-v3-www/dist/index.html

# shell 模板 / 渲染结果缓存秒数。站点内容发布后靠内容版本号自动失效，
# 这两个值只决定静态兜底的最长延迟。
SEO_SHELL_CACHE_TTL=600
SEO_CACHE_TTL=300
```

### 8.3 自检

```bash
# 1) robots 与 sitemap 必须是真实内容，不是 SPA 壳
curl -s https://www.你的域名.com/robots.txt | head -3
curl -s https://www.你的域名.com/sitemap.xml | head -c 200

# 2) 爬虫 UA 取首页：应有 canonical 与 JSON-LD，且没有 noindex
curl -s -A 'Mozilla/5.0 (compatible; Googlebot/2.1)' https://www.你的域名.com/ \
  | grep -E 'rel="canonical"|ld\+json|name="robots"'

# 3) 商品详情页应带 Product 结构化数据
curl -s -A 'Mozilla/5.0 (compatible; Googlebot/2.1)' https://www.你的域名.com/products/1 \
  | grep -o '"@type":"Product"'
```

> [!TIP] 注意
> CDN 回源规则同样生效，但 CDN 可能缓存旧壳，必要时在 CDN 侧刷新缓存。

## 关联文档

- [宝塔部署项目指南](bt-panel.md)：面板化部署流程。
- [Docker / 1Panel 部署指南](docker-1panel.md)：容器化部署。
- [裸机源码部署指南](bare-metal.md)：无面板、无容器部署。
- [部署与调度指南](scheduling.md)：调度、队列与运维规则。
