# 茶序前端接口联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将茶序原型迁移为可在 mock 与 `/api/v1` 后端间切换的严格类型化前端，并保留所有已验收流程。

**Architecture:** 页面通过 feature hooks 访问领域服务，服务由启动时确定的 mock/live 适配器实现。API 客户端统一处理协议、cookie、CSRF、幂等与错误；页面不直接修改演示数据。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-11-api-integration-design.md`

## Global Constraints

- 保留七幕 Sticky 首页、移动端文档流、问茶冲泡融合、`#/brew/:teaItemId` 兼容路由和四套后台职能平台。
- 路径固定 `/api/v1`，字段为 snake_case；成功/失败信封、UUID、RFC 3339 UTC 和 Asia/Shanghai 展示遵循接口契约。
- `VITE_API_MODE` 只允许 `mock` 或 `live`，默认 `mock`；live 使用 `credentials: 'include'`，不向 localStorage 写会话或 CSRF。
- 命令请求带 UUID `Idempotency-Key`；后台并发更新带 `If-Match`；后台命令带 `X-CSRF-Token`。
- 401、403、409、422、429、503 显示不同状态；前端权限控制不是后端授权替代。
- 每组可验收代码变更同步 README、VERSION_SNAPSHOTS、原型说明和验收记录，并以 `snapshot(code): <摘要>` 提交；推送失败明确标为待推送。

---

### Task 1: 建立 API 协议、运行模式与 HTTP 客户端

**Files:**
- Create: `prototype/src/api/contracts.ts`
- Create: `prototype/src/api/errors.ts`
- Create: `prototype/src/api/client.ts`
- Create: `prototype/src/api/runtime.ts`
- Create: `prototype/src/api/client.test.ts`
- Modify: `prototype/package.json`

**Interfaces:**
- Consumes: 契约的成功/失败信封、分页、CSRF、ETag 和幂等规则。
- Produces: `ApiClient.request<T>(input): Promise<T>`、`ApiError`、`RuntimeConfig`、`newIdempotencyKey()`。

- [x] **Step 1: 安装并配置 Vitest**

在 `package.json` 添加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 2: 定义共享协议类型**

在 `contracts.ts` 添加：

```ts
export type ApiMeta = { request_id: string; server_time: string };
export type ApiSuccess<T> = { data: T; meta: ApiMeta };
export type ApiFailure = { error: { code: string; message: string; details: Array<{field: string; reason: string}> }; meta: ApiMeta };
export type Page<T> = { items: T[]; page: number; page_size: number; total: number };
```

- [x] **Step 3: 写失败测试，锁定请求与错误转换**

```ts
expect(fetch).toHaveBeenCalledWith('/api/v1/teas?page=1&page_size=20', expect.objectContaining({credentials: 'include'}));
await expect(client.request({path: '/questions', method: 'POST', idempotent: true})).rejects.toMatchObject({code: 'RATE_LIMITED', retryAfterSeconds: 30});
```

- [x] **Step 4: 确认测试失败**

Run: `npm test -- --run src/api/client.test.ts`  
Expected: FAIL，`ApiClient` 与 `ApiError` 尚未定义。

- [x] **Step 5: 实现客户端、错误与运行模式**

```ts
export type RequestInput = { path: string; method?: 'GET'|'POST'|'PATCH'|'DELETE'; query?: Record<string, string|number|undefined>; body?: unknown; csrf?: string; ifMatch?: string; idempotent?: boolean };
export class ApiClient { async request<T>(input: RequestInput): Promise<T> { /* 构建 URL、headers，解析 ApiSuccess 或抛 ApiError */ } }
```

`ApiError` 保存 `status`、`code`、`message`、`details`、`requestId` 与 `retryAfterSeconds`；网络和非 JSON 响应映射 `SERVICE_UNAVAILABLE`。`runtime.ts` 拒绝除 `mock/live` 外的模式。

- [x] **Step 6: 运行检查**

Run: `npm test -- --run src/api/client.test.ts && npm run build`  
Expected: PASS。

- [x] **Step 7: 提交基础协议快照**

更新四份说明后运行：

```bash
git add prototype/package.json prototype/package-lock.json prototype/src/api README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md
git commit -m "snapshot(code): add typed API client foundation"
```

### Task 2: 迁移演示数据为 mock 领域适配器

**Files:**
- Create: `prototype/src/api/types.ts`
- Create: `prototype/src/api/mock/seed.ts`
- Create: `prototype/src/api/mock/mockStore.ts`
- Create: `prototype/src/api/mock/publicApi.ts`
- Create: `prototype/src/api/mock/adminApi.ts`
- Create: `prototype/src/api/mock/mockApi.test.ts`
- Modify: `prototype/src/model.ts`

