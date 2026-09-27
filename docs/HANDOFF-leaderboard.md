# 交接：排行榜上线（给 ChatGPT）

仓库 `virgoone/pixi-gomoku`，PR #1（分支 `claude/leaderboard` → `main`）：https://github.com/virgoone/pixi-gomoku/pull/1

本分支包含邮箱登录、排行榜与本机成绩补传。合并前必须通过下面的 Deploy Preview 验收；合并需要用户明确同意。

## 1. 这个 PR 做了什么

- **邮箱验证码登录**（流程照 `virgoone/meme`）：输入邮箱 → Resend 发 6 位验证码（10 分钟有效）→ 首次登录自动建号 → 会话是 HttpOnly Cookie `gomoku_session`（30 天）。
  - meme 用 Better Auth + D1；这里没有用 Better Auth，因为它的存储适配器需要关系型查询，而 Netlify Blobs 是键值存储。流程在 `server/auth.ts` 里直接实现。
  - 验证码和会话令牌只存哈希；每个验证码最多验证 5 次（并发猜测也算数）；同一邮箱 60 秒内只能发一次；写接口校验 Origin。
- **排行榜**：人机、在线对局结束时提交整盘棋谱，服务器按规则逐手复盘，真的连成五子（或对手认输且双方都落过子）才算胜。
  - 积分：豆芽 1、狐狸阿明 3、猫头鹰棋圣 6、在线 5、平局 1；负局 0 分但记负场。每人 8 秒最多提交一次。
  - AI 着法在浏览器里算，服务器无法证明来自 AI；靠复盘、限频和管理员删人兜底。
- **实时刷新**：Netlify Functions 不支持长连接，首页「排行」每 4 秒轮询，带 ETag，没变化回 304；标签页在后台时暂停。
- **登录时机**：游戏与结算都不要求登录、不弹登录框；只有进入首页「排行」时要求登录。排行榜 API 也要求有效会话，退出后清除页面内的榜单。所有玩家都使用自己的邮箱登录。
- **本机补传与跨设备合并**：每局结束先把完整棋谱、UUID 和结束时间保存到 localStorage；游客刷新后仍保留，登录后归属该账号并补传。已归属 A 的记录不会传给 B。网络失败、限流会保留并重试，收到成功响应才移除。不同设备向同一账号增量提交，玩家统计与已处理对局 ID 在同一个 Blobs 文档中条件写入，重复请求只记一次；排行榜连胜按结束时间合并计算。
- **历史兼容与账号存档**：`LocalProgress` 为旧汇总存档保存稳定导入 ID，首次登录合并金币、宝石、皇冠及胜负战绩，原始存档保留。新的变动使用每事件一个 localStorage 键，收到云端检查点后清理，检查点包含本设备已处理 ID，响应丢失或刷新不重复累计。服务端 `profiles/<userId>` 通过条件写入原子保存合计与回执，`profile-owners/<eventId>` 绑定首次账号。独立设备旧存档相加，云端合计不作为新导入。排行榜与账号「战绩」都展示合并后的胜负和平局；旧战绩没有棋谱和难度，不补计排行榜积分。
- **榜单与存档一致**：存档同步后发布账号合计；打开榜单也会修复当前账号已导入但尚未展示的历史战绩，无需重传或新开一局。榜单与 `/api/me` 使用账号总数，已验证棋谱场次仅作为旧客户端尚未补传存档时的下限，两份计数不相加；`players` 内的棋谱账本和积分保持独立。相同合计不更新榜单版本，仍可返回 304；发布失败后重试不会重复导入。只有历史战绩也可上榜；管理员移除时留下隐藏标记，周期同步不会把玩家重新加回，重新完成有效对局后才能再上榜。
- **存档同步时机**：登录立即导入；本地奖励和战绩变化后 250ms 合批，最多每批 50 条；前台每 30 秒、回到前台、重新打开或恢复网络时同步。页面显示同步状态，点击可手动刷新。偏好仍为本机设置，退出后展示游客存档，旧账号存档保留并隔离。历史最高连胜取最大值，个人当前连胜使用最近一次设备结算快照，历史快照不能覆盖新对局；并行设备无法还原旧版缺失的时间线。

## 2. 需要你配置的东西

### 2.1 Netlify 环境变量（Site configuration → Environment variables）

