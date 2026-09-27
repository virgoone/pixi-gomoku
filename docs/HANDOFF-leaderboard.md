# 交接：排行榜上线（给 ChatGPT）

仓库 `virgoone/pixi-gomoku`，PR #1（分支 `claude/leaderboard` → `main`）：https://github.com/virgoone/pixi-gomoku/pull/1

代码已写完并在本地测通，**还没有在真实 Netlify 环境（Blobs、Resend 真发信）上跑过**。你的任务是把配置补齐、在 Deploy Preview 上验证，通过后再合并上线。

## 1. 这个 PR 做了什么

- **邮箱验证码登录**（流程照 `virgoone/meme`）：输入邮箱 → Resend 发 6 位验证码（10 分钟有效）→ 首次登录自动建号 → 会话是 HttpOnly Cookie `gomoku_session`（30 天）。
  - meme 用 Better Auth + D1；这里没有用 Better Auth，因为它的存储适配器需要关系型查询，而 Netlify Blobs 是键值存储。流程在 `server/auth.ts` 里直接实现。
  - 验证码和会话令牌只存哈希；每个验证码最多验证 5 次（并发猜测也算数）；同一邮箱 60 秒内只能发一次；写接口校验 Origin。
- **排行榜**：人机、在线对局结束时提交整盘棋谱，服务器按规则逐手复盘，真的连成五子（或对手认输且双方都落过子）才算胜。
  - 积分：豆芽 1、狐狸阿明 3、猫头鹰棋圣 6、在线 5、平局 1；负局 0 分但记负场。每人 8 秒最多提交一次。
  - AI 着法在浏览器里算，服务器无法证明来自 AI；靠复盘、限频和管理员删人兜底。
- **实时刷新**：Netlify Functions 不支持长连接，首页「排行」每 4 秒轮询，带 ETag，没变化回 304；标签页在后台时暂停。
- **界面**：首页新增「排行」标签；登录框是 HTML 浮层；结算页显示「排行榜 +N 分 · 第 M 名」，未登录时左上角有「登录记录这局」。

## 2. 需要你配置的东西

### 2.1 Netlify 环境变量（Site configuration → Environment variables）

| 变量 | 必填 | 值 |
| --- | --- | --- |
| `AUTH_SECRET` | 是 | 至少 16 位随机串，用 `openssl rand -hex 32` 生成。**没配时所有 `/api/*` 返回 500「服务器未配置 AUTH_SECRET」**。以后更换会让所有人重新登录。 |
| `RESEND_API_KEY` | 是 | Resend 控制台生成的 API Key。没配时验证码只打印在函数日志里，用户收不到。 |
| `EMAIL_FROM` | 是 | 发件人，例如 `五子棋 <login@你的域名>`。域名必须先在 Resend 验证。 |
| `ADMIN_EMAILS` | 否 | 逗号分隔的邮箱，这些账号可以把作弊玩家移出榜单。 |

变量作用域选 Functions（或 All scopes），Production 和 Deploy Previews 都要有，否则预览环境登录会 500。

### 2.2 Resend 发信域名

1. Resend → Domains → Add Domain，填要用的域名（建议子域名，如 `mail.你的域名`）。
2. 按提示在 DNS 加 SPF、DKIM（以及可选的 DMARC）记录，等状态变成 Verified。
3. `EMAIL_FROM` 用这个域名下的地址。

未验证域名时 Resend 只能用 `onboarding@resend.dev` 发信，而且只能发给 Resend 账号本人的邮箱，只适合自测。

### 2.3 不需要配的

- **Netlify Blobs**：在 Netlify 上自动可用，无需开关或密钥。
- **函数**：`netlify.toml` 已声明 `[functions] directory = "netlify/functions"`、`node_bundler = "esbuild"`；函数 `netlify/functions/api.mts` 自己声明了路径 `/api/*`。
- **存储隔离**：生产环境用 `gomoku-auth`、`gomoku-board` 两个 store；非生产部署（Deploy Preview、分支部署，按 Netlify 的 `CONTEXT` 变量判断）自动用 `gomoku-auth-preview`、`gomoku-board-preview`，不会污染正式榜单。

## 3. 在 Deploy Preview 上验证（合并前必须做）