**Interfaces:**
- Consumes: Task 1 类型、现有 TeaItem/线索/审计演示数据与 U01--U14、C01--C13 规则。
- Produces: Promise 化的 `PublicApi`、`AdminApi`、带订阅能力的 `MockStore`。

- [x] **Step 1: 定义 DTO 与适配器边界**

```ts
export interface PublicApi { getConfig(): Promise<PublicConfig>; searchTeas(q: TeaSearch): Promise<Page<SearchHit>>; getTeaItem(id: string): Promise<TeaItemPublic>; askQuestion(input: QuestionCreate): Promise<AnswerPublic>; createInquiry(input: InquiryCreate): Promise<InquiryReceipt>; }
export interface AdminApi { getMe(): Promise<AdminUser>; listContent(q: ContentQuery): Promise<Page<ContentSummary>>; transitionContent(input: ContentCommand): Promise<ContentDetail<TeaItemPublic>>; }
```

- [x] **Step 2: 写 mock 行为失败测试**

```ts
await admin.withdraw({id: 'longjing-2026', ifMatch: 'rv-2', idempotencyKey: key});
await expect(publicApi.getTeaItem('longjing-2026')).rejects.toMatchObject({status: 404, code: 'NOT_FOUND'});
await admin.relist({id: 'longjing-2026', ifMatch: 'rv-3', idempotencyKey: newKey});
expect((await publicApi.getTeaItem('longjing-2026')).id).toBe('longjing-2026');
```

同时覆盖：来源撤回阻断公开读和问答、重新上架恢复来源、R 不能审核自身版本、O 仅能删除草稿。

- [x] **Step 3: 确认 mock 测试失败**

Run: `npm test -- --run src/api/mock/mockApi.test.ts`  
Expected: FAIL，mock 服务尚不存在。

- [x] **Step 4: 实现种子、store 与 U01--U14**

迁移 `model.ts` 演示数组至 `seed.ts`。公开可见性只由以下条件决定：

```ts
const isPublic = (item: TeaItemPublic, sourceActive: boolean) => item.status === 'published' && sourceActive;
```

U11 只有匹配已公开茶品时才返回 `intent: 'brewing'` 与 `tea_item_id`；无法确认时返回 `status: 'unconfirmed'` 且不带茶品 ID。

- [x] **Step 5: 实现 C01--C13 状态和并发语义**

每次内容修改增加 `row_version` 并返回 `etag: 'rv-' + row_version`；缺 `If-Match` 抛 `PRECONDITION_REQUIRED`，不匹配抛 `VERSION_CONFLICT`。`withdraw`、`relist`、`submit-review`、`review` 与 `delete` 检查角色、作者、状态和来源。

- [x] **Step 6: 验证并提交**

Run: `npm test -- --run src/api/mock/mockApi.test.ts && npm run build`  
Expected: PASS；公开端无草稿、下架、无效来源和联系人原文。

```bash
git add prototype/src/api prototype/src/model.ts README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md
git commit -m "snapshot(code): add contract-aligned mock API"
```

### Task 3: 实现 live 适配器、服务容器与运行模式切换

**Files:**
- Create: `prototype/src/api/live/publicApi.ts`
- Create: `prototype/src/api/live/adminApi.ts`
- Create: `prototype/src/api/createServices.ts`
- Create: `prototype/src/features/AppServicesContext.tsx`
- Create: `prototype/src/features/useRemoteState.ts`
- Create: `prototype/src/api/live/liveApi.test.ts`
- Create: `prototype/.env.example`
- Modify: `prototype/src/main.tsx`

**Interfaces:**
- Consumes: `ApiClient`、`PublicApi`、`AdminApi`。
- Produces: `createServices(config)`、`useAppServices()` 和 `{status,data,error,reload}` 远程状态。

- [x] **Step 1: 写端点映射失败测试**

```ts
await publicApi.getBrewing({teaId: 'tea-1', teaItemId: 'item-1'});
expect(request).toHaveBeenCalledWith(expect.objectContaining({path: '/teas/tea-1/brewing', query: {tea_item_id: 'item-1'}}));
await adminApi.review({id: 'item-1', revision: 3, decision: 'approve', comment: '资料完整', ifMatch: 'rv-3'});
expect(request).toHaveBeenCalledWith(expect.objectContaining({path: '/admin/content/tea-items/item-1/review', method: 'POST', ifMatch: 'rv-3'}));
```

- [x] **Step 2: 确认测试失败**

