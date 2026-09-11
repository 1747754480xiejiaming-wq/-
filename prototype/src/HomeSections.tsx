import {useState} from 'react';
import {TeaItem,goto,url} from './model';
import {Badge,Button,Icon,TeaArt} from './ui';

export type SceneId='home'|'history-origin-cover'|'history-origin-discovery'|'history-origin-tang-song'|'history-exchange-cover'|'history-exchange-gathering'|'history-exchange-journey'|'history-craft-cover'|'history-craft-categories'|'categories'|'references-contact';
export type SceneTone='light'|'deep'|'warm';
export type NavSection='home'|'history'|'categories'|'references-contact';
export type StorySceneDefinition={id:SceneId;nav:NavSection;label:string;shortLabel:string;tone:SceneTone};

export const sceneMeta:StorySceneDefinition[]=[
  {id:'home',nav:'home',label:'首页',shortLabel:'首页',tone:'light'},
  {id:'history-origin-cover',nav:'history',label:'茶史：起源与利用',shortLabel:'起源',tone:'deep'},
  {id:'history-origin-discovery',nav:'history',label:'茶史：被看见的一片叶',shortLabel:'发现',tone:'light'},
  {id:'history-origin-tang-song',nav:'history',label:'茶史：茶进入生活记录',shortLabel:'唐宋',tone:'warm'},
  {id:'history-exchange-cover',nav:'history',label:'茶史：茶事与交流',shortLabel:'茶事',tone:'deep'},
  {id:'history-exchange-gathering',nav:'history',label:'茶史：茶在相见之间',shortLabel:'茶席',tone:'light'},
  {id:'history-exchange-journey',nav:'history',label:'茶史：从地方风土走向世界',shortLabel:'传播',tone:'warm'},
  {id:'history-craft-cover',nav:'history',label:'茶史：制茶与分类',shortLabel:'制茶',tone:'deep'},
  {id:'history-craft-categories',nav:'history',label:'茶史：一片鲜叶，六种方向',shortLabel:'六类',tone:'light'},
  {id:'categories',nav:'categories',label:'茶叶品类',shortLabel:'品类',tone:'warm'},
  {id:'references-contact',nav:'references-contact',label:'参考资料与联系我们',shortLabel:'联系',tone:'deep'}
];

type HistoryChapter={
  id:Extract<SceneId,`history-${string}`>;
  number:string;
  section:string;
  sectionTitle:string;
  pageType:'cover'|'content';
  tag?:string;
  subtitle?:string;
  title:string;
  lead:string;
  summary?:string;
  content?:readonly string[];
  quote?:string;
  facts?:readonly string[];
  progress:string;
  visual:string;
  icon:string;
};

