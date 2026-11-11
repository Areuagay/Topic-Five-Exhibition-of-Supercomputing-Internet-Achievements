#!/usr/bin/env node
/**
 * 打包可部署版本
 *
 * 用法：
 *   node scripts/package-deploy.mjs            # 打包（要求 frontend/.output 已存在）
 *   node scripts/package-deploy.mjs --build    # 先构建前端再打包
 *
 * 产物：<repo>/../_packages/topic5-exhibition-<版本>-<日期>.tar.gz
 *       以及同名解压目录，方便直接拷到服务器。
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const OUT_ROOT = resolve(REPO, '..', '_packages')
const wantBuild = process.argv.includes('--build')

function run(cmd, cwd = REPO) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function sh(cmd, cwd = REPO) {
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim()
}

const pkg = JSON.parse(readFileSync(join(REPO, 'frontend', 'package.json'), 'utf8'))
const version = pkg.version || '0.0.0'
let commit = 'unknown'
try {
  commit = sh('git rev-parse --short HEAD')
} catch {}
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const NAME = `topic5-exhibition-${version}-${stamp}`
const STAGE = join(OUT_ROOT, NAME)
const ARCHIVE = join(OUT_ROOT, `${NAME}.tar.gz`)

if (wantBuild) {
  run('npm.cmd run build', join(REPO, 'frontend'))
}

const outputServer = join(REPO, 'frontend', '.output', 'server', 'index.mjs')
if (!existsSync(outputServer)) {
  console.error('[ERROR] frontend/.output/server/index.mjs 不存在。先构建：')
  console.error('        cd frontend && npm.cmd run build')
  console.error('        或者用：node scripts/package-deploy.mjs --build')
  process.exit(1)
}

console.log(`\n==> 打包 ${NAME}`)
rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

// 1. 前端构建产物
cpSync(join(REPO, 'frontend', '.output'), join(STAGE, 'frontend', '.output'), { recursive: true })

// 2. 后端（零依赖 Node 服务）
cpSync(join(REPO, 'backend'), join(STAGE, 'backend'), {
  recursive: true,
  filter: (src) => !src.includes('tests') && !src.endsWith('.log'),
})

// 3. 数据与产物
cpSync(join(REPO, 'mock-data'), join(STAGE, 'mock-data'), { recursive: true })
if (existsSync(join(REPO, 'artifacts'))) {
  cpSync(join(REPO, 'artifacts'), join(STAGE, 'artifacts'), { recursive: true })
}

// 4. 启动脚本
writeFileSync(join(STAGE, 'start.sh'), `#!/usr/bin/env bash
# 启动：后端 3001 + 前端 3000，日志写到 logs/
set -e
cd "$(dirname "$0")"
mkdir -p logs .runtime-data

if [ -f .env ]; then set -a; . ./.env; set +a; fi

BACKEND_PORT=\${BACKEND_PORT:-3001}
FRONTEND_PORT=\${FRONTEND_PORT:-3000}

echo "[1/2] backend  -> :$BACKEND_PORT"
BACKEND_PORT=$BACKEND_PORT nohup node backend/server.js > logs/backend.log 2>&1 &
echo $! > .backend.pid

sleep 2

echo "[2/2] frontend -> :$FRONTEND_PORT"
PORT=$FRONTEND_PORT HOST=0.0.0.0 nohup node frontend/.output/server/index.mjs > logs/frontend.log 2>&1 &
echo $! > .frontend.pid

sleep 2
echo "done. 打开 http://<服务器IP>:$FRONTEND_PORT"
echo "日志：tail -f logs/backend.log logs/frontend.log"
`)

writeFileSync(join(STAGE, 'stop.sh'), `#!/usr/bin/env bash
cd "$(dirname "$0")"
for f in .backend.pid .frontend.pid; do
  if [ -f "$f" ]; then kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; fi
done
echo stopped
`)

writeFileSync(join(STAGE, 'start.cmd'), `@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist .runtime-data mkdir .runtime-data
echo [1/2] backend  -^> :3001
start "topic5-backend" cmd /k "cd /d %~dp0 && node backend\\server.js"
echo [2/2] frontend -^> :3000
start "topic5-frontend" cmd /k "cd /d %~dp0 && set PORT=3000&& node frontend\\.output\\server\\index.mjs"
echo.
echo 打开 http://localhost:3000
pause
`)

// 5. pm2 / systemd 示例
writeFileSync(join(STAGE, 'ecosystem.config.cjs'), `// pm2 启动：pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'topic5-backend',
      script: 'backend/server.js',
      cwd: __dirname,
      env: { BACKEND_PORT: 3001, NODE_ENV: 'production' },
      out_file: 'logs/backend.out.log',
      error_file: 'logs/backend.err.log',
    },
    {
      name: 'topic5-frontend',
      script: 'frontend/.output/server/index.mjs',
      cwd: __dirname,
      env: { PORT: 3000, HOST: '0.0.0.0', NODE_ENV: 'production' },
      out_file: 'logs/frontend.out.log',
      error_file: 'logs/frontend.err.log',
    },
  ],
}
`)

writeFileSync(join(STAGE, 'topic5.service'), `# /etc/systemd/system/topic5.service
[Unit]
Description=Topic5 Exhibition (backend + frontend)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/topic5-exhibition
ExecStart=/bin/bash /opt/topic5-exhibition/start.sh
ExecStop=/bin/bash /opt/topic5-exhibition/stop.sh
Restart=on-failure
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
`)

writeFileSync(join(STAGE, 'nginx.conf.example'), `# 用 nginx 统一 80 端口，反代到前端
server {
    listen 80;
    server_name _;

    # 前端（含 /api 代理到后端，Nitro 内部已处理）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
    }

    client_max_body_size 20m;
}
`)

writeFileSync(join(STAGE, 'README-部署.md'), `# 部署说明（${NAME}）

构建于 ${new Date().toISOString()}，源码 commit \`${commit}\`，前端版本 ${version}。

## 一键启动（Linux）

\`\`\`bash
tar -xzf ${NAME}.tar.gz
cd ${NAME}
chmod +x start.sh stop.sh
./start.sh
\`\`\`

打开 \`http://<服务器IP>:3000\`。日志在 \`logs/\`。

## 端口

| 服务 | 端口 | 说明 |
|---|---|---|
| 前端 | 3000 | Nuxt SSR，对外只暴露这个 |
| 后端 | 3001 | 仅本机，前端通过 /api/v1 代理访问 |

后端默认只监听 127.0.0.1，不需要对外开放。

## 用 systemd / pm2 守护

- systemd：把 \`topic5.service\` 拷到 \`/etc/systemd/system/\`，改路径后 \`systemctl enable --now topic5\`
- pm2：\`pm2 start ecosystem.config.cjs && pm2 save\`

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| BACKEND_PORT | 3001 | 后端端口 |
| BACKEND_HOST | 127.0.0.1 | 后端监听地址 |
| FRONTEND_PORT / PORT | 3000 | 前端端口 |
| MOCK_DATA_DIR | ../mock-data | 数据目录 |
| MOCK_RUNTIME_DIR | ../.runtime-data | 运行时状态（上传文件、任务状态） |

## 注意

1. **前端通过 Nitro 代理访问后端**（/api/v1/** → localhost:3001），所以两个服务必须同机、后端必须是 3001，除非改构建配置重新打包。
2. \`.runtime-data/\` 存页面上的上传文件和任务状态，**升级时保留**，不要删。
3. 数据是演示用的模拟数据，见 \`mock-data/\`。
`)

// 6. 打包
try {
  sh('tar --version')
  run(`tar -czf "${ARCHIVE}" -C "${OUT_ROOT}" "${NAME}"`)
  console.log(`\n✓ 目录：${STAGE}`)
  console.log(`✓ 压缩包：${ARCHIVE}`)
} catch (e) {
  console.log(`\n✓ 目录：${STAGE}（tar 不可用，未压缩）`)
}
