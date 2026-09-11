# 沉浸式 Sticky 滚动首页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将茶序首页实现为桌面七幕 Sticky 原生滚动叙事，并让茶史四章分别成为独立场景，移动端降级为纵向吸附。

**Architecture:** 新建 `ScrollStory.tsx` 专门计算滚动进度、活动幕和锚点定位；`HomeSections.tsx` 只负责场景内容；`PublicPages.tsx` 组合首页并向 `main.tsx` 报告导航归属。连续动画通过 CSS 变量完成，React 只在活动幕变化时更新语义状态。

**Tech Stack:** React 19、TypeScript 7、Vite 8、CSS sticky/transform/custom properties、现有原创 SVG、Codex 浏览器 Playwright 接口。

**Spec:** `docs/superpowers/specs/2026-09-11-envision-scroll-home-design.md`

## Global Constraints

- 桌面使用原生页面滚动驱动 `position: sticky` 舞台，不拦截 wheel、触控板、PageDown 或空格键。
- 七幕顺序固定为首页、茶史四章、茶叶品类、参考资料与联系我们。
- 宽度不超过 600px 时使用真实 DOM 文档流和 `scroll-snap-type: y proximity`。
- 保留 `?section=home|history|categories|references-contact`，其中 `history` 指向第一章。
- 不增加 GSAP 或其他运行时依赖，不使用参考站图片、视频、文案或品牌元素。
- `prefers-reduced-motion: reduce` 取消缩放、视差和平移，移动端取消吸附。
- 公开档案数量只来自 `publicItems`；现有问茶、详情、咨询和后台逻辑不变。
- 实现完成后更新 README、原型 README、验收记录和版本快照并推送 GitHub。

---

### Task 1: 场景模型与独立内容组件

**Files:**
- Modify: `prototype/src/HomeSections.tsx`

**Interfaces:**
- Consumes: `TeaItem[]`、`url()`、现有 `Icon`、`Badge`、`Button`、`TeaArt`。
- Produces: `SceneId`、`SceneTone`、`StorySceneDefinition`、`storyScenes(items)`、`HomeSceneContent`、`HistorySceneContent`、`CategorySceneContent`、`ReferenceContactSceneContent`。

- [x] **Step 1: 定义七幕类型和导航归属**

```tsx
export type SceneId='home'|'history-origin'|'history-craft'|'history-culture'|'history-record'|'categories'|'references-contact';
export type SceneTone='light'|'deep'|'warm';
export type NavSection='home'|'history'|'categories'|'references-contact';
export type StorySceneDefinition={id:SceneId;nav:NavSection;label:string;shortLabel:string;tone:SceneTone};

export const sceneMeta:StorySceneDefinition[]=[
  {id:'home',nav:'home',label:'首页',shortLabel:'首页',tone:'light'},
  {id:'history-origin',nav:'history',label:'茶的历史：起源与利用',shortLabel:'起源',tone:'deep'},
  {id:'history-craft',nav:'history',label:'茶的历史：制茶与分类',shortLabel:'制茶',tone:'warm'},
  {id:'history-culture',nav:'history',label:'茶的历史：茶事与交流',shortLabel:'茶事',tone:'deep'},
  {id:'history-record',nav:'history',label:'茶的历史：当代记录',shortLabel:'记录',tone:'light'},
  {id:'categories',nav:'categories',label:'茶叶品类',shortLabel:'品类',tone:'warm'},
  {id:'references-contact',nav:'references-contact',label:'参考资料与联系我们',shortLabel:'联系',tone:'deep'}
];
```

- [x] **Step 2: 把茶史四条数据升级为四个可独立渲染的章节**