export const historyChapters:readonly HistoryChapter[]=[
  {id:'history-origin-cover',number:'02',section:'01',sectionTitle:'起源与利用',pageType:'cover',tag:'一片叶',title:'起源与利用',lead:'从认识植物与日常利用开始，茶逐渐进入生活记录。',summary:'山野中的叶片，被人们看见、采集与使用。茶的故事，先从人与自然的相遇开始。',progress:'01 / 03',visual:'mountain',icon:'leaf'},
  {id:'history-origin-discovery',number:'03',section:'01',sectionTitle:'起源与利用',pageType:'content',subtitle:'从山野植物到日常饮品',title:'被看见的一片叶',lead:'茶最初并非以“饮品”的身份出现，而是被人认识、采集和利用的山野植物。',content:[
    '关于茶的起源，中国流传着神农尝百草的传说。传说寄托着人们对茶最初用途的想象，却不应与确切年代混为一谈。',
    '更真实的历史，是人们在长期的生活实践中逐渐认识茶叶：它有清新的气息、微苦回甘的滋味，也能在劳作与长途跋涉中带来片刻清醒。',
    '从咀嚼鲜叶、煮叶为汤，到以热水冲泡，茶的使用方式不断改变。一片叶子由山林进入灶台，也由自然资源慢慢成为日常生活的一部分。'
  ],quote:'茶的开始，不是一种仪式，而是一次对自然的发现。',progress:'02 / 03',visual:'discovery',icon:'leaf'},
  {id:'history-origin-tang-song',number:'04',section:'01',sectionTitle:'起源与利用',pageType:'content',subtitle:'唐宋定型',title:'茶进入生活记录',lead:'唐代让茶形成体系，宋代则让茶成为审美、社交与城市生活的一部分。',content:[
    '唐代以前，饮茶习惯已在多地出现；到了唐代，茶叶种植、制作、贸易与饮用方法日渐成熟。陆羽所著《茶经》系统梳理茶的产地、器具、用水与煮饮方法，茶从此拥有了完整的文化语言。',
    '宋代流行点茶。茶叶被研成细末，以热水调和、击拂出细腻泡沫。人们品茶、斗茶，也欣赏茶盏、茶筅与水色之间的变化。',
    '茶由此走进寺院、宫廷、书房与市井。它既能陪伴独处，也能连接人与人；既是解渴之物，也成为一种从容、清醒而含蓄的生活态度。'
  ],quote:'茶让日常生活有了可以慢下来的时刻。',progress:'03 / 03',visual:'archive',icon:'book'},
  {id:'history-exchange-cover',number:'05',section:'02',sectionTitle:'茶事与交流',pageType:'cover',tag:'见人情',title:'茶事与交流',lead:'器具、礼俗与地方经验，让饮茶成为人与人交流的方式。',summary:'一席茶连接着器物、礼节和日常往来。每一次斟饮，也在记录地方生活的温度。',progress:'01 / 03',visual:'gathering',icon:'cup'},
  {id:'history-exchange-gathering',number:'06',section:'02',sectionTitle:'茶事与交流',pageType:'content',subtitle:'一席一器',title:'茶在相见之间',lead:'茶席不只是摆放器物的空间，更是人与人相处的方式。',content:[
    '在中国人的待客礼俗中，一杯热茶往往比一句寒暄更早到来。烧水、温器、投茶、出汤，看似寻常的动作，构成了对来客的欢迎与关照。',
    '壶、盖碗、盏、杯，并非只是盛放茶汤的器具。不同材质、形制和使用习惯，映照着各地对温度、香气、口感与节奏的理解。',
    '围坐饮茶时，话题可以很轻，也可以很深。茶不催促交谈，却为交谈留出时间；它让陌生人有了开场，也让熟人拥有安静相伴的片刻。'
  ],quote:'茶席之上，重要的不只是茶，也是在场的人。',progress:'02 / 03',visual:'gathering',icon:'cup'},
  {id:'history-exchange-journey',number:'07',section:'02',sectionTitle:'茶事与交流',pageType:'content',subtitle:'随路而行',title:'从地方风土走向世界',lead:'茶沿着山路、河流和海洋传播，也在不同地方长成不同的饮茶习惯。',content:[
    '茶叶离开产地后，并没有失去地方性。高山云雾、土壤气候、制茶手法与饮水习惯，共同塑造了每一地茶汤独有的香气和滋味。',
    '在中国，茶曾沿茶马古道进入高原与边地；在东亚，僧侣、使节和商人带去了茶籽、器物与饮茶方法；此后，茶又经由海上贸易进入欧洲，并逐渐成为世界性的日常饮品。',
    '今天，我们在一杯茶中感受到的不只是产地名称，也是一方山水、一群制茶人和一段迁徙交流的历史。茶的传播，从来都是人与地方彼此理解的过程。'
  ],quote:'一片叶子的旅程，连接了山川、道路与人群。',progress:'03 / 03',visual:'journey',icon:'pin'},
  {id:'history-craft-cover',number:'08',section:'03',sectionTitle:'制茶与分类',pageType:'cover',tag:'成其味',title:'制茶与分类',lead:'不同加工方式保留或转化叶片特征，形成各有特点的茶类。',summary:'杀青、揉捻、发酵与干燥，让同一片叶子走向清鲜或醇厚，也留下可辨认的工艺线索。',progress:'01 / 02',visual:'craft',icon:'sun'},
  {id:'history-craft-categories',number:'09',section:'03',sectionTitle:'制茶与分类',pageType:'content',subtitle:'工艺塑造风味',title:'一片鲜叶，六种方向',lead:'茶的分类并不只看颜色，更取决于鲜叶在加工过程中经历了怎样的变化。',content:[
    '绿茶重在及时杀青，保留鲜爽与清香；黄茶多一道闷黄工序，滋味更显醇和；白茶工艺相对简约，在萎凋与干燥中呈现自然毫香。',
    '乌龙茶介于绿茶与红茶之间，讲究做青带来的花香与层次；红茶经过充分发酵，汤色红亮、滋味甜醇；黑茶则常在后发酵与陈化中发展出沉稳浓厚的风味。',
    '同样是茶树鲜叶，工艺决定了它最终的性格。制茶人对时间、温度、湿度和手法的判断，让每一杯茶都有了自己的方向。'
  ],facts:['绿茶：清鲜、爽朗','黄茶：醇和、柔润','白茶：自然、清甜','乌龙茶：馥郁、层次丰富','红茶：甜醇、温暖','黑茶：陈香、厚重'],quote:'茶的风味，来自叶片与时间共同完成的变化。',progress:'02 / 02',visual:'categories',icon:'sun'}
] as const;

