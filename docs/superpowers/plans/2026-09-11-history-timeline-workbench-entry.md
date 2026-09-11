# 茶史时间线与工作台入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页原四幕茶史扩展为已经确认的 8 页时间线，并把桌面端工作台入口调整为低强调按钮且补齐登录页返回路径。

**Architecture:** 保留现有 `ScrollStory` 的场景数组驱动结构，只扩展历史场景数据和历史场景的内容变体，不改动 Sticky 滚动、移动端文档流和公共路由机制。工作台仍通过前端 `#/admin` 路由进入登录页，登录表单继续调用现有后端 `/admin/auth/csrf` 与 `/admin/auth/login` 接口。

**Tech Stack:** React 19、TypeScript、Vite、CSS、FastAPI 登录接口

**Spec:** 用户在 2026-09-11 确认的 8 页茶史内容与工作台入口调整要求

## Global Constraints

- 保持现有米白、深茶绿、朱砂视觉语言和整体页面风格。
- 历史内容严格采用已确认的 3 + 3 + 2 八页结构。
- 桌面顶部文字导航保留首页、问茶、茶叶品类；工作台使用右上角低强调按钮。
- 移动底部继续保留工作台入口，因为桌面右上角按钮在移动端隐藏。
- 登录页必须提供明确的返回用户端入口。
- 登录身份仍由后端 Cookie、CSRF 与岗位权限校验，不增加前端伪登录。
- 完成后更新 README、原型说明和版本快照记录，创建并推送独立 Git 快照。

---

### Task 1: 扩展八页茶史数据与场景渲染

**Files:**
- Modify: `prototype/src/HomeSections.tsx`
- Modify: `prototype/src/HomeExperience.css`
- Verify: `prototype/src/ScrollStory.tsx`

**Interfaces:**
- Consumes: `sceneMeta: StorySceneDefinition[]`、`historyChapters`
- Produces: 8 个连续历史场景，以及封面页和内容页两种数据驱动渲染形态

- [ ] **Step 1: 将四个历史场景定义替换为八个唯一场景定义**

  使用 `history-origin-cover` 至 `history-categories-detail` 的稳定 ID，短标签依次为“起源、发现、唐宋、茶事、茶席、传播、制茶、六类”。

- [ ] **Step 2: 写入用户确认的八页完整文案**

  数据结构包含 `kind`、`section`、`tag`、`subtitle`、`title`、`lead`、`paragraphs`、`quote`、`facts`、`progress` 和现有插画属性。

- [ ] **Step 3: 实现封面页与内容页的差异化排版**

  封面页继续使用现有大标题、说明和圆形插画；内容页在相同栅格中显示副标题、正文、引用或六茶类摘要。

- [ ] **Step 4: 增加必要的响应式样式**

  复用现有颜色、字体、圆环与间距，限制正文高度并在 1050px、600px 断点保持可读和无横向溢出。

- [ ] **Step 5: 运行生产构建**

  Run: `npm run build`

  Expected: TypeScript 编译和 Vite 构建成功。

### Task 2: 调整工作台入口及退出路径

**Files:**
- Modify: `prototype/src/navigation.ts`
- Modify: `prototype/src/main.tsx`
- Modify: `prototype/src/AdminLogin.tsx`
- Modify: `prototype/src/AdminLogin.css`

**Interfaces:**
- Consumes: `Button href="/admin"`、`url('/')`、`TeaApi.login()`
- Produces: 桌面低强调工作台按钮、移动工作台入口、登录页返回用户端链接

- [ ] **Step 1: 从桌面文字导航移除工作台**

  `publicNavigation` 只保留首页、问茶和茶叶品类，`mobilePublicNavigation` 继续保留四项。

- [ ] **Step 2: 将右上角主按钮替换为低强调工作台按钮**

  使用 `Button tone="ghost" href="/admin" icon="users"`；该路由渲染 `AdminLogin`，登录提交继续调用 `/admin/auth/csrf` 和 `/admin/auth/login`。

- [ ] **Step 3: 在登录页增加显式返回入口**

  在品牌区顶部加入带返回图标的“返回用户端”链接，并为桌面及移动端提供清晰但低干扰的样式。

- [ ] **Step 4: 回归工作台接口路径**

  核对 `prototype/src/api/client.ts` 保持 CSRF 获取与登录 POST，不建立到 API 地址的直接浏览器链接。

### Task 3: 浏览器验收、文档与快照

**Files:**
- Modify: `README.md`
- Modify: `prototype/README.md`
- Modify: `VERSION_SNAPSHOTS.md`
- Create: `output/playwright/26-history-timeline-workbench-desktop.png`
- Create: `output/playwright/26-history-timeline-mobile.png`

**Interfaces:**
- Consumes: 本地 Vite 页面与构建产物
- Produces: 可回滚的 `SNAP-20260911-026` 代码快照

- [ ] **Step 1: 验收桌面端首页和导航**

  检查 11 幕、八个历史页、右上角低强调工作台按钮、`#/admin` 登录页和“返回用户端”。

- [ ] **Step 2: 验收移动端文档流**

  在 390×844 检查八个历史页顺序、文字可读性、底部工作台入口与无横向溢出。

- [ ] **Step 3: 复核控制台和登录接口**

  Expected: 页面控制台无 error；工作台入口进入 `#/admin`；登录表单由 API 客户端提交真实后端接口。

- [ ] **Step 4: 更新项目说明与快照记录**

  将“七幕/茶史四章/顶部四项导航”更新为“十一幕/茶史八页/桌面三项加低强调工作台按钮”，并记录验证证据。

- [ ] **Step 5: 创建并推送 Git 快照**

  Run: `git commit -m "snapshot(code): 扩展茶史时间线并优化工作台入口"`

  Expected: 新提交推送到 GitHub 当前快照分支；若 detached HEAD 无法直接推送，则明确推送到 `main` 与现有同步分支并核对远端提交。
