import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiError } from './api/errors';
import type { ContentDetail, LeadDetail } from './api/types';
import type { ItemStatus, Lead, TeaItem } from './model';
import { downloadCsv, goto, roleNames, statusNames, url, useApp } from './model';
import { useAppServices } from './features/AppServicesContext';
import { PermissionGate } from './features/admin/PermissionGate';
import { useAdminSession } from './features/admin/useAdminSession';
import { useContent } from './features/admin/useContent';
import { useReviews } from './features/admin/useReviews';
import { useLeads } from './features/admin/useLeads';
import { Badge, Button, Empty, Icon, Modal, Notice, StatusBadge } from './ui';

const currentStatus = (item: TeaItem) => item.draftStatus ?? item.status;
const statusRank: Record<ItemStatus, number> = { draft: 0, pending_review: 1, approved: 2, published: 3, withdrawn: 4 };
const leadLabels: Record<Lead['status'], string> = { new: '待跟进', assigned: '已指派', contacted: '已联系', closed: '已关闭' };

function AdminError({ error, retry }: { error?: ApiError; retry?: () => void }) {
  if (!error) return null;
  const title = error.status === 401 ? '登录状态已失效' : error.status === 403 ? '当前职能无权执行' : error.status === 409 ? '数据版本已经变化' : error.status === 428 ? '请先刷新最新版本' : error.status === 422 ? '提交内容未通过校验' : error.status === 429 ? '操作过于频繁' : '后台服务暂时不可用';
  return <Notice tone="warning" title={title}><span role="alert">{error.message}{error.retryAfterSeconds !== undefined ? `，请在 ${error.retryAfterSeconds} 秒后重试` : ''}</span>{retry && <>{' '}<button className="text-link" onClick={retry}>刷新重试</button></>}</Notice>;
}

function LoadingAdmin({ label = '正在读取后台数据…' }: { label?: string }) {
  return <section className="panel" role="status"><div className="skeleton"/><div className="skeleton"/><p className="muted">{label}</p></section>;
}

export function Overview() {
  const { role } = useApp();
  if (role === 'lead') return <LeadOverview/>;
  return <ContentOverview/>;
}

function ContentOverview() {
  const app = useApp();
  const content = useContent(app.role);
  if (content.status === 'loading') return <LoadingAdmin/>;
  if (content.status === 'error') return <AdminError error={content.error} retry={content.reload}/>;
  const items = content.data?.items ?? [];
  const count = (status: ItemStatus) => items.filter(item => currentStatus(item) === status).length;
  const copy = app.role === 'reviewer'
    ? { eyebrow: 'CONTENT REVIEW / 客户审核平台', title: '每一次通过，都直接面向用户。', description: '核对待审核资料；通过后系统将自动发布。', button: '处理审核待办', href: '/admin/content' }
    : app.role === 'admin'
      ? { eyebrow: 'PROJECT CONTROL / 项目管理平台', title: '掌握商品与平台运行状态。', description: '管理商品上下架、账号权限和关键操作记录。', button: '进入商品管理', href: '/admin/content' }
      : { eyebrow: 'CONTENT OPERATIONS / 数据运营平台', title: '先把资料整理清楚。', description: '集中处理草稿、批量导入和商品上下架。', button: '进入内容与导入', href: '/admin/content' };
  const stats = [
    ['草稿', count('draft'), '置顶等待补充或提交', 'edit'],
    ['待审核', count('pending_review'), '等待客户审核', 'file'],
    ['已发布', count('published'), '当前用户端可见', 'leaf'],
    ['已下架', count('withdrawn'), '用户端不可读取', 'eye']
  ];
  const tasks = app.role === 'reviewer' ? items.filter(item => currentStatus(item) === 'pending_review') : items.filter(item => currentStatus(item) === 'draft');
  return <>
    <div className="admin-title"><div><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>下午好，{roleNames[app.role]}。{copy.description}</p></div><Button href={copy.href} icon="arrow" tone="secondary">{copy.button}</Button></div>
    <div className="stats-grid">{stats.map(([label, value, sub, icon]) => <div className="stat-card" key={String(label)}><div><span>{label}</span><Icon name={String(icon)}/></div><strong>{value}</strong><small>{sub}</small></div>)}</div>
    <div className="admin-two-col"><section className="panel"><div className="section-head"><h2>我的待办</h2><Badge tone={tasks.length ? 'warning' : 'success'}>{tasks.length} 项</Badge></div><div className="task-list">{tasks.slice(0, 4).map(item => <a href={url(app.role === 'reviewer' ? `/admin/review/${item.id}` : `/admin/edit/${item.id}`)} key={item.id}><span className="task-icon"><Icon name={app.role === 'reviewer' ? 'shield' : 'edit'}/></span><div><strong>{item.name}</strong><p>{item.batch} · {statusNames[currentStatus(item)]}</p></div><Icon name="arrow" size={18}/></a>)}{!tasks.length && <p className="muted">当前没有需要处理的事项。</p>}</div></section><section className="panel"><div className="section-head"><h2>服务边界</h2><Icon name="shield"/></div><div className="checklist"><p><span>01</span><strong>会话权限</strong><small>入口来自 A03 permission_codes</small></p><p><span>02</span><strong>并发保护</strong><small>写请求携带 ETag 与幂等键</small></p><p><span>03</span><strong>公开一致</strong><small>下架和发布立即影响公开读取</small></p></div></section></div>
  </>;
}

