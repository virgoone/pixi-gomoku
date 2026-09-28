# Pixi 五子棋 · Gomoku

[在线试玩](https://gomoku.douni.one/) · [GPL-3.0 License](./LICENSE) · [用 Opus 开发的过程与提示词](./docs/BUILDING-WITH-OPUS.md)

用 **Claude Code + Opus** 起步并持续迭代的开源浏览器五子棋。基于 **PixiJS 8、TypeScript、Vite**，支持三档 AI、同屏双人和 WebRTC 好友对战；配有开箱结算动画、邮箱登录、排行榜及跨设备存档。

**打开就能下棋，不用注册。** 邀请好友时分享房间链接；想查看排行榜、合并不同设备的战绩和奖励时，再用自己的邮箱登录。

一个用 [PixiJS v8](https://pixijs.com/) 写的休闲五子棋小游戏。工程结构参照
[pixijs/open-games](https://github.com/pixijs/open-games) 里的 *Puzzling Potions*
（screens / popups / ui / navigation 分层），主要美术资源是手写 SVG，在加载阶段栅格化成纹理；排行榜空状态另用一张透明 PNG 插画。

开发分工：Claude Code / Opus 完成游戏主体与初版登录排行榜，后续用 Codex 补齐移动端交互、部署、历史存档迁移和榜单一致性等工程细节。仓库保留对应提交与测试，便于复现和继续修改。

## 玩法

- **人机对战**：四个电脑棋手可选，AI 跑在 Web Worker 里，不卡界面。
  | 棋手 | 难度 | 思路 |
  | --- | --- | --- |
  | 豆芽 | 简单 | 按棋型打分后在前几名里随机挑，偶尔漏看 |
  | 狐狸阿明 | 中等 | 贪心：同时算进攻和防守价值，必杀和必防不会漏 |
  | 猫头鹰棋圣 | 困难 | alpha-beta 迭代加深搜索，每步约 0.9 秒 |
  | 神龙棋仙 | 大师 | 开源引擎 [Rapfi](https://github.com/dhbloo/rapfi) 编译成 WebAssembly，每步约 1 秒；选中时才下载（约 1.3 MB），加载失败不能开局，对局中出错由猫头鹰接手并按猫头鹰结算 |
- **同屏双人**：两个人在同一台设备上轮流落子。
- **在线房间**：创建房间得到 6 位房间号和邀请链接（`?room=123456`），好友点开即可加入。
  基于 WebRTC（PeerJS 公共信令服务器）点对点传输，不需要自建后端。
  **30 秒内没人加入会自动改为和「狐狸阿明」对战**；对局中对手掉线，也由狐狸阿明接手。
- 规则：15×15 棋盘，黑先，五子或以上连成一线即胜（无禁手）。支持悔棋（人机/同屏）、认输、再来一局（在线会交换先后手）。
- 连珠模式（人机、同屏、在线都可选）：按 RIF 连珠规则，黑棋只有恰好五连才算胜，不能下三三、四四、长连；成五优先于禁手，白棋不受限制。轮到你执黑时禁手点会标红叉，AI 执黑不会下禁手，执白也不会去堵黑棋下不了的禁手点。禁手判定在 `src/gomoku/renju.ts`，用开源引擎 [Rapfi](https://github.com/dhbloo/rapfi) 的 `YXSHOWFORBID` 在约 4 万个禁手点上做过对拍，抽样结果存在 `tests/fixtures/renju-rapfi.json`。暂未包含开局规则（三手交换、五手两打）。
- 开局规则（可选，仅连珠）：三手交换 · 五手两打（RIF）。一方先摆前三手（第 1 手天元、第 2 手天元一圈内、第 3 手两圈内，棋盘上会标出范围），另一方决定是否交换执子；白方下第 4 手后，黑方给出两个互不对称的第 5 手，白方留下一个、另一个作废。开局阶段不能悔棋。电脑棋手会自己摆开局、决定交换和挑第 5 手（神龙用引擎评估，其余用棋型评分）。规则按钮在「无禁手 → 连珠 → 连珠 · 三手交换五手两打」间切换。
- 托管（在线房间）：对局中点「托管」，由神龙棋仙替你下，开局阶段的交换、给第五手、挑第五手也由它决定；只有你手动取消才会结束。对方会看到「托管给神龙」标记（对方客户端太旧看不到时不允许托管）。托管期间不显示悔棋按钮。托管局不计入你的战绩和奖励，记在龙九段名下（对手照常按在线对局计分；双方都托管的「神龙对神龙」谁都不算），结算页显示「托管局」。对手掉线时由神龙接手对手一方：托管中直接继续，否则先问你；你这边仍按在线对局结算，同时算作龙九段的一局。
- 在线悔棋：需要对方同意；轮到你时撤回两手，刚下完时撤回一手；RIF 开局阶段、托管期间不能悔棋。
- 龙九段（神龙棋仙的排行榜昵称）：和玩家一起按积分排名，所有和它对下的局都算（人机挑战神龙、神龙接手掉线对手的在线局、替人托管的局），它赢一局 +10 分、平局 +1。点它那一行能看最近 10 局；「神龙战绩里显示我的名字」开关在这个弹窗里，默认关闭（显示为匿名棋手）。
- 规则说明：首页「规则」标签页，分「三种规则 / 禁手 / 开局 / 托管与排行」四页，用对比表和小棋盘示意说明各规则的区别；窄屏自动改成卡片排版。
- 在线连珠：规则由房主开房前选，随 `start` 消息发给对方，再来一局沿用。联机协议版本为 4（3 起有开局规则的交换、候选、挑选消息，4 起有托管与悔棋请求）；对方客户端较旧时逐级降级：协议 2 按不带开局规则的连珠进行，协议 1 按无禁手进行，并提示房主。
- 触屏上第一次点击是预览，再点一次同一位置才落子，防误触。

## 结算动画

参考 [这条推文](https://x.com/op7418/status/2103724883301814408) 里的开宝箱节奏：

1. 宝箱从天而降，按本局表现逐级「升级！」——普通 → 稀有 → 史诗 → 传说，每升一级有闪光、光环和背景换色；
2. 「点击开启」后开盖，光束与彩纸爆发，金币 / 宝石 / 皇冠奖励卡依次弹出；
3. 点「收下」，奖励图标飞向右上角 HUD 并计入存档。

输棋或和棋显示银色 / 铜色徽章和安慰奖。

对局结束、宝箱升级和开箱时有中文语音播报，用的是 [edge-tts](https://github.com/rany2/edge-tts)（微软 Edge 在线神经语音，活泼的卡通女声 `zh-CN-XiaoyiNeural`）预先生成、打包进 `public/voice/` 的音频，播放时自动跳过开头静音以卡准动画节拍。对局结束的播报缺少音频时退回浏览器自带的语音合成；结算页（升级、开箱）的台词只用音频，迟到超过 0.4 秒就不播。音效全部用 Web Audio 实时合成：铃音、木质落子声、起跳/转身/蓄力/爆炸/号角/计数滴答，经过低通、混响、压缩和限幅；静音开关同时关闭音效和语音。
宝箱照参考视频画成 3/4 视角的立体木箱（桶形箱盖、木板箱身、包角和 U 形锁扣），按等级换配色：普通绿、稀有蓝、史诗紫配黄/金包边，传说黄箱配粉色包边。

人机或在线对局中，自己落子后中途退出会中断连胜（暂停菜单会提示）；对手先离开则不受影响。

宝箱等级：对手强度定基础（豆芽 0、狐狸 1、猫头鹰 2、神龙 3、在线 1），12 手内取胜 +1，连胜 3 局以上 +1，最高传说。
游客存档保存在 `localStorage`；登录后金币、宝石、皇冠和胜负战绩会合并到账号并跨设备同步。昵称、静音和对局偏好保留在本机。

## 开发

需要 Node 22.23.3（见 `.nvmrc`，Vite 要求至少 22.12）。

```bash
nvm use           # 使用 .nvmrc 中的 Node 版本
npm ci            # 按 package-lock.json 安装依赖
npm run dev        # http://localhost:5173
npm test           # 规则、AI、结算的单元测试（Vitest）
npm run build      # tsc 类型检查 + vite 打包到 dist/
```

开发模式下可以直接跳到某个画面（生产包里不含这些入口）：

```
/?demo=result&brain=owl&moves=9   胜利宝箱
/?demo=loss  /?demo=draw          输 / 和 徽章
/?demo=game&brain=fox             直接开一局
```

`dev/art.html` 是所有 SVG 素材的预览页（`npm run dev` 后打开 `/dev/art.html`）。

## 排行榜与登录

- 邮箱验证码登录，流程与 meme 项目一致：输入邮箱 → 收到 6 位验证码（Resend 发信，10 分钟有效）→ 首次登录自动建号，会话是 HttpOnly Cookie。验证码与会话令牌只存哈希；每个验证码最多试 5 次（并发猜测也算数），同一邮箱 60 秒内只能发一次。
- 登录后，人机与在线对局结束时自动提交整盘棋谱。服务器用同一套规则逐手复盘，只有真的连成五子（或对手认输且已下满 5 手）才算胜；积分：豆芽 1、狐狸阿明 3、猫头鹰棋圣 6、神龙棋仙 10、在线 5、平局 1（龙九段赢玩家一局也 +10）。每人 8 秒最多提交一次。电脑的着法在浏览器里算，服务器无法证明它来自 AI，这点靠复盘、限频和管理员删人兜底。
- 玩游戏与结算不需要登录；只有查看「排行」时才弹登录框。每局棋谱先保存在本机，游客刷新或断网后仍保留，登录后自动补传。同一邮箱在不同设备的成绩累加合并，以对局 UUID 去重；切换账号不会上传旧账号待传成绩。服务端同时保护查看榜单与上传接口。
- 旧版汇总战绩及金币、宝石、皇冠首次登录会一次性导入账号存档。排行榜胜负和平局展示同一份账号合计，包含历史存档；只有历史战绩的玩家也能上榜。已导入的存档在打开排行榜或下次存档同步时自动更新榜单，无需重新导入或再玩一局。历史存档没有完整棋谱，不补计排行榜积分；展示合计不与已验证棋谱场次相加，避免重复累计。旧客户端尚未上传存档时，已验证场次作为展示下限。
- 存档在登录后立即合并，后续战绩与奖励变动批量自动上传；前台每 30 秒或回到页面时拉取另一设备的存档，失败后 30 秒重试，也可点击同步状态刷新。每次本机变动都有固定编号，导入与重试原子去重；切换账号不会再次导入原账号的存档。已更新的客户端不会把云端合计重新当成本机增量。
- 首页「排行」页每 4 秒轮询一次（带 ETag，没变化时服务器回 304，节省响应体传输；函数与存储读取仍会发生，切到后台自动暂停）。Netlify Functions 不支持长连接，所以用轮询实现实时刷新；自己提交成绩后会立即刷新。
- 存储是 Netlify Blobs：`gomoku-auth`（验证码、用户、会话）与 `gomoku-board`（玩家战绩、排行榜文档）；非生产部署自动改用 `-preview` 结尾的独立存储。排行榜文档用条件写入（ETag 乐观锁）更新，多人同时提交不会互相覆盖。
- 接口在 `netlify/functions/api.mts`（路径 `/api/*`），逻辑在 `server/`。`npm run dev` 时 Vite 用同一份代码在内存里跑这些接口，登录框会直接显示验证码，方便本地调试。

需要在 Netlify 配置的环境变量：

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 必填，至少 16 位的随机串（如 `openssl rand -hex 32`），用于给验证码和会话做哈希；更换会让所有人重新登录 |
| `RESEND_API_KEY` | 发验证码邮件用的 Resend 密钥；线上不配返回 503，验证码不会写入日志；仅本地开发显示调试验证码 |
| `EMAIL_FROM` | 发件人，需是 Resend 已验证的域名，如 `五子棋 <login@你的域名>` |
| `ADMIN_EMAILS` | 可选，逗号分隔；这些邮箱可调用 `DELETE /api/admin/players/<userId>` 把作弊的玩家移出排行榜 |

## 语音

台词在 `src/app/voiceLines.ts`。改了台词或想换声音后重新生成（只会重做有变化的句子）。
默认用 edge-tts，不需要密钥，只需装好 [uv](https://docs.astral.sh/uv/)（脚本通过 `uvx edge-tts` 调用）或 `pipx install edge-tts`：

```bash
npm run voice:edge                                  # 生成到 public/voice/*.mp3
EDGE_VOICE=zh-CN-XiaoxiaoNeural EDGE_RATE=+0% npm run voice:edge -- --force   # 换声音/语速、全部重做
uvx edge-tts --list-voices | grep zh-CN             # 可选的中文声音
```

也可以改用 Fish Audio TTS（需要 API Key）：

```bash
FISH_API_KEY=你的密钥 npm run voice            # 生成到 public/voice/*.mp3
FISH_API_KEY=... FISH_VOICE_ID=<声音 id> npm run voice -- --force   # 换声音、全部重做
```

`public/voice/manifest.json` 记录每句的文本和声音，生成的 mp3 需要一起提交。

## 部署

游戏前端是静态资源；登录与排行榜使用 Netlify Functions、Blobs 和 Resend，所需环境变量见上文。

- 正式域名：<https://gomoku.douni.one>
- Netlify 地址：<https://pixi-gomoku.netlify.app>
- 部署管理：<https://app.netlify.com/projects/pixi-gomoku>

**自动 CI/CD 由 Netlify GitHub App 执行**：仓库的 `main` 推送后，Netlify 自动安装锁定依赖，
执行 `npm test && npm run build`（单元测试、类型检查、生产打包），全部成功才发布 `dist/`。
构建命令和 Node 版本由 `netlify.toml` 管理；失败时保留上一版正式站点。

GitHub Actions 的 `.github/workflows/ci.yml` 保留为手动备用发布流程 **Manual test and deploy**。
2026-09-27 配置时，GitHub 托管运行器因账户付款/支出额度问题无法启动，因此不依赖它自动发布。
账户恢复后可在 Actions 手动运行；该流程先测试构建，再触发 Netlify 对 `main` 的 Git 构建，
同时部署 `dist/` 与 Functions。等待状态 `ready` 后检查提交 SHA、逐个下载静态产物核对 SHA-256
（包含 AI Worker 与动态加载资源），并验证 `/api/auth/session`。仅 `main` 会发布正式站点。

GitHub **Settings → Environments → production** 中需要：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `NETLIFY_AUTH_TOKEN` | Netlify 部署凭据，仅发布作业可用 |
| Variable | `NETLIFY_SITE_ID` | `4a15eda8-12e1-48f1-a7e4-1e6a74a1cb30` |

不要将部署 token 写进源码或 `VITE_*` 变量。需要更换凭据时，只更新 GitHub 环境 Secret。
Cloudflare DNS 使用 `gomoku` CNAME 指向 `pixi-gomoku.netlify.app`，DNS only；TLS 由 Netlify 管理。
如需回滚，在 Netlify 的 Deploys 中选择上一次成功部署并 **Publish deploy**。

仓库根目录的 `netlify.toml` 是自动构建配置：测试后打包，发布目录 `dist`，Node 与 `.nvmrc` 一致。
`vite.config.ts` 里 `base: './'`，放在任意子路径下也能用。

在线房间依赖 PeerJS 公共信令和 WebRTC，部分防火墙/NAT 网络可能无法直连；人机与同屏模式不受影响。

## Google Analytics（可选）

在 GA4 中新建网站数据流，再在 Netlify 的构建环境中添加：

| 变量 | 示例 | 用途 |
| --- | --- | --- |
| `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | 你自己的 GA4 衡量 ID（公开标识符） |
| `VITE_ANALYTICS_ORIGIN` | `https://gomoku.douni.one` | 唯一允许上报的正式站点 origin |

修改后重新构建。未配置 ID 时不加载统计；开发模式、Deploy Preview 与其他域名也不发送事件。Fork 部署请同时设置自己的 ID 和 origin。

统计包括 `page_view`、`level_start`（开局）、`level_end`（胜负、模式、手数、结束原因）和 `view_leaderboard`。只记录新发生的对局，不把历史存档同步计作新游戏。链接可使用 `utm_source`、`utm_medium`、`utm_campaign` 区分推广来源。

事件不包含邮箱、昵称、房间号、棋谱或账号 ID；页面 URL 只保留路径和上述简单 UTM 标签，来源 URL 只保留域名。关闭 Google Signals 和广告个性化信号。建议创建数据流时关闭增强型衡量，只使用标准页面浏览和代码中的游戏事件。GA 自身仍会使用客户端标识符统计访问，部署者应按自己的发布地区设置适当的隐私说明与同意机制。

上线验证：浏览器 Network 中检查 `gtag/js` 与 GA `collect` 请求，随后在 GA4 实时报告中确认 `page_view` 和游戏事件；常规报表可能延迟。广告拦截器或网络限制可能阻止统计，不影响对局。

## 目录

```
src/
  main.ts            启动：创建 Pixi Application、加载纹理、进入首页
  app/               纹理注册、导航（screen/popup 栈）、音效合成、存档、字体
  svg/               palette.ts 配色与宝箱等级，art.ts 所有 SVG 素材
  ui/                按钮、面板、HUD、棋盘、玩家卡、彩纸、提示条
  screens/           Load / Home / Game / Result
  popups/            人机设置、在线房间、暂停、确认
  gomoku/            rules.ts 规则与对局；renju.ts 连珠禁手；ai/ 棋型评估、四个棋手、Worker（大师走 engine.worker.ts + public/engines/rapfi）
  net/online.ts      PeerJS 房间、消息协议、心跳
  result/            结算计分与宝箱动画
tests/               Vitest 单元测试
```

## 致谢

- 架构参考 [pixijs/open-games](https://github.com/pixijs/open-games)（MIT）
- 字体：Google Fonts 的 ZCOOL KuaiLe、Lilita One
- 动画：[GSAP](https://gsap.com/)

## 开源许可

项目代码采用 [GNU GPL v3.0 或更新版本](./LICENSE)（2026-09 起；此前的版本以 MIT 发布）。欢迎 Fork 和修改，分发修改版时需同样以 GPL 开源。大师对手使用的 [Rapfi](https://github.com/dhbloo/rapfi) 引擎为 GPL-3.0，编译产物在 `public/engines/rapfi/`（附 `COPYING`），可用 `scripts/build-rapfi.sh` 从固定版本的源码复现；其估值权重来自 [rapfi-networks](https://github.com/dhbloo/rapfi-networks)（CC0）。依赖库与字体保留各自的许可证；部署凭据、Resend Key 和 Fish Audio Key 需自行配置（默认语音用 edge-tts，不需要 Key），不能放进源码或 `VITE_*` 变量。
