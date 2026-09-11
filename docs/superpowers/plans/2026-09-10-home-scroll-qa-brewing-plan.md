# 首页滚动与问茶冲泡融合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The skill is not installed in this workspace, so the current session executes the same checkpoints inline. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把茶序首页改成四段式单页滚动体验，并把完整分步冲泡流程嵌入问茶页，让泡法问题自动带入对应茶品参数。

**Architecture:** 首页展示内容拆到 `HomeSections.tsx`，冲泡状态机拆到 `BrewGuide.tsx`，`PublicPages.tsx` 负责组合页面与问答意图解析，`main.tsx` 负责导航和兼容路由。现有本地数据仍是唯一演示数据来源，所有自动匹配只使用 `publicItems`。

**Tech Stack:** React 19、TypeScript 7、Vite 8、现有 CSS 设计令牌、Codex 内嵌浏览器验收。

**Spec:** `docs/superpowers/specs/2026-09-10-home-scroll-qa-brewing-design.md`

## Global Constraints

- 保持米白、深茶绿、朱砂点缀的现有视觉语言。
- 不新增运行时依赖、真实网络请求、真实联系发送或大模型调用。
- 旧 `/brew/{teaItemId}` 链接必须继续有效并进入问茶中的冲泡区。
- 只从已发布且来源可用的 `publicItems` 匹配茶品。
- 每次代码快照同时更新根 README、原型 README、接口契约、验收记录和 `VERSION_SNAPSHOTS.md`。

---

### Task 1: 首页展示区块

**Files:**
- Create: `prototype/src/HomeSections.tsx`
- Modify: `prototype/src/PublicPages.tsx`

**Interfaces:**
- Consumes: `TeaItem[]`、`TeaCard`、`Icon`、`Button`、`url()`。
- Produces: `HomeHistory`、`HomeCategories({items})`、`HomeReferencesContact`。

- [x] **Step 1: 建立四阶段历史时间轴数据**

```tsx
const history=[
  ['01','起源与利用','从认识植物与日常利用开始，茶逐渐进入生活记录。'],
  ['02','制茶与分类','不同加工方式形成各有特点的茶类。'],
  ['03','茶事与交流','器具、礼俗与地方经验让饮茶成为交流方式。'],
  ['04','当代记录','用来源、版本与批次重新整理可查的茶知识。']
];
```

- [x] **Step 2: 实现分类与参考联系区块**

```tsx
export function HomeCategories({items}:{items:TeaItem[]}){/* 绿茶、红茶分类卡与已发布数量 */}
export function HomeReferencesContact(){/* 左侧资料说明，右侧问茶、咨询与后台入口 */}
```

- [x] **Step 3: 在 `Home` 中按固定顺序组合区块**

```tsx
<section id="home">...</section>
<HomeHistory/>
<HomeCategories items={teas}/>
<HomeReferencesContact/>
```

- [x] **Step 4: 运行构建检查**

```powershell
cd prototype
npm run build
```

### Task 2: 可复用冲泡组件

**Files:**
- Create: `prototype/src/BrewGuide.tsx`
- Modify: `prototype/src/PublicPages.tsx`

**Interfaces:**
- Consumes: `TeaItem`、`useApp().record`、`useApp().toast`。
- Produces: `BrewGuide({item,embedded})`，其中 `embedded` 控制问茶页紧凑标题。

- [x] **Step 1: 从现有 `Brew` 提取状态机**

```tsx
export function BrewGuide({item,embedded=false}:{item:TeaItem;embedded?:boolean}){
  const [step,setStep]=useState(0);
  const [remaining,setRemaining]=useState(item.seconds);
  const [running,setRunning]=useState(false);
  // 保留四步、计时、参数调整、反馈与完成记录
}
```

- [x] **Step 2: 茶品变化时重置临时状态**

```tsx
useEffect(()=>{
  setStep(0); setRemaining(item.seconds); setRunning(false);
  setTemp(item.water); setGrams(item.grams); setComplete(false);
},[item.id,item.seconds,item.water,item.grams]);
```

- [x] **Step 3: 把旧 `Brew` 页面改为复用组件**

```tsx
export function Brew({id}:{id:string}){
  const item=publicItems(items,sourceActive).find(t=>t.id===id);
  return item?<BrewGuide item={item}/>:<Empty .../>;
}
```

- [x] **Step 4: 运行构建检查**

```powershell
cd prototype
npm run build
```

### Task 3: 问答意图与自动填充

**Files:**
- Modify: `prototype/src/PublicPages.tsx`

**Interfaces:**
- Consumes: `publicItems(items,sourceActive)`、`BrewGuide`。
- Produces: `resolveBrewItem(question,items)` 与扩展的 `AnswerState`。

- [x] **Step 1: 定义泡法识别与匹配优先级**

