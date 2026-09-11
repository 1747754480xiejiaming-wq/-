import { useCallback, useState } from 'react';
import type { InquiryInput } from '../../api/services';
import { ApiError } from '../../api/errors';
import { useAppServices } from '../AppServicesContext';
import { useRemoteState } from '../useRemoteState';

export const useInquiry = (teaItemId: string) => {
  const { publicApi } = useAppServices();
  const load = useCallback(async () => {
    const [config, item] = await Promise.all([publicApi.getConfig(), publicApi.getTeaItem(teaItemId)]);
    return { config, item };
  }, [publicApi, teaItemId]);
  const state = useRemoteState(load);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError>();
  const submit = useCallback(async (input: InquiryInput) => {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      return await publicApi.createInquiry(input);
    } catch (cause) {
      const normalized = cause instanceof ApiError ? cause : new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '咨询暂时无法提交，请稍后重试' });
      setSubmitError(normalized);
      throw normalized;
    } finally {
      setSubmitting(false);
    }
  }, [publicApi]);
  return { ...state, submitting, submitError, submit };
};
