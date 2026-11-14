import { defineConfig, devices } from '@playwright/test';

/**
 * PW_E2E_PREVIEW=1：跑构建产物（vite preview）而不是 dev server。
 *
 * 为什么 CI 门禁必须这么跑：dev server 是按需编译的，N 个 worker 同时首屏会互相抢着
 * 编译，5 秒断言超时就会随机炸——同一套 138 个用例实测 dev 12.5 分钟且大面积假红，
 * 换成本地已经构建好的产物后 55 秒全绿。本地开发仍然用 dev server（改代码即时生效）。
 */
const PREVIEW_MODE = process.env.PW_E2E_PREVIEW === '1';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // 并行跑：曾因「共享一个 Vite 服务、首屏模块按需编译」而关掉 fullyParallel，
  // 但关掉之后 smoke.spec.ts 这 6200 行、52 个用例的单体文件被锁成一条串行车道，
  // 其余 worker 干完就闲着——实测桌面端全量 138 个用例：串行 12.5 分钟，
  // 打开并行 2.6 分钟，且失败集合完全相同（差异只来自用例本身的漂移）。
  // 并行度可用 PLAYWRIGHT_WORKERS 覆盖，CI 上按 4 核给 4。
  fullyParallel: true,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? 4 : 8)),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    // 钉住语言：应用首屏按浏览器偏好自适应，而本套 spec 的断言写的是中文。
    // 不钉的话，宿主语言是英文时页面就渲染英文，整批用例会以「看起来像回归」的形式变红。
    locale: 'zh-CN',
    // 本机没下载 Playwright 自带 chromium 时，可用 PW_E2E_CHANNEL=chrome 走系统 Chrome
    channel: process.env.PW_E2E_CHANNEL || undefined,
    baseURL: 'http://127.0.0.1:5176',
    // 预览（CI 门禁）模式只在失败重试时留 trace：常开 trace 会持续抓 DOM 快照，
    // 重交互用例（打开弹窗 → 树选择 → 跳转）会被拖到超时；录像同理直接关掉。
    trace: PREVIEW_MODE ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: PREVIEW_MODE ? 'off' : 'retain-on-failure',
  },
  webServer: {
    // 不带 .env 文件也能启动：CI/干净 clone 下 .env.development 被 gitignore。
    // 用 pnpm exec vite 直接传参（pnpm run 会把 --port 原样传递导致端口未生效）；
    // 接口地址走 env 字段下发，避免 Windows cmd 不认 `VAR=x 命令` 前缀写法。
    command: PREVIEW_MODE
      ? 'pnpm exec vite preview --host 127.0.0.1 --port 5176 --strictPort'
      : 'pnpm exec vite --host 127.0.0.1 --mode development --port 5176 --strictPort',
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:8000/api',
      VITE_BASE_URL: '/',
    },
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    timeout: PREVIEW_MODE ? 60_000 : 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
});
