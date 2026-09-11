import type { TeaItem } from '../../model';
import { ApiError } from '../errors';
import type { ApiPage, TeaItemPublic, TeaSearch } from '../types';
import type { BrewingRecipe, InquiryInput, PublicConfig, QuestionResult, TeaItemQuery } from '../services';
import { MockStore } from './mockStore';

const notFound = () => new ApiError({ status: 404, code: 'NOT_FOUND', message: '内容不存在或当前不可公开' });
const asPublic = (item: TeaItem): TeaItemPublic => ({ ...item, row_version: item.revision, etag: `rv-${item.revision}` });

export class MockPublicApi {
  constructor(private readonly store: MockStore) {}
  private published = () => {
    const state = this.store.snapshot();
    return state.sourceActive ? state.items.filter(item => item.status === 'published') : [];
  };
  async getTeaItem(id: string): Promise<TeaItemPublic> {
    const item = this.published().find(value => value.id === id);
    if (!item) throw notFound();
    return asPublic(item);
  }
  async getConfig(): Promise<PublicConfig> {
    return { data_mode: 'demo', tea_categories: [{ code: 'green', label: '绿茶' }, { code: 'black', label: '红茶' }], inquiry_notice: { version: 'demo-v1', text: '联系方式仅用于本次咨询与样品安排。', purpose: '咨询与样品安排沟通' }, health_notice: { version: 'demo-v1', text: '不提供诊断或治疗建议。' }, capabilities: { qa: true } };
  }
  async searchTeas(query: TeaSearch = {}): Promise<ApiPage<TeaItem>> {
    const search = (query.q ?? '').toLowerCase();
    const items = this.published().filter(item =>
      (!query.category || item.category === query.category) &&
      (!search || `${item.name} ${item.sku} ${item.batch}`.toLowerCase().includes(search))
    );
    const page = query.page ?? 1;
    const page_size = query.page_size ?? 20;
    return { items: structuredClone(items.slice((page - 1) * page_size, page * page_size)), page, page_size, total: items.length };
  }
  async listTeaItems(query: TeaItemQuery = {}): Promise<ApiPage<TeaItem>> {
    const items = this.published().filter(item => (!query.tea_id || item.teaId === query.tea_id) && (!query.sku || item.sku === query.sku) && (!query.batch_code || item.batch === query.batch_code));
    const page = query.page ?? 1;
    const page_size = query.page_size ?? 20;
    return { items: structuredClone(items.slice((page - 1) * page_size, page * page_size)), page, page_size, total: items.length };
  }
  async getBrewing({ teaId, teaItemId }: { teaId: string; teaItemId?: string }): Promise<BrewingRecipe> {
    const item = this.published().find(value => value.teaId === teaId && (!teaItemId || value.id === teaItemId));
    if (!item) throw notFound();
    return { tea_id: item.teaId, tea_item_id: item.specific ? item.id : undefined, vessel: item.vessel, water_ml: 150, tea_g: item.grams, temperature_c: item.water, steps: [{ title: '温杯与准备', description: '温润器具，准备茶叶。' }, { title: '投茶注水', description: '按建议水温缓缓注水。' }, { title: '静候出汤', description: '观察茶叶舒展后出汤。', seconds: item.seconds }, { title: '品饮与调整', description: '根据滋味记录下一泡调整。' }] };
  }
  async askQuestion(question: string): Promise<QuestionResult> {
    if (/治愈|治疗|糖尿病|降血压|替代药|减肥|治病/.test(question)) return { status: 'boundary', text: '茶序不能根据问题判断疾病或提供治疗建议。涉及健康状况、用药或治疗，请咨询专业人员。' };
    const brewing = /怎么泡|如何泡|冲泡|泡茶|水温|投茶|几克|泡多久|浸泡|第一泡/.test(question);
    const items = [...this.published()].sort((a, b) => b.year - a.year);
    const item = items.find(value => question.includes(value.name) || question.includes(value.sku) || question.includes(value.batch)) ?? (/龙井|绿茶/.test(question) ? items.find(value => value.category === '绿茶') : /祁门|红茶/.test(question) ? items.find(value => value.category === '红茶') : undefined);
    if (brewing && item) return { status: 'answered', text: `已匹配 ${item.name} · ${item.batch} 的冲泡资料。`, intent: 'brewing', tea_item_id: item.id, tea_id: item.teaId };
    if (brewing) return { status: 'unconfirmed', text: '暂时无法确认具体茶品，请选择一款已发布茶品。', intent: 'brewing' };
    return item ? { status: 'answered', text: `当前资料将 ${item.name} 描述为${item.taste.join('、')}。` } : { status: 'unconfirmed', text: '现有资料不足以确认这个问题。' };
  }
  async createInquiry(input: InquiryInput) {
    if (!input.consented) throw new ApiError({ status: 422, code: 'CONSENT_REQUIRED', message: '请先阅读并同意用途说明', details: [{ field: 'consented', reason: 'required' }] });
    const item = await this.getTeaItem(input.tea_item_id);
    const id = `CX-DEMO-${Date.now()}`;
    this.store.update(state => ({ ...state, leads: [{ id, name: '本次演示访客', contact: input.contact.includes('@') ? `${input.contact.slice(0, 1)}***@${input.contact.split('@')[1]}` : `${input.contact.slice(0, 3)}****${input.contact.slice(-4)}`, item: `${item.name} · ${item.batch}`, kind: input.kind === 'sample' ? '样品申请' : '茶品咨询', status: 'new', date: new Date().toLocaleString('zh-CN'), note: input.need }, ...state.leads], leadVersions: { ...state.leadVersions, [id]: 1 } }));
    return { id, status: 'new' as const, submitted_at: new Date().toISOString(), receipt_message: '需求已记录，后续将由工作人员跟进。' };
  }
  async isSourceActive() { return this.store.snapshot().sourceActive; }
}