function LeadOverview() {
  const app = useApp();
  const leads = useLeads(app.role);
  if (leads.status === 'loading') return <LoadingAdmin label="正在读取脱敏咨询线索…"/>;
  if (leads.status === 'error') return <AdminError error={leads.error} retry={leads.reload}/>;
  const rows = leads.data?.items ?? [];
  const count = (status: Lead['status']) => rows.filter(lead => lead.status === status).length;
  return <><div className="admin-title"><div><div className="eyebrow">LEAD SERVICE / 线索跟进平台</div><h1>让每一次咨询都有回应。</h1><p>列表只读取 M01 返回的脱敏线索。</p></div><Button href="/admin/leads" icon="arrow" tone="secondary">处理跟进待办</Button></div><div className="stats-grid">{([['待跟进', count('new')], ['已指派', count('assigned')], ['已联系', count('contacted')], ['已关闭', count('closed')]] as const).map(([label, value]) => <div className="stat-card" key={label}><div><span>{label}</span><Icon name="chat"/></div><strong>{value}</strong><small>服务端当前状态</small></div>)}</div></>;
}

export function Content() {
  const { role } = useApp();
  if (role === 'reviewer') return <ReviewQueue/>;
  if (role === 'lead') return <Leads/>;
  return <ProductContent/>;
}

