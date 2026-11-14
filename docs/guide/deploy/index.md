# 部署安装

<DeploymentSelector />

## 部署后

1. **确认依赖服务**：确保应用、数据库正常运行。
2. **启用调度**：根据 [部署与调度](scheduling.md) 设置计划任务、队列组与探针，并配置 VNC Relay 常驻进程。
3. **自检**：在 `backend/` 下执行 `php artisan app:doctor`，确认 PHP、扩展与禁用函数满足要求。
4. **测试后上线**：使用测试账户对「下单 → 支付 → 自动开通 → 通知」进行测试。

## 必要条件

- 数据库最低兼容 MySQL 5.7.44，推荐 8.3以上；SQL 必须同时兼容两个版本。
- 生产不使用 `php artisan serve`，后端使用 PHP-FPM。

## 关联文档

- [初始配置](../configure/index.md)：配置站点、通知、支付与上游。
- [维护与升级](../maintain/index.md)：备份、升级与日志归档。
- [开发者文档](../../develop/index.md)：本地开发、前端构建与测试命令。