| 变量 | 必填 | 值 |
| --- | --- | --- |
| `AUTH_SECRET` | 是 | 至少 16 位随机串，用 `openssl rand -hex 32` 生成。**没配时所有 `/api/*` 返回 500「服务器未配置 AUTH_SECRET」**。以后更换会让所有人重新登录。 |
| `RESEND_API_KEY` | 是 | Resend 控制台生成的 API Key。线上缺失时返回 503，不生成或打印验证码。 |
| `EMAIL_FROM` | 是 | 发件人，例如 `五子棋 <login@你的域名>`。域名必须先在 Resend 验证。 |
| `ADMIN_EMAILS` | 否 | 逗号分隔的邮箱，这些账号可以把作弊玩家移出榜单。每次读取会话重新检查名单，已有账号也能授予或撤销权限。 |

变量作用域选 Functions（或 All scopes），Production 和 Deploy Previews 都要有，否则预览环境登录会 500。免费套餐不支持细分作用域时使用 All scopes。生产和预览使用不同 AUTH_SECRET。

自行部署时使用自己的 Resend Key、已验证发信域名与管理员邮箱。密钥仅放在 Netlify 环境变量中，不提交到 Git。

### 2.2 Resend 发信域名

1. Resend → Domains → Add Domain，填要用的域名（建议子域名，如 `mail.你的域名`）。
2. 按提示在 DNS 加 SPF、DKIM（以及可选的 DMARC）记录，等状态变成 Verified。
3. `EMAIL_FROM` 用这个域名下的地址。

未验证域名时 Resend 只能用 `onboarding@resend.dev` 发信，而且只能发给 Resend 账号本人的邮箱，只适合自测。

### 2.3 不需要配的

- **Netlify Blobs**：在 Netlify 上自动可用，无需开关或密钥。
- **函数**：`netlify.toml` 已声明 `[functions] directory = "netlify/functions"`、`node_bundler = "esbuild"`；函数 `netlify/functions/api.mts` 自己声明了路径 `/api/*`。
- **存储隔离**：生产环境用 `gomoku-auth`、`gomoku-board` 两个 store；非生产部署（Deploy Preview、分支部署，按函数运行时 `context.deploy.context` 判断，未知上下文也按非生产处理）自动用 `gomoku-auth-preview`、`gomoku-board-preview`，不会污染正式榜单。

## 3. 在 Deploy Preview 上验证（合并前必须做）

1. 配好变量后，在 PR 上触发一次 Deploy Preview（配置变了需要重新部署才生效）；检查 `GET /api/auth/session` 为 `{"user":null}`，未登录访问 `/api/leaderboard` 和提交 `/api/results` 均为 401。
2. 不登录玩一局人机：游戏与结算不弹登录，刷新后本机待上传棋谱仍在，网络中没有 `/api/results` 请求。
3. 打开「排行」才弹登录；用自己的邮箱接收并输入验证码。登录成功后本机成绩补传，待同步数量归零，榜单出现积分；管理员邮箱的会话角色为 `admin`，普通账号为 `user`。
4. 用第二个浏览器或另一设备登录同一邮箱；各完成不同对局，分数与场次应累加。重发同一 `gameId` 不重复计分；模拟断网、刷新、429 后仍能补传。
5. 两个浏览器同时打开「排行」，一个提交成绩后，另一个应在下一次 4 秒轮询后更新；未变化返回 304，切到后台暂停请求。
6. 退出后榜单立即隐藏，再玩一局仍不弹登录；下次进入排行并登录后补传。切换账号不上传已归属于旧账号的待传棋谱。
7. 检查 Netlify 构建与 Functions 日志；预览数据只在 `gomoku-auth-preview` / `gomoku-board-preview`，正式 store 不出现测试战绩。

出问题时先看函数日志：
- `AUTH_SECRET is missing or too short` → 变量没配或没作用到 Functions / 当前部署上下文。
- `Resend 4xx` → Key 不对，或 `EMAIL_FROM` 的域名没验证。
- `MissingBlobsEnvironmentError` → 函数不是在 Netlify 上运行（例如被当成静态站点部署了），检查构建是否识别到了 `netlify/functions`。

验证通过后再合并到 `main`，生产部署会用正式 store（初始为空榜）。

## 4. 本地开发与测试

