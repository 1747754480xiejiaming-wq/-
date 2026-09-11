import { useCallback, useState } from 'react';
import type { BrewingRecipe, PublicApi, QuestionResult } from '../../api/services';
import type { TeaItem } from '../../model';
import { ApiError } from '../../api/errors';
import { useAppServices } from '../AppServicesContext';

export type QuestionFlow = { answer: QuestionResult; item?: TeaItem; recipe?: BrewingRecipe };

export const askAndLoadBrewing = async (api: PublicApi, question: string): Promise<QuestionFlow> => {
  const answer = await api.askQuestion(question);
  if (answer.intent !== 'brewing' || !answer.tea_id || !answer.tea_item_id) return { answer };
  const [item, recipe] = await Promise.all([
    api.getTeaItem(answer.tea_item_id),
    api.getBrewing({ teaId: answer.tea_id, teaItemId: answer.tea_item_id })
  ]);
  return { answer, item, recipe };
};

export const withRecipe = (item: TeaItem, recipe: BrewingRecipe): TeaItem => ({
  ...item,
  vessel: recipe.vessel,
  grams: recipe.tea_g,
  water: recipe.temperature_c,
  seconds: recipe.steps.find(step => step.seconds)?.seconds ?? item.seconds,
  specific: recipe.tea_item_id === item.id
});

export function useQuestion() {
  const { publicApi } = useAppServices();
  const [flow, setFlow] = useState<QuestionFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError>();

  const ask = useCallback(async (question: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await askAndLoadBrewing(publicApi, question);
      setFlow(next);
      return next;
    } catch (cause) {
      const normalized = cause instanceof ApiError ? cause : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '问茶服务暂时不可用，请稍后重试' });
      setError(normalized);
      throw normalized;
    } finally {
      setLoading(false);
    }
  }, [publicApi]);

  const loadItem = useCallback(async (item: TeaItem) => {
    setLoading(true);
    setError(undefined);
    try {
      const recipe = await publicApi.getBrewing({ teaId: item.teaId, teaItemId: item.id });
      const next = { answer: flow?.answer ?? { status: 'answered', text: `已选择 ${item.name} · ${item.batch}。`, intent: 'brewing', tea_id: item.teaId, tea_item_id: item.id }, item, recipe } satisfies QuestionFlow;
      setFlow(next);
      return next;
    } catch (cause) {
      const normalized = cause instanceof ApiError ? cause : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '冲泡资料暂时不可用，请稍后重试' });
      setError(normalized);
      throw normalized;
    } finally {
      setLoading(false);
    }
  }, [flow?.answer, publicApi]);

  return { flow, loading, error, ask, loadItem, reset: () => { setFlow(null); setError(undefined); } };
}