function ProductContent() {
  const app = useApp();
  const { mode } = useAppServices();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | ItemStatus>('all');
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: '', category: '绿茶' as TeaItem['category'], tea_id: 'longjing', sku: '', batch: '' });
  const [action, setAction] = useState<{ kind: 'delete' | 'withdraw' | 'relist'; item: ContentDetail<TeaItem> }>();
  const content = useContent(app.role, { q: q || undefined, status: filter === 'all' ? undefined : filter });
  const items = useMemo(() => [...(content.data?.items ?? [])].sort((a, b) => statusRank[currentStatus(a)] - statusRank[currentStatus(b)] || b.year - a.year), [content.data?.items]);
  const execute = async () => {
    if (!action) return;
    try {
      if (action.kind === 'withdraw') await content.withdraw({ id: action.item.id, etag: action.item.etag });
      if (action.kind === 'relist') await content.relist({ id: action.item.id, etag: action.item.etag });
      if (action.kind === 'delete') await content.remove({ id: action.item.id, etag: action.item.etag });
      app.record(action.kind === 'withdraw' ? '下架商品' : action.kind === 'relist' ? '重新上架商品' : '删除商品', action.item.name);
      app.toast(action.kind === 'withdraw' ? '商品已下架，公开读取与咨询已关闭' : action.kind === 'relist' ? '商品已重新上架；若来源失效已同步恢复' : '商品已逻辑删除');
      setAction(undefined);
    } catch { /* hook 已保留错误 */ }
  };
  const createDraft = async () => {
    if (!form.name.trim() || !form.tea_id.trim() || !form.sku.trim() || !form.batch.trim()) return;
    try {
      const item = await content.create({ ...form, name: form.name.trim(), tea_id: form.tea_id.trim(), sku: form.sku.trim(), batch: form.batch.trim() });
      app.record('新建草稿', item.name); app.toast('草稿已通过 C02 创建'); setCreate(false); goto(`/admin/edit/${item.id}`);
    } catch { /* hook 已保留错误 */ }
  };
  if (content.status === 'loading') return <LoadingAdmin/>;
  if (content.status === 'error') return <AdminError error={content.error} retry={content.reload}/>;
  return <>
    <div className="admin-title"><div><div className="eyebrow">{app.role === 'admin' ? 'PRODUCT ADMIN / 项目管理平台' : 'CONTENT & IMPORT / 数据运营平台'}</div><h1>{app.role === 'admin' ? '商品管理' : '内容与导入'}</h1><p>数据来自 C01；所有状态命令携带当前 ETag 与独立幂等键。</p></div><PermissionGate required={['content:write']} fallback={<Button disabled>新建草稿</Button>}><Button onClick={() => { setForm({ name: '', category: '绿茶', tea_id: 'longjing', sku: `DEMO-${String(Date.now()).slice(-5)}`, batch: 'NEW-DEMO' }); setCreate(true); }} icon="edit">新建草稿</Button></PermissionGate></div>
    <AdminError error={content.mutationError} retry={content.reload}/>
    <section className="panel"><div className="admin-table-tools"><div className="search-field"><Icon name="search"/><input aria-label="后台搜索茶品" placeholder="茶名、SKU、批次" value={q} onChange={event => setQ(event.target.value)}/></div><select aria-label="筛选内容状态" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">全部状态</option>{Object.entries(statusNames).filter(([key]) => key !== 'approved').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>茶品 / 商品编号</th><th>茶类</th><th>批次</th><th>ETag</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map(item => { const status = currentStatus(item); return <tr key={item.id} className={status === 'draft' ? 'draft-row' : ''}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{item.category}</td><td>{item.batch}</td><td>{item.etag}</td><td><StatusBadge status={status}/></td><td><div className="table-actions"><a href={url(`/admin/edit/${item.id}`)}>编辑</a>{item.status === 'published' && <button className="action-warning" disabled={content.busy === item.id} onClick={() => setAction({ kind: 'withdraw', item })}>下架</button>}{item.status === 'withdrawn' && <button className="action-success" disabled={content.busy === item.id} onClick={() => setAction({ kind: 'relist', item })}>重新上架</button>}{(app.role === 'admin' || status === 'draft') && <button className="action-danger" disabled={content.busy === item.id} onClick={() => setAction({ kind: 'delete', item })}>删除</button>}</div></td></tr>; })}</tbody></table>{!items.length && <p className="table-empty">没有匹配的内容。</p>}</div><div className="table-footer">共 {content.data?.total ?? 0} 条内容 <span>草稿优先；上下架操作按状态互斥。</span></div></section>
    {app.role === 'operator' && <ImportPanel create={content.create} onDone={() => content.reload()}/>}
    {app.role === 'admin' && (mode === 'mock' ? <section className="panel source-admin"><div><h3>示例来源授权</h3><p>来源撤回会阻止公开读取；重新上架时会同步恢复。</p><Badge tone={content.data?.sourceActive ? 'success' : 'danger'}>{content.data?.sourceActive ? '演示授权有效' : '演示授权已撤回'}</Badge></div><Button tone={content.data?.sourceActive ? 'danger' : 'secondary'} disabled={content.busy === 'source'} onClick={() => void content.setSourceActive(!content.data?.sourceActive).then(() => { app.record(content.data?.sourceActive ? '撤回示例来源' : '恢复示例来源', '茶序示例资料'); app.toast('来源状态已更新'); }).catch(() => undefined)}>{content.data?.sourceActive ? '撤回来源授权' : '恢复来源授权'}</Button></section> : <Notice title="live 模式按正式来源资源维护授权">原型不会在 live 模式伪造来源撤回或恢复成功。</Notice>)}
    {create && <Modal title="新建茶品草稿" onClose={() => setCreate(false)}><label className="field">茶品名称<input value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} autoFocus/></label><label className="field">茶类<select value={form.category} onChange={event => setForm(value => ({ ...value, category: event.target.value as TeaItem['category'] }))}><option>绿茶</option><option>红茶</option></select></label><label className="field">关联茶 ID<input value={form.tea_id} onChange={event => setForm(value => ({ ...value, tea_id: event.target.value }))}/></label><label className="field">SKU<input value={form.sku} onChange={event => setForm(value => ({ ...value, sku: event.target.value }))}/></label><label className="field">批次<input value={form.batch} onChange={event => setForm(value => ({ ...value, batch: event.target.value }))}/></label><Notice title="新内容只保存为草稿">C02 不会直接发布。</Notice><div className="modal-actions"><Button tone="secondary" onClick={() => setCreate(false)}>取消</Button><Button disabled={!form.name.trim() || !form.tea_id.trim() || !form.sku.trim() || !form.batch.trim() || content.busy === 'create'} onClick={() => void createDraft()}>创建草稿</Button></div></Modal>}
    {action && <Modal title={action.kind === 'withdraw' ? '确认下架这件商品？' : action.kind === 'relist' ? '确认重新上架？' : '确认逻辑删除？'} onClose={() => setAction(undefined)}><p>{action.kind === 'withdraw' ? '下架后公开详情与咨询立即关闭。' : action.kind === 'relist' ? '恢复已审核版本，不创建新的审核任务。' : '历史版本与审计事实仍会保留。'}</p><div className="modal-actions"><Button tone="secondary" onClick={() => setAction(undefined)}>取消</Button><Button tone={action.kind === 'relist' ? 'primary' : 'danger'} onClick={() => void execute()}>{action.kind === 'withdraw' ? '确认下架' : action.kind === 'relist' ? '确认上架' : '确认删除'}</Button></div></Modal>}
  </>;
}

