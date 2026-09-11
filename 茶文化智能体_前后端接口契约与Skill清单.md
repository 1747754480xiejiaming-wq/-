# 茶文化智能体前后端接口契约与 Skill 清单

依据：用户指定的《茶文化智能体开发方案资料版.docx》，文内版本 2.0，日期 2026-09-08。本文编制日期：2026-09-10。

本文把方案的 7 个 MVP 模块和 6 条示例接口扩展为可供前端、后端及联调共同使用的设计基线，包括接口目录、字段类型、权限、状态迁移、异常处理、Skill 分工和验收要求。本文为接口设计交付，不代表应用代码已实现或联调已通过。原方案中尚未明确的路径、字段名、技术框架、限额和状态枚举，均为本次新增的建议约定。

## 1 范围与技术选型

按原方案路径 B 设计：有限茶类与 SKU、批量导入、规则匹配、人工审核。资料不足时允许路径 C 演示，但演示环境与真实资料隔离，界面标明演示数据。首期涵盖选茶检索、功效与适饮说明、分步泡茶、货源档案、咨询或样品申请、内容后台、反馈统计，以及方案技术架构中的有来源问答。

不增加商城、支付、库存预占、退款、会员、课程、社区、图片识茶、原生应用、实时供应链同步接口。未来能力通过稳定标识和内部适配器扩展，不创建无业务用途的空接口。

| 层次 | 建议选型 | 选择理由和约束 |
|---|---|---|
| 用户端和运营后台 | React + TypeScript + Vite，React Router；共享 API 客户端 | 响应式 Web/H5；公开页面与后台路由分离；首期不依赖服务端渲染 |
| 前端数据与表单 | TanStack Query；React Hook Form + Zod | 管理请求缓存、表单提示；服务端仍须独立校验；版本在实施时锁定 |
| 后端 | Python + FastAPI + Pydantic，模块化单体 | 方便衔接 NetworkX、中文向量模型、导入解析；模块内部调用，不拆微服务 |
| 业务数据库 | PostgreSQL + SQLAlchemy + Alembic | 茶品、版本、权限、咨询、任务和审计的唯一正式数据源 |
| 本地检索 | SQLite + NetworkX + bge-small-zh-v1.5 | SQLite 保存可重建的检索片段和索引元数据；NetworkX 表达关系；业务内容不得双写为两个事实来源 |
| 文本生成 | Ollama + Qwen3 4B，后端内部适配器 | 前端不能直连 Ollama；只解释获授权且已发布的检索证据；不生成价格或库存事实 |
| 文件 | 私有对象存储 + 授权文件读取接口 | 数据库只保存文件元数据；文件下载时检查授权；不泄露对象存储密钥 |
| 接口约束 | OpenAPI 3.1 + JSON Schema + 生成的 TypeScript 客户端 | 实施时落地机器可读契约，保持路径、请求和响应类型一致 |
| 测试 | 后端 pytest/HTTPX；前端组件验证；Playwright 浏览器联调 | PostgreSQL 集成测试覆盖事务和并发；浏览器验证完整业务闭环 |

