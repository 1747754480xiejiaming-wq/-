import { useCallback } from 'react';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export const useTeaDetail = (id: string) => {
  const { publicApi } = useAppServices();
  const load = useCallback(async () => {
    const item = await publicApi.getTeaItem(id);
    const batches = await publicApi.listTeaItems({ tea_id: item.teaId, page_size: 100 });
    return { item, batches: batches.items };
  }, [id, publicApi]);
  return useRemoteState(load);
};