```tsx
type AnswerState={status:string;text:string;intent?:'brewing';teaItemId?:string};
const brewWords=/怎么泡|如何泡|冲泡|泡茶|水温|投茶|几克|泡多久|浸泡|第一泡/;
function resolveBrewItem(question:string,items:TeaItem[]){
  if(!brewWords.test(question))return undefined;
  return [...items].sort((a,b)=>b.year-a.year).find(item=>
    question.includes(item.sku)||question.includes(item.batch)||question.includes(item.name)||question.includes(item.category)
  );
}
```

- [x] **Step 2: 回答时携带匹配茶品**

```tsx
const brewItem=resolveBrewItem(value,available);
setAnswer({status:'answered',text:buildBrewAnswer(brewItem),intent:'brewing',teaItemId:brewItem.id});
```

- [x] **Step 3: 在回答下方展开冲泡区**

```tsx
{answer?.intent==='brewing'&&selectedItem&&(
  <section ref={brewRef} aria-labelledby="guided-brew-title">
    <BrewGuide item={selectedItem} embedded/>
  </section>
)}
```

- [x] **Step 4: 无明确茶品时显示选择器**

```tsx
<select aria-label="选择要冲泡的茶品" value={selectedId} onChange={...}>
  <option value="">请选择具体茶品</option>
  {available.map(item=><option value={item.id}>{item.name} · {item.batch}</option>)}
</select>
```

- [x] **Step 5: 构建并检查龙井、祁门、健康边界、资料不足和离线五类回答**

```powershell
cd prototype
npm run build
```

### Task 4: 导航、锚点与兼容路由

**Files:**
- Modify: `prototype/src/main.tsx`
- Modify: `prototype/src/PublicPages.tsx`

**Interfaces:**
- Consumes: 首页区块 ID `home`、`history`、`categories`、`references-contact`。
- Produces: 桌面滚动导航、移动高频导航、旧冲泡链接转向。

- [x] **Step 1: 将桌面导航改为四个首页锚点**

```tsx
const homeNav=[
  ['首页','home'],['茶的历史','history'],['茶叶品类','categories'],['参考资料与联系我们','references-contact']
];
```

- [x] **Step 2: 实现跨页面锚点跳转和当前区块高亮**

```tsx
function homeHref(id:string){return url('/?section='+id)}
// Home 监听 section 查询参数与 IntersectionObserver，更新 activeSection。
```

- [x] **Step 3: 调整入口与旧路由**

```tsx
// 详情按钮：/qa?tea=<id>&intent=brew
// /brew/<id>：渲染 Questions，并由查询参数直接选中该茶品和展开 BrewGuide。
```

- [x] **Step 4: 更新移动底部导航**

```tsx
const mobilePublicNav=[['首页','/?section=home','leaf'],['品类','/?section=categories','book'],['问茶','/qa','chat'],['联系','/?section=references-contact','users']];
```

### Task 5: 视觉、响应式、文档与快照

**Files:**
- Modify: `prototype/src/styles.css`
- Modify: `README.md`
- Modify: `prototype/README.md`
- Modify: `prototype/验收记录.md`
- Modify: `茶文化智能体_前后端接口契约与Skill清单.md`
- Modify: `VERSION_SNAPSHOTS.md`

**Interfaces:**
- Consumes: 新首页与 `BrewGuide` 的类名和语义结构。
- Produces: 桌面、平板、移动样式及 `SNAP-20260910-011`。

- [x] **Step 1: 添加滚动、时间轴、分类、参考联系和嵌入冲泡样式**

```css
html{scroll-behavior:smooth;scroll-padding-top:88px}
.scroll-section{min-height:70vh;padding:96px 0}
.history-grid,.category-showcase,.reference-contact-grid{display:grid}
.qa-brew-section{margin-top:56px;padding-top:48px;border-top:1px solid var(--line)}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
```

- [x] **Step 2: 添加 850px 和 600px 响应式规则**

```css
@media(max-width:850px){.history-grid,.reference-contact-grid{grid-template-columns:1fr}}
@media(max-width:600px){.scroll-section{min-height:auto;padding:56px 0}.category-showcase{grid-template-columns:1fr}}
```

- [x] **Step 3: 浏览器验收**

```text
1440×900：首页四段滚动、导航高亮、参考资料与联系同区块。
390×844：时间轴纵向、分类单列、问答和冲泡无横向溢出。
问题：西湖龙井怎么泡；祁门红茶第一泡多久；茶能治病吗；没有资料怎么办；离线状态。
路由：详情入口和 /brew/longjing-2026 均进入问茶冲泡区。
```

- [x] **Step 4: 同步文档并创建快照**

```powershell
git add -- README.md VERSION_SNAPSHOTS.md prototype docs/superpowers/plans/2026-09-10-home-scroll-qa-brewing-plan.md 茶文化智能体_前后端接口契约与Skill清单.md
git commit -m "snapshot(code): add scroll homepage and guided tea Q&A"
git push origin HEAD:main
```