```tsx
export const historyChapters=[
  {id:'history-origin',number:'02',tag:'一片叶',title:'起源与利用',description:'从认识植物与日常利用开始，茶逐渐进入生活记录。',visual:'mountain'},
  {id:'history-craft',number:'03',tag:'成其味',title:'制茶与分类',description:'不同加工方式保留或转化叶片特征，形成各有特点的茶类。',visual:'craft'},
  {id:'history-culture',number:'04',tag:'见人情',title:'茶事与交流',description:'器具、礼俗与地方经验，让饮茶成为人与人交流的方式。',visual:'gathering'},
  {id:'history-record',number:'05',tag:'可查证',title:'当代记录',description:'用来源、版本与批次整理茶知识，让每份说明都有迹可循。',visual:'archive'}
] as const;
```

- [x] **Step 3: 实现各场景内容，保持链接和公开数量逻辑**

```tsx
export function CategorySceneContent({items}:{items:TeaItem[]}){
  const green=items.filter(item=>item.category==='绿茶').length;
  const black=items.filter(item=>item.category==='红茶').length;
  return <div className="story-categories">{/* 两张可点击的分类入口，显示 green/black */}</div>;
}
```

- [x] **Step 4: 构建检查场景类型和 JSX**

Run: `npm --prefix prototype run build`

Expected: TypeScript 与 Vite 构建通过；没有未使用导出或缺失图标。

### Task 2: Sticky 原生滚动控制器

**Files:**
- Create: `prototype/src/ScrollStory.tsx`

**Interfaces:**
- Consumes: `TeaItem[]`、`sceneMeta`、四种场景内容组件。
- Produces: `ScrollStory({items,onSectionChange}:{items:TeaItem[];onSectionChange:(section:NavSection)=>void})`。

- [x] **Step 1: 建立滚动轨道、活动幕和连续 CSS 变量**

```tsx
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));

export function ScrollStory({items,onSectionChange}:Props){
  const trackRef=useRef<HTMLDivElement>(null);
  const [activeIndex,setActiveIndex]=useState(0);
  const activeRef=useRef(0);

  const update=useCallback(()=>{
    const track=trackRef.current;
    if(!track)return;
    const rect=track.getBoundingClientRect();
    const distance=Math.max(1,track.offsetHeight-innerHeight);
    const progress=clamp(-rect.top/distance);
  const sceneFloat=progress*(sceneMeta.length-1);
  const next=Math.round(sceneFloat);
  track.style.setProperty('--story-progress',String(progress));
  track.style.setProperty('--scene-progress',String(sceneFloat));
  sceneRefs.current.forEach((scene,index)=>{
    if(!scene)return;
    const offset=sceneFloat-index;
    scene.style.setProperty('--scene-visibility',String(clamp(1-Math.abs(offset))));
    scene.style.setProperty('--scene-offset',String(offset));
  });
  if(next!==activeRef.current){activeRef.current=next;setActiveIndex(next);onSectionChange(sceneMeta[next].nav)}
  },[onSectionChange]);
}
```

- [x] **Step 2: 用 passive scroll 和 requestAnimationFrame 合并更新**

```tsx
useEffect(()=>{
  let frame=0;
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)};
  schedule();
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule);
  return()=>{cancelAnimationFrame(frame);removeEventListener('scroll',schedule);removeEventListener('resize',schedule)};
},[update]);

useEffect(()=>{
  const query=matchMedia('(max-width: 600px)');
  const sync=()=>setStackedMode(query.matches);
  sync();query.addEventListener('change',sync);
  return()=>query.removeEventListener('change',sync);
},[]);
```

- [x] **Step 3: 实现深链接映射和导航定位**

```tsx
const sectionTargets:Record<string,SceneId>={
  home:'home',history:'history-origin',categories:'categories','references-contact':'references-contact'
};

function scrollToScene(id:SceneId,focus=false){
  const track=trackRef.current;
  const index=sceneMeta.findIndex(scene=>scene.id===id);
  const y=track.offsetTop+(track.offsetHeight-innerHeight)*(index/(sceneMeta.length-1));
  scrollTo({top:y,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  if(focus)document.getElementById(id+'-title')?.focus({preventScroll:true});
}
```

- [x] **Step 4: 渲染叠放场景和七点进度导航**

