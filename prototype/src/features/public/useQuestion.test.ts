import { describe, expect, it, vi } from 'vitest';
import type { PublicApi } from '../../api/services';
import { askAndLoadBrewing } from './useQuestion';

describe('question and brewing flow', () => {
  it('loads U07 only when U11 confirms a public tea item', async () => {
    const api = {
      askQuestion: vi.fn().mockResolvedValue({ status: 'answered', text: '已找到', intent: 'brewing', tea_id: 'longjing', tea_item_id: 'longjing-2026' }),
      getTeaItem: vi.fn().mockResolvedValue({ id: 'longjing-2026', teaId: 'longjing' }),
      getBrewing: vi.fn().mockResolvedValue({ tea_id: 'longjing', tea_item_id: 'longjing-2026', vessel: '玻璃杯', water_ml: 150, tea_g: 3, temperature_c: 85, steps: [] })
    } as unknown as PublicApi;

    const flow = await askAndLoadBrewing(api, '西湖龙井怎么泡');

    expect(flow.answer.intent).toBe('brewing');
    expect(api.getBrewing).toHaveBeenCalledWith({ teaId: 'longjing', teaItemId: 'longjing-2026' });
  });

  it('does not invent a brewing lookup for an unconfirmed answer', async () => {
    const api = { askQuestion: vi.fn().mockResolvedValue({ status: 'unconfirmed', text: '资料不足', intent: 'brewing' }), getTeaItem: vi.fn(), getBrewing: vi.fn() } as unknown as PublicApi;
    await expect(askAndLoadBrewing(api, '没有资料的茶怎么泡')).resolves.toMatchObject({ answer: { status: 'unconfirmed' } });
    expect(api.getBrewing).not.toHaveBeenCalled();
  });
});
