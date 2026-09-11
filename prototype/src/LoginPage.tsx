import { useState, type FormEvent } from 'react';
import { ApiError } from './api/errors';
import type { AdminUser } from './api/types';
import { useAppServices } from './features/AppServicesContext';
import { goto, useApp } from './model';
import { Badge, Button, Icon, Notice } from './ui';

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AdminUser) => void }) {
  const app = useApp();
  const { adminApi, mode } = useAppServices();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const user = await adminApi.login({ username: username.trim(), password });
      onAuthenticated(user);
      app.toast('登录成功，正在进入工作台');
      goto('/admin');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '登录服务暂时不可用，请稍后重试' }));
    } finally {
      setSubmitting(false);
    }
  };

  const errorTitle = error?.status === 401 ? '用户名或密码不正确' : error?.status === 429 ? '尝试次数过多' : '登录服务暂时不可用';

  return <div className="login-page container page-content">
    <section className="login-intro">
      <Badge tone="warning">WORKSPACE / 工作台</Badge>
      <div className="login-mark"><Icon name="shield" size={34}/></div>
      <h1>进入茶序工作台</h1>
      <p>内容整理、客户审核、线索跟进和项目管理，都从经过验证的后台会话开始。</p>
      <div className="login-boundaries"><p><span>01</span><strong>会话由服务端管理</strong><small>浏览器不保存密码、会话密钥或 CSRF token</small></p><p><span>02</span><strong>按岗位分配权限</strong><small>登录后仅展示当前账号可访问的平台入口</small></p><p><span>03</span><strong>操作保持可追溯</strong><small>审核、上下架、导出等关键行为进入审计边界</small></p></div>
    </section>
    <form className="panel login-card" onSubmit={event => void submit(event)} noValidate>
      <div className="eyebrow">ADMIN SIGN IN / 后台登录</div>
      <h2>欢迎回来</h2>
      <p className="muted">使用后台账号进入对应职能工作台。</p>
      <label className="field">用户名<input name="username" autoComplete="username" maxLength={64} value={username} onChange={event => setUsername(event.target.value)} placeholder="请输入用户名" autoFocus/></label>
      <label className="field">密码<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="请输入密码"/><button type="button" className="text-link" onClick={() => setShowPassword(value => !value)}>{showPassword ? '隐藏' : '显示'}</button></div></label>
      {error && <Notice tone="warning" title={errorTitle}><span role="alert">{error.message}{error.retryAfterSeconds !== undefined ? `，请在 ${error.retryAfterSeconds} 秒后重试` : ''}</span></Notice>}
      <Button type="submit" icon="arrow" disabled={!username.trim() || !password || submitting} className="login-submit">{submitting ? '正在验证会话…' : '登录工作台'}</Button>
      {mode === 'mock' && <div className="demo-login"><div><strong>演示账号</strong><small>用户名 demo · 密码 demo123456</small></div><button type="button" className="text-link" onClick={() => { setUsername('demo'); setPassword('demo123456'); setError(undefined); }}>填入演示账号</button></div>}
      <p className="login-help"><Icon name="info" size={15}/> {mode === 'mock' ? '当前为 mock 演示登录；进入后可切换四种职能身份。' : '当前为 live 登录，将调用 A01/A02 并使用服务端 Cookie。'}</p>
    </form>
  </div>;
}
