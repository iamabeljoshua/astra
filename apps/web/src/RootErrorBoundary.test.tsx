import { useMutation, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/apiError';
import { RootErrorBoundary } from './RootErrorBoundary';
import { APP_ERROR_LABELS, PRODUCT_NAME } from './strings';
import { renderWithQueryClient } from './test/renderWithQueryClient';

const SCREEN_TEXT = 'The screen';

function ScreenThatThrows(): ReactElement {
  throw new Error('a bug in a screen');
}

function ScreenWithQuery({ queryError }: { queryError: Error }) {
  const { error } = useQuery({
    queryKey: ['thing'],
    queryFn: () => Promise.reject(queryError),
  });
  return <p>{error ? SCREEN_TEXT : null}</p>;
}

function ScreenWithMutation({ mutationError }: { mutationError: Error }) {
  const { mutate, error } = useMutation({ mutationFn: () => Promise.reject(mutationError) });
  useEffect(() => mutate(), [mutate]);
  return <p>{error ? SCREEN_TEXT : null}</p>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RootErrorBoundary', () => {
  it('announces a heading and a calm line, with a reload control, in place of a crashed screen', () => {
    render(
      <RootErrorBoundary>
        <ScreenThatThrows />
      </RootErrorBoundary>,
    );

    const announcement = within(screen.getByRole('alert'));
    announcement.getByRole('heading', { level: 1, name: APP_ERROR_LABELS.heading });
    announcement.getByText(APP_ERROR_LABELS.message);
    screen.getByRole('button', { name: APP_ERROR_LABELS.reload });
    expect(document.title).toBe(PRODUCT_NAME);
  });

  it('reloads the page from the reload control', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <RootErrorBoundary>
        <ScreenThatThrows />
      </RootErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: APP_ERROR_LABELS.reload }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves a working screen alone', () => {
    render(
      <RootErrorBoundary>
        <p>{SCREEN_TEXT}</p>
      </RootErrorBoundary>,
    );

    screen.getByText(SCREEN_TEXT);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the shared throwOnError default', () => {
  it.each([
    ['a query', <ScreenWithQuery key="query" queryError={new TypeError('a bug in a query')} />],
    ['a mutation', <ScreenWithMutation key="mutation" mutationError={new TypeError('a bug in a mutation')} />],
  ])('sends a plain error from %s to the boundary', async (_name, screenWithError) => {
    renderWithQueryClient(<RootErrorBoundary>{screenWithError}</RootErrorBoundary>);

    await screen.findByRole('alert');
  });

  it.each([
    ['a query', <ScreenWithQuery key="query" queryError={new ApiError({ kind: 'server', status: 500 })} />],
    ['a mutation', <ScreenWithMutation key="mutation" mutationError={new ApiError({ kind: 'server', status: 500 })} />],
  ])('keeps an ApiError from %s on the screen', async (_name, screenWithError) => {
    renderWithQueryClient(<RootErrorBoundary>{screenWithError}</RootErrorBoundary>);

    await screen.findByText(SCREEN_TEXT);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
