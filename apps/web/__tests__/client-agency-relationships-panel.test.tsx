import React, { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  ClientAgencyRelationshipsPanel,
  clientAgencyRelationshipQueryKeys,
  executeClientRelationshipAction,
  refreshClientRelationshipQueries,
} from '@/components/client/client-agency-relationships-panel';
import { clientApi } from '@/lib/client-api';
import type {
  AgencyRelationshipDto,
  AgencyRelationshipMutationResponse,
  DiscoverableAgencyDto,
  ManagementRequestDto,
} from '@/types/client';

jest.mock('@tanstack/react-query', () => {
  const actual =
    jest.requireActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query',
    );
  return {
    ...actual,
    useMutation: jest.fn(actual.useMutation),
    useQuery: jest.fn(actual.useQuery),
    useQueryClient: jest.fn(actual.useQueryClient),
  };
});

const actualQueryHooks =
  jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
const CLIENT_ID = 'client-1';

type UiAction =
  | { type: 'request'; organizationId: string }
  | { type: 'accept-invitation'; relationshipId: string }
  | { type: 'reject-invitation'; relationshipId: string }
  | { type: 'cancel-request'; relationshipId: string }
  | { type: 'terminate' };

type MutationOptions = {
  onSuccess?: (data: unknown, action: UiAction) => Promise<void> | void;
};

function findElements(
  node: ReactNode,
  predicate: (element: React.ReactElement) => boolean,
): React.ReactElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElements(child, predicate));
  }
  if (!React.isValidElement(node)) return [];

  const element = node as React.ReactElement;
  const children = (element.props as { children?: ReactNode }).children;
  return [
    ...(predicate(element) ? [element] : []),
    ...findElements(children, predicate),
  ];
}

function findButtons(node: ReactNode): React.ReactElement<ButtonProps>[] {
  return findElements(node, (element) => element.type === Button) as React.ReactElement<ButtonProps>[];
}

function buttonText(button: React.ReactElement<ButtonProps>): string {
  return typeof button.props.children === 'string' ? button.props.children : '';
}

function clickButton(node: ReactNode, text: string): void {
  const button = findButtons(node).find((candidate) => buttonText(candidate) === text);
  if (!button?.props.onClick) {
    throw new Error(`Could not find click handler for "${text}"`);
  }
  button.props.onClick({} as React.MouseEvent<HTMLButtonElement>);
}

function treeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(treeText).join('');
  if (!React.isValidElement(node)) return '';
  return treeText((node.props as { children?: ReactNode }).children);
}

function mockPanelHooks(
  data: Map<string, unknown>,
  isPending: () => boolean,
  mutate: jest.Mock,
  queryClient: QueryClient,
) {
  let hookIndex = 0;
  const state: unknown[] = [];
  jest.spyOn(React, 'useState').mockImplementation(
    ((initialValue: unknown) => {
      const index = hookIndex++;
      if (!(index in state)) state[index] = initialValue;
      return [
        state[index],
        (nextValue: unknown) => {
          state[index] =
            typeof nextValue === 'function'
              ? (nextValue as (previous: unknown) => unknown)(state[index])
              : nextValue;
        },
      ];
    }) as typeof React.useState,
  );
  jest.mocked(useQuery).mockImplementation(
    ((options: { queryKey: readonly unknown[] }) => ({
      data: data.get(JSON.stringify(options.queryKey)),
      isLoading: false,
      isError: false,
      error: null,
    })) as never,
  );

  let mutationOptions: MutationOptions | undefined;
  jest.mocked(useMutation).mockImplementation(
    ((options: MutationOptions) => {
      mutationOptions = options;
      return { mutate, isPending: isPending(), isError: false, error: null };
    }) as never,
  );
  jest.mocked(useQueryClient).mockReturnValue(queryClient);

  return {
    render: () => {
      hookIndex = 0;
      return ClientAgencyRelationshipsPanel({ clientId: CLIENT_ID });
    },
    getMutationOptions: () => mutationOptions,
  };
}

function relationship(
  id: string,
  status: AgencyRelationshipDto['status'],
  organizationId: string,
  name: string,
): AgencyRelationshipDto {
  return {
    id,
    clientId: CLIENT_ID,
    organizationId,
    status,
    initiatedBy:
      status === 'PENDING_REQUEST' || status === 'TERMINATED'
        ? 'CLIENT'
        : 'AGENCY',
    startedAt: status === 'ACTIVE' ? '2026-01-01T00:00:00.000Z' : null,
    terminatedAt: status === 'TERMINATED' ? '2026-02-01T00:00:00.000Z' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    organization: { id: organizationId, name },
  };
}

function managementRequest(
  id: string,
  organizationId: string,
  name: string,
): ManagementRequestDto {
  return {
    ...relationship(id, 'PENDING_INVITATION', organizationId, name),
    status: 'PENDING_INVITATION',
    initiatedBy: 'AGENCY',
  };
}

const agencyCatalog: DiscoverableAgencyDto[] = [
  { id: 'agency-new', name: 'New Agency', discoveryApprovedAt: '2026-01-01T00:00:00.000Z' },
];

function makeQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID),
    [],
  );
  queryClient.setQueryData(
    clientAgencyRelationshipQueryKeys.invitations(CLIENT_ID),
    [],
  );
  queryClient.setQueryData(
    clientAgencyRelationshipQueryKeys.agencies(CLIENT_ID),
    agencyCatalog,
  );
  return queryClient;
}

function renderPanel(
  queryClient: QueryClient,
  children: ReactNode = createElement(ClientAgencyRelationshipsPanel, {
    clientId: CLIENT_ID,
  }),
) {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: queryClient }, children),
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(useQuery).mockReset().mockImplementation(actualQueryHooks.useQuery);
  jest
    .mocked(useMutation)
    .mockReset()
    .mockImplementation(actualQueryHooks.useMutation);
  jest
    .mocked(useQueryClient)
    .mockReset()
    .mockImplementation(actualQueryHooks.useQueryClient);
});

describe('ClientAgencyRelationshipsPanel', () => {
  it('renders the active relationship and history and blocks new requests while active', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID),
      [
        relationship('active-1', 'ACTIVE', 'agency-active', 'Current Agency'),
        relationship('ended-1', 'TERMINATED', 'agency-old', 'Former Agency'),
      ],
    );

    const markup = renderPanel(queryClient);

    expect(markup).toContain('Current Agency');
    expect(markup).toContain('ACTIVE');
    expect(markup).toContain('Relationship history');
    expect(markup).toContain('Former Agency');
    expect(markup).toContain('Terminate relationship');
    expect(markup).not.toContain('Cancel request');
    expect(markup).toContain('Request relationship');
    expect(markup).toContain('disabled=""');
  });

  it('shows only the supported actions for invitations and outgoing requests', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID),
      [relationship('request-1', 'PENDING_REQUEST', 'agency-request', 'Request Agency')],
    );
    queryClient.setQueryData(
      clientAgencyRelationshipQueryKeys.invitations(CLIENT_ID),
      [managementRequest('invite-1', 'agency-invite', 'Inviting Agency')],
    );

    const markup = renderPanel(queryClient);

    expect(markup).toContain('Incoming invitations');
    expect(markup).toContain('Inviting Agency');
    expect(markup).toContain('Accept');
    expect(markup).toContain('Reject');
    expect(markup).toContain('Outgoing requests');
    expect(markup).toContain('Request Agency');
    expect(markup).toContain('Cancel request');
    expect(markup).not.toContain('Terminate relationship');
  });

  it('renders eligible Agencies and the empty relationship state', () => {
    const markup = renderPanel(makeQueryClient());

    expect(markup).toContain('You do not have an Agency relationship');
    expect(markup).toContain('Discover Agencies');
    expect(markup).toContain('New Agency');
    expect(markup).toContain('Request relationship');
  });

  it('renders loading, discovery-empty, query-error, and onboarding-pending states', async () => {
    const loadingMarkup = renderPanel(
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    expect(loadingMarkup).toContain('Loading Agency relationships');

    const emptyQueryClient = makeQueryClient();
    emptyQueryClient.setQueryData(
      clientAgencyRelationshipQueryKeys.agencies(CLIENT_ID),
      [],
    );
    expect(renderPanel(emptyQueryClient)).toContain(
      'No Agencies are currently available to request.',
    );

    const errorQueryClient = makeQueryClient();
    await expect(
      errorQueryClient.fetchQuery({
        queryKey: clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID),
        queryFn: async () => {
          throw new Error('Network unavailable');
        },
        retry: false,
      }),
    ).rejects.toThrow('Network unavailable');
    expect(renderPanel(errorQueryClient)).toContain('Could not load Agency');

    const pendingMarkup = renderPanel(
      makeQueryClient(),
      createElement(ClientAgencyRelationshipsPanel, {
        clientId: CLIENT_ID,
        onboardingPending: true,
      }),
    );
    expect(pendingMarkup).toContain(
      'Complete Client onboarding before managing Agency relationships.',
    );
    expect(pendingMarkup).not.toContain('Request relationship');
  });
});

