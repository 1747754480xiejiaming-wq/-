import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrewGuide } from './BrewGuide';
import { Context, goto, maskContact, type Lead, type TeaItem, url, useApp } from './model';
import { Catalog as LegacyCatalog, TeaDetail as LegacyTeaDetail } from './PublicPages';
import { ScrollStory } from './ScrollStory';
import type { NavSection } from './HomeSections';
import { Badge, Button, Empty, Icon, Notice, SourceContent, TeaCard, TeaArt } from './ui';
import { useCatalog } from './features/public/useCatalog';
import { useTeaDetail } from './features/public/useTeaDetail';
import { useQuestion, withRecipe } from './features/public/useQuestion';
import { useInquiry } from './features/public/useInquiry';

const categoryCode = (label: string) => label === '绿茶' ? 'green' : label === '红茶' ? 'black' : undefined;

function LoadingPage({ label = '正在载入已发布资料…' }: { label?: string }) {
  return <div className="container page-content"><div className="answer-panel" role="status"><div className="skeleton"/><div className="skeleton"/><p>{label}</p></div></div>;
}

function ErrorPage({ message, retry }: { message: string; retry: () => void }) {
  return <div className="container page-content"><Empty title="资料暂时不可用" action={<Button onClick={retry} tone="secondary">重新载入</Button>}><span role="alert">{message}</span></Empty></div>;
}

export function Home({ onSectionChange }: { onSectionChange: (section: NavSection) => void }) {
  const catalog = useCatalog({ page_size: 100 });
  return <><span className="sr-only" role="status">{catalog.status === 'loading' ? '正在载入公开茶品' : catalog.status === 'error' ? catalog.error?.message : ''}</span><ScrollStory items={catalog.data?.items ?? []} onSectionChange={onSectionChange}/></>;
}

export function Catalog() {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '全部');
  const [sort, setSort] = useState('new');
  const catalog = useCatalog({ q: q.trim() || undefined, category: categoryCode(category), page_size: 100 });
  const results = useMemo(() => [...(catalog.data?.items ?? [])].sort((a, b) => sort === 'new' ? b.year - a.year : a.name.localeCompare(b.name, 'zh')), [catalog.data?.items, sort]);

  return <div className="container page-content">
    <div className="page-heading"><div className="eyebrow">茶品档案 / TEA COLLECTION</div><h1>找到想了解的那一款茶</h1><p>从茶类、茶名或商品编号开始。每个批次，都有自己的档案。</p></div>
    <div className="catalog-tools">
      <div className="search-field"><Icon name="search"/><input aria-label="检索茶品" placeholder="搜索茶名、SKU 或批次" value={q} onChange={event => setQ(event.target.value)}/>{q && <button className="icon-btn" aria-label="清空检索" onClick={() => setQ('')}><Icon name="close" size={16}/></button>}</div>
      <div className="segmented" aria-label="茶类筛选">{['全部', '绿茶', '红茶'].map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)} aria-pressed={category === value}>{value}</button>)}</div>
    </div>
    <div className="result-meta"><span>共 <strong>{catalog.data?.total ?? 0}</strong> 款茶品 <span className="muted">· 仅展示已发布资料</span></span><label>排序 <select aria-label="茶品排序" value={sort} onChange={event => setSort(event.target.value)}><option value="new">年份从新到旧</option><option value="name">茶名排序</option></select></label></div>
    {catalog.status === 'loading' && <div className="answer-panel" role="status">正在检索已发布茶品…</div>}
    {catalog.status === 'error' && <Notice tone="warning" title="检索服务暂时不可用"><span role="alert">{catalog.error?.message}</span> <button className="text-link" onClick={catalog.reload}>重新载入</button></Notice>}
    {results.length > 0 ? <div className="tea-grid">{results.map(item => <TeaCard item={item} key={item.id}/>)}</div> : catalog.status !== 'loading' && catalog.status !== 'error' && <Empty title="暂时没有找到这款茶" action={<Button onClick={() => { setQ(''); setCategory('全部'); }} tone="secondary">清除筛选，重新看看</Button>}>试试茶名的部分关键词，或检查 SKU 是否正确。<br/>没有可靠资料时，茶序不会猜测。</Empty>}
    <div className="quiet-note"><Icon name="info" size={16}/> 本期以绿茶与红茶为例；同名商品按 SKU 和批次区分。</div>
  </div>;
}

