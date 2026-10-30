'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { contentApi } from '@/lib/content-api';
import { queryKeys } from '@/lib/query-keys';
import type { ClientContentViewDto, ContentDto, CreateContentRequest } from '@/types/content';

export type SchedulePostScope = 'agency' | 'mine';

interface SchedulePostContext {
  previous: unknown;
  queryKey: readonly ['content', 'list'];
}

export function useSchedulePost(scope: SchedulePostScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<ContentDto | ClientContentViewDto, Error, CreateContentRequest, SchedulePostContext>({
    mutationFn: (body) =>
      scope === 'agency'
        ? contentApi.createForClient(clientId, body)
        : contentApi.createMine(clientId, body),
    onMutate: async (body) => {
      const queryKey = queryKeys.content.lists();

      await queryClient.cancelQueries({ queryKey: queryKeys.content.all });

      const previous = queryClient.getQueryData(queryKey);

      const tempPost = {
        id: `temp-id-${Date.now()}`,
        title: body.title,
        body: body.body,
        status: 'scheduled',
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(queryKey, (old: unknown) => [
        tempPost,
        ...(Array.isArray(old) ? old : []),
      ]);

      return { previous, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.content.all });
    },
  });
}