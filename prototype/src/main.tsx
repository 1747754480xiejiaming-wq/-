import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuditPage, Content, EditContent, Imports, Leads, Overview, Review, Users } from './ApiAdminPages';
import { Catalog, Home, Inquiry, Questions, TeaDetail } from './ApiPublicPages';
import { LoginPage } from './LoginPage';
import { Receipt } from './PublicPages';
import { createServices } from './api/createServices';
import { readRuntimeConfig } from './api/runtime';
import type { AdminUser } from './api/types';
import { AppServicesContext } from './features/AppServicesContext';
import { Audit, Context, Lead, Role, TeaItem, goto, roleNames, seedItems, seedLeads, url } from './model';
import { Badge, Button, Empty, Icon, Modal } from './ui';
import './styles.css';
import './HomeExperience.css';

const prefix = 'chaxu-prototype-v1-';
const appServices = createServices(readRuntimeConfig());

function saved<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(prefix + key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function captureHash() {
  const route = new URLSearchParams(location.search).get('figmaRoute');
  return location.hash.startsWith('#figmacapture=') ? '#' + (route || '/') : (location.hash || '#/');
}

function App() {
  const [hash, setHash] = useState(captureHash);
  const [items, setItems] = useState<TeaItem[]>(() => saved('items', seedItems));
  const [leads, setLeads] = useState<Lead[]>(() => saved('leads', seedLeads));
  const [role, setRole] = useState<Role>('operator');
  const [session, setSession] = useState<{ status: 'unknown' | 'checking' | 'authenticated' | 'anonymous'; user?: AdminUser }>({ status: 'unknown' });
  const [sourceActive, setSourceActive] = useState(() => saved('source', true));
  const [audit, setAudit] = useState<Audit[]>(() => saved('audit', [{ id: 'initial', action: '创建演示工作区', object: '茶序 MVP 示例内容', role: '项目管理员', time: '2026-09-10 09:00' }]));
  const [receipt, setReceipt] = useState<Lead | null>(null);
  const [message, setMessage] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [, setActiveHomeSection] = useState('home');

  useEffect(() => {
    const handleHashChange = () => {
      setHash(captureHash());
      setMobileNav(false);
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', handleHashChange);
    return () => removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(prefix + 'items', JSON.stringify(items));
      localStorage.setItem(prefix + 'leads', JSON.stringify(leads));
      localStorage.setItem(prefix + 'source', JSON.stringify(sourceActive));
      localStorage.setItem(prefix + 'audit', JSON.stringify(audit.slice(0, 150)));
    } catch { /* storage unavailable */ }
  }, [items, leads, sourceActive, audit]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!hash.startsWith('#/admin') && !hash.startsWith('#/login')) return;
    let active = true;
    if (session.status !== 'authenticated') setSession({ status: 'checking' });
    void appServices.adminApi.getMe().then(user => {
      if (!active) return;
      setSession({ status: 'authenticated', user });
      setRole(user.role);
      if (hash.startsWith('#/login')) goto('/admin');
    }).catch(() => {
      if (!active) return;
      setSession({ status: 'anonymous' });
      if (hash.startsWith('#/admin')) goto('/login');
    });
    return () => { active = false; };
  }, [hash]);

  const toast = useCallback((text: string) => setMessage(text), []);
  const record = useCallback((action: string, object: string) => setAudit(current => [{ id: crypto.randomUUID(), action, object, role: roleNames[role], time: new Date().toLocaleString('zh-CN') }, ...current]), [role]);
  const closeReset = useCallback(() => setShowReset(false), []);
  const reset = async () => {
    if (appServices.mode === 'live') {
      setShowReset(false);
      toast('live 模式不会重置服务端数据');
      return;
    }
    await appServices.adminApi.resetDemo();
    setItems(structuredClone(seedItems));
    setLeads(structuredClone(seedLeads));
    setSourceActive(true);
    setAudit([{ id: crypto.randomUUID(), action: '重置演示数据', object: '本地工作区', role: roleNames[role], time: new Date().toLocaleString('zh-CN') }]);
    setReceipt(null);
    setShowReset(false);
    toast('演示数据已恢复初始状态');
    goto('/');
  };

  const logout = async () => {
    try {
      await appServices.adminApi.logout();
      setSession({ status: 'anonymous' });
      toast('已退出工作台');
      goto('/login');
    } catch {
      toast('退出登录未完成，请稍后重试');
    }
  };

  const path = hash.replace(/^#/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  const admin = parts[0] === 'admin';
  const routeParams = new URLSearchParams(hash.split('?')[1] || '');
  let page: React.ReactNode;

  if (!admin) {
    if (!parts.length) page = <Home onSectionChange={setActiveHomeSection}/>;
    else if (parts[0] === 'catalog') page = <Catalog/>;
    else if (parts[0] === 'tea') page = <TeaDetail id={parts[1]}/>;
    else if (parts[0] === 'brew') page = <Questions initialTeaId={parts[1]} initialBrew/>;
    else if (parts[0] === 'qa') page = <Questions initialTeaId={routeParams.get('tea') || undefined} initialBrew={routeParams.get('intent') === 'brew'}/>;
    else if (parts[0] === 'inquiry') page = <Inquiry id={parts[1]}/>;
    else if (parts[0] === 'receipt') page = <Receipt/>;
    else if (parts[0] === 'login') page = <LoginPage onAuthenticated={user => { setSession({ status: 'authenticated', user }); setRole(user.role); }}/>;
    else page = <Empty title="页面不存在" action={<Button href="/">返回首页</Button>}>请从导航重新选择页面。</Empty>;
  } else if (session.status !== 'authenticated') {
    page = <div className="container page-content"><section className="panel session-check" role="status"><Icon name="shield"/><div><strong>正在确认工作台会话</strong><p className="muted">请稍候，正在验证当前账号。</p></div></section></div>;
  } else {
    switch (parts[1]) {
      case 'content': page = <Content/>; break;
      case 'edit': page = <EditContent id={parts[2]}/>; break;
      case 'review': page = <Review id={parts[2] || ''}/>; break;
      case 'imports': page = <Imports/>; break;
      case 'leads': page = <Leads/>; break;
      case 'users': page = <Users/>; break;
      case 'audit': page = <AuditPage/>; break;
      default: page = <Overview/>;
    }
  }

  const roleAllowed: Record<Role, string[]> = {
    operator: ['', 'content', 'edit', 'imports'],
    reviewer: ['', 'content', 'review'],
    lead: ['', 'leads'],
    admin: ['', 'content', 'edit', 'leads', 'users', 'audit'],
  };
  if (admin && session.status === 'authenticated' && !roleAllowed[role].includes(parts[1] || '')) {
    page = <Empty title="当前页面不属于此职能平台" action={<Button href="/admin">返回当前平台首页</Button>}>请从左侧导航进入{roleNames[role]}的工作待办。</Empty>;
  }

  const publicNav = [['首页', '/'], ['问茶', '/qa'], ['茶叶品类', '/catalog'], ['工作台', '/login']];
  const mobilePublicNav = [['首页', '/', 'leaf'], ['问茶', '/qa', 'chat'], ['茶叶品类', '/catalog', 'book'], ['工作台', '/login', 'users']];
  const adminNavByRole: Record<Role, string[][]> = {
    operator: [['运营概览', '/admin', 'grid'], ['内容与导入', '/admin/content', 'book']],
    reviewer: [['审核概览', '/admin', 'grid'], ['审核待办', '/admin/content', 'shield']],
    lead: [['线索概览', '/admin', 'grid'], ['跟进待办', '/admin/leads', 'chat']],
    admin: [['项目概览', '/admin', 'grid'], ['商品管理', '/admin/content', 'book'], ['咨询线索', '/admin/leads', 'chat'], ['账号与权限', '/admin/users', 'users'], ['操作记录', '/admin/audit', 'clock']],
  };
  const platformNames: Record<Role, string> = { operator: '数据运营平台', reviewer: '客户审核平台', lead: '线索跟进平台', admin: '项目管理平台' };
  const adminNav = adminNavByRole[role];
  const active = (target: string) => target === '/'
    ? path === '/'
    : target === '/admin'
      ? path === '/admin'
      : target === '/qa'
        ? ['qa', 'brew'].includes(parts[0])
        : target === '/catalog'
          ? ['catalog', 'tea', 'inquiry', 'receipt'].includes(parts[0])
          : target === '/login'
            ? parts[0] === 'login'
            : path.startsWith(target);

  return <Context.Provider value={{ items, setItems, leads, setLeads, role, setRole, toast, audit, record, sourceActive, setSourceActive, reset, receipt, setReceipt }}>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳至主要内容</a>
    {admin ? <div className="admin-layout">
      <aside className={'admin-sidebar ' + (mobileNav ? 'open' : '')}>
        <a className="brand inverse" href={url('/admin')}><span>茶序</span><small>CHA XU</small></a>
        <p className="sidebar-subtitle">{platformNames[role]}</p>
        <nav aria-label="后台导航">{adminNav.map(([title, target, icon]) => <a key={target} href={url(target)} className={active(target) ? 'active' : ''}><Icon name={icon}/>{title}</a>)}</nav>
        <a className="back-public" href={url('/')}><Icon name="back" size={17}/> 返回用户端</a>
        <div className="sidebar-bottom"><span className="avatar">{session.user?.id.slice(0, 1).toUpperCase() || '茶'}</span><div><strong>{session.user?.id || '工作台账号'} · {appServices.mode === 'mock' ? '演示账号' : '服务会话'}</strong><small>{appServices.mode === 'mock' ? '只操作契约化示例资料' : '权限由后端会话决定'}</small></div></div>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <button className="icon-btn mobile-menu" aria-label="展开后台导航" onClick={() => setMobileNav(!mobileNav)}><Icon name="menu"/></button>
          <span>{platformNames[role]} <span className="muted"> / 茶序{appServices.mode === 'mock' ? '演示' : '联调'}工作区</span></span>
          <div>
            <Badge tone="warning">{appServices.mode === 'mock' ? '交互演示' : 'LIVE 联调'}</Badge>
            <label className="role-control">{appServices.mode === 'mock' ? '演示身份' : '会话身份'} <select aria-label={appServices.mode === 'mock' ? '切换演示身份' : '当前会话身份'} value={role} disabled={appServices.mode === 'live'} onChange={event => { const next = event.target.value as Role; void appServices.adminApi.setDemoRole(next).then(user => { setRole(user.role); goto('/admin'); toast('已切换：' + roleNames[user.role] + '平台'); }).catch(() => toast('身份切换未完成')); }}>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <button className="icon-btn" aria-label="重置演示数据" disabled={appServices.mode === 'live'} onClick={() => setShowReset(true)}><Icon name="refresh" size={17}/></button>
            <button className="text-link logout-link" onClick={() => void logout()}>退出</button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="admin-content" key={hash + '-' + role}>{page}</main>
      </div>
    </div> : <>
      <header className="site-header"><div className="header-inner">
        <a className="brand" href={url('/')}><span>茶序</span><small>CHA XU</small></a>
        <nav aria-label="主要导航">{publicNav.map(([title, target]) => <a href={url(target)} key={target} className={active(target) ? 'active' : ''} aria-current={active(target) ? 'page' : undefined}>{title}</a>)}</nav>
        <div className="header-actions"><Badge>{appServices.mode === 'mock' ? '交互演示' : 'LIVE 联调'}</Badge><Button href="/qa" icon="cup">问茶 · 泡一杯</Button></div>
      </div></header>
      <main id="main-content" tabIndex={-1} key={hash}>{page}</main>
      <footer className="site-footer container"><div><a className="brand" href={url('/')}><span>茶序</span><small>CHA XU</small></a><p>从一片茶叶，到一杯好茶。</p></div><div><p>产品交互原型 · 所有资料与货源均为演示内容</p><div className="footer-links"><a href={url('/login')}>工作台登录 <Icon name="arrow" size={13}/></a><button onClick={() => setShowReset(true)}>重置演示数据</button><a href={url('/?section=references-contact')}>内容与使用边界</a></div></div></footer>
      <nav className="mobile-bottom-nav" aria-label="移动端导航">{mobilePublicNav.map(([title, target, icon]) => <a key={target} href={url(target)} className={active(target) ? 'active' : ''}><Icon name={icon}/><span>{title}</span></a>)}</nav>
    </>}
    {message && <div className="toast" role="status"><Icon name="check" size={18}/>{message}</div>}
    {showReset && <Modal title="重置本机演示数据？" onClose={closeReset}><p>将恢复初始茶品、来源授权与示例线索，清除本轮演示修改。不会影响 Figma 文件或任何真实业务系统。</p><div className="modal-actions"><Button tone="secondary" onClick={closeReset}>取消</Button><Button onClick={() => void reset()}>恢复初始数据</Button></div></Modal>}
  </Context.Provider>;
}

createRoot(document.getElementById('root')!).render(<AppServicesContext.Provider value={appServices}><App/></AppServicesContext.Provider>);