function ImportPanel({ create, onDone }: { create: (input: { name: string; category: TeaItem['category']; tea_id: string; sku: string; batch: string }) => Promise<ContentDetail<TeaItem>>; onDone: () => void }) {
  const { mode } = useAppServices();
  const app = useApp();
  const [state, setState] = useState<'idle' | 'invalid' | 'validated' | 'committing' | 'committed'>('idle');
  const [rows, setRows] = useState<Array<{ name: string; category: TeaItem['category']; tea_id: string; sku: string; batch: string }>>([]);
  const loadExample = (valid: boolean) => { setRows(valid ? [{ name: '春日示例茶', category: '绿茶', tea_id: 'longjing', sku: `DEMO-${String(Date.now()).slice(-5)}`, batch: '2026-X' }] : []); setState(valid ? 'validated' : 'invalid'); };
  const commit = async () => {
    setState('committing');
    try { for (const row of rows) await create(row); setState('committed'); app.record('导入草稿', `${rows.length} 条`); app.toast('导入记录已通过服务创建为草稿'); onDone(); }
    catch { setState('validated'); }
  };
  return <section className="import-panel"><div className="section-head"><div><div className="eyebrow">BATCH IMPORT / 批量导入</div><h2>校验后生成草稿</h2><p className="muted small">mock 模式保留演示导入；live 模式必须接 I01–I05，当前不会伪造任务成功。</p></div></div>{mode === 'live' ? <Notice tone="warning" title="live 导入尚未连接文件服务">请接入 multipart 上传和 ImportJob 轮询后再开放提交。</Notice> : <section className="panel"><div className="example-actions"><button className="text-link" onClick={() => loadExample(false)}>查看有错误的文件</button><button className="text-link" onClick={() => loadExample(true)}>查看可导入的文件</button></div>{state === 'invalid' && <Notice tone="warning" title="校验未通过">示例行缺少必填字段，未调用创建接口。</Notice>}{state === 'validated' && <Notice title="校验通过">1 条资料可生成草稿。</Notice>}{state === 'committed' && <Notice title="草稿已创建">返回列表继续补齐并提交审核。</Notice>}<div className="form-bottom"><Button disabled={state !== 'validated'} onClick={() => void commit()}>{state === 'committing' ? '正在提交…' : '导入为草稿'}</Button></div></section>}</section>;
}

