import { useCallback } from 'react';
import type { TeaSearch } from '../../api/types';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export const useCatalog = (query: TeaSearch = {}) => {
  const { publicApi } = useAppServices();
  const { q, category, page = 1, page_size = 100 } = query;
  const load = useCallback(() => publicApi.searchTeas({ q, category, page, page_size }), [category, page, page_size, publicApi, q]);
  return useRemoteState(load, result => result.items.length === 0);
};