React 官方介绍了 Vite 的 React/TypeScript 起步方式，同时指出路由和数据请求需要另行配置；本方案采用该组合是对有限规模 H5 的工程判断。[React 文档](https://react.dev/learn/build-a-react-app-from-scratch)

FastAPI 提供 OpenAPI/JSON Schema，并支持据此生成 TypeScript SDK，适合落实接口契约。[FastAPI 功能](https://fastapi.tiangolo.com/features/) [SDK 生成](https://fastapi.tiangolo.com/advanced/generate-clients/)

原方案的“预计总体开发空间 3G”不能视作部署承诺。核验时 Ollama 的 qwen3:4b Q4_K_M 包为约 2.5GB，BGE 单份模型权重约 95.8MB，尚未包含运行时、依赖、数据库、索引、文件及备份。磁盘、内存、显存和延迟应在目标机器分别实测；模型固定到明确 tag/digest，不使用浮动 latest。[Ollama 模型](https://ollama.com/library/qwen3:4b) [BGE 文件](https://huggingface.co/BAAI/bge-small-zh-v1.5/tree/main)

## 2 全局接口约束

### 2.1 路径和标识

- 业务根路径为 `/api/v1`。以下接口表均省略这一前缀，健康检查除外。
- 路径 `{teaId}` 始终指 Tea 的 UUID，不接受 SKU 或 TeaItem ID。`tea_item_id` 指具体 SKU 与批次对应的 TeaItem UUID。一个 Tea 可有多个 TeaItem；同 SKU 的不同批次必须使用不同 TeaItem ID。
- Tea 表示一种有稳定名称的茶叶基础知识实体，`category` 表示茶类；不得把茶类枚举与 Tea ID 混用。SKU 是业务检索字段，不承担全局主键功能。
- 维持原方案的 `GET /teas/{teaId}/effects`、`/brewing`、`/supplies`，增加可选 `tea_item_id` 参数以消除茶类与商品的歧义。传入不属于该 Tea 的 TeaItem 返回 422，不能静默回退到其他茶品。
- 二维码只编码前端茶品详情链接，例如 `/items/{teaItemId}`，不新增图片识别或扫码识茶 API。
- JSON 字段统一使用 `snake_case`；ID 为 UUID 字符串；时间为 RFC 3339 UTC 字符串；界面按 Asia/Shanghai 展示。纯日期为 `YYYY-MM-DD`。

### 2.2 成功与错误响应

业务 JSON 成功响应统一为：

```json
{"data":{},"meta":{"request_id":"UUID","server_time":"2026-09-10T08:00:00Z"}}
```

分页集合把 `data` 固定为 `{items: T[], page: integer, page_size: integer, total: integer}`。页码从 1 开始，`page_size` 默认 20、范围 1 至 100；空集合返回 200 和空数组。默认按 `updated_at DESC, id ASC` 排序；未在接口表声明的排序键不接受。详情不存在或不可公开时统一 404。

```json
{"error":{"code":"VERSION_CONFLICT","message":"内容已更新，请刷新后重试","details":[{"field":"row_version","reason":"stale"}]},"meta":{"request_id":"UUID","server_time":"2026-09-10T08:00:00Z"}}
```

- `data` 与 `error` 互斥。`details` 为数组，无详情时为空；`message` 用于用户提示，前端逻辑依赖 `code`。
- 200：查询或更新成功；201：创建；202：异步任务已入库；204：退出登录等无响应体操作。文件下载返回二进制或 CSV，不套 JSON。
- 400 `BAD_REQUEST`：格式错误；401 `UNAUTHENTICATED`：无有效会话；403 `FORBIDDEN`/`CSRF_FAILED`：权限或 CSRF 校验失败；404 `NOT_FOUND`：不存在或不可见。
- 409：`VERSION_CONFLICT`、`INVALID_STATE`、`IDEMPOTENCY_CONFLICT`、`DATA_CONFLICT`；410 `DOWNLOAD_EXPIRED`：后台临时导出已过期；413 `FILE_TOO_LARGE`；415 `UNSUPPORTED_MEDIA_TYPE`；422 `VALIDATION_ERROR`/`CONSENT_REQUIRED`/`AUTHORIZATION_INVALID`。
- 429 `RATE_LIMITED` 携带 `Retry-After`；500 `INTERNAL_ERROR`；503 `SERVICE_UNAVAILABLE`。内部栈、SQL、路径和模型服务地址不得返回前端。
- 无法找到获授权证据是问答业务结果，返回 200 `unconfirmed`；数据库不可用等基础设施故障返回 503，不能伪装成无结果。

### 2.3 类型与写入约定

- 本文类型表中 `?` 表示可省略且可为 null；其余为必填非 null。数组无内容时为 `[]`。PATCH 中未出现表示不修改，null 仅可清空明确可空字段；未知字段一律 422。
- POST 新建内容可只填写该资源的最小草稿字段；发布时必须满足完整业务字段要求。服务端管理的 ID、审核人、时间、发布状态和版本禁止由内容请求体写入。
- 金额使用最多两位小数的十进制字符串，禁止二进制浮点金额；币种首期固定 `CNY`。克和毫升最多两位小数，温度为摄氏度数值，时长为整数秒。
- 请求文本按 Unicode 字符计数；通用标题 1 至 120，说明 1 至 2000，备注最多 1000。除明确说明外不接收 HTML。数组默认最多 100 项，来源每条最多 20 个。
- 范围类型 `Range={min:number,max:number}`，必须 `0 < min <= max`；水温上限 100，单步时长 0 至 3600，步骤总数 1 至 50，投茶量上限 100，水量上限 5000。这些是首期输入校验上限，不是冲泡建议。
- 有效期使用 `[valid_from, valid_until)`：开始包含，结束不包含；`valid_until` 可空表示未设置结束日期，货源报价必须有结束日期。服务器时钟决定是否有效。

### 2.4 会话和权限

用户浏览和提交咨询无需注册；后台使用服务端会话。生产环境采用同域部署，Cookie 为 HttpOnly、Secure、SameSite=Lax；本地 HTTP 的开发 Cookie 配置单独管理。后台登录先取得 CSRF token，所有后台写请求验证 `X-CSRF-Token` 和来源；前端不得把会话密钥存入 localStorage。

| 权限代号 | 建议角色 | 服务端能力 |
|---|---|---|
| P | 访客 | 公开查询、问答、匿名反馈、经同意的咨询 |
| O | 数据运营 | 内容草稿读写、文件上传、提交审核、商品上下架、删除本人权限范围内的未提交草稿；具备导入权限时导入 |
| R | 客户审核人 | 按审核领域查看资料并审批；通过审批在同一事务中自动发布；不能审核自己修改的版本 |
| L | 线索跟进人员 | 查询、跟进及经授权导出咨询；不因此获得内容发布权限 |
| A | 项目管理员 | 管理账号、权限、商品上下架与逻辑删除、导入和审计；不自动获得专家审批权 |

R 必须细分 `review_domains`：`tea_content` 用于茶叶、功效、泡茶；`supply` 用于供应商和货源；`source_rights` 用于资料授权。一个账号可有多项授权；新账号默认无权限。后台统计单独使用 `stats:read`，线索导出为 `inquiries:export`，导入为 `imports:write`。UI 按权限控制入口，后端逐请求、逐对象检查。

会话建议空闲 30 分钟或绝对 8 小时到期；禁用账号和修改权限立即撤销旧会话。登录限速默认同账号或同来源 5 次失败/15 分钟；咨询 5 次/10 分钟/匿名会话并叠加来源限速；问答 10 次/分钟/匿名会话并设置服务器并发上限。限额属于初始配置，压测后可调整。

### 2.5 幂等和并发

- 咨询、反馈、埋点、问答、创建草稿、提交审核、审批自动发布、下架、重新上架、逻辑删除、复制版本、导入提交和导出创建必须携带 `Idempotency-Key` UUID。
- 幂等作用域为会话/账号 + HTTP 方法 + 规范路径 + key；保存请求哈希和响应至少 24 小时。同 key 同请求返回原结果；同 key 不同请求返回 409；并发重复不能创建多条记录。
- 幂等响应回放前仍检查当前账号权限。问答响应还要重新检查引用内容和来源的公开授权；已撤权或失效时返回 409 `CONTENT_UNAVAILABLE`，不能回放旧答案。前端刷新内容后以新 key 重新请求。
- 内容维护采用整数 `row_version`，初始 1。详情与写响应返回该字段及对应 ETag，例如 `"rv-3"`。内容和线索 PATCH、审核迁移、账号 PATCH 必须携带 `If-Match`；缺失返回 428 `PRECONDITION_REQUIRED`，不匹配返回 409。
- 业务更新、版本变化、审计写入和持久任务入库处于同一事务。导入任务记录唯一键及进度，进程重启后恢复，不能只用内存后台任务。
- 公开内容首期使用 `Cache-Control: no-store`；前端在回到页面、切换茶品和发起新动作时重新查询。撤权后新请求立即受阻；已发送到用户设备的数据不能声称可被收回。

## 3 用户端接口目录

以下 `Page<T>` 表示前述分页结构；`Match<T>` 和各 DTO 见第 6 节。所有公开内容都经过发布、有效期、父记录可见性和授权检查。

| 编号 | 方法和路径 | 请求参数或请求体 | 响应 data | 前端用途与后端约束 |
|---|---|---|---|---|
| U01 | GET `/config` | 无 | `{data_mode:live或demo,tea_categories:[{code,label}],inquiry_notice:{version,text,purpose},health_notice:{version,text},capabilities:{qa:boolean}}` | 首页配置；不得含密钥或内部地址；告知文本由部署配置管理 |
| U02 | GET `/teas` | `q?:string≤100,category?:code,entity_type?:tea或tea_item,page?,page_size?` | `Page<SearchHit>` | 保留原方案混合检索意图；结果带实体类型和正确的 ID；无结果不猜测 |
| U03 | GET `/teas/{teaId}` | UUID | `TeaPublic` | 茶叶基础知识页 |
| U04 | GET `/tea-items` | `tea_id?:UUID,sku?:string≤64,batch_code?:string≤64,page?,page_size?` | `Page<TeaItemPublic>` | 具体商品和批次列表；SKU 精确筛选 |
| U05 | GET `/tea-items/{teaItemId}` | UUID | `TeaItemPublic` | 二维码和商品详情落点；返回关联 tea_id |
| U06 | GET `/teas/{teaId}/effects` | `tea_item_id?:UUID` | `Match<EffectPublic>` | 具体茶品优先，通用回退必须由返回值明确标记 |
| U07 | GET `/teas/{teaId}/brewing` | `tea_item_id?:UUID` | `Match<BrewingPublic>` | 返回完整步骤；步骤切换、计时和参数试调在浏览器本地完成 |
| U08 | GET `/teas/{teaId}/supplies` | `tea_item_id?:UUID,page?,page_size?` | `Page<SupplyPublic>` 加 `availability_notice?:string` | 只返回有效授权货源；没有可用货源时空列表加说明，不返回过期价格 |
| U09 | GET `/sources/{sourceId}` | UUID | `SourcePublic` | 已授权出处标题、摘要和公开附件；仅内部可用的资料不因知道 ID 就可读 |
| U10 | GET `/files/{fileId}/content` | UUID | 二进制，合法 Content-Type | 每次校验其关联的公开内容和文件披露授权；建议代理传输；不提供永久公开原件链接 |
| U11 | POST `/questions` | `QuestionCreate` | `AnswerPublic` | 一次请求一次回答；泡法回答返回 `intent=brewing` 和匹配茶品标识，前端随后用 U07 取得完整配方；不建聊天历史、WebSocket 或长期会话 |
| U12 | POST `/inquiries` | `InquiryCreate` | `{id:UUID,status:new,submitted_at:timestamp,receipt_message:string}` | 样品和咨询共用；响应不回显完整联系方式；不开放匿名查询线索接口 |
| U13 | POST `/feedback` | `FeedbackCreate` | `{id:UUID,accepted:true}` | 有帮助或无帮助及简短原因；只关联服务器验证过的公开记录/回答 |
| U14 | POST `/events` | `{events:EventCreate[1..20]}` | `{accepted_count:integer,duplicate_count:integer}` | 仅支持白名单匿名事件；以 event_id 去重；不能接受任意属性字典 |

默认公开会话由服务端设置短期随机 Cookie，有效期 24 小时，用于幂等和限速；不是会员账号。所有公开写入检查同源 Origin，仅接受 JSON；匿名会话不能查询他人咨询。无 Cookie 的客户端可以浏览，但提交前须先访问 U01 建立会话。

## 4 后台接口目录

### 4.1 登录和账号管理

| 编号 | 方法和路径 | 请求 | 响应 data | 权限和约束 |
|---|---|---|---|---|
| A01 | GET `/admin/auth/csrf` | 无 | `{csrf_token:string}` | 建立预登录会话；返回 token 不代表已登录 |
| A02 | POST `/admin/auth/login` | `{username:string[1..64],password:string[1..128]}` | `{user:AdminUser,csrf_token:string}` | 校验预登录 CSRF；成功轮换会话 ID；失败统一文案 |
| A03 | GET `/admin/auth/me` | 无 | `AdminUser` | 有效后台会话；包含实际权限 |
| A04 | POST `/admin/auth/logout` | 无正文 | 204 | 撤销服务器会话和 Cookie |
| A05 | PATCH `/admin/auth/password` | `{current_password:string,new_password:string[12..128]}` | `{changed:true}` | 当前用户；撤销所有会话并要求重新登录 |
| A06 | GET `/admin/users` | `page?,page_size?,status?:active或disabled` | `Page<AdminUser>` | A；不返回密码摘要 |
| A07 | POST `/admin/users` | `{username,display_name,initial_password,permission_codes:string[],review_domains:string[]}` | `AdminUser` | A；用户名唯一；首次登录必须改密，未改密仅允许 me/password/logout |
| A08 | PATCH `/admin/users/{userId}` | `{display_name?,permission_codes?,review_domains?,status?}` | `AdminUser` | A + If-Match；禁止禁用或移除最后一个有效管理员权限 |
| A09 | POST `/admin/users/{userId}/password-reset` | `{temporary_password:string[12..128]}` | `{reset:true}` | A；强制改密并撤销会话；不在审计日志记录密码 |

首个管理员通过受控部署命令创建，不开放后台注册接口。`AdminUser={id,username,display_name,status,permission_codes[],review_domains[],must_change_password:boolean,row_version,created_at,updated_at}`，所有 ID、状态、权限均由服务端维护和验证。

### 4.2 内容维护与审核发布

为减少后台重复交互，内容接口使用 `/admin/content/{resource}`。`resource` 只允许以下七个字面值；禁止把它解释为任意数据库表名。实施 OpenAPI 时按字面路径展开，每种资源使用独立的请求/响应模型，不能使用无类型的 `object` 或 `any` 代替。

| resource | 实体 | 最小草稿创建字段 | 发布所需业务字段 | 审核领域 |
|---|---|---|---|---|
| `teas` | Tea | `name,category` | `name,category,aliases,origin,process,source_ids` | tea_content |
| `tea-items` | TeaItem | `tea_id,sku,batch_code,name` | 以上加 `grade,year,specification,storage,shelf_life_months?,supplier_id,source_ids`；可选 `media_file_ids:UUID[]` 默认空 | tea_content |
| `effects` | EffectProfile | `tea_id,tea_item_id?` | `features,scenarios,cautions,claims,source_ids,valid_from` | tea_content |
| `brewing-recipes` | BrewingRecipe | `tea_id,tea_item_id?,title` | `vessel,water_ml,tea_g,temperature_c,water_quality,rinse,steps,adjustments,source_ids,valid_from` | tea_content |
| `suppliers` | Supplier | `name` | `cooperation_status,contact,qualifications,disclosure,source_ids` | supply |
| `supply-offers` | SupplyOffer | `tea_item_id,supplier_id` | `price_mode,price?,inventory_mode,quantity?,minimum_order,lead_time_text,ship_from,sample_rule,as_of,valid_from,valid_until,disclosure,source_ids` | supply |
| `sources` | SourceRecord | `type,title` | `author_or_org,source_date?,summary,file_ids,rights,valid_from,valid_until?` | source_rights |

发布所需字段中的 `?` 允许明确为 null；缺少年份、等级等无法满足真实资料要求时保留草稿，或调整经过项目确认的首发资料范围，不自动编造。来源本身是授权根对象，不要求循环引用另一个来源。

发布依赖按顺序检查：SourceRecord 授权先有效；Tea 和 Supplier 的来源先发布；TeaItem 的父 Tea 与 Supplier 已发布且供应商合作有效；功效/泡茶的 Tea、可选 TeaItem 和全部声明来源已发布；SupplyOffer 的 TeaItem、Supplier 和来源均已发布且有效。Claim.source_ids 必须为该功效 source_ids 的非空子集。TeaItem 媒体通过 media_file_ids 关联文件及有效来源授权，未授权媒体不进入 images。上述依赖检查也用于公开读取，避免父对象下线后子对象仍可访问。

| 编号 | 方法和路径 | 请求 | 响应 data | 权限和业务要求 |
|---|---|---|---|---|
| C01 | GET `/admin/content/{resource}` | `q?,status?,tea_id?,page?,page_size?` | `Page<ContentSummary>` | O/R/A；仅接受该资源有意义的筛选，否则 422 |
| C02 | POST `/admin/content/{resource}` | 该资源最小草稿模型 | `ContentDetail<T>`，201 | O/A；只能新建 draft，ID 服务端生成 |
| C03 | GET `/admin/content/{resource}/{id}` | `revision?:integer≥1` | `ContentDetail<T>` | O/R/A；历史版本只读；敏感字段仍按权限过滤 |
| C04 | PATCH `/admin/content/{resource}/{id}` | 该资源可编辑业务字段的子集 | `ContentDetail<T>` | O/A + If-Match；仅 draft/rejected 可编辑，编辑后为 draft |
| C05 | GET `/admin/content/{resource}/{id}/versions` | `page?,page_size?` | `Page<VersionSummary>` | O/R/A；保留版本历史 |
| C06 | GET `/admin/content/{resource}/{id}/diff` | `from_revision:integer,to_revision:integer` | `{changes:[{field:string,before:JSON值,after:JSON值}]}` | O/R/A；差异结果同样脱敏，不暴露无权字段 |
| C07 | POST `/admin/content/{resource}/{id}/revisions` | `{base_revision:integer,reason:string}` | `ContentDetail<T>`，201 | O/A + If-Match；复制为下一版草稿；已有工作草稿则 409 |
| C08 | POST `/admin/content/{resource}/{id}/submit-review` | `{revision:integer,comment?:string}` | `ContentDetail<T>` | O/A + If-Match；校验完整性、引用与授权，冻结待审内容 |
| C09 | GET `/admin/reviews` | `resource?,status?:pending或resolved,page?,page_size?` | `Page<ReviewSummary>` | R/A；R 只能访问对应领域 |
| C10 | POST `/admin/content/{resource}/{id}/review` | `{revision:integer,decision:approve或reject,comment:string}` | `ContentDetail<T>` | 对应领域 R + If-Match；禁止审核自己的修改；拒绝必须说明原因；approve 时重新核验依赖并在同一事务中自动发布，响应直接为 published |
| C11 | POST `/admin/content/{resource}/{id}/withdraw` | `{revision:integer,reason:string}` | `ContentDetail<T>` | O/A + If-Match；仅 published 可执行；立即阻止公开读取和咨询创建，并触发检索索引失效 |
| C12 | POST `/admin/content/{resource}/{id}/relist` | `{revision:integer,reason?:string}` | `ContentDetail<T>` | O/A + If-Match；仅 withdrawn 可执行；直接恢复已审核版本为 published，不创建新审核、不增加内容 revision；若该商品因本次演示来源撤回而不可见，同一事务恢复其来源可用状态和公开索引，响应返回后 U02/U04/U05 必须可读 |
| C13 | DELETE `/admin/content/tea-items/{id}` | `{reason:string}` | 204 | A 可逻辑删除任意商品；O 仅可删除未提交 draft；需 If-Match。公开版本、历史版本和审计事实不做物理擦除 |

商品删除是逻辑删除：默认内容列表、公开读取、问答检索和咨询创建均排除 deleted；历史版本和审计记录保留。其他内容资源不提供删除接口。历史发布版本不得被 PATCH 覆写；回滚内容必须复制旧版本到新草稿，重新审核并自动发布。单个 stable ID 同时只允许一个活动发布版本、一个工作版本。

`ContentDetail<T>={id:UUID,resource:enum,revision:integer,row_version:integer,status:ContentStatus,published_revision?:integer,payload:T,created_by:UUID,updated_by:UUID,reviewed_by?:UUID,reviewed_at?:timestamp,created_at:timestamp,updated_at:timestamp}`。

`ContentSummary` 为上述元数据加 `title:string`，不带 payload。`VersionSummary={revision,status,created_at,updated_at,updated_by,reviewed_by?,change_reason?:string}`。`ReviewSummary={resource,content_id,revision,title,submitted_by,submitted_at,review_domain,status:pending或resolved}`。

状态允许：`draft → pending_review → published`，其中审核通过与发布为同一事务；`pending_review → rejected → draft`；`published → withdrawn/expired/superseded/deleted`；`withdrawn → published` 可由 O/A 直接执行，恢复最近一次已审核版本和对应公开来源可用状态，不再审核且不增加内容 revision；未提交 `draft → deleted`。到期和下架由读取条件立即生效，后台任务补记 expired；不得依赖定时任务及时运行才阻止读取。独立撤回、过期或法务禁用的外部来源仍须由来源权限流程恢复，不能由商品上架绕过。

### 4.3 导入与文件

| 编号 | 方法和路径 | 请求 | 响应 data | 权限与约束 |
|---|---|---|---|---|
| I01 | GET `/admin/import-templates/{resource}` | `format:xlsx或csv` | 模板文件 | A 或 imports:write；七种 resource；包含 schema_version 和字段说明 |
| I02 | POST `/admin/imports` | multipart：`file,resource,schema_version` | `ImportJob`，202 | A 或 imports:write；保留原方案接口；仅校验和暂存，不发布 |
| I03 | GET `/admin/imports/{importId}` | UUID | `ImportJob` | A 或任务创建者且仍有 imports:write |
| I04 | GET `/admin/imports/{importId}/errors` | `page?,page_size?` | `Page<{row:integer,column:string,code:string,message:string}>` | 同 I03；错误不包含完整联系方式等敏感原文 |
| I05 | POST `/admin/imports/{importId}/commit` | `{validation_version:integer,mode:create_only或upsert_draft}` | `ImportJob`，202 | 同 I03；只允许全部校验通过的文件提交；生成草稿 |
| I06 | POST `/admin/files` | multipart：`file,purpose:source或media` | `FileMeta`，201 | O/A；原件默认私有；上传不等于公开授权 |
| I07 | GET `/admin/files/{fileId}/content` | UUID | 二进制 | 按来源资料读取权限；每次下载审计 |

`ImportJob={id,resource,schema_version,state:queued或validating或invalid或validated或committing或committed或failed,total_rows,error_rows,warning_rows,validation_version:integer,created_count:integer,updated_count:integer,created_at,finished_at?,failure_code?:string}`。`FileMeta={id,name,mime_type,size_bytes,sha256,created_at}`；不返回磁盘路径和 bucket 凭据。

导入限制建议：仅 `.xlsx`/UTF-8 `.csv`，不支持 `.xlsm`；文件最多 10MiB、数据行最多 5000，解压后最多 100MiB，拒绝公式单元格和外部链接。图片/资料允许 PNG、JPEG、WebP、PDF、DOCX，媒体允许 MP4；普通文件最多 20MiB，MP4 最多 100MiB；同时验证扩展名、MIME 和实际文件签名，不接受 HTML/SVG/可执行文件。必要的文件处理在受限进程中进行。

I05 必须再次检查引用版本和唯一键；校验后数据发生变化则 409 并要求重新上传校验。首期整批事务提交，任何行失败整批回滚。`upsert_draft` 只更新未发布工作草稿，引用业务唯一键；已有发布内容须通过版本流程生成新草稿。不得按不可信导入字段更新权限、审批结果或任意数据库列。

唯一键：Tea 为规范化 `category+name`；TeaItem 为 `supplier_id+sku+batch_code`；功效与泡茶为 `tea_id+tea_item_id或通用` 的活动标准版本；SupplyOffer 使用显式 `offer_code`；Supplier 使用客户分配的 `supplier_code`。后两者在草稿创建时可由后台生成，导出与再次导入必须携带。来源用稳定 `source_code`，文件哈希仅用于重复提示，不能代替授权记录标识。

### 4.4 线索 统计 导出 审计

| 编号 | 方法和路径 | 请求 | 响应 data | 权限与约束 |
|---|---|---|---|---|
| M01 | GET `/admin/inquiries` | `status?,kind?,tea_id?,tea_item_id?,created_from?,created_to?,page?,page_size?` | `Page<InquirySummary>` | L/A；列表联系方式脱敏 |
| M02 | GET `/admin/inquiries/{inquiryId}` | UUID | `InquiryDetail` | `inquiries:read_contact` 才能读完整联系方式；访问记审计 |
| M03 | PATCH `/admin/inquiries/{inquiryId}` | `{status?:InquiryStatus,assignee_id?:UUID,note?:string}` | `InquiryDetail` | L/A + If-Match；只能指派给具备线索权限的有效账号 |
| M04 | GET `/admin/feedback` | `tea_id?,tea_item_id?,rating?,page?,page_size?` | `Page<FeedbackRecord>` | stats:read；备注经脱敏处理 |
| M05 | GET `/admin/statistics` | `from:date,to:date,group_by:day或tea或tea_item` | `{rows:StatisticsRow[],timezone:"Asia/Shanghai"}` | stats:read；日期闭区间，最多 93 天；分组缺少茶品的流量进入 unknown |
| M06 | GET `/admin/unanswered-questions` | `from?,to?,reason?,page?,page_size?` | `Page<UnansweredQuestion>` | stats:read；只读脱敏问题；不保留健康画像 |
| M07 | POST `/admin/exports` | `{kind:inquiries或content或statistics,resource?:enum,filters:该类型允许的筛选对象,format:csv}` | `ExportJob`，202 | 对应数据权限；inquiries 还需 inquiries:export；不能自行选择敏感列 |
| M08 | GET `/admin/exports/{exportId}` | UUID | `ExportJob` | 创建者且当前仍有该导出权限，或 A 且有数据权限 |
| M09 | GET `/admin/exports/{exportId}/content` | UUID | CSV 文件 | 同 M08；下载再次审计；失效返回 410 |
| M10 | GET `/admin/audit-logs` | `actor_id?,action?,resource?,object_id?,from?,to?,page?,page_size?` | `Page<AuditEntry>` | A；只读，无修改删除接口 |

`InquiryStatus=new或assigned或contacted或closed`。迁移只允许 `new→assigned/contacted/closed`、`assigned→contacted/closed`、`contacted→closed`，状态回退一律 409。closed 必须提供关闭备注。首次指派可将 new 改为 assigned。

`InquirySummary={id,kind,tea_id?,tea_item_id?,status,contact_masked,assignee_id?,created_at,updated_at,row_version}`。`InquiryDetail` 增加 `need,contact?或contact_masked,consent:{notice_version,purpose,accepted_at},notes:[{text,actor_id,created_at}]`；未经权限不能包含 `contact` 字段。

`FeedbackRecord={id,target_type,target_id,target_version?,rating,reason?,tea_id?,tea_item_id?,created_at}`。`UnansweredQuestion={id,question_redacted,reason,tea_id?,tea_item_id?,created_at}`。

`StatisticsRow={group_key:string,search_count:integer,no_result_search_count:integer,helpful_count:integer,unhelpful_count:integer,brewing_start_count:integer,brewing_complete_count:integer,inquiry_count:integer,unconfirmed_answer_count:integer}`。

`ExportJob={id,kind,state:queued或running或succeeded或failed,created_at,finished_at?,expires_at?,row_count:integer,failure_code?:string}`。文件完成后最多保存 24 小时；导出 CSV 对以 `= + - @` 开头或控制字符开头的单元格做公式注入防护；不导出密码、密钥、采购价或原始审计中的个人信息。

`AuditEntry={id,actor_id?,action,resource,object_id?,before_revision?,after_revision?,summary_redacted,request_id,created_at}`。审计只追加；查看联系方式、导出、下载来源、导入、审核自动发布、下架、重新上架、逻辑删除、撤权、账号权限调整均记录；普通运营账号没有删除审计能力。

## 5 运维及内部边界

| 接口或内部协议 | 输入 | 输出和约束 |
|---|---|---|
| GET `/health/live` | 无；不带 /api/v1 前缀 | `{status:"ok"}`；只证明进程存活，不泄露版本和内部连接信息 |
| GET `/health/ready` | 仅基础设施网络 | 200 或 503，`{status:ready或not_ready}`；检查 PostgreSQL 和关键文件依赖；模型故障触发问答降级，不让浏览查询整体失效 |
| `ContentResolver.resolve(tea_id,tea_item_id,kind)` | kind 为 effects/brewing | 只从已发布记录解析 Match；不是公开 HTTP API |
| `KnowledgeIndex.rebuild(snapshot_id)` | PostgreSQL 的已授权发布快照 | `{index_version,record_count}`；SQLite/NetworkX 是可重建产物；失败可重试，不创建公开重建接口 |
| `Retriever.search(question,scope,index_version)` | 脱敏问题、茶品范围 | `[{source_id,source_revision,content_id,content_revision,chunk_id,text,score}]`；分数只内部使用，不包装成真实性概率 |
| `Generator.answer(question,evidence)` | 服务端组装的证据，不接受前端 system prompt | `{text,citation_ids}`；调用 Ollama；不允许模型写业务数据库或调用发布工具 |

发布和撤权事务同时写持久索引任务；后台工作进程轮询 PostgreSQL 领取任务，不引入 Kafka/Redis。检索命中后、生成前以及响应发送前重新核验来源和内容的当前状态。旧索引只可能降低命中率，不能绕过正式数据库的公开授权过滤。模型缓存必须包含内容版本和授权版本；首期可禁用回答缓存以简化一致性。

## 6 核心业务字段模型

### 6.1 公开内容和匹配结果

`PublicVersion={revision:integer≥1,published_at:timestamp,updated_at:timestamp,reviewer_label:string}`。所有正式功效、泡茶必须携带 PublicVersion 和至少一个允许公开说明的出处摘要；不能公开文件时仍可返回获准的来源标题，但不能泄露未授权摘要。

| DTO | 必填和可空字段 | 规则 |
|---|---|---|
| SearchHit | `entity_type:tea或tea_item,id:UUID,tea_id:UUID,tea_item_id?:UUID,name:string,category:string,sku?:string,batch_code?:string` | 类型为 tea 时 id=tea_id，tea_item_id 为 null；具体商品时 id=tea_item_id |
| TeaPublic | `id,name,category,aliases:string[],origin:string,process:string,version:PublicVersion` | 分类由 config 字典提供，不接受前端自行创造枚举 |
| TeaItemPublic | `id,tea_id,sku,batch_code,name,grade:string,year:integer[1900..当前年],specification:string,storage:string,shelf_life_months?:integer[1..600],images:FilePublic[],version:PublicVersion` | 父 Tea 不公开时自身也不可公开；媒体需单独授权 |
| Match<T> | `requested:{tea_id,tea_item_id?},match_level:tea_item或tea或none,fallback_reason?:no_item_record或item_record_unavailable,record:T或null,notice?:string` | none 时 record=null；存在茶但缺少内容返回 200 none；茶本身不可见返回 404 |
| EffectPublic | `id,tea_id,tea_item_id?,features:string[],scenarios:string[],cautions:string[],claims:Claim[],sources:SourceSummary[],boundary_notice:string,version:PublicVersion` | features、cautions、sources 非空；健康提示来自固定已审文案 |
| Claim | `text:string,evidence_level:experience或composition或research,source_ids:UUID[]` | 每个表述有证据层级及来源，不输出疾病判断 |
| BrewingPublic | `id,tea_id,tea_item_id?,title,vessel:string,water_ml:Range,tea_g:Range,temperature_c:Range,water_quality:string,rinse:boolean,steps:BrewingStep[],adjustments:Adjustment[],sources:SourceSummary[],version:PublicVersion` | 参数来自审核内容；不能由模型修改已发布配方 |
| BrewingStep | `step_no:integer≥1,title:string,instruction:string,duration_seconds:integer,infusion_no?:integer≥1` | step_no 从 1 连续；润茶若 rinse=true 必须有明确步骤 |
| Adjustment | `condition:too_strong或too_weak或bitter或low_aroma,instruction:string` | 只展示专家审核建议，用户感官判断在前端选择 |
| SourceSummary | `id,type:book或standard或paper或report或expert或internal,title,author_or_org?:string,source_date?:date,revision:integer` | 仅输出获准披露字段，标题和类型必须可公开；作者、日期无公开授权时为 null |
| SourcePublic | SourceSummary 加 `summary?:string,files:FilePublic[]` | files 只包含可公开下载的文件 |
| FilePublic | `id,name,mime_type,size_bytes,content_path:string` | content_path 固定指向授权读取接口，不是本地磁盘路径 |

匹配顺序：明确 `tea_item_id` 时先查该 SKU/批次有效内容，再回退关联 Tea 通用内容；未传则只返回 Tea 通用内容。不能回退到另一个 SKU 或批次。缺少来源、授权撤回、未审核、过期都视为不可用。若出现两个同等优先的活动版本，后端报内部数据冲突并告警，不能随机选取。

前端可让用户临时调整泡茶计时，但不得覆盖后台 recipe；完成事件必须带原 recipe_id、revision 和 brewing_run_id。首期不保存跨设备泡茶进度，因此不新增泡茶会话增删改查接口。

### 6.2 货源和后台敏感字段

| 对象 | 字段 | 规则 |
|---|---|---|
| Supplier 后台 | `id,supplier_code,name,cooperation_status:active或paused或ended,contact:{name,phone?,email?},qualifications:UUID[],disclosure:Disclosure,source_ids:UUID[]` | contact 至少有 phone/email 一个；供应商联系人仅获权后台人员可读 |
| SupplyOffer 后台 | `id,offer_code,tea_item_id,supplier_id,price_mode:quote_only或reference,price?:Price,inventory_mode:unknown或snapshot,quantity?:number≥0,minimum_order:{value:number>0,unit:g或kg或piece},lead_time_text,ship_from,sample_rule,as_of:timestamp,valid_from,valid_until,disclosure,source_ids` | 不接受 realtime/in_stock 作为首期状态；as_of 不得晚于服务器当前时间 |
| Price | `amount:decimal-string,currency:CNY,unit:g或kg或piece,tax_included:boolean,shipping_included:boolean` | reference 时 price 必填；quote_only 时为 null；采购价另存私有字段，不出现在公开 DTO |
| Disclosure | `public_fields:string[],reviewer_note:string` | 每类资源独立字段白名单；敏感字段不能靠配置变为公开；审核后生效 |
| SupplyPublic | `id,tea_id,tea_item_id,sku,batch_code,supplier_display_name?:string,origin?:string,specification:string,price_mode,price?:Price,inventory_mode,quantity?:number,minimum_order?,lead_time_text?:string,ship_from?:string,sample_rule?:string,as_of,valid_until,sources:SourceSummary[],notice:string,version:PublicVersion` | price/quantity/供应主体等逐字段授权；无公开价格权限时输出 quote_only+null；非实时状态必须有提示 |

报价过期、供应商停用、TeaItem 下线、来源撤权任意一项成立，整条供应信息不进入公开列表；前台可以显示“暂无有效货源，请咨询”，不能显示该过期记录的价格或库存。报价作为参考不等于下单承诺。

后台敏感字段还包括 `purchase_price?:Price`；仅 `suppliers:sensitive_read` 可读，仅 `suppliers:sensitive_write` 可写。两项权限不默认赋予所有运营/管理员。没有读权限的详情、版本对比、导出必须投影去除这些字段，不能靠前端隐藏。

`SourceRecord.rights={development:boolean,retrieval:boolean,evaluation:boolean,public_metadata:boolean,public_excerpt:boolean,public_file:boolean,authorization_note:string,rights_holder:string,authorized_until?:timestamp}`。公开依赖至少要求 public_metadata；RAG 使用同时要求 retrieval 和相应公开表达授权；撤回后按引用关系停止使用。文件上传和文件持有人并不自动取得这些权利。

### 6.3 问答 留资与反馈

| DTO | 字段 | 校验及处理 |
|---|---|---|
| QuestionCreate | `question:string[1..1000],intent?:general或brewing,tea_id?:UUID,tea_item_id?:UUID` | tea_item_id 存在时 tea_id 必填且关联一致；intent 只表达界面意图，服务端仍须根据问题与证据判断；不接受 model/system_prompt/source_text 等客户端控制字段 |
| AnswerPublic | `id:UUID,status:answered或unconfirmed或boundary或degraded,answer:string,intent?:general或brewing,tea_id?:UUID,tea_item_id?:UUID,citations:[{source:SourceSummary,content_id:UUID,content_revision:integer}],related_tea_ids:UUID[],boundary_notice:string,reason_code?:string,created_at:timestamp` | answered 必须有有效 citations；`intent=brewing` 时返回的茶品标识必须来自公开检索结果，前端再调用 U07；边界提示可无 citation；不输出模型思考链、内部提示词和完整检索原文 |
| InquiryCreate | `kind:consultation或sample,tea_id?:UUID,tea_item_id?:UUID,supply_offer_id?:UUID,need:string[1..1000],contact:{channel:phone或email,value:string},consent:{accepted:true,notice_version:string,purpose:inquiry_followup}` | 样品必须 tea_item_id；供应记录必须属于该茶品且当前可用；phone 为 + 和数字共 7 至 15 位数字，email≤254；不收住址、身份证或病史 |
| FeedbackCreate | `target_type:effect或brewing或answer,target_id:UUID,target_version?:integer,rating:helpful或unhelpful,reason?:string≤500` | effect/brewing 必须版本号；answer 不传版本，且属于本匿名会话；客户端不能随意指定归因 tea_id |
| EventCreate | `event_id:UUID,event_type:brewing_started或brewing_step_completed或brewing_completed,recipe_id:UUID,recipe_revision:integer,brewing_run_id:UUID,step_no?:integer,occurred_at:timestamp` | step_completed 必须合法 step_no；时间与服务器差值≤24小时；其余属性拒绝；采集值仅为用户自报行为 |

咨询同意必须用户主动勾选，不默认勾选；服务端校验当前 notice_version 并记录服务器 `accepted_at` 与当时用途。文本版本过期返回 409 `NOTICE_CHANGED`，前端重新展示并请用户再次主动同意。业务并不要求短信验证码，首期不增短信发送 API。日志、统计和模型输入不包含联系方式。

问答默认同步 JSON，模型最长预算 30 秒，HTTP 超时 35 秒，页面 40 秒；超时或模型离线时可返回 `degraded` 的固定提示和可确认的结构化出处，不凭空补全回答。证据不足返回 `unconfirmed`，健康越界问题返回固定 `boundary`；这些情况都不让模型决定供应状态。资料中的指令和模型输出均当作数据处理。

已进入浏览器的步骤事件只做匿名统计，不用于安全决策。服务端验证 recipe/version 曾发布，且当前仍允许使用；单次 brewing_run_id 每种完成指标最多记一次。检索次数、无结果、咨询提交、回答不可确认由后端在真实业务请求成功后记录，浏览器不得自行上报这些指标。

## 7 前端页面和接口对应关系

| 页面 | 使用接口 | 必须处理的界面状态 |
|---|---|---|
| 滚动首页与检索 | U01、U02、U03 | 历史与联系为展示内容；茶类数量来自公开数据；加载、空结果、错误重试、演示标识、茶类与具体商品结果区分 |
| 商品与批次详情 | U04、U05、U06、U08 | 不存在/下线、缺少功效、来源失效、无有效货源 |
| 功效与出处 | U06、U09、U10、U13 | 通用回退提示、证据层级、来源可见范围、健康边界、反馈成功/失败 |
| 问茶与泡茶 | U11、U07、U13、U14 | 生成中、泡法意图与茶品匹配、茶品不明确时选择器、回答后获取完整配方、分步计时、完成反馈、answered、unconfirmed、boundary、degraded、429 与重试 |
| 咨询和样品 | U01、U12 | 茶品关联、主动同意、字段错误、重复提交、货源失效、告知文本变更 |
| 登录和权限 | A01—A09 | 未改初始密码、会话失效、无权页面、重新登录 |
| 内容编辑及审核 | C01—C13、I06—I07 | 草稿置顶、校验失败、审核拒绝、版本冲突、对比、审核自动发布、上下架互斥、免复审重新上架、逻辑删除 |
| 导入中心 | I01—I05 | 上传、校验中、逐行错误、待提交、提交中、完成与失败 |
| 线索和统计 | M01—M10 | 联系方式脱敏、跟进、无数据、导出排队、文件过期、审计只读 |

移动端建议验收视口至少 375×812，桌面至少 1440×900，并检查中间宽度不产生横向溢出。前端不得用“按钮不可见”代替后端权限，不得把模拟数据自动当正式数据发送。

## 8 开发与联调使用的 Skill

Skill 是任务工作方法，React、FastAPI、pytest、OpenAPI、Ollama 是技术或工具，不是当前已安装的同名 Skill。当前列表中没有独立的 React 或 FastAPI 专用开发 Skill；相应代码由通用编码能力按契约实施，不声称存在或已经安装这些 Skill。

| 阶段 | 选用 Skill | 工作内容与产物 | 使用安排 |
|---|---|---|---|
| 需求读取 | `documents:documents` | 读取 Word 方案，保留首期边界与客户资料条件 | 本次已用于读取资料；后续 Word 交付也使用 |
| 接口与交互设计 | `brainstorming` | 茶类/SKU/批次边界、权限、状态流、异常分支、设计审查 | 本次用于设计梳理；不会把文档内“下一步”当作额外执行指令 |
| 前后端任务拆分 | `writing-plans` | 将获准的契约拆为用户端、内容后台、问答导入、联调任务，写出输入输出和验证方法 | 接口设计确定后使用；本次只选型，不声称完整实施计划已执行 |
| 前端浏览器联调 | `playwright` | 实际浏览器完成检索、看功效、泡茶、咨询及后台审核流程，保存失败证据 | 首选；执行前检查 Node/npx、浏览器和 CLI 环境 |
| 导入资料与模板 | `spreadsheets:Spreadsheets` | 创建/检查 XLSX/CSV 模板、标准样例、单位与缺失值；不代替后端导入程序 | 有真实样表或开始制作模板时使用 |
| 安全专项验收 | `security-best-practices` | 按 Python 和 React/TypeScript 检查越权、CSRF、文件处理、数据泄露、模型信任边界 | 明确开展安全编码/安全验收时启用；不是每次普通联调都做完整审计 |

前端实施组合：`brainstorming → writing-plans → 通用 React/TypeScript 编码 → playwright`。

后端实施组合：`brainstorming → writing-plans → 通用 FastAPI/Python 编码 → pytest/HTTPX 契约验证`；有导入模板任务时用 `spreadsheets:Spreadsheets`，进入安全专项时用 `security-best-practices`。

前后端联合验证：依据同一 OpenAPI 契约，运行后端真实接口校验，再用 `playwright` 检查页面和端到端业务流程。Playwright Skill 用于浏览器操作；API 模型和数据库事务测试由相应测试工具完成。

### 8.1 条件适用的 Skill

| Skill | 使用条件 | 本次选择 |
|---|---|---|
| `figma:figma-design-to-code` | 有 Figma 设计文件，需要读取设计上下文并实现页面 | 目前无 Figma 输入，不作为阻塞项 |
| `playwright-interactive` | 持久 JS REPL 和该 Skill 要求的运行环境可用，需要反复交互调试 | 备选；当前受限沙箱不满足其所述无沙箱运行前提，不作为默认联调依赖 |
| `system-design` | 需要专门做容量、分布式或扩容设计 | 首期保持模块化单体，不为了用 Skill 引入微服务和消息系统 |
| `sites:sites-building`、`sites:sites-hosting` | 明确选用 Sites 托管或项目已有 .openai/hosting.json | 当前无该托管要求；本地模型部署不因此迁到 Sites |
| `skill-creator` | 后续明确要把本项目契约封装为团队可复用 Skill | 可创建项目专用 Skill，但本次不安装或创建新 Skill |
| `aspnet-core` | 团队明确改为 ASP.NET Core 后端 | 当前选 Python，故不使用；不为了匹配 Skill 改变技术栈 |

`h3lite`、`aishipin` 用于本地视频模型与视频制作，不能因为同为“本地 AI”就用于本项目问答后端。

## 9 契约落地和联调顺序

1. **建立唯一契约来源。** 把本文落地为 `contracts/openapi.yaml`，固定 OpenAPI 3.1；为所有明确展开的路径定义唯一 operationId、请求/响应 schema、权限、示例和错误码。该文件是前后端共用基线；FastAPI 自动输出必须与之做语义对比。本文尚未生成这个文件。
2. **先完成一条纵向业务链。** 测试数据准备一个 Tea、两个不同批次 TeaItem、一份通用功效、一份具体配方、一条来源和一条有效货源，验证选茶→说明→泡茶→咨询。样例注明非正式资料。
3. **前端按契约开发。** 从固定契约生成 TS 类型与客户端；Mock 必须通过同一 JSON Schema 验证；组件不手写另一个字段版本。Mock 用于独立开发，验收切到真实 API。
4. **后端按模块实现。** 内容与发布、导入文件、咨询、问答分别保持内部边界；逐条验证请求、响应、错误码和权限。所有公开查询使用公共的可发布性判断。
5. **完成后台内容循环。** 导入→校验→草稿→审核并自动发布→前台可见→下架或演示来源撤回→前台和问答不可见；下架商品可直接重新上架，原型同步恢复演示来源并恢复公开访问；加入草稿与线上版本并存验证。
6. **浏览器联合验证。** 使用 Playwright 走真实服务，测试桌面和移动端，记录环境、应用提交版本、契约版本、数据集版本与失败证据。
7. **形成交付证据。** API 契约报告、端到端结果、30 个真实问题的逐条核验、权限测试、备份恢复和部署回滚记录。仅页面截图、Swagger 可打开或接口返回 200 都不足以代表通过。

建议实施产物布局：`contracts/openapi.yaml`、`contracts/examples/`、`frontend/src/api/generated/`、`backend/app/modules/`、`backend/tests/contracts/`、`backend/tests/integration/`、`output/playwright/`、`docs/acceptance/`。这些是后续目标位置，本文不声称已创建应用代码。

接口变更先修改契约再改实现。删除字段、改类型、改空值语义、改变权限或状态码均按破坏性变更审查；前后端共同更新用例。无兼容迁移方案不能直接更改 v1。新枚举值也要检查前端穷举逻辑，而非默认向后兼容。

## 10 必须通过的联调验收用例

| 编号 | 场景 | 预期结果 |
|---|---|---|
| T01 | 同名茶品、同 SKU 不同批次 | 结果实体类型和标识正确；二维码进入指定 TeaItem |
| T02 | SKU 专属内容存在/缺失/下线 | 分别精确命中、标明通用回退、按当前授权处理；不跨批次借用 |
| T03 | TeaItem 与 teaId 不匹配 | 422，不返回其他商品内容 |
| T04 | 未审核内容通过公开 ID、来源 ID、文件 ID 请求 | 404；搜索、文件和问答均不可旁路读取 |
| T05 | 配方有效且完整 | 步骤顺序、单位、区间、版本正确；移动端可完成计时和反馈 |
| T06 | 货源刚过期或供应商暂停 | 新请求不返回该报价和库存；可显示无有效货源提示 |
| T07 | 供应商联系人和采购价 | 不出现在公开响应、错误、日志、版本差异或无权导出中 |
| T08 | 咨询未同意/告知版本过期/字段不合法 | 分别返回 422/409/422，数据库不落有效线索 |
| T09 | 同一咨询双击、网络重试、并发重复 | 同幂等键只创建一条，冲突请求体 409，响应不回显完整联系方式 |
| T10 | 无关账号访问线索详情和导出下载 | 403/404，无越权读取；权限撤销后的旧导出也不能下载 |
| T11 | 导入非法文件、公式、重复键、引用缺失 | 阻断并给出行列错误；无部分写入，无直接发布 |
| T12 | 校验通过后目标数据变化再提交导入 | 409；不得覆盖别人刚修改的数据 |
| T13 | 两人同时编辑或审核 | 一个成功，旧 If-Match 返回 409；审核人不可批准自己的修改 |
| T14 | 新草稿编辑、拒绝与再次审核 | 原发布版本保持可用；草稿未发布不出现在公开内容里 |
| T15 | 来源撤权但 SQLite 仍有旧片段 | 内容、文件、模型引用均被实时过滤，索引重建最终完成 |
| T16 | 无来源、越界问题、模型离线 | unconfirmed/boundary/degraded 分别正确；不存在伪造出处和模型价格 |
| T17 | 恶意资料内含“忽略规则”或越权操作指令 | 仅作为资料文本；不能改变权限、触发工具或读取私密来源 |
| T18 | 反馈和事件重复、非法步骤、伪造咨询事件 | 去重或拒绝；咨询量只来自成功入库的真实咨询 |
| T19 | 登录过期、CSRF 缺失、账号禁用 | 401/403，写入不成功；UI 给出可操作的恢复提示 |
| T20 | 导出完成后下载、过期、Excel 打开 | 权限和期限正确；敏感列受控；公式字符不被执行 |
| T21 | 任务执行时后端重启 | 导入/导出可恢复或明确失败，不显示虚假成功，不重复写入 |
| T22 | 客户审核人通过待审内容 | 审核、依赖复核、版本替换与审计在同一事务完成；响应直接为 published；失败时不产生部分发布 |
| T23 | 数据运营或管理员上下架商品、管理员删除商品、运营删除草稿 | published 只允许下架，withdrawn 只允许重新上架；上下架两按钮互斥；重新上架无需复审且内容 revision 不变；演示来源撤回后重新上架同步恢复来源状态，响应后公开列表、详情与咨询入口立即恢复；下架和逻辑删除立即关闭公开详情与咨询创建；O 不能删除已提交或已发布商品；历史版本与审计保留 |
| T24 | 备份恢复和应用版本回滚 | 数据与附件引用可恢复；迁移兼容性经验证，不能只回滚前端文件 |

业务资料验收沿用原方案建议：1 至 2 个茶类、约 20 个代表茶品、至少 20 条完整冲泡方案（其中至少 5 条绑定具体茶品）、约 20 个货源 SKU、至少 30 个真实问答及对应审核答案。数量最终取决于客户确认范围；演示数据不能充抵真实来源、授权和专家审核。

## 11 尚需业务确认的内容

这些事项影响真实资料发布和运营，不妨碍按上述契约准备页面和基础后端：首发茶类/SKU清单；茶文化与供应链审核人；来源元数据/摘要/附件各自的授权；供应主体披露字段；咨询用途告知文案和跟进人员；联系方式与日志保留期限；目标部署机器和域名。

技术选型和接口是本次建议基线；没有把原方案中的客户沟通建议、资料准备任务或模型容量估算当成已批准的事实。正式开发和验收时，应把已确认取值固化到契约、配置和测试数据中。
