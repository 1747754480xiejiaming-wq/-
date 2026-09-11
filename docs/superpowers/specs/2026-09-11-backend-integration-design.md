# 茶序后端与前后端联调设计

## 目标与边界

在不改变 `prototype/` 已确认的页面流、四种角色名称或业务规则的前提下，为茶序交付可运行的 API 服务、持久化种子数据、鉴权授权、契约测试和前端切换配置。唯一外部接口基线是仓库根目录 `茶文化智能体_前后端接口契约与Skill清单.md`，并将其机器化为 `contracts/openapi.yaml`。所有业务 API 使用 `/api/v1`；健康检查仍为 `/health/live` 与 `/health/ready`。

首期不接入真实模型、对象存储、异步工作进程或正式资料。问茶使用可审计的规则型演示回答，且只对当前公开、已授权种子资料返回引用；导入、导出和文件接口只实现契约中可用的安全最小闭环或明确返回稳定的未配置错误。不会把模拟数据冒充真实茶学资料或供应承诺。

## 架构与运行模式

新增 `backend/` 模块化 FastAPI 单体：路由层负责 HTTP、认证和契约 envelope；服务层承载发布性解析、状态迁移、幂等与审计；SQLAlchemy 仓储负责事务；Pydantic 模型同时约束请求与响应。Alembic 管理迁移。`DATABASE_URL` 默认指向项目内可忽略的 SQLite 文件，供一条命令本地联调；显式 PostgreSQL URL 使用同一 ORM 与迁移，是生产唯一支持的正式数据源。SQLite 不承担检索索引或生产并发保证的声明。

应用首次启动不自动破坏或重置数据库。`python -m app.seed` 显式创建四个演示账号、两类茶、三个批次、授权来源、通用/专属配方、有效与过期货源及示例线索。密码仅以 hash 保存；种子账号和开发 cookie 的说明写入 `.env.example`，不写入 README 的生产指引。

## 接口、兼容与前端适配

`contracts/openapi.yaml` 固定 OpenAPI 3.1、operationId、统一成功/错误 envelope、分页和关键示例。实现首个可联调的纵向链：U01–U14 的公开浏览、功效、冲泡、货源、问茶、咨询、反馈和事件；A01–A04 的会话；C01–C13 的茶品/批次内容循环；M01–M03、M10 的线索及审计。其余账号、导入、文件、统计和导出路径保留在 OpenAPI 中，并在服务端以明确的 `FEATURE_NOT_CONFIGURED` 或已实现的安全空集表现，绝不返回伪造成功。

为了兼容当前原型稳定 ID（如 `longjing-2026`）与契约要求的 UUID，公开响应总是含 UUID `id`，另提供只读 `legacy_id`；前端 API 适配器把后端 DTO 映射到既有 `TeaItem` 与 `Lead` 类型。浏览器默认保留现有 localStorage 演示模式；设置 `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1` 后改用真实请求。任何 API 不可用均回落至原型演示状态，并以开发标记提示，避免改变现有交互。

## 权限、状态与一致性

公开读取统一经过 `PublicationResolver`：内容必须是 published、未 deleted/withdrawn/expired、父级可见且全部所需来源授权有效；任何条件失效都不旁路为公开数据。四种角色映射为 operator、reviewer、lead、admin，并在服务端逐请求检查：运营编辑草稿、提交审核及上下架；审核人仅在授权领域审核且不能审核自己更新的版本；线索角色只能处理线索；管理员管理账号、商品与审计，但不自动取得审核领域。后台 cookie 为 HttpOnly，所有写入要求 CSRF token 与同源 Origin。

内容记录使用 `row_version` 和 ETag。PATCH、审核、上下架、重新上架、删除、线索 PATCH 缺失 `If-Match` 返回 428，不匹配返回 `409 VERSION_CONFLICT`。所有创建和状态命令要求 UUID `Idempotency-Key`，按主体、方法、规范路径、key 和请求 hash 存储：重试回放原响应，不同 body 返回 409。写操作、版本变更、审计和幂等回放记录在同一事务。状态严格遵循 `draft → pending_review → published`（审批同步发布）、`pending_review → rejected → draft`、`published → withdrawn`、`withdrawn → published`；重新上架复用已审核版本、不增加 revision、不要求复审。演示来源被撤回时，只可由明确的演示重新上架流程恢复；其他授权撤回不被绕过。

## 测试与验收

pytest + HTTPX 覆盖 OpenAPI envelope、公开过滤、UUID/tea-item 关联错误、告知版本、咨询幂等、If-Match、角色越权、自审禁止、审核自动发布、下架/重新上架、来源撤权、线索脱敏与审计。用 SQLite 集成测试验证服务逻辑，另提供 PostgreSQL CI/本地命令的占位说明而不伪称已执行。前端构建保持通过；新增 API 客户端类型检查与可选的真实后端联调脚本。

README 将列出后端入口、启动、种子和切换方式，并清楚标明本地 SQLite、规则问答和未配置能力的限制。每个完整可验收代码阶段更新 README 与 `VERSION_SNAPSHOTS.md`，建立 `snapshot(code):` 提交；可访问远端时推送，否则明确记录待推送。

## 关键取舍

1. **推荐：FastAPI + SQLAlchemy + SQLite 本地 / PostgreSQL 生产。** 直接符合既有契约的技术方向，安装与前端联调成本低，且不把 SQLite 误称为正式并发数据库。
2. **Docker-only PostgreSQL。** 与生产最接近，但阻断没有 Docker 的开发者，且当前原型没有容器化约束。
3. **Node/Express 后端。** 可复用前端语言，但会背离既定 Python、Pydantic、后续 NetworkX/Ollama 适配方向，故不采用。

推荐方案以明确模式边界控制风险，并先实现一条端到端业务链，再通过契约扩展余下后台模块。