```bash
npm ci
npm test         # 规则、登录、接口、本机队列、跨设备去重、轮询与部署上下文隔离
npm run build    # 浏览器端 + Node 端（函数、vite 配置）两套类型检查后打包
npm run dev      # http://localhost:5173
```

`npm run dev` 时，`vite.config.ts` 里的 `localApi` 插件用同一套 `server/` 代码在内存里跑 `/api/*`（重启即清空），登录框会直接显示验证码，不需要 Resend 和 Blobs。本地模拟一局可上榜的胜局：

```
http://localhost:5173/?demo=result&brain=owl&moves=9&rated
```

（无需先登录：结算时先保存在本机；之后在首页「排行」登录即可补传。开发演示不会进入生产包。）

## 5. 代码地图

| 路径 | 内容 |
| --- | --- |
| `netlify/functions/api.mts` | Netlify Function 入口：读环境变量、选 Blobs store、交给 `handleApi` |
| `server/api.ts` | 所有 `/api/*` 路由、Cookie、Origin 校验、错误格式 `{ error: { code, message } }` |
| `server/auth.ts` | 验证码、用户、会话；邮件模板；`AUTH_SECRET` 用于哈希 |
| `server/board.ts` | 棋谱校验与复盘（`judge`）、积分、账号胜负合计展示、排行榜文档（ETag 条件写入重试） |
| `server/profile.ts` | 个人存档导入、事件归属、原子合并与回执去重；独立于排行榜积分 |
| `src/profile/localProgress.ts` | 本机历史快照、事件队列、账号隔离与云端检查点 |
| `src/net/profileSync.ts` | 登录、变动、前台恢复和重试时的存档同步 |
| `server/kv.ts` | 存储接口：`blobsKV`（生产）与 `MemoryKV`（测试、本地） |
| `src/result/ladder.ts` | 积分表，前后端共用 |
| `src/net/account.ts` | 前端：会话状态、登录、补传与重试、`BoardFeed` 轮询 |
| `src/net/resultQueue.ts` | 每局独立 localStorage 记录，匿名认领、账号归属、确认后删除 |
| `src/ui/authDialog.ts` | 登录 / 改名的 HTML 浮层 |
| `src/ui/LeaderboardView.ts` | 首页排行面板 |
| `src/screens/ResultScreen.ts` | 结算时保存棋谱，登录后自动同步，不触发登录 |

## 6. 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/email-otp` | `{ email }`，发验证码 |
| POST | `/api/auth/verify` | `{ email, code, name? }`，登录并设置 Cookie |
| GET | `/api/auth/session` | 当前用户或 `null` |
| POST | `/api/auth/sign-out` | 退出 |
| GET / PATCH | `/api/me` | 我的战绩与名次 / 改昵称 `{ name }` |
| POST | `/api/profile` | `{ userId, deviceId, events }`；需要登录，账号匹配，最多 50 个事件 / 64 KB；返回个人存档、版本和本设备回执。空事件数组用于拉取最新存档 |
| GET | `/api/leaderboard` | 需要登录；前 50 名，支持 `If-None-Match` → 304 |
| POST | `/api/results` | 需要登录；`{ userId, gameId, finishedAt, mode, brain?, myStone, moves: [[x,y],...], resigned? }`，`gameId` 为 UUID v4，`finishedAt` 为 Unix 毫秒；账号必须与会话相同 |
| DELETE | `/api/admin/players/:userId` | 仅 `ADMIN_EMAILS` 中的账号 |

## 7. 注意事项

- 本仓库的约定：**合并 PR 要先经用户明确同意**；提交信息用英文，结尾带 `Co-Authored-By` 行（见历史提交）。
- `.github/workflows/ci.yml` 目前只能手动触发（`workflow_dispatch`），PR 不会自动跑 CI；本地请跑 `npm test && npm run build`。
- 手动发布通过 Netlify Git 构建一起打包静态页面与 Functions，校验提交 SHA、静态文件哈希及会话接口。不要用只有 dist 的 ZIP 发布覆盖含函数的站点。
- 当前 GitHub Actions 因账号计费限额无法启动（之前的运行都是「recent account payments have failed or your spending limit needs to be increased」），不是代码问题。
- 语音文件还没生成：需要用户提供 Fish Audio API Key 后运行 `FISH_API_KEY=... npm run voice`，把 `public/voice/` 下生成的 mp3 一起提交；在那之前游戏会退回浏览器语音。这件事和排行榜无关，可以之后再做。
