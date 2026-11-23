# Doro Birthday

简约浅粉与浅绿色生日页面原型：草莓蛋糕、两侧持续掉落并可拖动收集的多罗图片，以及许愿后拖拽蛋糕上多罗猫的脸和耳朵使其形变的交互。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址（通常是 `http://localhost:5173/`）。

也可以双击项目根目录的 `start-doro19.bat`，先构建，再在 5173 启动稳定预览并检查 Cloudflare Tunnel 服务。开发时使用 `npm run dev`；开发服务会在源码或 `.env` 变化时自动刷新页面，不适合给访客使用。

## `.env` 界面配置

项目根目录的 `.env` 使用 UTF-8 编码。页面文案、按钮标签、等待时间和主要动效时长都集中在这里，并按中文注释分组：

- `VITE_TEXT_...`：页面提示、按钮文字、辅助标签和网页标题。
- `VITE_WAIT_..._MS`：页面流程等待时长，单位为毫秒；例如长按蜡烛、蛋糕揭示和切蛋糕阶段。
- `VITE_MOTION_..._MS`：视觉动画时长，单位为毫秒。

修改 `.env` 后，开发环境重启 Vite；公开页面重新运行 `start-doro19.bat` 完成构建与启动。`VITE_` 配置会编译进前端页面，只用于公开文案和界面设置，不要存放密钥。

`.env` 是项目运行所需的公开界面配置，已纳入版本库。Resend 的 API 密钥不放进 `.env`，而是在 Cloudflare Pages 的 **Settings → Variables and Secrets** 中配置。

## 通过 Cloudflare Tunnel 发布

Cloudflare Tunnel 当前转发到 5173。`start-doro19.bat` 会在该端口启动构建后的预览页面，修改源码不会让访客页面自动刷新。项目仍保留 4173 端口的预览启动脚本，供单独检查构建结果使用：

```powershell
.\start-public-site.ps1
```

保持这个 PowerShell 窗口运行。单独预览会在 `http://127.0.0.1:4173/` 提供服务。当前公网 Tunnel 使用的是 `http://127.0.0.1:5173`，可直接运行 `start-doro19.bat`。

Cloudflare 控制台配置：

1. 在 **Domains → Onboard a domain** 添加 `minamo.life`，检查现有 DNS 记录，记下 Cloudflare 分配的两条 Nameserver。
2. 在阿里云域名管理中把 `minamo.life` 的权威 DNS 服务器改为这两条 Nameserver；如果域名启用了 DNSSEC，先在阿里云关闭它。等待 Cloudflare 的域名状态显示 **Active**。
3. 进入 **Networking → Tunnels → Create a tunnel**，创建一个由 Cloudflare 控制台管理的 Tunnel，并选择 Windows Connector。本机已安装 `cloudflared`。在 Windows 管理员 PowerShell 中运行控制台给出的 `cloudflared.exe service install <隧道令牌>` 命令，等待隧道状态显示 **Healthy**。隧道令牌相当于凭据，不要提交到项目或发给他人。
4. 打开该 Tunnel 的 **Routes → Add route → Published application**：Subdomain 填 `doro19`、Domain 选 `minamo.life`、Service URL 填 `http://127.0.0.1:5173`，然后保存。
5. 在域名的 **DNS → Records** 中确认 `doro19` 有一条指向 `<隧道 UUID>.cfargotunnel.com` 的 CNAME 记录，代理状态为橙色云朵。如果第 4 步没有自动创建，再手动添加；不要重复创建。

不需要为本机公网 IP 创建 A/AAAA 记录，也不需要在路由器开放端口。电脑和 5173 端口的预览服务必须持续运行，网站才能访问。修改后再次运行 `start-doro19.bat` 才会把新版本发布到公网。

## 技术方案

- Vite + React：页面与许愿状态。
- 原生 CSS 动画：持续掉落的表情、蛋糕浮动、拖拽脸与耳朵时逐渐增大的阻力和松手回弹，以及蜡烛火焰。
- 内联 SVG：蛋糕上的多罗猫沿用重绘造型；当前参考图保存在 `reference-doro.png`。
- `doro_bq/` 中的图片：两侧约每 0.6 秒持续生成随机种类和位置的贴纸；每个实例掉出页面或被收集后直接移除，不会回到顶部重生。用鼠标或触摸拖到桶上方松开，贴纸自由落至桶底后计数并淡出；进度按图片种类去重，蛋糕上的数字同步变化。开始收集后可打开完整图鉴：已收集的显示原图，未收集的显示剪影；集齐后进度条变为许愿按钮。写下非空愿望并提交后，愿望通过 Resend 发到指定收件箱，蛋糕上的大多罗猫出现；长按「吹蜡烛ovo」2.5 秒，进度环完成后先短暂熄灯，再进入昏暗画面。

## Cloudflare Pages 部署

使用 GitHub 集成创建 Pages 项目时，构建命令为 `npm run build`，输出目录为 `dist`，项目根目录留空。`functions/api/wishes.js` 会自动部署为 `/api/wishes`。

Pages 项目中的邮件变量需要在 **Settings → Variables and Secrets** 配置：`RESEND_API_KEY`、`WISH_RECIPIENT_EMAIL`、`WISH_FROM_EMAIL`。其中 API Key 必须设为加密 Secret；发件地址必须使用已经在 Resend 验证过的域名。

### 愿望邮件配置

提交愿望后，服务端会通过 [Resend](https://resend.com/) 把内容发送到指定收件箱，不再写入本机 `save/`。本地开发和 Cloudflare Pages Functions 都使用同一组环境变量：

```text
RESEND_API_KEY=re_...
WISH_RECIPIENT_EMAIL=收件邮箱@example.com
WISH_FROM_EMAIL=Doro19 <wish@minamo.life>
```

本地使用时，将这些内容保存为项目根目录的 `.env.local`；Cloudflare Pages 使用 **Settings → Variables and Secrets** 添加同名变量，并将 `RESEND_API_KEY` 标记为加密 Secret。`.env.local` 已被 `.gitignore` 排除，不要提交到代码仓库。

Resend 中需要先验证 `minamo.life` 发件域名，并按它提供的值在 Cloudflare DNS 添加 DKIM/SPF 记录。验证完成后才能稳定使用 `wish@minamo.life` 作为发件地址；测试阶段也可以使用 Resend 控制台允许的测试发件地址。

提交接口位于 `functions/api/wishes.js`，本地 Vite 通过同样的邮件逻辑转发到 Resend。部署到 Cloudflare Pages 时，构建命令使用 `npm run build`，输出目录使用 `dist`；Pages Functions 会自动接管 `/api/wishes`。

简单动效会跟随系统“减少动态效果”设置停用。