function ReviewQueue() {
  const app = useApp();
  const reviews = useReviews(app.role);
  if (reviews.status === 'loading') return <LoadingAdmin label="正在读取审核待办…"/>;
  if (reviews.status === 'error') return <AdminError error={reviews.error} retry={reviews.reload}/>;
  const items = reviews.data?.items ?? [];
  return <><div className="admin-title"><div><div className="eyebrow">REVIEW TASKS / 客户审核平台</div><h1>审核待办</h1><p>待办来自 C01 pending_review；通过操作在 C10 内自动发布。</p></div><Badge tone={items.length ? 'warning' : 'success'}>{items.length} 项待审核</Badge></div><section className="panel"><div className="task-list">{items.map(item => <a href={url(`/admin/review/${item.id}`)} key={item.id}><span className="task-icon"><Icon name="shield"/></span><div><strong>{item.name}</strong><p>{item.sku} · {item.batch} · {item.etag}</p></div><Icon name="arrow" size={18}/></a>)}{!items.length && <Empty title="审核待办已处理完成">当前没有等待客户审核的内容。</Empty>}</div></section></>;
}

export function EditContent({ id }: { id: string }) {
  const app = useApp();
  const content = useContent(app.role);
  const item = content.data?.items.find(value => value.id === id);
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState('');
  useEffect(() => { if (item) setNote(item.draftNote || item.description); }, [item?.id]);
  if (content.status === 'loading') return <LoadingAdmin/>;
  if (content.status === 'error') return <AdminError error={content.error} retry={content.reload}/>;
  if (!item) return <Empty title="未找到内容" action={<Button href="/admin/content">返回内容列表</Button>}>请刷新后重新选择。</Empty>;
  const editable = ['operator', 'admin'].includes(app.role) && currentStatus(item) !== 'pending_review';
  const save = async (submit: boolean) => {
    if (note.trim().length < 10) { setFieldError('请至少填写 10 个字的资料说明'); return; }
    setFieldError('');
    try {
      const saved = await content.save({ id: item.id, description: note.trim(), etag: item.etag });
      if (submit) await content.submit({ id: saved.id, revision: saved.row_version, etag: saved.etag });
      app.record(submit ? '提交审核' : '保存草稿', item.name); app.toast(submit ? '已提交客户审核' : '草稿已保存');
      if (submit) goto('/admin/content');
    } catch { /* hook 已保留错误 */ }
  };
  return <><div className="breadcrumb"><a href={url('/admin/content')}><Icon name="back" size={16}/> 返回内容与导入</a></div><div className="admin-title"><div><h1>{item.name}</h1><p>{item.sku} / {item.batch}</p></div><StatusBadge status={currentStatus(item)}/></div><AdminError error={content.mutationError} retry={content.reload}/><div className="admin-two-col wide-left"><section className="panel"><h2>内容资料</h2><div className="read-fields"><div><span>茶类</span><strong>{item.category}</strong></div><div><span>版本</span><strong>v{item.row_version}.0</strong></div><div><span>ETag</span><strong>{item.etag}</strong></div></div><label className="field">特点与资料说明<textarea rows={7} value={note} onChange={event => setNote(event.target.value)} disabled={!editable} aria-invalid={!!fieldError}/>{fieldError && <small className="field-error">{fieldError}</small>}</label><div className="form-bottom"><Button tone="secondary" disabled={!editable || content.busy === item.id} onClick={() => void save(false)}>保存草稿</Button><Button disabled={!editable || content.busy === item.id} onClick={() => void save(true)} icon="arrow">保存并提交审核</Button></div></section><aside className="panel"><h2>版本与发布规则</h2><ol className="review-checks"><li>C04 保存工作草稿并更新 ETag。</li><li>C08 冻结本次待审核版本。</li><li>客户审核人通过 C10 后自动发布。</li><li>409 或 428 时必须刷新后再操作。</li></ol><Badge tone="warning">操作身份：{roleNames[app.role]}</Badge></aside></div></>;
}