```tsx
<div className="scroll-story" ref={trackRef} style={{'--scene-count':sceneMeta.length} as CSSProperties}>
  <div className="story-stage" data-scene-tone={sceneMeta[activeIndex].tone}>
    {sceneMeta.map((scene,index)=><section key={scene.id} id={scene.id} className={'story-scene '+(index===activeIndex?'is-active':'')} data-index={index} aria-hidden={stackedMode?undefined:index!==activeIndex}>{/* content */}</section>)}
    <nav className="story-progress" aria-label="首页场景进度">{/* 七个定位按钮 */}</nav>
  </div>
</div>
```

- [x] **Step 5: 构建检查滚动控制器**

Run: `npm --prefix prototype run build`

Expected: 构建通过；所有场景 ID 和 `NavSection` 类型一致。

### Task 3: 首页组合与全局导航联动

**Files:**
- Modify: `prototype/src/PublicPages.tsx`
- Modify: `prototype/src/main.tsx`

**Interfaces:**
- Consumes: `ScrollStory`、`NavSection`、`publicItems(items,sourceActive)`。
- Produces: `Home({onSectionChange}:{onSectionChange:(section:NavSection)=>void})`；顶部与底部导航使用同一活动分组。

- [x] **Step 1: 用 `ScrollStory` 替换当前普通首页区块组合**

```tsx
export function Home({onSectionChange}:{onSectionChange:(section:NavSection)=>void}){
  const {items,sourceActive}=useApp();
  return <ScrollStory items={publicItems(items,sourceActive)} onSectionChange={onSectionChange}/>;
}
```

- [x] **Step 2: 删除 `main.tsx` 旧 DOM 位置扫描并接收活动分组**

```tsx
if(!parts.length)page=<Home onSectionChange={setActiveHomeSection}/>;
```

移除当前查询 `.home-scroll-section` 的全局 scroll effect；活动分组只由 `ScrollStory` 报告。

- [x] **Step 3: 保持导航 URL 和四组高亮规则**

```tsx
const homeNav=[
  ['首页','home'],['茶的历史','history'],['茶叶品类','categories'],['参考资料与联系我们','references-contact']
];
```

历史四幕均上报 `history`；移动端“品类”和“联系”继续定位第六、七幕。

- [x] **Step 4: 构建并检查原页面入口**

Run: `npm --prefix prototype run build`

Expected: 首页、`#/catalog`、`#/qa`、`#/admin` 都能渲染；无 TypeScript 错误。

### Task 4: 桌面叙事动画与移动端吸附样式

**Files:**
- Modify: `prototype/src/HomeExperience.css`
- Modify: `prototype/index.html`

**Interfaces:**
- Consumes: `.scroll-story`、`.story-stage`、`.story-scene[data-index]`、`.story-progress`、场景内容类名、`data-scene-tone`。
- Produces: 七视口桌面轨道、全屏 Sticky 舞台、交叉淡化、背景轻视差、移动端纵向吸附和减少动画模式。

- [x] **Step 1: 建立桌面滚动轨道和叠放层**

```css
.scroll-story{height:calc(var(--scene-count) * 100svh);position:relative}
.story-stage{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden;background:var(--bg)}
.story-scene{position:absolute;inset:0;display:grid;align-items:center;opacity:var(--scene-visibility,0);pointer-events:none;transform:translateY(calc(var(--scene-offset,1) * 24px)) scale(calc(1 + (1 - var(--scene-visibility,0)) * .035))}
.story-scene.is-active{pointer-events:auto}
```

- [x] **Step 2: 添加茶序自己的七幕构图和进度轨**

```css
.story-progress{position:absolute;right:clamp(22px,4vw,64px);top:50%;transform:translateY(-50%);z-index:12}
.story-progress button[aria-current="step"] i{height:28px;background:currentColor}
.history-visual{transform:translate3d(0,calc(var(--scene-local) * -18px),0)}
```

- [x] **Step 3: 添加移动端真实文档流和 proximity 吸附**

```css
@media(max-width:600px){
  .scroll-story{height:auto;scroll-snap-type:y proximity}
  .story-stage{position:relative;height:auto;overflow:visible}
  .story-scene{position:relative;min-height:100vh;min-height:100svh;opacity:1;transform:none;pointer-events:auto;scroll-snap-align:start}
  .story-progress{display:none}
}
```

