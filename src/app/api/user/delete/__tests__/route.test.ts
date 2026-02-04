import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so hoisted mocks are initialized before import evaluation
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetServerSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockUserFindByIdAndDelete = vi.hoisted(() => vi.fn());
const mockArgumentFind = vi.hoisted(() => vi.fn());
const mockArgumentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockArgumentDeleteMany = vi.hoisted(() => vi.fn());
const mockCommentFind = vi.hoisted(() => vi.fn());
const mockCommentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockCommentDeleteMany = vi.hoisted(() => vi.fn());
const mockTopicUpdateMany = vi.hoisted(() => vi.fn());
const mockVoteFind = vi.hoisted(() => vi.fn());
const mockVoteDeleteMany = vi.hoisted(() => vi.fn());
const mockVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockFactDeleteMany = vi.hoisted(() => vi.fn());
const mockDeleteEvidenceFilesForDocuments = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockRenderEmail = vi.hoisted(() => vi.fn());
const mockIsValidObjectId = vi.hoisted(() => vi.fn((val: any) => val !== 'bad'));

vi.mock('mongoose', () => {
  class MockObjectId {
    value: string;
    constructor(value: string = 'mock-object-id') {
      this.value = value;
    }
    toString() {
      return this.value;
    }
  }

  return {
    __esModule: true,
    default: {
      Types: { ObjectId: MockObjectId },
      isValidObjectId: mockIsValidObjectId,
    },
    Types: { ObjectId: MockObjectId },
    isValidObjectId: mockIsValidObjectId,
  };
});

vi.mock('@/app/lib/mongoose', () => ({ dbConnect: mockDbConnect }));
vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/app/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
    findByIdAndDelete: mockUserFindByIdAndDelete,
  },
}));
vi.mock('@/app/models/argument', () => ({
  __esModule: true,
  default: {
    find: mockArgumentFind,
    findByIdAndUpdate: mockArgumentFindByIdAndUpdate,
    deleteMany: mockArgumentDeleteMany,
  },
}));
vi.mock('@/app/models/comment', () => ({
  __esModule: true,
  default: {
    find: mockCommentFind,
    findByIdAndUpdate: mockCommentFindByIdAndUpdate,
    deleteMany: mockCommentDeleteMany,
  },
}));
vi.mock('@/app/models/topic', () => ({
  __esModule: true,
  default: { updateMany: mockTopicUpdateMany },
}));
vi.mock('@/app/models/vote', () => ({
  __esModule: true,
  default: {
    find: mockVoteFind,
    deleteMany: mockVoteDeleteMany,
    countDocuments: mockVoteCountDocuments,
  },
}));
vi.mock('@/app/models/facts', () => ({
  __esModule: true,
  default: { deleteMany: mockFactDeleteMany },
}));
vi.mock('@/app/services/evidenceCleanupService', () => ({
  deleteEvidenceFilesForDocuments: mockDeleteEvidenceFilesForDocuments,
}));
vi.mock('@/app/services/emailService', () => ({
  sendEmail: mockSendEmail,
}));
vi.mock('@/app/emails/renderEmail', () => ({
  renderEmail: mockRenderEmail,
}));
vi.mock('@/app/emails/templates/AccountDeletedEmail', () => ({
  __esModule: true,
  default: vi.fn(({ name, deletedBy }: { name: string; deletedBy: string }) => `AccountDeletedEmail-${name}-${deletedBy}`),
}));

import { DELETE as userDelete } from '@/app/api/user/delete/route';

