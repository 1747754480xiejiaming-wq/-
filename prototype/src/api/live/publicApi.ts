import type { PublicApi } from '../services';
import { ApiClient } from '../client';
import type { Page } from '../contracts';
import type { AnswerTransport, BrewingTransport, InquiryCreateTransport, InquiryReceiptTransport, MatchTransport, SearchHitTransport, TeaItemTransport, TeaTransport } from '../publicTransport';
import type { TeaItem } from '../../model';

const fromTeaItem = (item: TeaItemTransport, tea: TeaTransport): TeaItem => ({
  id: item.id,
  teaId: item.tea_id,
  name: item.name,
  subtitle: `${item.grade} · ${item.specification}`,
  category: /black|red|红茶/i.test(tea.category) ? '红茶' : '绿茶',
  origin: tea.origin,
  sku: item.sku,
  batch: item.batch_code,
  year: item.year,
  taste: [],
  water: 85,
  seconds: 30,
  grams: 3,
  vessel: '盖碗',
  status: 'published',
  revision: item.version.revision,
  offer: 'unavailable',
  specific: false,
  price: '',
  description: `${tea.process}。${item.storage}`
});

const rangeMidpoint = (range: { min: number; max: number }) => Math.round((range.min + range.max) / 2);

export const createLivePublicApi = (client: ApiClient): PublicApi => {
  const getTeaItem = async (id: string) => {
    const item = await client.request<TeaItemTransport>({ path: `/tea-items/${id}` });
    const tea = await client.request<TeaTransport>({ path: `/teas/${item.tea_id}` });
    return fromTeaItem(item, tea);
  };
  return ({
  getConfig: () => client.request({ path: '/config' }),
  searchTeas: async query => {
    const page = await client.request<Page<SearchHitTransport>>({ path: '/teas', query: { q: query?.q, category: query?.category, entity_type: 'tea_item', page: query?.page ?? 1, page_size: query?.page_size ?? 20 } });
    const itemHits = page.items.filter(hit => hit.entity_type === 'tea_item' && hit.tea_item_id);
    return { ...page, items: await Promise.all(itemHits.map(hit => getTeaItem(hit.tea_item_id!))), total: itemHits.length };
  },
  listTeaItems: async query => {
    const page = await client.request<Page<TeaItemTransport>>({ path: '/tea-items', query: { tea_id: query?.tea_id, sku: query?.sku, batch_code: query?.batch_code, page: query?.page ?? 1, page_size: query?.page_size ?? 20 } });
    return { ...page, items: await Promise.all(page.items.map(async item => fromTeaItem(item, await client.request<TeaTransport>({ path: `/teas/${item.tea_id}` })))) };
  },
  getTeaItem,
  getBrewing: async ({ teaId, teaItemId }) => {
    const match = await client.request<MatchTransport<BrewingTransport>>({ path: `/teas/${teaId}/brewing`, query: { tea_item_id: teaItemId } });
    if (!match.record) throw new Error(match.notice ?? '暂无可用冲泡方案');
    const record = match.record;
    return { tea_id: record.tea_id, tea_item_id: record.tea_item_id, vessel: record.vessel, water_ml: rangeMidpoint(record.water_ml), tea_g: rangeMidpoint(record.tea_g), temperature_c: rangeMidpoint(record.temperature_c), steps: record.steps.map(step => ({ title: step.title, description: step.instruction, seconds: step.duration_seconds || undefined })) };
  },
  askQuestion: async question => {
    const answer = await client.request<AnswerTransport>({ path: '/questions', method: 'POST', body: { question }, idempotent: true });
    return { status: answer.status, text: answer.answer, intent: answer.intent === 'brewing' ? 'brewing' : undefined, tea_item_id: answer.tea_item_id, tea_id: answer.tea_id };
  },
  createInquiry: input => {
    const body: InquiryCreateTransport = { kind: input.kind, tea_item_id: input.tea_item_id, need: input.need, contact: { channel: input.contact_channel, value: input.contact }, consent: { accepted: true, notice_version: input.consent_version, purpose: 'inquiry_followup' } };
    return client.request<InquiryReceiptTransport>({ path: '/inquiries', method: 'POST', body, idempotent: true });
  }
  });
};
