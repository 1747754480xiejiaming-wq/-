import {useState} from 'react';
import {TeaItem,goto,url} from './model';
import {Badge,Button,Icon,TeaArt} from './ui';

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

export const historyChapters=[
  {id:'history-origin',number:'02',tag:'一片叶',title:'起源与利用',description:'从认识植物与日常利用开始，茶逐渐进入生活记录。',detail:'山野中的叶片，被人们看见、采集与使用。茶的故事，先从人与自然的相遇开始。',visual:'mountain',icon:'leaf'},
  {id:'history-craft',number:'03',tag:'成其味',title:'制茶与分类',description:'不同加工方式保留或转化叶片特征，形成各有特点的茶类。',detail:'杀青、揉捻、发酵与干燥，让同一片叶子走向清鲜或醇厚，也留下可辨认的工艺线索。',visual:'craft',icon:'sun'},
  {id:'history-culture',number:'04',tag:'见人情',title:'茶事与交流',description:'器具、礼俗与地方经验，让饮茶成为人与人交流的方式。',detail:'一席茶连接着器物、礼节和日常往来。每一次斟饮，也在记录地方生活的温度。',visual:'gathering',icon:'cup'},
  {id:'history-record',number:'05',tag:'可查证',title:'当代记录',description:'用来源、版本与批次整理茶知识，让每份说明都有迹可循。',detail:'茶序把茶名、SKU、批次、资料来源和审核版本放在一起，让传统经验进入清晰的当代档案。',visual:'archive',icon:'book'}
] as const;

export function HomeSceneContent(){const [q,setQ]=useState('');return <div className="story-home container"><div className="story-home-copy"><div className="eyebrow"><span className="short-line"/> 茶有来处，饮有章法</div><h1 id="home-title" tabIndex={-1}>好好认识<br/>一杯<span>茶。</span></h1><p>从一片茶叶的来处，到一杯茶汤的温度。<br/>让每一次品饮，都有据可依。</p><form className="hero-search" onSubmit={event=>{event.preventDefault();goto('/catalog?q='+encodeURIComponent(q))}}><Icon name="search"/><input aria-label="搜索茶名或SKU" placeholder="想了解哪一款茶？试试「龙井」" value={q} onChange={event=>setQ(event.target.value)}/><button aria-label="搜索茶品"><Icon name="arrow"/></button></form><div className="story-home-actions"><a href={url('/?section=history')}>循着时间认识茶 <Icon name="arrow" size={16}/></a><a href={url('/qa')}>问茶 · 泡一杯 <Icon name="cup" size={16}/></a></div></div><div className="story-home-art"><TeaArt hero/><div className="story-orbit orbit-one"/><div className="story-orbit orbit-two"/><div className="seal">茶<br/>序</div></div><div className="story-scroll-cue"><span>SCROLL TO EXPLORE</span><i/></div></div>}

export function HistorySceneContent({chapter,index}:{chapter:typeof historyChapters[number];index:number}){return <div className={'story-history container visual-'+chapter.visual}><div className="story-history-copy"><span className="story-big-number" aria-hidden="true">{chapter.number}</span><div className="eyebrow">A SHORT HISTORY OF TEA / 茶的历史</div><Badge>{chapter.tag}</Badge><h2 id={chapter.id+'-title'} tabIndex={-1}>{chapter.title}</h2><p className="history-lead">{chapter.description}</p><p className="history-detail">{chapter.detail}</p><div className="history-chapter-position"><span>0{index+1}</span><i/><span>04</span></div></div><div className="history-visual" aria-hidden="true"><div className="history-disc"><Icon name={chapter.icon} size={54}/></div><div className="history-ripple ripple-one"/><div className="history-ripple ripple-two"/><span className="history-mark">{chapter.tag}</span></div></div>}

const categoryGroups=[
  {name:'绿茶',en:'GREEN TEA',icon:'leaf',copy:'从清鲜、鲜爽的感官印象出发，认识未经充分发酵的茶。',process:'杀青 · 揉捻 · 干燥',taste:'清鲜 / 豆香 / 回甘'},
  {name:'红茶',en:'BLACK TEA',icon:'sun',copy:'从花果香与甜润感受出发，认识充分发酵带来的风味变化。',process:'萎凋 · 揉捻 · 发酵 · 干燥',taste:'花果香 / 醇和 / 甜润'}
] as const;

export function CategorySceneContent({items}:{items:TeaItem[]}){return <div className="story-category container"><div className="story-scene-heading"><div><div className="eyebrow">TEA CATEGORIES / 茶叶品类</div><h2 id="categories-title" tabIndex={-1}>先分清茶类，<br/>再认识一款茶</h2></div><p>本期从绿茶和红茶开始。茶名相同的商品，仍按 SKU 与采制批次分别记录。</p></div><div className="story-category-grid">{categoryGroups.map((group,index)=>{const count=items.filter(item=>item.category===group.name).length;const sample=items.find(item=>item.category===group.name);return <a href={url('/catalog?category='+group.name)} className={'story-category-card card-'+index} key={group.name}><div className="story-category-top"><span>0{index+1}</span><Icon name={group.icon} size={24}/><Badge tone="success">{count} 份公开档案</Badge></div><div className="eyebrow">{group.en}</div><h3>{group.name}</h3><p>{group.copy}</p><dl><div><dt>制作线索</dt><dd>{group.process}</dd></div><div><dt>示例滋味</dt><dd>{sample?.taste.join(' / ')||group.taste}</dd></div></dl><strong>查看{group.name}档案 <Icon name="arrow" size={17}/></strong></a>})}</div>{!items.length&&<p className="story-empty-note"><Icon name="info" size={16}/> 暂无已发布且来源有效的公开茶品，恢复后档案数量会自动更新。</p>}</div>}

export function ReferenceContactSceneContent(){return <div className="story-reference container"><article><div className="eyebrow">REFERENCES / 参考资料</div><h2 id="references-contact-title" tabIndex={-1}>内容有来处，<br/>也有边界</h2><p>资料类型、适用范围、内容版本和审核状态，被放进同一套说明里，方便回看每条信息从哪里来。</p><div className="story-reference-list"><span><Icon name="book"/><i><strong>资料类型</strong><small>茶品字段、冲泡参数与使用说明</small></i></span><span><Icon name="clock"/><i><strong>版本记录</strong><small>按商品、SKU、批次和内容版本区分</small></i></span><span><Icon name="shield"/><i><strong>使用边界</strong><small>演示内容不替代健康建议或交易承诺</small></i></span></div><Button href="/qa" tone="secondary" icon="arrow">查看问茶的资料依据</Button></article><article className="story-contact"><div className="eyebrow">CONTACT / 联系我们</div><h2>从一款具体的茶，<br/>开始沟通</h2><p>想了解规格、货源或样品，可以先选择对应茶品，再提交一份演示咨询。当前原型不会向任何商家发送信息。</p><div className="contact-actions"><Button href="/catalog" icon="arrow">选择茶品并咨询</Button><Button href="/qa" tone="ghost" icon="chat">先问一问茶</Button></div><div className="story-contact-meta"><span><Icon name="shield" size={17}/> 联系方式仅用于对应咨询</span><a href={url('/admin')}>进入管理工作台 <Icon name="arrow" size={15}/></a></div></article></div>}
