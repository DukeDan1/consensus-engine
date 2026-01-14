import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FeaturedTopics from '../FeaturedTopics';

// Mock the TopicCard component
vi.mock('@/app/components/topics/TopicCard', () => ({
  __esModule: true,
  default: ({ topic }: any) => (
    <div data-testid={`topic-card-${topic._id}`}>
      <h3>{topic.title}</h3>
      <span>Upvotes: {topic.upvoteCount}</span>
      <span>Downvotes: {topic.downvoteCount}</span>
    </div>
  ),
}));

const mockTopics = [
  {
    _id: '1',
    title: 'Should we adopt renewable energy?',
    upvoteCount: 42,
    downvoteCount: 8,
    totalVotes: 50,
    creatorName: 'John Doe',
    ontologyCategories: [{ id: 'energy', label: 'Energy', description: 'Energy topics' }],
  },
  {
    _id: '2',
    title: 'Is remote work better than office work?',
    upvoteCount: 35,
    downvoteCount: 15,
    totalVotes: 50,
    creatorName: 'Jane Smith',
    ontologyCategories: [{ id: 'work', label: 'Work', description: 'Work topics' }],
  },
];

describe('FeaturedTopics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading spinner while fetching topics', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // Never resolves
    render(<FeaturedTopics />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading topics/i)).toBeInTheDocument();
  });

  it('displays topics after successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ topics: mockTopics, total: 2 }),
    });

    render(<FeaturedTopics />);

    await waitFor(() => {
      expect(screen.getByTestId('topic-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('topic-card-2')).toBeInTheDocument();
    });

    expect(screen.getByText('Should we adopt renewable energy?')).toBeInTheDocument();
    expect(screen.getByText('Is remote work better than office work?')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Network error' }),
    });

    render(<FeaturedTopics />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('displays info message when no topics are available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ topics: [], total: 0 }),
    });

    render(<FeaturedTopics />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/no topics available yet/i)).toBeInTheDocument();
    });
  });

  it('fetches topics with correct parameters', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ topics: mockTopics, total: 2 }),
    });
    global.fetch = mockFetch;

    render(<FeaturedTopics />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/topics?page=1&pageSize=6',
        { cache: 'no-store' }
      );
    });
  });

  it('handles fetch rejection gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection failed'));

    render(<FeaturedTopics />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
    });
  });
});
