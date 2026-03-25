# mynote

个人 Markdown 笔记网页端：Express + **Node 内置 SQLite**（`node:sqlite`），**图片以 BLOB 存在同一数据库**（表 `images`），通过 `GET /api/images/:id` 访问。

**环境要求**：**Node.js ≥ 22.13**（无需 `better-sqlite3` 等原生模块，线上 `npm install` 不必装编译工具链）。

## 本地开发

```bash
npm install
npm run dev
```

浏览器打开 **http://localhost:5173**（Vite 会把 `/api` 代理到 **http://localhost:3000**，含 `/api/images/...`）。

## 生产部署

```bash
npm install
npm run build
npm start
```

默认 **http://localhost:3000**，静态页面由 `dist/` 提供。

- **端口**：环境变量 `PORT`（默认 `3000`）。
- **图片 URL**：若需固定对外地址，设置 `PUBLIC_BASE_URL`（须与浏览器访问地址一致，含 `http://` 与端口）。

## 数据

- 数据库：`data/notes.db`（含表 `notes` 与 `images`，图片二进制在 `images.data`）

请定期备份该文件；库会随图片增多而变大，大文件多时也可再考虑改回对象存储。

## 线上部署（完整流程，不使用 HTTPS）

以下假设：**Ubuntu 22.04**、仅用 **HTTP**（密码与数据明文传输，仅建议在可信网络或内网使用；公网长期使用请改 HTTPS）。

### 1. 准备服务器与网络

1. 购买云主机，记录 **公网 IP**。
2. 云厂商 **安全组 / 防火墙**：放行 **22**（SSH）。后续二选一：
   - **方案 A（推荐）**：再放行 **80**（HTTP），应用由 Nginx 监听 80 反代到本机 3000。
   - **方案 B**：直接放行 **3000**，浏览器访问 `http://公网IP:3000`（可不装 Nginx）。

### 2. SSH 登录并安装 Node.js

```bash
ssh root@你的公网IP
```

安装 **Node.js 22 LTS 或更新**（示例，可用 [NodeSource](https://github.com/nodesource/distributions)）：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs
node -v   # 应 ≥ v22.13
```

本项目数据库使用 Node 内置 `node:sqlite`，**不需要** `build-essential` / `python3` 来编译 SQLite 驱动。

### 3. 上传项目代码

在 **本机**用 `scp` / SFTP / `git clone` 把 `mynote` 放到服务器，例如 `/opt/mynote`。

### 4. 安装依赖并构建

```bash
cd /opt/mynote
npm install
npm run build
```

若 `npm install` 仍失败，检查 Node 版本是否满足 `package.json` 里的 `engines`；启动时若出现 **SQLite experimental** 提示，属当前 Node 版本提示，可忽略或日后升级 Node。

### 5. 配置 `PUBLIC_BASE_URL`（与访问方式一致）

笔记里插入的图片地址会用到该变量，**必须与你在浏览器里打开的地址完全一致**（协议 + 主机 + 端口）：

| 你最终如何访问 | `PUBLIC_BASE_URL` 示例 |
|----------------|-------------------------|
| `http://公网IP:3000` | `http://123.45.67.89:3000` |
| `http://公网IP`（无端口，即 80） | `http://123.45.67.89` |
| `http://域名`（解析到服务器，80 端口） | `http://note.example.com` |

### 6. 用 PM2 常驻运行

```bash
sudo npm install -g pm2
cd /opt/mynote
```

**方案 B（直接暴露 3000）** 示例：

```bash
export NODE_ENV=production
export PORT=3000
export PUBLIC_BASE_URL=http://你的公网IP:3000
pm2 start server/index.js --name mynote
pm2 save
pm2 startup
# 按屏幕提示执行一条 sudo 命令，完成开机自启
```

在云安全组中放行 **3000** 后，浏览器访问：`http://公网IP:3000`。

**方案 A（Nginx 80 端口，对外不显式端口）** 先同样启动 PM2，但 `PORT` 仍用 3000，且：

```bash
export PUBLIC_BASE_URL=http://你的公网IP
# 或 http://你的域名
```

然后安装并配置 Nginx（见下一节），安全组放行 **80**，不要对公网开放 **3000**。

### 7. Nginx 反代（方案 A，可选）

仓库内有一份可直接套用的完整配置：**`deploy/nginx-mynote.conf`**（含 `upstream`、超时、`client_max_body_size` 等）。下面为等价精简版，二选一即可。

```bash
sudo apt install -y nginx
```

若使用仓库文件：

```bash
sudo cp /opt/mynote/deploy/nginx-mynote.conf /etc/nginx/sites-available/mynote
# 按需编辑 server_name、proxy_pass 端口
```

或手动新建 `/etc/nginx/sites-available/mynote`：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/mynote /etc/nginx/sites-enabled/mynote
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

此时 `PUBLIC_BASE_URL` 应为 `http://公网IP` 或 `http://域名`（**不要**写 `:3000`）。

### 8. 防火墙（若启用 UFW）

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp    # 方案 A
# 方案 B 则：sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

### 9. 数据备份

数据库（含图片）在服务器路径：`/opt/mynote/data/notes.db`。定期下载备份该文件。

### 10. 更新版本

```bash
cd /opt/mynote
# 更新代码后：
npm install
npm run build
pm2 restart mynote
```