Run: `npm test -- --run src/api/live/liveApi.test.ts`  
Expected: FAIL，live 适配器不存在。

- [x] **Step 3: 实现 live 适配器与服务工厂**

每个方法逐字映射契约路径和 snake_case 请求。`createServices` 按 `RuntimeConfig.mode` 返回 mock 或 live；live 后台以 A01 获取内存 CSRF token，收到 401 后清除 token 与用户状态。

- [x] **Step 4: 实现 Context 与远程状态 hook**

```tsx
export function useRemoteState<T>(load: () => Promise<T>) {
  // 返回 loading、ready、empty、error 以及 reload；卸载后不再 setState。
}
```

`main.tsx` 创建一次 services 并包裹既有 hash 路由，不改变 URL 行为。

- [x] **Step 5: 验证并提交**

Run: `npm test -- --run src/api/live/liveApi.test.ts && npm run build`  
Expected: PASS；mock 模式不发 HTTP，live 模式不读种子。

```bash
git add prototype/src/api prototype/src/features prototype/src/main.tsx prototype/.env.example README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md
git commit -m "snapshot(code): add mock and live service switching"
```

### Task 4: 连接用户端的目录、详情、问答、冲泡与咨询

**Files:**
- Create: `prototype/src/features/public/useCatalog.ts`
- Create: `prototype/src/features/public/useTeaDetail.ts`
- Create: `prototype/src/features/public/useQuestion.ts`
- Create: `prototype/src/features/public/useInquiry.ts`
- Modify: `prototype/src/PublicPages.tsx`
- Modify: `prototype/src/BrewGuide.tsx`
- Modify: `prototype/src/HomeSections.tsx`
- Modify: `prototype/src/ScrollStory.tsx`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: `PublicApi`、`useRemoteState`、`BrewingPublic`。
- Produces: 保留路由和视觉的公开远程状态、U11→U07 冲泡加载、U12 脱敏回执。

- [x] **Step 1: 写问答→冲泡失败测试**

```ts
const answer = await ask({question: '西湖龙井怎么泡'});
expect(answer.intent).toBe('brewing');
expect(loadBrewing).toHaveBeenCalledWith({teaId: answer.tea_id, teaItemId: answer.tea_item_id});
await expect(ask({question: '没有资料的茶怎么泡'})).resolves.toMatchObject({status: 'unconfirmed'});
```

- [x] **Step 2: 实现公开 hooks**

目录将 URL `q/category/page` 转为 U02/U04；详情先 U05，再用返回 `tea_id` 调 U06/U07/U08。`BrewGuide` 接收 `BrewingPublic`，四步、计时、临时参数和反馈仍为本地状态。

- [x] **Step 3: 实现问答和咨询**

问答生成新 UUID；`unconfirmed` 显示资料不足，`CONTENT_UNAVAILABLE` 清除冲泡并允许刷新。咨询读取 U01 用途文本和版本，未主动同意不调用 U12，成功只显示 API 回执。

- [x] **Step 4: 替换页面直读演示状态**

`PublicPages.tsx`、`HomeSections.tsx`、`ScrollStory.tsx` 只消费 hooks 的公开 items；七幕第六幕不重置滚动位置。移除公开页面直接调用 `setItems`、`setLeads`、`sourceActive`。

- [x] **Step 5: 加入可访问状态 UI**

使用既有 `Notice`/`Empty` 处理加载、空集、404、429、503；重试调用 `reload`，错误区设置 `role="alert"`。

- [x] **Step 6: 验证并提交**

Run: `npm test -- --run src/features/public && npm run build`  
Browser: mock 1440×900 验证七幕、`LJ-050`、龙井 3g/85°C/30 秒；390×844 验证无横向溢出、问答与咨询。

```bash
git add prototype/src output/playwright README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md
git commit -m "snapshot(code): connect public flows to API services"
```

### Task 5: 连接四套后台的会话、权限、内容与线索服务

**Files:**
- Create: `prototype/src/features/admin/useAdminSession.ts`
- Create: `prototype/src/features/admin/useContent.ts`
- Create: `prototype/src/features/admin/useReviews.ts`
- Create: `prototype/src/features/admin/useLeads.ts`
- Create: `prototype/src/features/admin/PermissionGate.tsx`
- Modify: `prototype/src/AdminPages.tsx`
- Modify: `prototype/src/model.ts`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: `AdminApi`、`permission_codes`、`review_domains`、ETag 和 `row_version`。
- Produces: 后台会话状态、权限门、带 CSRF/ETag/幂等键的内容命令。

- [ ] **Step 1: 写权限与命令失败测试**