export function TeaDetail({ id }: { id: string }) {
  const app = useApp();
  const detail = useTeaDetail(id);
  if (detail.status === 'loading') return <LoadingPage/>;
  if (detail.status === 'error' || !detail.data) return <ErrorPage message={detail.error?.message ?? '内容可能尚未发布、已下架或来源授权失效。'} retry={detail.reload}/>;
  return <Context.Provider value={{ ...app, items: detail.data.batches, sourceActive: true }}><LegacyTeaDetail id={id}/></Context.Provider>;
}

const statusLabel = { answered: '资料回答', unconfirmed: '需要更多信息', boundary: '健康边界提示', degraded: '服务暂不可用' } as const;

export function Questions({ initialTeaId, initialBrew = false }: { initialTeaId?: string; initialBrew?: boolean } = {}) {
  const catalog = useCatalog({ page_size: 100 });
  const question = useQuestion();
  const [q, setQ] = useState('');
  const [offline, setOffline] = useState(false);
  const [selectedId, setSelectedId] = useState(initialTeaId ?? '');
  const brewRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const available = catalog.data?.items ?? [];

  const reveal = useCallback(() => setTimeout(() => {
    brewRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    brewRef.current?.focus({ preventScroll: true });
  }, 60), []);

  useEffect(() => {
    if (initialized.current || !initialBrew || !initialTeaId || catalog.status !== 'ready') return;
    const item = available.find(value => value.id === initialTeaId);
    if (!item) return;
    initialized.current = true;
    setSelectedId(item.id);
    void question.loadItem(item).then(reveal).catch(() => undefined);
  }, [available, catalog.status, initialBrew, initialTeaId, question, reveal]);

  const ask = async (value = q) => {
    if (!value.trim() || question.loading) return;
    setQ(value);
    setSelectedId('');
    question.reset();
    if (offline) return;
    try {
      const flow = await question.ask(value);
      if (flow.item) { setSelectedId(flow.item.id); reveal(); }
    } catch { /* 错误由 hook 归一化并展示 */ }
  };

  const choose = async (id: string) => {
    setSelectedId(id);
    const item = available.find(value => value.id === id);
    if (!item) return;
    try { await question.loadItem(item); reveal(); } catch { /* 错误由 hook 展示 */ }
  };

  const flowItem = question.flow?.item;
  const selected = flowItem?.id === selectedId ? flowItem : available.find(value => value.id === selectedId);
  const brewItem = selected && question.flow?.recipe ? withRecipe(selected, question.flow.recipe) : selected;
  const answer = offline ? { status: 'degraded' as const, text: '问茶服务暂时不可用。你仍可以浏览已发布的茶品档案；冲泡资料恢复后再继续。' } : question.flow?.answer;

  return <div className="container page-content qa-page">
    <div className="qa-heading"><div className="qa-symbol"><Icon name="leaf" size={36}/></div><div className="eyebrow">ASK & BREW / 问茶 · 泡一杯</div><h1>先问明白，再跟着泡一杯</h1><p>询问泡法时，茶序会自动找到对应茶品，并把审核过的参数和步骤填到下方。</p></div>
    <form className="question-box" onSubmit={event => { event.preventDefault(); void ask(); }}><label className="sr-only" htmlFor="question">你的茶问题</label><textarea id="question" maxLength={1000} rows={3} value={q} onChange={event => setQ(event.target.value)} placeholder="例如：西湖龙井怎么泡，水温要多少？"/><div className="question-toolbar"><span><Icon name="book" size={16}/> 当前为{catalog.status === 'error' ? '不可用' : '已发布'}知识库</span><Button type="submit" disabled={!q.trim() || question.loading} icon="arrow">{question.loading ? '正在查找资料…' : '提问并匹配'}</Button></div></form>
    <div className="suggested-questions">{['西湖龙井怎么泡？', '祁门红茶第一泡要多久？', '没有这款茶的资料怎么办？'].map(value => <button onClick={() => void ask(value)} disabled={question.loading} key={value}>{value}<Icon name="arrow" size={15}/></button>)}</div>
    {question.loading && <div className="answer-panel" role="status"><div className="skeleton"/><div className="skeleton"/><p>正在核对资料范围与冲泡方案…</p></div>}
    {question.error && <Notice tone="warning" title={question.error.code === 'RATE_LIMITED' ? '提问过于频繁' : '问茶服务暂时不可用'}><span role="alert">{question.error.message}</span></Notice>}
    {answer && <article className="answer-panel" aria-live="polite"><div className="inline"><Badge tone={answer.status === 'answered' ? 'success' : 'warning'}>{statusLabel[answer.status]}</Badge><span className="small muted">本次回答</span></div><p className="answer-text">{answer.text}</p>{answer.status === 'answered' && <div className="citation"><span>1</span><div><strong>已授权资料摘要</strong><small>回答引用以服务端返回为准</small></div><Icon name="chevron"/></div>}<div className="button-row"><Button tone="secondary" href="/catalog" icon="arrow">查看茶品档案</Button>{question.flow?.item && <Button onClick={reveal} icon="cup">查看冲泡步骤</Button>}<Button tone="ghost" onClick={() => { question.reset(); setQ(''); }}>换个问题</Button></div></article>}
    <div className="qa-bottom"><span><Icon name="shield" size={16}/> 回答不替代专业健康建议，也不提供库存与价格承诺。</span><label className="demo-toggle"><input type="checkbox" checked={offline} onChange={event => { setOffline(event.target.checked); question.reset(); }}/>演示离线状态</label></div>
    <section className="guided-brew-section" ref={brewRef} tabIndex={-1} aria-labelledby="qa-brew-title"><div className="guided-brew-intro"><div><div className="eyebrow">BREWING GUIDE / 泡一杯茶</div><h2 id="qa-brew-title">把问到的泡法，变成一步步的动作</h2><p>选择具体茶品后，器具、投茶量、水温和时间会从 U07 自动填入。</p></div><label>选择茶品<select aria-label="选择要冲泡的茶品" value={selectedId} onChange={event => void choose(event.target.value)}><option value="">请选择具体茶品</option>{available.map(item => <option value={item.id} key={item.id}>{item.name} · {item.batch}</option>)}</select></label></div>{brewItem && question.flow?.recipe ? <BrewGuide key={brewItem.id} item={brewItem} embedded/> : available.length ? <div className="brew-entry-card"><Icon name="cup" size={32}/><div><strong>还没有带入具体茶品</strong><p>直接问“西湖龙井怎么泡”，或从上方选择一款茶开始。</p></div><Button tone="secondary" onClick={() => void choose(available[0].id)} icon="arrow">用第一款示例茶</Button></div> : <Empty title="暂时没有可用冲泡方案" action={<Button href="/?section=categories">返回茶叶品类</Button>}>当前没有已发布茶品，或公开服务暂时不可用。</Empty>}</section>
  </div>;
}