1. 配好变量后，在 PR 上触发一次 Deploy Preview（配置变了需要重新部署才生效）。
2. 打开预览地址，确认 `GET /api/leaderboard` 返回 JSON：`{"version":0,"updatedAt":0,"entries":[]}`，响应头有 `etag`。
3. 首页 → 「排行」→「登录上榜」→ 输入邮箱 → 收到邮件 → 输入验证码，排行页底部应显示「昵称 · 还没有成绩」。
4. 回首页「对战」→「人机对战」→ 选豆芽 → 赢一局 → 结算页收下奖励后应提示「排行榜 +1 分 · 第 1 名」。
5. 用另一个浏览器（或无痕窗口）打开「排行」不要刷新，在第一个浏览器再赢一局，第二个浏览器应在 5 秒内自动更新分数。
6. 退出登录后再赢一局：结算页左上角应出现「登录记录这局」，登录后这一局会被记上。
7. 在 Netlify → Logs → Functions 里确认 `api` 函数没有报错。

出问题时先看函数日志：
- `AUTH_SECRET is missing or too short` → 变量没配或没作用到 Functions / 当前部署上下文。
- `Resend 4xx` → Key 不对，或 `EMAIL_FROM` 的域名没验证。
- `MissingBlobsEnvironmentError` → 函数不是在 Netlify 上运行（例如被当成静态站点部署了），检查构建是否识别到了 `netlify/functions`。

验证通过后再合并到 `main`，生产部署会用正式 store（初始为空榜）。

## 4. 本地开发与测试

```bash
npm ci
npm test         # 42 个测试，其中 tests/server.test.ts 覆盖登录、复盘判定、积分、并发提交、接口
npm run build    # 浏览器端 + Node 端（函数、vite 配置）两套类型检查后打包
npm run dev      # http://localhost:5173
```

`npm run dev` 时，`vite.config.ts` 里的 `localApi` 插件用同一套 `server/` 代码在内存里跑 `/api/*`（重启即清空），登录框会直接显示验证码，不需要 Resend 和 Blobs。本地模拟一局可上榜的胜局：

```
http://localhost:5173/?demo=result&brain=owl&moves=9&rated
```

（先在首页「排行」里登录，再打开这个地址，开箱收下后会提交。）

## 5. 代码地图

| 路径 | 内容 |
| --- | --- |
| `netlify/functions/api.mts` | Netlify Function 入口：读环境变量、选 Blobs store、交给 `handleApi` |
| `server/api.ts` | 所有 `/api/*` 路由、Cookie、Origin 校验、错误格式 `{ error: { code, message } }` |
| `server/auth.ts` | 验证码、用户、会话；邮件模板；`AUTH_SECRET` 用于哈希 |
| `server/board.ts` | 棋谱校验与复盘（`judge`）、积分、玩家战绩、排行榜文档（ETag 条件写入重试） |
| `server/kv.ts` | 存储接口：`blobsKV`（生产）与 `MemoryKV`（测试、本地） |
| `src/result/ladder.ts` | 积分表，前后端共用 |
| `src/net/account.ts` | 前端：会话状态、登录、提交成绩、`BoardFeed` 轮询 |
| `src/ui/authDialog.ts` | 登录 / 改名的 HTML 浮层 |
| `src/ui/LeaderboardView.ts` | 首页排行面板 |
| `src/screens/ResultScreen.ts` | 结算页自动提交与「登录记录这局」 |

## 6. 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/email-otp` | `{ email }`，发验证码 |
| POST | `/api/auth/verify` | `{ email, code, name? }`，登录并设置 Cookie |
| GET | `/api/auth/session` | 当前用户或 `null` |
| POST | `/api/auth/sign-out` | 退出 |
| GET / PATCH | `/api/me` | 我的战绩与名次 / 改昵称 `{ name }` |
| GET | `/api/leaderboard` | 前 50 名，支持 `If-None-Match` → 304 |
| POST | `/api/results` | `{ mode, brain?, myStone, moves: [[x,y],...], resigned? }` |
| DELETE | `/api/admin/players/:userId` | 仅 `ADMIN_EMAILS` 中的账号 |

## 7. 注意事项

- 本仓库的约定：**合并 PR 要先经用户明确同意**；提交信息用英文，结尾带 `Co-Authored-By` 行（见历史提交）。
- `.github/workflows/ci.yml` 目前只能手动触发（`workflow_dispatch`），PR 不会自动跑 CI；本地请跑 `npm test && npm run build`。
- 当前 GitHub Actions 因账号计费限额无法启动（之前的运行都是「recent account payments have failed or your spending limit needs to be increased」），不是代码问题。
- 语音文件还没生成：需要用户提供 Fish Audio API Key 后运行 `FISH_API_KEY=... npm run voice`，把 `public/voice/` 下生成的 mp3 一起提交；在那之前游戏会退回浏览器语音。这件事和排行榜无关，可以之后再做。