export function Review({ id }: { id: string }) {
  const app = useApp();
  const reviews = useReviews(app.role);
  const [comment, setComment] = useState('');
  const item = reviews.data?.items.find(value => value.id === id);
  if (reviews.status === 'loading') return <LoadingAdmin label="正在读取待审核版本…"/>;
  if (reviews.status === 'error') return <AdminError error={reviews.error} retry={reviews.reload}/>;
  if (!item) return <Empty title="请选择一条待审核内容" action={<Button href="/admin/content">返回审核待办</Button>}>审核对象可能已被其他人处理，请刷新列表。</Empty>;
  const act = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !comment.trim()) { app.toast('退回前请填写修改意见'); return; }
    try { await reviews.review({ id: item.id, revision: item.row_version, etag: item.etag, decision, comment: comment.trim() }); app.record(decision === 'approve' ? '审核通过并自动发布' : '退回修改', item.name); app.toast(decision === 'approve' ? '审核通过，已自动发布到用户端' : '已退回草稿'); goto('/admin/content'); }
    catch { /* hook 已保留错误 */ }
  };
  return <><div className="breadcrumb"><a href={url('/admin/content')}><Icon name="back" size={16}/> 返回审核待办</a></div><div className="admin-title"><div><div className="eyebrow">REVIEW & AUTO PUBLISH / 审核与自动发布</div><h1>{item.name} · 内容审核</h1><p>{item.batch} · {item.etag}</p></div><StatusBadge status={currentStatus(item)}/></div><AdminError error={reviews.mutationError} retry={reviews.reload}/><div className="admin-two-col wide-left"><section className="panel"><div className="section-head"><h2>待审核版本</h2><Badge>revision {item.row_version}</Badge></div><div className="diff-grid"><div><span className="eyebrow">原始资料</span><p>{item.description}</p></div><div className="diff-new"><span className="eyebrow">本次审核内容</span><p>{item.draftNote || item.description}</p></div></div><Notice tone="warning" title="通过操作会自动发布">C10 在同一事务中重新校验依赖并发布。</Notice></section><aside className="panel"><h2>审核意见</h2><label className="field">给资料维护人的说明<textarea rows={5} value={comment} onChange={event => setComment(event.target.value)} placeholder="退回时必须说明原因。"/></label><div className="vertical-buttons"><Button disabled={reviews.busy === item.id} onClick={() => void act('approve')} icon="check">通过并自动发布</Button><Button tone="secondary" disabled={reviews.busy === item.id} onClick={() => void act('reject')}>退回修改</Button></div></aside></div></>;
}

export function Imports() { return <Content/>; }

