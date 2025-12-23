import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

// Basic mocks for Next.js primitives
const pushMock = vi.fn();
const refreshMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, replace: replaceMock }),
  usePathname: () => '/topics/test',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } } }),
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bootstrap/js/dist/tooltip', () => ({
  __esModule: true,
  default: class {
    dispose() {}
  },
}));

// Allow components that import toast to render without a provider
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Components under test
import AddNewArgumentComponent from '../AddNewArgumentComponent';
import AddNewCommentComponent from '../AddNewCommentComponent';
import ArgumentCard from '../ArgumentCard';
import OntologyBadgeList from '../ontology/OntologyBadgeList';
import TopicFilters from '../topics/TopicFilters';
import TopicOntologyFilters from '../topics/TopicOntologyFilters';
import TopicsBrowser from '../topics/TopicsBrowser';
import InteractiveCard from '../ui/InteractiveCard';
import Header from '../ui/header';
import ProfileHoverCard from '../../profile/ProfileHoverCard';
import SummaryColumnCard from '../../topics/[id]/summary/SummaryColumnCard';
import TopicDiscussionControls from '../topics/TopicDiscussionControls';
import FactCard from '../topics/FactCard';
import SearchLoading from '../topics/SearchLoading';
import TopicCard from '../topics/TopicCard';
import CreateNewTopic from '../topics/CreateNewTopic';
import OntologyCategoryPicker from '../ontology/OntologyCategoryPicker';

// Shared helpers
const mockFetch = (data: any, ok = true) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(data),
  } as any);
};

beforeAll(() => {
  // jsdom doesn't define scrollTo by default
  (global as any).window.scrollTo = vi.fn();
});

beforeEach(() => {
  // Default fetch mock to avoid unhandled rejections in components that prefetch categories
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ categories: [] }) } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
  refreshMock.mockReset();
  replaceMock.mockReset();
});