describe('Client Agency relationship actions', () => {
  const response: AgencyRelationshipMutationResponse = {
    id: 'relationship-1',
    clientId: CLIENT_ID,
    organizationId: 'agency-1',
    status: 'TERMINATED',
    initiatedBy: 'CLIENT',
    startedAt: null,
    terminatedAt: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  it('dispatches each supported UI action to its matching Client API endpoint', async () => {
    const create = jest
      .spyOn(clientApi, 'createAgencyRequest')
      .mockResolvedValue(response);
    const accept = jest.spyOn(clientApi, 'acceptManagementRequest').mockResolvedValue({
      ...response,
      status: 'ACTIVE',
      initiatedBy: 'AGENCY',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const reject = jest
      .spyOn(clientApi, 'rejectManagementRequest')
      .mockResolvedValue(response);
    const cancel = jest
      .spyOn(clientApi, 'cancelAgencyRequest')
      .mockResolvedValue(response);
    const terminate = jest
      .spyOn(clientApi, 'terminateAgencyRelationship')
      .mockResolvedValue(response);

    await executeClientRelationshipAction(CLIENT_ID, {
      type: 'request',
      organizationId: 'agency-1',
    });
    await executeClientRelationshipAction(CLIENT_ID, {
      type: 'accept-invitation',
      relationshipId: 'invitation-1',
    });
    await executeClientRelationshipAction(CLIENT_ID, {
      type: 'reject-invitation',
      relationshipId: 'invitation-2',
    });
    await executeClientRelationshipAction(CLIENT_ID, {
      type: 'cancel-request',
      relationshipId: 'request-1',
    });
    await executeClientRelationshipAction(CLIENT_ID, { type: 'terminate' });

    expect(create).toHaveBeenCalledWith(CLIENT_ID, 'agency-1');
    expect(accept).toHaveBeenCalledWith(CLIENT_ID, 'invitation-1');
    expect(reject).toHaveBeenCalledWith(CLIENT_ID, 'invitation-2');
    expect(cancel).toHaveBeenCalledWith(CLIENT_ID, 'request-1');
    expect(terminate).toHaveBeenCalledWith(CLIENT_ID);
  });

  it('refreshes relationship, invitation, and Agency catalog queries after a mutation', async () => {
    const invalidations: unknown[][] = [];
    await refreshClientRelationshipQueries(
      async ({ queryKey }) => {
        invalidations.push([...queryKey]);
      },
      CLIENT_ID,
    );

    expect(invalidations).toEqual([
      clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID),
      clientAgencyRelationshipQueryKeys.invitations(CLIENT_ID),
      clientAgencyRelationshipQueryKeys.agencies(CLIENT_ID),
    ]);
  });

  it('handles a discovery request click, pending state, and confirmed success', async () => {
    let pending = false;
    const mutate = jest.fn((action: UiAction) => {
      expect(action).toEqual({
        type: 'request',
        organizationId: 'agency-new',
      });
      pending = true;
    });
    const data = new Map<string, unknown>([
      [JSON.stringify(clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID)), []],
      [JSON.stringify(clientAgencyRelationshipQueryKeys.invitations(CLIENT_ID)), []],
      [
        JSON.stringify(clientAgencyRelationshipQueryKeys.agencies(CLIENT_ID)),
        agencyCatalog,
      ],
    ]);
    const queryClient = new QueryClient();
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    const harness = mockPanelHooks(data, () => pending, mutate, queryClient);

    let tree = harness.render();
    clickButton(tree, 'Request relationship');
    expect(mutate).toHaveBeenCalledTimes(1);

    tree = harness.render();
    expect(findButtons(tree).every((button) => button.props.disabled)).toBe(true);

    pending = false;
    await harness.getMutationOptions()?.onSuccess?.(response, {
      type: 'request',
      organizationId: 'agency-new',
    });
    tree = harness.render();
    expect(treeText(tree)).toContain('Agency relationship request sent.');
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });

  it('requires explicit termination confirmation and reports success after mutation success', async () => {
    const activeRelationship = relationship(
      'active-1',
      'ACTIVE',
      'agency-active',
      'Current Agency',
    );
    const data = new Map<string, unknown>([
      [
        JSON.stringify(clientAgencyRelationshipQueryKeys.relationships(CLIENT_ID)),
        [activeRelationship],
      ],
      [JSON.stringify(clientAgencyRelationshipQueryKeys.invitations(CLIENT_ID)), []],
      [JSON.stringify(clientAgencyRelationshipQueryKeys.agencies(CLIENT_ID)), []],
    ]);
    const queryClient = new QueryClient();
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    const mutate = jest.fn();
    const harness = mockPanelHooks(data, () => false, mutate, queryClient);

    let tree = harness.render();
    const dialogBeforeClick = findElements(
      tree,
      (element) => element.type === Dialog,
    )[0];
    expect(
      (dialogBeforeClick?.props as { open?: boolean }).open,
    ).toBe(false);

    clickButton(tree, 'Terminate relationship');
    tree = harness.render();
    const dialog = findElements(tree, (element) => element.type === Dialog)[0];
    const dialogProps = dialog?.props as {
      open?: boolean;
      footer?: ReactNode;
    };
    expect(dialogProps.open).toBe(true);
    expect(mutate).not.toHaveBeenCalled();

    clickButton(dialogProps.footer, 'Confirm termination');
    expect(mutate).toHaveBeenCalledWith({ type: 'terminate' });
    expect(treeText(tree)).not.toContain('Agency relationship terminated.');

    await harness.getMutationOptions()?.onSuccess?.(response, {
      type: 'terminate',
    });
    tree = harness.render();
    expect(treeText(tree)).toContain('Agency relationship terminated.');
    expect(
      (findElements(tree, (element) => element.type === Dialog)[0]?.props as {
        open?: boolean;
      }).open,
    ).toBe(false);
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });
});