export function Leads() {
  const app = useApp();
  const [filter, setFilter] = useState<'all' | Lead['status']>('all');
  const [selected, setSelected] = useState<LeadDetail>();
  const [status, setStatus] = useState<Lead['status']>('new');
  const [note, setNote] = useState('');
  const leads = useLeads(app.role, filter === 'all' ? undefined : filter);
  const rows = leads.data?.items ?? [];
  const close = useCallback(() => setSelected(undefined), []);
  if (leads.status === 'loading') return <LoadingAdmin label="正在读取脱敏咨询线索…"/>;
  if (leads.status === 'error') return <AdminError error={leads.error} retry={leads.reload}/>;
  const save = async () => {
    if (!selected) return;
    try { await leads.update({ id: selected.id, status, note, etag: selected.etag }); app.record('更新线索状态', `${selected.id} → ${leadLabels[status]}`); app.toast('跟进记录已通过 M03 保存'); close(); }
    catch { /* hook 已保留错误 */ }
  };
  const exportRows = async () => {
    try {
      const job = await leads.export();
      if (job.state === 'succeeded') downloadCsv('茶序_脱敏演示线索.csv', [['编号', '茶品', '类型', '联系方式（脱敏）', '状态'], ...rows.map(lead => [lead.id, lead.item, lead.kind, lead.contact, leadLabels[lead.status]])]);
      app.record('创建线索导出', job.id); app.toast(job.state === 'succeeded' ? '脱敏演示 CSV 已生成' : `导出任务已进入${job.state}状态`);
    } catch { /* hook 已保留错误 */ }
  };
  return <><div className="admin-title"><div><div className="eyebrow">INQUIRIES / 咨询线索</div><h1>让每一次咨询都有回应</h1><p>列表只展示 M01 的 contact_masked；写入使用 M03 与当前 ETag。</p></div><Button tone="secondary" icon="download" disabled={leads.busy === 'export'} onClick={() => void exportRows()}>导出当前列表</Button></div><AdminError error={leads.mutationError} retry={leads.reload}/><section className="panel"><div className="admin-table-tools"><div className="segmented">{([['all', '全部'], ['new', '待跟进'], ['assigned', '已指派'], ['contacted', '已联系'], ['closed', '已关闭']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><span className="muted small">共 {leads.data?.total ?? 0} 条</span></div><div className="table-wrap"><table><thead><tr><th>需求编号 / 时间</th><th>茶品</th><th>类型</th><th>联系方式</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(lead => <tr key={lead.id}><td><strong>{lead.id}</strong><small>{lead.date}</small></td><td>{lead.item}</td><td>{lead.kind}</td><td>{lead.contact}</td><td><Badge tone={lead.status === 'new' ? 'warning' : 'neutral'}>{leadLabels[lead.status]}</Badge></td><td><button className="text-link" onClick={() => { setSelected(lead); setStatus(lead.status); setNote(lead.note); }}>查看并跟进</button></td></tr>)}</tbody></table>{!rows.length && <p className="table-empty">该状态下暂无咨询需求。</p>}</div></section>{selected && <Modal title="需求详情与跟进" onClose={close}><Badge>{selected.kind}</Badge><h3>{selected.item}</h3><dl className="fact-list"><div><dt>需求编号</dt><dd>{selected.id}</dd></div><div><dt>联系方式</dt><dd>{selected.contact} · 已脱敏</dd></div><div><dt>并发版本</dt><dd>{selected.etag}</dd></div></dl><label className="field">跟进状态<select value={status} onChange={event => setStatus(event.target.value as Lead['status'])}>{(['new', 'assigned', 'contacted', 'closed'] as const).filter(value => ({ new: 0, assigned: 1, contacted: 2, closed: 3 }[value] >= { new: 0, assigned: 1, contacted: 2, closed: 3 }[selected.status])).map(value => <option value={value} key={value}>{leadLabels[value]}</option>)}</select></label><label className="field">跟进备注<textarea rows={4} value={note} onChange={event => setNote(event.target.value)}/></label><div className="modal-actions"><Button tone="secondary" onClick={close}>取消</Button><Button disabled={leads.busy === selected.id || (status === 'closed' && !note.trim())} onClick={() => void save()}>保存跟进</Button></div></Modal>}</>;
}

export function Users() {
  const app = useApp();
  const session = useAdminSession(app.role);
  return <><div className="admin-title"><div><div className="eyebrow">ACCESS CONTROL / 项目管理平台</div><h1>让四类岗位各自处理待办</h1><p>菜单和操作入口以 A03 返回的 permission_codes 为准；后端仍逐请求授权。</p></div></div>{session.status === 'loading' ? <LoadingAdmin/> : session.status === 'error' ? <AdminError error={session.error} retry={session.reload}/> : <Notice title={`当前会话：${roleNames[session.data!.role]}`}>权限码：{session.data!.permission_codes.join('、') || '无'}；审核领域：{session.data!.review_domains.join('、') || '无'}。</Notice>}<section className="panel mt24"><div className="table-wrap"><table><thead><tr><th>演示身份</th><th>内容</th><th>审核</th><th>商品</th><th>线索</th></tr></thead><tbody>{[['数据运营', '读写 / 导入', '提交审核', '上下架 / 删除草稿', '无'], ['客户审核人', '只读', 'tea_content', '无', '无'], ['线索跟进', '无', '无', '无', '跟进 / 导出'], ['项目管理员', '读写', '不可专家审批', '上下架 / 删除', '跟进 / 导出']].map(row => <tr key={row[0]}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div></section></>;
}

function AuditTable({ rows }: { rows: ReturnType<typeof useApp>['audit'] }) {
  return <div className="table-wrap"><table><thead><tr><th>操作</th><th>对象</th><th>操作身份</th><th>时间</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.action}</td><td>{row.object}</td><td>{row.role}</td><td className="small muted">{row.time}</td></tr>)}</tbody></table>{!rows.length && <p className="table-empty">暂无操作记录</p>}</div>;
}

export function AuditPage() {
  const { audit, role } = useApp();
  const [q, setQ] = useState('');
  if (role !== 'admin') return <Empty title="操作日志仅管理员可查看">请切换为项目管理员。</Empty>;
  return <><div className="admin-title"><div><div className="eyebrow">AUDIT LOG / 操作记录</div><h1>关键变更，有迹可循</h1><p>原型保留本次会话操作；正式 live 审计由 M10 只读接口承接。</p></div></div><section className="panel"><div className="search-field"><Icon name="search"/><input aria-label="筛选操作日志" value={q} onChange={event => setQ(event.target.value)} placeholder="按操作或对象关键词筛选"/></div><AuditTable rows={audit.filter(row => `${row.action}${row.object}`.includes(q))}/></section></>;
}