export function HomeSceneContent(){const [q,setQ]=useState('');return <div className="story-home container"><div className="story-home-copy"><div className="eyebrow"><span className="short-line"/> 茶有来处，饮有章法</div><h1 id="home-title" tabIndex={-1}>好好认识<br/>一杯<span>茶。</span></h1><p>从一片茶叶的来处，到一杯茶汤的温度。<br/>让每一次品饮，都有据可依。</p><form className="hero-search" onSubmit={event=>{event.preventDefault();goto('/catalog?q='+encodeURIComponent(q))}}><Icon name="search"/><input aria-label="搜索茶名或SKU" placeholder="想了解哪一款茶？试试「龙井」" value={q} onChange={event=>setQ(event.target.value)}/><button aria-label="搜索茶品"><Icon name="arrow"/></button></form><div className="story-home-actions"><a href={url('/?section=history')}>循着时间认识茶 <Icon name="arrow" size={16}/></a><a href={url('/qa')}>问茶 · 泡一杯 <Icon name="cup" size={16}/></a></div></div><div className="story-home-art"><TeaArt hero/><div className="story-orbit orbit-one"/><div className="story-orbit orbit-two"/><div className="seal">茶<br/>序</div></div><div className="story-scroll-cue"><span>SCROLL TO EXPLORE</span><i/></div></div>}