```tsx
render(<PermissionGate required={['content:write']} fallback={<span>无权</span>}><button>新建草稿</button></PermissionGate>);
expect(screen.getByText('无权')).toBeVisible();
await expect(withdraw({id: 'tea-item-1', etag: 'rv-1'})).rejects.toMatchObject({code: 'FORBIDDEN'});
```

测试 O 草稿删除、R 自审阻断、L 无内容入口、A 无专家审核权限及 409 冲突。

- [ ] **Step 2: 实现后台会话和权限门**

live 调 A03，写前调 A01；mock 保留演示身份切换，但每个身份映射精确权限和审核领域。`PermissionGate` 隐藏入口、阻止提交并说明职能边界。

- [ ] **Step 3: 实现内容、审核和线索 hooks**

`useContent` 调 C01--C13，保留响应 `row_version`/ETag。下架、重新上架、删除、提交审核和审核各用新幂等键；409 显示刷新提示。`useLeads` 只为授权角色请求和脱敏导出。

- [ ] **Step 4: 迁移 `AdminPages.tsx` setter**

移除页面直接 `setItems`、`setLeads`、`setSourceActive`。保留草稿置顶、审核即发布、状态互斥与来源恢复文案，以服务返回的状态刷新列表。

- [ ] **Step 5: 处理后台错误状态**

401 清理会话；403 只显示无权；422 展示字段 details；428 提示刷新；429 展示秒数；503 展示重试。live 不伪造导入或下载成功。

- [ ] **Step 6: 验证并提交**

Run: `npm test -- --run src/features/admin && npm run build`  
Browser: 验证 O 下架、R 审核发布、L 跟进、A 上下架/删除与“来源撤回→重新上架→公开恢复”。

```bash
git add prototype/src output/playwright README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md
git commit -m "snapshot(code): connect admin platforms to API services"
```

### Task 6: 完成模式、响应式与快照验收

**Files:**
- Create: `prototype/.env.example`
- Create: `output/playwright/19-api-mock-desktop.png`
- Create: `output/playwright/20-api-mock-mobile.png`
- Create: `output/playwright/21-api-live-unavailable.png`
- Modify: `README.md`
- Modify: `VERSION_SNAPSHOTS.md`
- Modify: `prototype/README.md`
- Modify: `prototype/验收记录.md`

**Interfaces:**
- Consumes: Tasks 1--5。
- Produces: 模式说明、桌面/移动/故障态证据和可回滚发布快照。

- [ ] **Step 1: 运行全量自动检查**

Run: `npm test && npm run build`  
Expected: API、mock、live、公开端和后台测试全部通过。

- [ ] **Step 2: 验收 mock 桌面与移动**

以 `VITE_API_MODE=mock npm run dev` 启动。1440×900 验证七幕、搜索、详情、问答、咨询、四后台角色、审核、上下架和来源恢复，保存 `19-api-mock-desktop.png`。390×844 验证深链接、移动导航、问茶、咨询和后台菜单，确认 `document.documentElement.scrollWidth <= window.innerWidth`，保存 `20-api-mock-mobile.png`。

- [ ] **Step 3: 验收 live 故障边界**

以 `VITE_API_MODE=live VITE_API_BASE_URL=http://127.0.0.1:9999/api/v1 npm run dev` 启动；确认服务不可用与重试入口、无未捕获控制台异常，保存 `21-api-live-unavailable.png`。

- [ ] **Step 4: 更新文档与版本表**

README 写明 mock/live、环境变量和已验证边界；原型说明列出模式切换；验收记录声明 live 无后端仅验证故障边界；VERSION_SNAPSHOTS 添加快照号、命令和推送状态。

- [ ] **Step 5: 提交并推送最终快照**

```bash
git add README.md VERSION_SNAPSHOTS.md prototype output/playwright
git commit -m "snapshot(code): complete API-ready frontend integration"
git push origin HEAD:main
```

网络或凭据失败时保留本地提交，并在版本记录与交付说明标明“待推送”。

## Self-Review

- Spec coverage: Task 1 覆盖协议、cookie、CSRF、幂等和错误；Task 2 覆盖 mock、公开可见性和状态机；Task 3 覆盖 live；Task 4 覆盖用户端与问答冲泡；Task 5 覆盖后台、权限和并发；Task 6 覆盖浏览器、文档和快照。
- Placeholder scan: 计划不含未决占位、空泛的错误处理描述或未定义步骤。
- Type consistency: mock/live 均实现 `PublicApi` 与 `AdminApi`；所有内容命令使用 ETag/row version；页面经服务 Context 访问数据。
