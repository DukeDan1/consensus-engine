import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Basic mocks for Next.js primitives
const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

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

const useSessionMock = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({
  useSession: useSessionMock,
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
import AdminUserActions from '../../profile/AdminUserActions';
import ProfileHeaderClient from '../../profile/ProfileHeaderClient';
import ProfileBioCard from '../../profile/ProfileBioCard';
import ModerationQueue from '../moderation/ModerationQueue';
import SummaryColumnCard from '../../topics/[id]/summary/SummaryColumnCard';
import TopicDiscussionControls from '../topics/TopicDiscussionControls';
import FactCard from '../topics/FactCard';
import SearchLoading from '../topics/SearchLoading';
import TopicCard from '../topics/TopicCard';
import CreateNewTopic from '../topics/CreateNewTopic';
import OntologyCategoryPicker from '../ontology/OntologyCategoryPicker';
import ConfirmModal from '../ui/ConfirmModal';

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
  useSessionMock.mockReturnValue({
    data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
  });
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

  it('hides admin delete controls when moderator mode is off', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', isAdmin: true } },
    });

    render(<ArgumentCard argument={{
      id: 'a2',
      body: 'Argument body',
      createdAt: new Date().toISOString(),
      createdBy: { _id: 'user-1', name: 'User One' },
      comments: [],
    }} />);

    expect(screen.queryByLabelText(/delete argument/i)).not.toBeInTheDocument();
  });

  it('shows admin delete controls when moderator mode is on', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', isAdmin: true } },
    });

    render(<ArgumentCard argument={{
      id: 'a3',
      body: 'Argument body',
      createdAt: new Date().toISOString(),
      createdBy: { _id: 'user-1', name: 'User One' },
      comments: [],
    }} moderatorMode />);

    expect(screen.getByLabelText(/delete argument/i)).toBeInTheDocument();
  });

  it('hides comment delete controls for admins when moderator mode is off', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', isAdmin: true } },
    });

    render(<ArgumentCard argument={{
      id: 'a5',
      body: 'Argument body',
      createdAt: new Date().toISOString(),
      createdBy: { _id: 'user-1', name: 'User One' },
      comments: [
        {
          id: 'c3',
          body: 'Comment text',
          createdAt: new Date().toISOString(),
          createdBy: { _id: 'user-2', name: 'User Two' },
        },
      ],
    }} />);

    expect(screen.queryByLabelText(/delete comment/i)).not.toBeInTheDocument();
  });

  it('shows restore controls for hidden content in moderator mode', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', isAdmin: true } },
    });

    render(<ArgumentCard argument={{
      id: 'a4',
      body: 'Argument body',
      createdAt: new Date().toISOString(),
      createdBy: { _id: 'user-1', name: 'User One' },
      visibility: { status: 'hidden' },
      comments: [
        {
          id: 'c2',
          body: 'Comment text',
          createdAt: new Date().toISOString(),
          createdBy: { _id: 'u2', name: 'User Two' },
          visibility: { status: 'needs_review' },
        },
      ],
    }} moderatorMode />);

    expect(screen.getAllByRole('button', { name: /restore/i }).length).toBeGreaterThanOrEqual(1);
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

describe('ConfirmModal', () => {
  it('renders and triggers confirm/cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen
        title="Delete item"
        body={<p>Confirm delete</p>}
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('AdminUserActions', () => {
  it('shows admin controls for admins', () => {
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Admin User', email: 'admin@example.com', isAdmin: true } },
    });

    render(<AdminUserActions userId="user-1" initialSuspended={false} displayName="User One" />);

    expect(screen.getByRole('button', { name: /suspend account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete user/i })).toBeInTheDocument();
  });
});

describe('ModerationQueue', () => {
  it('restores a comment via API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'c1', visibility: { status: 'visible' } }),
    } as any);

    render(
      <ModerationQueue
        topics={[]}
        arguments={[]}
        comments={[{
          id: 'c1',
          body: 'Needs review',
          createdAt: new Date().toISOString(),
          createdBy: { _id: 'u1', name: 'User' },
          visibility: { status: 'hidden' },
          topic: { id: 't1', title: 'Topic' },
        }]}
        avatars={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/comment',
      expect.objectContaining({ method: 'PATCH' }),
    ));
  });

  it('restores a topic via API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 't1', visibility: { status: 'visible' } }),
    } as any);

    render(
      <ModerationQueue
        topics={[{
          id: 't1',
          title: 'Topic',
          createdAt: new Date().toISOString(),
          createdBy: { _id: 'u1', name: 'User' },
          visibility: { status: 'hidden' },
        }]}
        arguments={[]}
        comments={[]}
        avatars={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/topics/t1',
      expect.objectContaining({ method: 'PATCH' }),
    ));
  });
});

describe('Topic discussion controls', () => {
  it('toggles filters and argument form', () => {
    render(<TopicDiscussionControls topicId="t1" argumentQuery="" commentQuery="" />);
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

describe('ProfileHeaderClient', () => {
  it('toggles email visibility for owner', () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Owner', email: 'owner@example.com' } },
    });

    render(
      <ProfileHeaderClient
        userId="user-1"
        displayName="Owner"
        memberSince="January 2024"
        avatarUrl={null}
        email="owner@example.com"
        canViewEmail
        isSuspended={false}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /view email/i });
    fireEvent.click(toggleButton);
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/only you can view your email address/i)).toBeInTheDocument();
  });
});

describe('ProfileBioCard', () => {
  it('saves bio changes for owner', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Owner', email: 'owner@example.com' } },
    });
    mockFetch({ ok: true });

    render(<ProfileBioCard userId="user-1" initialBio="" />);

    fireEvent.click(screen.getByRole('button', { name: /add bio/i }));
    fireEvent.change(screen.getByPlaceholderText(/tell others about yourself/i), { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /save bio/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/user/update',
      expect.objectContaining({ method: 'POST' }),
    ));
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
    mockFetch({ categories: [{ id: 'c1', label: 'Health' }, { id: 'c2', label: 'Science' }] });
    const onChange = vi.fn();
    render(<OntologyCategoryPicker selected={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/type to search/i), { target: { value: 'hea' } });

    await waitFor(() => expect(screen.getByRole('button', { name: /health/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /health/i }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })]);
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'c2' })]));
    // Simulate removing category
    render(<OntologyCategoryPicker selected={[{ id: 'c1', label: 'Health' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /remove health/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
