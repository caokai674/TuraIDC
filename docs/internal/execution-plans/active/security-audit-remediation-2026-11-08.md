---
status: 进行中
updated: 2026-11-14
owner: platform-security
---

# 安全审查、依赖与 CI 修复计划（2026-11-08）

## 背景

根据 `Issue_idc.md` 的 TuraIDC 安全审查，集中修复上游 JWT、控制台回源、面板票据、host/sync 回调、插件市场、Docker 密钥、生产依赖和 CI 门禁问题。目标是让代码在受控测试环境中 fail-closed，并把未能在当前环境完成的生产密钥轮换、Docker 和完整后端回归保留为明确验收项。

## 范围与验收

- [x] 上游 JWT 拒绝空/短/示例 APP_KEY，强制 `iat/exp/is_api/iss/aud` 与 HS256 头校验。
- [x] 控制台静态资源代理关闭自动跳转，逐跳校验来源主机、端口、DNS 地址、大小和超时。
- [x] 控制台票据改为服务路径限定的 HttpOnly Cookie/Bearer，URL、Referer、缓存不再承载原票据。
- [x] 上游面板 HTML 净化并收紧 CSP；补充 host/sync 持久幂等与 VNC 启动 token 消费边界。
- [ ] 上游面板业务操作兼容：按维护者确认的隔离/信任边界恢复原始脚本依赖的交互，并以真实供应商模块 E2E 验收。
- [ ] Cookie 跨站部署与 legacy 回调协议兼容政策确认并完成相应测试。
- [x] 插件市场代码启用 HTTPS/仓库 allowlist、固定 commit、远程纯数据 manifest 和 archive SHA-256；保留受信任本地 `--zip` 对 legacy `config.php` 的兼容。
- [ ] 插件市场端到端发布：官方索引补真实 archive SHA-256，官方发行包补 `plugin.json`，并以实际下载/安装/回滚验收。
- [x] Docker 生产缺失或短 APP_KEY 直接退出；CI 增加依赖审计、E2E 入口、SBOM/provenance 和本地测试对齐。
- [x] Node 生产依赖升级，`pnpm audit --prod` 无已知漏洞。
- [ ] 在 PHP 8.3 + MySQL + Redis + Docker runner 完成完整 PHPUnit、Pint、PHPStan、Docker CI 和 Playwright 浏览器套件。
- [ ] 生产/staging 注入持久化 APP_KEY，轮换已在空密钥环境签发的 JWT，并完成容器重建演练。

## 实施步骤

1. 先完成认证、回源和票据的 fail-closed 代码与定向回归。
2. 增加数据库事件幂等迁移并运行迁移/Feature 测试。
3. 升级前端依赖、补 CI 审计与 E2E 门禁，运行三端构建和共享测试。
4. 在具备 PHP 8.3、MySQL、Redis、Docker 和浏览器缓存的 runner 上执行完整验收。
5. 生产部署前备份配置与数据库，注入固定 APP_KEY，做登录、Crypt、供应商凭据、VNC 和队列重建前后对照。

## 风险与回滚

- 控制台面板脚本净化可能改变第三方页面行为；回滚前需保留 CSP、净化和票据测试，不能恢复 query bearer 传递。
- 新增 host/sync 事件表只增不删；异常时回滚应用代码前保留事件数据并确认旧协议兼容窗口。
- APP_KEY 变更会使旧会话和密文失效；生产必须先备份并按轮换迁移策略执行，禁止让入口脚本随机生成替代密钥。
- 当前环境缺少 MySQL PDO、Docker daemon 和 Playwright 浏览器时，失败只能标记为环境未覆盖，不得视作产品回归结论。

## 进度

- [x] 首批安全代码与定向测试已提交（2026-11-08）；2026-11-14 的审查修订已提交，新增测试等待 CI 实际执行。
- [x] 文档、依赖锁和 CI 配置同步完成（2026-11-08）。
- [ ] 完整后端/Docker/浏览器 CI 验收。
- [ ] staging/production 密钥轮换与重建演练。

## 决策日志

| 日期       | 决策                                                                 | 原因                                                                             |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2026-11-08 | 控制台票据使用服务路径 HttpOnly Cookie，Bearer 作为非 iframe 回退。  | iframe URL 不能安全承载 bearer；路径隔离、no-store 和 no-referrer 可收敛泄漏面。 |
| 2026-11-08 | 插件市场远程包只接受 `plugin.json`、固定 commit 和 archive SHA-256。 | 安装阶段不能执行不可信 `config.php`，动态分支和无摘要包无法证明供应链完整性。    |
| 2026-11-08 | host/sync nonce 在数据库事务内持久消费，工单回调继续使用缓存 nonce。 | 主机状态写入需要跨实例、重启和业务失败重试都成立的原子幂等边界。                 |

## 2026-11-14 人工审查与待决事项

- 审查入口：[PR #79 review](https://github.com/25Cloud/TuraIDC/pull/79#pullrequestreview-5901535545)，维护者状态为 `CHANGES_REQUESTED`。
- 已修复 CI 的 PHPStan 端口死代码/失效 baseline 与 Backend Feature Test 全零 APP_KEY；同步 main `66fefe0` 的三端构建产物 E2E、UI 漂移用例、Docker 前端构建上下文。
- 已补充对 `actions` 的同源来源校验、回调 token 密钥强度校验、CSS 重组注入保护及单元/Feature 回归用例。
- 已修复 MySQL digest：`mysql:8.0` 应使用多架构 OCI index `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`；旧 digest 是 amd64 子清单。
- 官方插件索引当前缺少 archive SHA-256，发行包仅有可执行 `config.php`。远程安装仍保持 fail-closed；必须由相关仓库先发布符合格式的 `plugin.json` 与固定提交 SHA-256 再进行联调。
- 控制台上游脚本可能包含 `onclick` / 内联逻辑。恢复交互需要隔离运行时或经过审核的本地动作适配，不直接放行未审查的供应商脚本。
- 完整 CI 当前受 fork PR 工作流人工批准限制，最新运行：https://github.com/25Cloud/TuraIDC/actions/runs/43592724924 （`action_required`）。测试结果以获批后本次提交的实际执行为准。
- 生产升级前检查旧容器仍可读的原 `APP_KEY`，提取并持久化到宿主机配置，随后重建、验证旧密文和回调。