export function HistorySceneContent({chapter}:{chapter:HistoryChapter}){
  const [current,total]=chapter.progress.split('/').map(value=>value.trim());
  const marker=chapter.tag||chapter.subtitle||chapter.sectionTitle;
  return <div className={`story-history container visual-${chapter.visual} ${chapter.pageType==='content'?'story-history-content':'story-history-cover'}`}>
    <div className="story-history-copy">
      <span className="story-big-number" aria-hidden="true">{chapter.number}</span>
      <div className="eyebrow">TEA HISTORY / {chapter.section} · {chapter.sectionTitle}</div>
      <Badge>{marker}</Badge>
      <h2 id={chapter.id+'-title'} tabIndex={-1}>{chapter.title}</h2>
      <p className="history-lead">{chapter.lead}</p>
      {chapter.pageType==='cover'?<p className="history-detail">{chapter.summary}</p>:<div className="history-body">{chapter.content?.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div>}
      {chapter.facts&&<div className="history-facts" aria-label="六大茶类风味摘要">{chapter.facts.map(fact=><span key={fact}>{fact}</span>)}</div>}
      {chapter.quote&&<blockquote className="history-quote">{chapter.quote}</blockquote>}
      <div className="history-chapter-position"><span>{current}</span><i/><span>{total}</span></div>
    </div>
    <div className="history-visual" aria-hidden="true">
      <div className="history-disc"><Icon name={chapter.icon} size={54}/></div>
      <div className="history-ripple ripple-one"/><div className="history-ripple ripple-two"/>
      <span className="history-mark">{marker}</span>
    </div>
  </div>
}

const categoryGroups=[
  {name:'绿茶',en:'GREEN TEA',icon:'leaf',copy:'从清鲜、鲜爽的感官印象出发，认识未经充分发酵的茶。',process:'杀青 · 揉捻 · 干燥',taste:'清鲜 / 豆香 / 回甘'},
  {name:'红茶',en:'BLACK TEA',icon:'sun',copy:'从花果香与甜润感受出发，认识充分发酵带来的风味变化。',process:'萎凋 · 揉捻 · 发酵 · 干燥',taste:'花果香 / 醇和 / 甜润'}
] as const;

export function CategorySceneContent({items}:{items:TeaItem[]}){return <div className="story-category container"><div className="story-scene-heading"><div><div className="eyebrow">TEA CATEGORIES / 茶叶品类</div><h2 id="categories-title" tabIndex={-1}>先分清茶类，<br/>再认识一款茶</h2></div><p>本期从绿茶和红茶开始。茶名相同的商品，仍按 SKU 与采制批次分别记录。</p></div><div className="story-category-grid">{categoryGroups.map((group,index)=>{const count=items.filter(item=>item.category===group.name).length;const sample=items.find(item=>item.category===group.name);return <a href={url('/catalog?category='+group.name)} className={'story-category-card card-'+index} key={group.name}><div className="story-category-top"><span>0{index+1}</span><Icon name={group.icon} size={24}/><Badge tone="success">{count} 份公开档案</Badge></div><div className="eyebrow">{group.en}</div><h3>{group.name}</h3><p>{group.copy}</p><dl><div><dt>制作线索</dt><dd>{group.process}</dd></div><div><dt>示例滋味</dt><dd>{sample?.taste.join(' / ')||group.taste}</dd></div></dl><strong>查看{group.name}档案 <Icon name="arrow" size={17}/></strong></a>})}</div>{!items.length&&<p className="story-empty-note"><Icon name="info" size={16}/> 暂无已发布且来源有效的公开茶品，恢复后档案数量会自动更新。</p>}</div>}

export function ReferenceContactSceneContent(){return <div className="story-reference container"><article><div className="eyebrow">REFERENCES / 参考资料</div><h2 id="references-contact-title" tabIndex={-1}>内容有来处，<br/>也有边界</h2><p>资料类型、适用范围、内容版本和审核状态，被放进同一套说明里，方便回看每条信息从哪里来。</p><div className="story-reference-list"><span><Icon name="book"/><i><strong>资料类型</strong><small>茶品字段、冲泡参数与使用说明</small></i></span><span><Icon name="clock"/><i><strong>版本记录</strong><small>按商品、SKU、批次和内容版本区分</small></i></span><span><Icon name="shield"/><i><strong>使用边界</strong><small>演示内容不替代健康建议或交易承诺</small></i></span></div><Button href="/qa" tone="secondary" icon="arrow">查看问茶的资料依据</Button></article><article className="story-contact"><div className="eyebrow">CONTACT / 联系我们</div><h2>从一款具体的茶，<br/>开始沟通</h2><p>想了解规格、货源或样品，可以先选择对应茶品，再提交一份演示咨询。当前原型不会向任何商家发送信息。</p><div className="contact-actions"><Button href="/catalog" icon="arrow">选择茶品并咨询</Button><Button href="/qa" tone="ghost" icon="chat">先问一问茶</Button></div><div className="story-contact-meta"><span><Icon name="shield" size={17}/> 联系方式仅用于对应咨询</span><a href={url('/admin')}>进入管理工作台 <Icon name="arrow" size={15}/></a></div></article></div>}
