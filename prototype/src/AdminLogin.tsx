import {useState} from 'react';
import type {Role} from './model';
import {Button,Icon} from './ui';
import './AdminLogin.css';

export const ADMIN_ACCOUNTS:{role:Role;username:string;title:string;description:string;icon:string}[]=[
  {role:'operator',username:'operator',title:'数据运营智能体',description:'维护茶品、批次与资料导入',icon:'book'},
  {role:'reviewer',username:'reviewer',title:'客户审核智能体',description:'核对内容并审核自动发布',icon:'shield'},
  {role:'lead',username:'lead',title:'线索跟进智能体',description:'处理咨询、样品与跟进记录',icon:'chat'},
  {role:'admin',username:'admin',title:'项目管理智能体',description:'管理账号、权限与操作记录',icon:'users'},
];

const DEMO_PASSWORD='TeaDemo2026!';

export function AdminLogin({checking=false,apiEnabled,onLogin}:{checking?:boolean;apiEnabled:boolean;onLogin:(role:Role,username:string,password:string)=>Promise<void>}){
  const [selected,setSelected]=useState<Role>('operator');
  const [password,setPassword]=useState(DEMO_PASSWORD);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const account=ADMIN_ACCOUNTS.find(item=>item.role===selected)!;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!apiEnabled||busy)return;
    setBusy(true);setError('');
    try{await onLogin(account.role,account.username,password)}
    catch(reason){setError(reason instanceof Error?reason.message:'登录失败，请稍后重试')}
    finally{setBusy(false)}
  };

  return <main id="main-content" tabIndex={-1} className="admin-login-shell">
    <section className="admin-login-story">
      <a className="login-brand" href="#/"><span>茶序</span><small>CHA XU</small></a>
      <div className="login-story-copy">
        <div className="eyebrow">FOUR AGENTS / 四岗协作</div>
        <h1>让每一份茶资料，<br/>都经过合适的人。</h1>
        <p>四个智能体对应四个独立账号。身份由后端会话确认，登录后只进入本岗位的工作台。</p>
      </div>
      <div className="login-story-foot"><span>资料维护</span><i/><span>客户审核</span><i/><span>线索跟进</span><i/><span>项目管理</span></div>
    </section>
    <section className="admin-login-panel" aria-labelledby="admin-login-title">
      <div className="admin-login-card">
        <div className="login-heading"><span className="login-kicker">MANAGEMENT CONSOLE</span><h2 id="admin-login-title">登录管理工作台</h2><p>先选择本次要使用的岗位智能体。</p></div>
        {checking?<div className="login-checking"><span className="login-spinner"/>正在确认登录状态…</div>:<form onSubmit={submit} noValidate>
          <div className="agent-grid" role="radiogroup" aria-label="选择岗位智能体">
            {ADMIN_ACCOUNTS.map(item=><button type="button" role="radio" aria-checked={selected===item.role} className={'agent-option '+(selected===item.role?'selected':'')} key={item.role} onClick={()=>{setSelected(item.role);setError('')}}><span className="agent-icon"><Icon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.description}</small><em>@{item.username}</em></span><span className="agent-check"><Icon name="check" size={14}/></span></button>)}
          </div>
          <label className="field login-password">统一演示密码<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} aria-invalid={!!error} disabled={!apiEnabled||busy}/><small>四个账号使用同一个本地演示密码：<code>{DEMO_PASSWORD}</code></small></label>
          {error&&<p className="login-error" role="alert"><Icon name="info" size={17}/>{error}</p>}
          {!apiEnabled&&<p className="login-error" role="alert"><Icon name="info" size={17}/>尚未配置后端地址，请使用一键联调脚本启动服务。</p>}
          <Button type="submit" disabled={!apiEnabled||busy||!password} icon="arrow">{busy?'正在登录…':`进入${account.title}`}</Button>
        </form>}
        <div className="login-boundary"><Icon name="shield" size={16}/><span>当前为本地演示环境；Cookie 会话、CSRF 与岗位权限均由后端校验。</span></div>
      </div>
    </section>
  </main>;
}