// Helper function to create chainable query mocks
function chainableQuery<T>(value: T) {
  const query: any = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  query.exec.mockResolvedValue(value);
  query.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(value).then(onFulfilled, onRejected);
  return query;
}

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function findChain<T>(value: T) {
  const chain: any = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  chain.exec.mockResolvedValue(value);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(value).then(onFulfilled, onRejected);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbConnect.mockResolvedValue(undefined);
  mockDeleteEvidenceFilesForDocuments.mockResolvedValue(undefined);
  mockRenderEmail.mockResolvedValue({ html: '<html></html>', text: 'text' });
  mockSendEmail.mockResolvedValue(undefined);
  mockArgumentDeleteMany.mockReturnValue(execResult({ deletedCount: 0 }));
  mockCommentDeleteMany.mockReturnValue(execResult({ deletedCount: 0 }));
  mockTopicUpdateMany.mockReturnValue(execResult({ modifiedCount: 0 }));
  mockVoteDeleteMany.mockReturnValue(execResult({ deletedCount: 0 }));
  mockFactDeleteMany.mockReturnValue(execResult({ deletedCount: 0 }));
  mockUserFindByIdAndDelete.mockReturnValue(execResult({ _id: 'user1' }));
  mockVoteCountDocuments.mockReturnValue(execResult(0));
  mockArgumentFindByIdAndUpdate.mockReturnValue(execResult(null));
  mockCommentFindByIdAndUpdate.mockReturnValue(execResult(null));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DELETE /api/user/delete', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('rejects when session has no email', async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'missing@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery(null));

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('deletes user and all associated content', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([{ _id: 'arg1', evidence: [] }]));
    mockCommentFind.mockReturnValue(findChain([{ _id: 'comment1', evidence: [] }]));
    mockVoteFind.mockReturnValue(findChain([]));

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(mockArgumentDeleteMany).toHaveBeenCalledWith({ createdBy: 'user1' });
    expect(mockCommentDeleteMany).toHaveBeenCalledWith({ createdBy: 'user1' });
    expect(mockTopicUpdateMany).toHaveBeenCalledWith({ createdBy: 'user1' }, { isActive: false });
    expect(mockVoteDeleteMany).toHaveBeenCalledWith({ user: 'user1' });
    expect(mockUserFindByIdAndDelete).toHaveBeenCalledWith('user1');
  });

  it('deletes facts associated with user content', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([{ _id: 'arg1', evidence: [] }]));
    mockCommentFind.mockReturnValue(findChain([{ _id: 'comment1', evidence: [] }]));
    mockVoteFind.mockReturnValue(findChain([]));

    await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(mockFactDeleteMany).toHaveBeenCalledWith({
      $or: [{ sourceArgument: { $in: ['arg1'] } }, { sourceComment: { $in: ['comment1'] } }],
    });
  });

  it('calls evidence cleanup service', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    const args = [{ _id: 'arg1', evidence: [{ url: 'http://example.com/file1' }] }];
    const comments = [{ _id: 'comment1', evidence: [{ url: 'http://example.com/file2' }] }];
    mockArgumentFind.mockReturnValue(findChain(args));
    mockCommentFind.mockReturnValue(findChain(comments));
    mockVoteFind.mockReturnValue(findChain([]));

    await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(mockDeleteEvidenceFilesForDocuments).toHaveBeenCalledWith([...args, ...comments]);
  });

  it('sends deletion confirmation email', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockVoteFind.mockReturnValue(findChain([]));

    await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(mockRenderEmail).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Your Consensus Engine account has been deleted',
      expect.any(String),
      expect.any(String)
    );
  });

  it('uses fallback name when user has no name', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: null })
    );
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockVoteFind.mockReturnValue(findChain([]));

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(200);
    // Should still succeed even without a name
  });

  it('recalculates vote counts for affected content', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockVoteFind.mockReturnValue(
      findChain([
        { targetId: { toString: () => 'arg1' }, targetType: 'Argument' },
        { targetId: { toString: () => 'comment1' }, targetType: 'Comment' },
      ])
    );

    await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(mockVoteCountDocuments).toHaveBeenCalled();
    expect(mockArgumentFindByIdAndUpdate).toHaveBeenCalled();
    expect(mockCommentFindByIdAndUpdate).toHaveBeenCalled();
  });

  it('handles email send failure gracefully', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockVoteFind.mockReturnValue(findChain([]));
    mockSendEmail.mockRejectedValue(new Error('Email service down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to send deletion email', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: 'user1', email: 'user@test.com', name: 'Test User' })
    );
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockImplementation(() => {
      throw new Error('Database error');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await userDelete(new Request('http://localhost/api/user/delete', { method: 'DELETE' }) as any);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to delete account');

    consoleSpy.mockRestore();
  });
});