- [x] **Step 4: 添加减少动画和无脚本降级**

```css
@media(prefers-reduced-motion:reduce){
  .story-scene,.story-scene *{animation:none!important;transition:none!important;transform:none!important}
}
@media(max-width:600px) and (prefers-reduced-motion:reduce){.scroll-story{scroll-snap-type:none}}
.no-js .scroll-story{height:auto}.no-js .story-stage{position:relative;height:auto}.no-js .story-scene{position:relative;opacity:1}
```

在 `prototype/index.html` 给根元素增加 `no-js`，并在 head 中立即移除：

```html
<html lang="zh-CN" class="no-js">
<script>document.documentElement.classList.remove('no-js')</script>
```

- [x] **Step 5: 生产构建**

Run: `npm --prefix prototype run build`

Expected: 构建通过，产物不新增第三方动画包。

### Task 5: 浏览器验收、文档与代码快照

**Files:**
- Modify: `README.md`
- Modify: `prototype/README.md`
- Modify: `prototype/验收记录.md`
- Modify: `VERSION_SNAPSHOTS.md`
- Modify: `docs/superpowers/plans/2026-09-11-immersive-sticky-home-implementation.md`

**Interfaces:**
- Consumes: 已完成的七幕首页与现有全部路由。
- Produces: 实际浏览器证据、完成勾选与 `SNAP-20260911-013`。

- [x] **Step 1: 桌面 1440×900 验收七幕与固定舞台**

在浏览器把视口设为 1440×900，依次滚动到七个等距位置并读取：

```js
({
  stagePosition:getComputedStyle(document.querySelector('.story-stage')).position,
  scene:document.querySelector('.story-scene.is-active')?.id,
  progress:document.querySelector('.story-progress [aria-current="step"]')?.getAttribute('aria-label'),
  overflow:document.documentElement.scrollWidth>innerWidth
})
```

Expected: `stagePosition` 为 `sticky`；活动幕依次为七个 ID；无横向溢出。

- [x] **Step 2: 验收历史四章、深链接和导航**

访问 `#/?section=history`、`categories`、`references-contact` 并刷新；检查目标幕、顶部高亮、浏览器返回。使用 PageDown 和空格推进，确认页面没有滚动锁死。

Expected: 四个历史幕分别独立显示；历史期间顶部“茶的历史”持续高亮；深链接映射正确。

- [x] **Step 3: 移动 390×844 与减少动画验收**

将视口设为 390×844，检查七幕均在真实文档流中，历史四幕各自占屏，底部导航可用；再模拟 `prefers-reduced-motion: reduce` 检查动画与吸附取消。

Expected: 无横向溢出；内容顺序完整；右侧进度轨隐藏；主要按钮均可点击。

- [x] **Step 4: 回归现有入口和浏览器日志**

依次打开 `/catalog`、`/qa`、`/tea/longjing-2026`、`/admin`，并查询 error/warn 日志。

Expected: 原业务页面正常；日志无应用错误或警告。

- [x] **Step 5: 同步文档和完成计划**

README 写明桌面 Sticky、七幕和移动吸附；验收记录写入实际视口、路由和场景结果；本计划全部步骤改为 `[x]`；版本表新增 `SNAP-20260911-013`。

- [x] **Step 6: 创建并推送代码快照**

```powershell
git add -- README.md VERSION_SNAPSHOTS.md prototype/README.md prototype/验收记录.md prototype/src/HomeSections.tsx prototype/src/ScrollStory.tsx prototype/src/PublicPages.tsx prototype/src/main.tsx prototype/src/HomeExperience.css docs/superpowers/plans/2026-09-11-immersive-sticky-home-implementation.md
git commit -m "snapshot(code): add immersive sticky tea story"
git push origin HEAD:main
```

Expected: GitHub `main` 指向新提交；与本任务无关的现有工作区修改保持未暂存。