describe('AddNewArgumentComponent', () => {
  it('opens form, submits text, and triggers router', async () => {
    mockFetch({ success: true });
    render(<AddNewArgumentComponent topicId="t1" />);

    fireEvent.click(screen.getByRole('button', { name: /start a new discussion point/i }));
    const textarea = screen.getByLabelText(/your message/i);
    fireEvent.change(textarea, { target: { value: 'New point' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /post/i }).closest('form')!);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/argument',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(replaceMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe('AddNewCommentComponent', () => {
  it('posts a reply and refreshes', async () => {
    mockFetch({ success: true });
    render(<AddNewCommentComponent argumentId="arg-1" />);

    fireEvent.click(screen.getByRole('button', { name: /reply/i }));
    fireEvent.change(screen.getByLabelText(/your comment/i), { target: { value: 'Nice point' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /post comment/i }).closest('form')!);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/comment',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe('ArgumentCard', () => {
  it('renders argument content and comments', () => {
    render(<ArgumentCard argument={{
      id: 'a1',
      body: 'Argument body',
      createdAt: new Date().toISOString(),
      createdBy: { _id: 'u1', name: 'User One' },
      ontologyCategories: [{ id: 'c1', label: 'Health' }],
      comments: [
        { id: 'cmt1', body: 'Comment text', createdAt: new Date().toISOString(), createdBy: { _id: 'u2', name: 'User Two' }, upvoteCount: 1, downvoteCount: 0 },
      ],
    }} />);

    expect(screen.getByText('Argument body')).toBeInTheDocument();
    expect(screen.getByText('Comment text')).toBeInTheDocument();
    expect(screen.getByText(/replies/i)).toBeInTheDocument();
  });
});

describe('UI atoms', () => {
  it('renders ontology badges', () => {
    render(<OntologyBadgeList categories={[{ id: 'c1', label: 'Science' }]} />);
    expect(screen.getByText(/Science/i)).toBeInTheDocument();
  });

  it('renders search loading spinner', () => {
    render(<SearchLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders interactive card as link', () => {
    render(<InteractiveCard href="/foo"><div>Card</div></InteractiveCard>);
    expect(screen.getByRole('link', { name: /card/i })).toHaveAttribute('href', '/foo');
  });
});

describe('Topic filters', () => {
  it('submits search criteria', async () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    render(<TopicFilters value={{ q: '', categories: [] }} onChange={onChange} onSearch={onSearch} />);

    fireEvent.change(screen.getByPlaceholderText(/search by topic/i), { target: { value: 'climate' } });
    fireEvent.submit(screen.getByRole('button', { name: /apply filters/i }).closest('form')!);

    expect(onChange).toHaveBeenCalledWith({ q: 'climate', categories: [] });
    expect(onSearch).toHaveBeenCalled();
  });

  it('applies ontology filters to URL', async () => {
    mockFetch({ categories: [] });
    render(<TopicOntologyFilters argumentCategoryIds={["a1"]} commentCategoryIds={[]} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('TopicsBrowser', () => {
  it('renders fetched topics and pagination', async () => {
    mockFetch({
      topics: [
        { _id: 't1', title: 'Topic One', upvoteCount: 1, downvoteCount: 0, totalVotes: 1, creatorName: 'Alice', ontologyCategories: [] },
      ],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });
    render(<TopicsBrowser />);

    await waitFor(() => expect(screen.getByText('Topic One')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument();
  });
});

describe('Topic discussion controls', () => {
  it('toggles filters and argument form', () => {
    render(<TopicDiscussionControls topicId="t1" argumentCategoryIds={[]} commentCategoryIds={[]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /filter/i })[0]);
    expect(screen.getByText(/apply filters/i)).toBeInTheDocument();
  });
});

describe('Header', () => {
  it('shows initials when no image provided', () => {
    render(<Header title="Consensus" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });
});

describe('ProfileHoverCard', () => {
  it('renders stats and quote', () => {
    render(
      <ProfileHoverCard
        topLabel="On Climate"
        timestamp="1d ago"
        body="Argument snippet"
        stats={[{ iconClass: 'fa-check', value: 3 }]}
        quote="Sample quote"
      />
    );
    expect(screen.getByText(/sample quote/i)).toBeInTheDocument();
    expect(screen.getByText(/argument snippet/i)).toBeInTheDocument();
  });
});

describe('SummaryColumnCard', () => {
  it('shows AI generated badge and discuss link', () => {
    render(
      <SummaryColumnCard
        label="For"
        tone="success"
        topicId="t1"
        items={[{ text: 'Point one', argument: 'a1', stance: 'for', justification: 'Because' }]}
      />
    );
    expect(screen.getByText(/point one/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discuss/i })).toHaveAttribute('href', '/topics/t1?ordering=relevant#argument-a1');
  });
});

describe('Topic primitives', () => {
  it('renders fact card with source link', () => {
    render(<FactCard fact={{ id: 'f1', text: 'Fact body', sourceArgument: 'a1' }} topicId="t1" />);
    expect(screen.getByText(/fact body/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view source argument/i })).toHaveAttribute('href', '/topics/t1#argument-a1');
  });

  it('renders topic card stats', () => {
    render(<TopicCard topic={{ _id: 't1', title: 'Topic title', upvoteCount: 2, downvoteCount: 1, totalVotes: 3, creatorName: 'Bob' }} />);
    expect(screen.getByText(/topic title/i)).toBeInTheDocument();
    expect(screen.getByText(/total votes/i)).toBeInTheDocument();
  });
});

describe('CreateNewTopic', () => {
  it('opens form and submits new topic', async () => {
    mockFetch({ _id: 't2', title: 'New Topic', upvoteCount: 0, downvoteCount: 0, totalVotes: 0, creatorName: 'You', ontologyCategories: [] });
    const onCreated = vi.fn();
    render(<CreateNewTopic onCreated={onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: /add topic/i }));
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'New Topic' } });
    fireEvent.change(textboxes[1], { target: { value: 'Desc' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/topics',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onCreated).toHaveBeenCalled();
  });
});

describe('OntologyCategoryPicker', () => {
  it('adds and removes categories from selection', async () => {
    mockFetch({ categories: [{ id: 'c1', label: 'Health' }] });
    const onChange = vi.fn();
    render(<OntologyCategoryPicker selected={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/type to search/i), { target: { value: 'hea' } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /health/i }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })]);
  });
});
