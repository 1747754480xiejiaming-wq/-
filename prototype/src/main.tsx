import React,{useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {Context,TeaItem,Lead,Audit,Role,seedItems,seedLeads,roleNames,url,goto} from './model';
import {Icon,Button,Badge,Modal,Empty} from './ui';
import {Home,Catalog,TeaDetail,Questions,Inquiry,Receipt} from './PublicPages';
import {Overview,Content,EditContent,Review,Imports,Leads,Users,AuditPage} from './AdminPages';
import {AdminLogin} from './AdminLogin';
import {mapTeaItem} from './api/mapper';
import {teaApi} from './api/runtime';
import type {AdminUserPublic} from './api/types';
import {isPublicNavigationActive,mobilePublicNavigation,publicNavigation} from './navigation';
import './styles.css';
import './HomeExperience.css';

const prefix='chaxu-prototype-v1-';
const adminSessionMarker='chaxu-admin-session';
function saved<T>(key:string,fallback:T):T{try{const s=localStorage.getItem(prefix+key);return s?JSON.parse(s):fallback}catch{return fallback}}
function captureHash(){const route=new URLSearchParams(location.search).get('figmaRoute');return location.hash.startsWith('#figmacapture=')?'#'+(route||'/'):(location.hash||'#/')}
function App(){const [hash,setHash]=useState(captureHash);const [items,setItems]=useState<TeaItem[]>(()=>saved('items',seedItems));const [leads,setLeads]=useState<Lead[]>(()=>saved('leads',seedLeads));const [role,setRole]=useState<Role>('operator');const [adminUser,setAdminUser]=useState<AdminUserPublic|null>(null),[authReady,setAuthReady]=useState(!teaApi);const [sourceActive,setSourceActive]=useState(()=>saved('source',true));const [audit,setAudit]=useState<Audit[]>(()=>saved('audit',[{id:'initial',action:'创建演示工作区',object:'茶序 MVP 示例内容',role:'项目管理员',time:'2026-09-10 09:00'}]));const [receipt,setReceipt]=useState<Lead|null>(null);const [message,setMessage]=useState(''),[showReset,setShowReset]=useState(false),[mobileNav,setMobileNav]=useState(false);const [,setActiveHomeSection]=useState('home');
useEffect(()=>{const h=()=>{setHash(captureHash());setMobileNav(false);window.scrollTo(0,0)};addEventListener('hashchange',h);return()=>removeEventListener('hashchange',h)},[]);
useEffect(()=>{try{localStorage.setItem(prefix+'items',JSON.stringify(items));localStorage.setItem(prefix+'leads',JSON.stringify(leads));localStorage.setItem(prefix+'source',JSON.stringify(sourceActive));localStorage.setItem(prefix+'audit',JSON.stringify(audit.slice(0,150)))}catch{}},[items,leads,sourceActive,audit]);
useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),4500);return()=>clearTimeout(t)},[message]);
useEffect(()=>{const api=teaApi;if(!api)return;let active=true;Promise.all([api.config(),api.listItems()]).then(async([,page])=>{const mapped=await Promise.all(page.items.map(async dto=>{try{return mapTeaItem(dto,(await api.brewing(dto.tea_id,dto.id)).record)}catch{return mapTeaItem(dto)}}));if(active){setItems(current=>[...mapped,...current.filter(item=>item.status!=='published')]);setSourceActive(true)}}).catch(()=>{if(active)setMessage('后端联调服务不可用，已保留本机演示数据')});return()=>{active=false}},[]);
useEffect(()=>{const api=teaApi;if(!api||sessionStorage.getItem(adminSessionMarker)!=='active'){setAuthReady(true);return}let active=true;api.me().then(user=>{if(active){setAdminUser(user);setRole(user.role)}}).catch(()=>{if(active){setAdminUser(null);sessionStorage.removeItem(adminSessionMarker)}}).finally(()=>{if(active)setAuthReady(true)});return()=>{active=false}},[]);
const toast=useCallback((s:string)=>setMessage(s),[]);const record=useCallback((action:string,object:string)=>setAudit(a=>[{id:crypto.randomUUID(),action,object,role:roleNames[role],time:new Date().toLocaleString('zh-CN')},...a]),[role]);const reset=()=>{setItems(structuredClone(seedItems));setLeads(structuredClone(seedLeads));setSourceActive(true);setAudit([{id:crypto.randomUUID(),action:'重置演示数据',object:'本地工作区',role:roleNames[role],time:new Date().toLocaleString('zh-CN')}]);setReceipt(null);setShowReset(false);toast('演示数据已恢复初始状态');goto('/')};const closeReset=useCallback(()=>setShowReset(false),[]);
const loginAdmin=useCallback(async(expectedRole:Role,username:string,password:string)=>{if(!teaApi)throw new Error('后端服务未配置，无法登录管理工作台');const result=await teaApi.login(username,password);if(result.user.role!==expectedRole){await teaApi.logout();throw new Error('账号岗位与所选智能体不一致')};sessionStorage.setItem(adminSessionMarker,'active');setAdminUser(result.user);setRole(result.user.role);goto('/admin');toast(`已登录：${result.user.display_name}`)},[toast]);
const logoutAdmin=useCallback(async()=>{try{await teaApi?.logout()}finally{sessionStorage.removeItem(adminSessionMarker);setAdminUser(null);setRole('operator');setMobileNav(false);goto('/admin')}},[]);
const path=hash.replace(/^#/,'').split('?')[0],parts=path.split('/').filter(Boolean),admin=parts[0]==='admin',routeParams=new URLSearchParams(hash.split('?')[1]||'');
let page:React.ReactNode;
if(!admin){if(!parts.length)page=<Home onSectionChange={setActiveHomeSection}/>;else if(parts[0]==='catalog')page=<Catalog/>;else if(parts[0]==='tea')page=<TeaDetail id={parts[1]}/>;else if(parts[0]==='brew')page=<Questions initialTeaId={parts[1]} initialBrew/>;else if(parts[0]==='qa')page=<Questions initialTeaId={routeParams.get('tea')||undefined} initialBrew={routeParams.get('intent')==='brew'}/>;else if(parts[0]==='inquiry')page=<Inquiry id={parts[1]}/>;else if(parts[0]==='receipt')page=<Receipt/>;else page=<Empty title="页面不存在" action={<Button href="/">返回首页</Button>}>请从导航重新选择页面。</Empty>}
else{switch(parts[1]){case'content':page=<Content/>;break;case'edit':page=<EditContent id={parts[2]}/>;break;case'review':page=<Review id={parts[2]||items.find(t=>(t.draftStatus||t.status)==='pending_review')?.id||''}/>;break;case'imports':page=<Imports/>;break;case'leads':page=<Leads/>;break;case'users':page=<Users/>;break;case'audit':page=<AuditPage/>;break;default:page=<Overview/>}}
const roleAllowed:Record<Role,string[]>={operator:['','content','edit','imports'],reviewer:['','content','review'],lead:['','leads'],admin:['','content','edit','leads','users','audit']};
if(admin&&!roleAllowed[role].includes(parts[1]||''))page=<Empty title="当前页面不属于此职能平台" action={<Button href="/admin">返回当前平台首页</Button>}>请从左侧导航进入{roleNames[role]}的工作待办。</Empty>;
const adminNavByRole:Record<Role,string[][]>={operator:[['运营概览','/admin','grid'],['内容与导入','/admin/content','book']],reviewer:[['审核概览','/admin','grid'],['审核待办','/admin/content','shield']],lead:[['线索概览','/admin','grid'],['跟进待办','/admin/leads','chat']],admin:[['项目概览','/admin','grid'],['商品管理','/admin/content','book'],['咨询线索','/admin/leads','chat'],['账号与权限','/admin/users','users'],['操作记录','/admin/audit','clock']]};
const adminNav=adminNavByRole[role];const platformNames:Record<Role,string>={operator:'数据运营平台',reviewer:'客户审核平台',lead:'线索跟进平台',admin:'项目管理平台'};const active=(p:string)=>p.startsWith('/admin')?(p==='/admin'?path==='/admin':path.startsWith(p)):isPublicNavigationActive(path,p);
return <Context.Provider value={{items,setItems,leads,setLeads,role,setRole,toast,audit,record,sourceActive,setSourceActive,reset,receipt,setReceipt}}>
  <a href="#main-content" className="skip-link" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus()}}>跳至主要内容</a>
  {admin&&!authReady?<AdminLogin checking apiEnabled={!!teaApi} onLogin={loginAdmin}/>:admin&&!adminUser?<AdminLogin apiEnabled={!!teaApi} onLogin={loginAdmin}/>:admin?<div className="admin-layout">
    <aside className={'admin-sidebar '+(mobileNav?'open':'')}>
      <a className="brand inverse" href={url('/admin')}><span>茶序</span><small>CHA XU</small></a>
      <p className="sidebar-subtitle">{platformNames[role]}</p>
      <nav aria-label="后台导航">{adminNav.map(([title,target,icon])=><a key={target} href={url(target)} className={active(target)?'active':''}><Icon name={icon}/>{title}{title==='审核待办'&&<span className="nav-count">{items.filter(item=>(item.draftStatus||item.status)==='pending_review').length}</span>}</a>)}</nav>
      <a className="back-public" href={url('/')}><Icon name="back" size={17}/> 返回用户端</a>
      <div className="sidebar-bottom"><span className="avatar">{adminUser?.display_name.slice(0,1)}</span><div><strong>{adminUser?.display_name}</strong><small>@{adminUser?.username} · 后端认证账号</small></div></div>
    </aside>
    <div className="admin-main">
      <header className="admin-header"><button className="icon-btn mobile-menu" aria-label="展开后台导航" onClick={()=>setMobileNav(!mobileNav)}><Icon name="menu"/></button><span>{platformNames[role]} <span className="muted"> / 茶序演示工作区</span></span><div><Badge tone="warning">联调环境</Badge><span className="signed-in-role">{adminUser?.display_name}</span><button className="text-link admin-logout" onClick={()=>void logoutAdmin()}>退出登录</button><button className="icon-btn" aria-label="重置演示数据" onClick={()=>setShowReset(true)}><Icon name="refresh" size={17}/></button></div></header>
      <main id="main-content" tabIndex={-1} className="admin-content" key={hash}>{page}</main>
    </div>
  </div>:<>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href={url('/')}><span>茶序</span><small>CHA XU</small></a>
      <nav aria-label="主要导航">{publicNavigation.map(([title,target])=><a href={url(target)} key={target} className={active(target)?'active':''} aria-current={active(target)?'page':undefined}>{title}</a>)}</nav>
      <div className="header-actions"><Badge>交互演示</Badge><Button href="/qa" icon="cup">问茶 · 泡一杯</Button></div>
    </div></header>
    <main id="main-content" tabIndex={-1} key={hash}>{page}</main>
    <footer className="site-footer container"><div><a className="brand" href={url('/')}><span>茶序</span><small>CHA XU</small></a><p>从一片茶叶，到一杯好茶。</p></div><div><p>产品交互原型 · 所有资料与货源均为演示内容</p><div className="footer-links"><a href={url('/admin')}>工作台登录 <Icon name="arrow" size={13}/></a><button onClick={()=>setShowReset(true)}>重置演示数据</button><a href={url('/?section=references-contact')}>内容与使用边界</a></div></div></footer>
    <nav className="mobile-bottom-nav" aria-label="移动端导航">{mobilePublicNavigation.map(([title,target,icon])=><a key={target} href={url(target)} className={active(target)?'active':''}><Icon name={icon}/><span>{title}</span></a>)}</nav>
  </>}
  {message&&<div className="toast" role="status"><Icon name="check" size={18}/>{message}</div>}
  {showReset&&<Modal title="重置本机演示数据？" onClose={closeReset}><p>将恢复初始茶品、来源授权与示例线索，清除本轮演示修改。不会影响 Figma 文件或任何真实业务系统。</p><div className="modal-actions"><Button tone="secondary" onClick={closeReset}>取消</Button><Button onClick={reset}>恢复初始数据</Button></div></Modal>}
</Context.Provider>}
createRoot(document.getElementById('root')!).render(<App/>);