export function Inquiry({ id }: { id: string }) {
  const app = useApp();
  const inquiry = useInquiry(id);
  const [kind, setKind] = useState<'consultation'|'sample'>(new URLSearchParams(location.hash.split('?')[1]).get('kind') === 'sample' ? 'sample' : 'consultation');
  const [channel, setChannel] = useState<'phone'|'email'>('phone');
  const [contact, setContact] = useState('');
  const [need, setNeed] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (inquiry.status === 'loading') return <LoadingPage label="正在载入咨询用途说明…"/>;
  if (inquiry.status === 'error' || !inquiry.data) return <ErrorPage message={inquiry.error?.message ?? '当前茶品不可咨询。'} retry={inquiry.reload}/>;
  const { item, config } = inquiry.data;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inquiry.submitting) return;
    const next: Record<string, string> = {};
    if (!need.trim()) next.need = '请简单说明你想了解的内容';
    if (channel === 'phone' ? !/^\+?\d{7,15}$/.test(contact) : !/^\S+@\S+\.\S+$/.test(contact)) next.contact = channel === 'phone' ? '请输入 7 至 15 位有效电话号码' : '请输入有效邮箱地址';
    if (!agree) next.agree = '请先阅读用途说明，并主动勾选同意';
    setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }
    try {
      const receipt = await inquiry.submit({ tea_item_id: item.id, kind, contact_channel: channel, contact, need: need.trim(), consent_version: config.inquiry_notice.version, consented: agree });
      const lead: Lead = { id: receipt.id, name: '本次访客', contact: maskContact(contact), item: `${item.name} · ${item.batch}`, kind: kind === 'sample' ? '样品申请' : '茶品咨询', status: receipt.status, date: new Date(receipt.submitted_at).toLocaleString('zh-CN'), note: need.trim() };
      app.setReceipt(lead);
      app.record('提交咨询', item.name);
      goto('/receipt');
    } catch { /* 错误由 hook 展示 */ }
  };

  return <div className="container page-content"><div className="breadcrumb"><a href={url('/tea/' + id)}><Icon name="back" size={16}/> 返回茶品档案</a></div><div className="page-heading"><div className="eyebrow">LET'S TALK / 进一步了解</div><h1>把想了解的，告诉我们</h1><p>留下简短需求，便于后续沟通；提交不产生订单。</p></div><div className="inquiry-layout"><form className="panel inquiry-form" onSubmit={event => void submit(event)} noValidate><h2>你的咨询需求</h2><fieldset><legend>你希望获得什么？</legend><div className="choice-cards">{([['consultation', '茶品咨询', '了解规格、特点或货源条件'], ['sample', '样品申请', '了解样品安排，不生成订单']] as const).map(([value, title, description]) => <label className={kind === value ? 'selected' : ''} key={value}><input type="radio" name="kind" checked={kind === value} onChange={() => setKind(value)}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></fieldset><label className="field">需求说明 <span className="required">*</span><textarea id="need" rows={4} maxLength={1000} value={need} onChange={event => setNeed(event.target.value)} aria-invalid={!!errors.need}/>{errors.need && <small className="field-error">{errors.need}</small>}</label><div className="contact-fields"><label className="field">联系方式类型<select value={channel} onChange={event => { setChannel(event.target.value as 'phone'|'email'); setContact(''); }}><option value="phone">电话号码</option><option value="email">电子邮箱</option></select></label><label className="field">{channel === 'phone' ? '电话号码' : '电子邮箱'} <span className="required">*</span><input id="contact" type={channel === 'phone' ? 'tel' : 'email'} value={contact} onChange={event => setContact(event.target.value)} aria-invalid={!!errors.contact}/>{errors.contact && <small className="field-error">{errors.contact}</small>}</label></div><div className="consent-block"><strong><Icon name="shield" size={17}/> 联系方式使用说明</strong><p>{config.inquiry_notice.text}</p><label className="checkbox-row"><input id="agree" type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)}/><span>我已阅读并同意用于{config.inquiry_notice.purpose}</span></label>{errors.agree && <p className="field-error" role="alert">{errors.agree}</p>}</div>{inquiry.submitError && <Notice tone="warning" title="提交未完成"><span role="alert">{inquiry.submitError.message}</span></Notice>}<div className="form-bottom"><Button type="submit" disabled={inquiry.submitting} icon="arrow">{inquiry.submitting ? '正在提交…' : '提交需求'}</Button><button type="button" className="text-link" onClick={() => { setNeed('想了解这款茶的小份量样品安排。'); setChannel('email'); setContact('demo@example.com'); }}>填入示例内容</button></div></form><aside><div className="panel inquiry-product"><TeaArt kind={item.category === '红茶' ? 'black' : 'green'}/><Badge>{item.category}</Badge><h3>{item.name}</h3><p>{item.batch}</p><dl className="fact-list"><div><dt>商品编号</dt><dd>{item.sku}</dd></div><div><dt>需求性质</dt><dd>咨询意向，非订单</dd></div></dl></div><Notice title="先沟通，再做决定">不收取付款，不预占库存。样品条件以正式沟通为准。</Notice></aside></div></div>;
}

export { LegacyCatalog };
