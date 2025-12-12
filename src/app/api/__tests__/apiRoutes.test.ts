import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so hoisted mocks are initialized before import evaluation
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetServerSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockUserFind = vi.hoisted(() => vi.fn());
const mockArgumentCreate = vi.hoisted(() => vi.fn());
const mockArgumentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockTopicFindById = vi.hoisted(() => vi.fn());
const mockTopicFindOne = vi.hoisted(() => vi.fn());
const mockTopicCountDocuments = vi.hoisted(() => vi.fn());
const mockTopicCreate = vi.hoisted(() => vi.fn());
const mockCommentCreate = vi.hoisted(() => vi.fn());
const mockCommentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockVoteInit = vi.hoisted(() => vi.fn());
const mockVoteFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockTrackBackgroundTask = vi.hoisted(() => vi.fn());
const mockClassifyTextToOntology = vi.hoisted(() => vi.fn());
const mockClassificationToAssignments = vi.hoisted(() => vi.fn());
const mockGetAIAnalysisForArgument = vi.hoisted(() => vi.fn());
const mockFactFindOne = vi.hoisted(() => vi.fn());
const mockFactCreate = vi.hoisted(() => vi.fn());
const mockFindUserByEmailOrPhone = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockMongooseConnect = vi.hoisted(() => vi.fn());
const mockCollection = vi.hoisted(() => vi.fn());
const mockAggregate = vi.hoisted(() => vi.fn());

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

  const connection = { collection: mockCollection };

  return {
    __esModule: true,
    default: { connect: mockMongooseConnect, connection, Types: { ObjectId: MockObjectId } },
    connection,
    Types: { ObjectId: MockObjectId }
  };
});

vi.mock('@/app/lib/mongoose', () => ({ dbConnect: mockDbConnect }));
vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/app/models/user', () => ({ __esModule: true, default: { findOne: mockUserFindOne, find: mockUserFind } }));
vi.mock('@/app/models/argument', () => ({ Argument: { create: mockArgumentCreate, findByIdAndUpdate: mockArgumentFindByIdAndUpdate }, ArgumentSide: { for: 'for', against: 'against', neutral: 'neutral' } }));
vi.mock('@/app/models/topic', () => ({ Topic: { countDocuments: mockTopicCountDocuments, findOne: mockTopicFindOne, findById: mockTopicFindById, create: mockTopicCreate } }));
vi.mock('@/app/models/comment', () => ({ Comment: { create: mockCommentCreate, findByIdAndUpdate: mockCommentFindByIdAndUpdate } }));
vi.mock('@/app/models/vote', () => ({ Vote: { init: mockVoteInit, findOneAndUpdate: mockVoteFindOneAndUpdate, countDocuments: mockVoteCountDocuments } }));
vi.mock('@/app/models/facts', () => ({ Fact: { findOne: mockFactFindOne, create: mockFactCreate } }));
vi.mock('@/app/services/ontologyClassificationService', () => ({ classifyTextToOntology: mockClassifyTextToOntology, classificationToAssignments: mockClassificationToAssignments }));
vi.mock('@/app/services/openaiService', () => ({ getAIAnalysisForArgument: mockGetAIAnalysisForArgument }));
vi.mock('@/app/lib/backgroundTasks', () => ({ trackBackgroundTask: mockTrackBackgroundTask }));
vi.mock('@/app/services/authService', () => ({ findUserByEmailOrPhone: mockFindUserByEmailOrPhone, createUser: mockCreateUser }));

import { POST as argumentPost } from '@/app/api/argument/route';
import { POST as commentPost } from '@/app/api/comment/route';
import { GET as topicsGet, POST as topicsPost } from '@/app/api/topics/route';
import { GET as topTopicsGet } from '@/app/api/top-topics/route';
import { POST as votePost } from '@/app/api/vote/route';
import { GET as authGet } from '@/app/api/auth/route';

function chainableQuery<T>(value: T) {
  const query: any = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn()
  };
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  query.exec.mockResolvedValue(value);
  return query;
}

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONGODB_URI = 'mongodb://localhost/test';
  mockDbConnect.mockResolvedValue(undefined);
  mockMongooseConnect.mockResolvedValue(undefined);
  mockClassifyTextToOntology.mockResolvedValue([]);
  mockClassificationToAssignments.mockReturnValue([]);
  mockGetAIAnalysisForArgument.mockResolvedValue({
    isFact: false,
    factualPart: '',
    side: 'neutral',
    aiSummary: 'summary',
    justification: 'because'
  });
  mockTrackBackgroundTask.mockImplementation(() => {});
  mockCollection.mockReturnValue({ aggregate: mockAggregate });
  mockAggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/argument', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('rejects unauthenticated requests', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ topicId, body: 'content' })
    });

    const res = await argumentPost(req as any);

    expect(res.status).toBe(401);
  });

  it('creates an argument and schedules background work', async () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Test User' }));
    mockTopicFindById.mockReturnValue(chainableQuery({ title: 'Topic title' }));
    mockArgumentCreate.mockResolvedValue({
      _id: 'arg1',
      side: 'for',
      body: 'trimmed body',
      createdAt,
      ontologyCategories: []
    });
    mockFactFindOne.mockReturnValue(execResult(null));

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ topicId, body: '  trimmed body  ', side: 'for' })
    });

    const res = await argumentPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockArgumentCreate).toHaveBeenCalledWith({
      topic: expect.anything(),
      side: 'for',
      body: 'trimmed body',
      createdBy: 'user1',
      upvoteCount: 0,
      downvoteCount: 0,
      score: 0,
      ontologyCategories: []
    });
    expect(mockTrackBackgroundTask).toHaveBeenCalledTimes(1);
    expect(json).toMatchObject({
      id: 'arg1',
      side: 'for',
      body: 'trimmed body',
      createdBy: { _id: 'user1', name: 'Test User' },
      ontologyCategories: []
    });
    expect(json.createdAt).toBe(createdAt.toISOString());
  });
});

describe('POST /api/comment', () => {
  const argumentId = '507f1f77bcf86cd799439011';

  it('validates payload', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Test User' }));

    const req = new Request('http://localhost/api/comment', { method: 'POST', body: JSON.stringify({}) });
    const res = await commentPost(req as any);

    expect(res.status).toBe(400);
  });

  it('creates a comment', async () => {
    const createdAt = new Date('2024-02-02T00:00:00.000Z');
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Commenter' }));
    mockCommentCreate.mockResolvedValue({ _id: 'c1', body: 'hello world', createdAt, ontologyCategories: [] });

    const req = new Request('http://localhost/api/comment', {
      method: 'POST',
      body: JSON.stringify({ argumentId, body: 'hello world' })
    });

    const res = await commentPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      id: 'c1',
      body: 'hello world',
      createdBy: { _id: 'user1', name: 'Commenter' }
    });
    expect(mockCommentCreate).toHaveBeenCalledWith({
      argument: expect.anything(),
      parent: undefined,
      body: 'hello world',
      createdBy: 'user1',
      ontologyCategories: []
    });
  });
});

describe('GET /api/topics', () => {
  it('returns paginated topics', async () => {
    mockTopicCountDocuments.mockReturnValue(execResult(2));
    const toArray = vi.fn().mockResolvedValue([
      { _id: 't1', title: 'Topic 1', upvoteCount: 1, downvoteCount: 0, totalVotes: 1, creatorName: 'Alice', ontologyCategories: [] }
    ]);
    mockAggregate.mockReturnValue({ toArray });

    const res = await topicsGet({ url: 'http://localhost/api/topics?page=2&pageSize=1' } as any);
    const json = await res.json();

    expect(mockCollection).toHaveBeenCalledWith('topics');
    expect(res.status).toBe(200);
    expect(json.topics).toHaveLength(1);
    expect(json.total).toBe(2);
    expect(json.page).toBe(2);
    expect(json.totalPages).toBe(2);
  });
});

describe('POST /api/topics', () => {
  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/topics', { method: 'POST', body: JSON.stringify({ title: 'Test' }) });
    const res = await topicsPost(req as any);

    expect(res.status).toBe(401);
  });

  it('creates a topic and queues classification', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Creator' }));

    const findOneQuery: any = { select: vi.fn(), lean: vi.fn() };
    findOneQuery.select.mockReturnValue(findOneQuery);
    findOneQuery.lean.mockResolvedValue(null);
    mockTopicFindOne.mockReturnValue(findOneQuery);

    const createdAt = new Date('2024-03-03T00:00:00.000Z');
    mockTopicCreate.mockResolvedValue({
      _id: 'topic1',
      title: 'New Topic',
      description: 'desc',
      ontologyCategories: [],
      createdAt
    });

    const req = new Request('http://localhost/api/topics', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Topic', description: 'desc' })
    });

    const res = await topicsPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      id: 'topic1',
      title: 'New Topic',
      description: 'desc',
      creatorName: 'Creator'
    });
    expect(mockTrackBackgroundTask).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/top-topics', () => {
  it('returns aggregated topics', async () => {
    const toArray = vi.fn().mockResolvedValue([{ _id: 't1', title: 'Top topic' }]);
    mockAggregate.mockReturnValue({ toArray });

    const res = await topTopicsGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topics).toEqual([{ _id: 't1', title: 'Top topic' }]);
  });
});

describe('POST /api/vote', () => {
  const targetId = '507f1f77bcf86cd799439011';

  it('validates payload', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));

    const req = new Request('http://localhost/api/vote', { method: 'POST', body: JSON.stringify({}) });
    const res = await votePost(req as any);

    expect(res.status).toBe(400);
  });

  it('records a vote and updates counts', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));
    mockVoteInit.mockResolvedValue(undefined);
    mockVoteFindOneAndUpdate.mockReturnValue(execResult(undefined));
    mockVoteCountDocuments
      .mockReturnValueOnce(execResult(3))
      .mockReturnValueOnce(execResult(1));

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Argument', targetId, value: 1 })
    });

    const res = await votePost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ upvoteCount: 3, downvoteCount: 1 });
    expect(mockArgumentFindByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), {
      upvoteCount: 3,
      downvoteCount: 1,
      score: 2
    });
  });
});

describe('GET /api/auth', () => {
  it('returns an existing user', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValue({ id: 'user1' });
    mockCreateUser.mockResolvedValue({ id: 'new-user' });

    const req = new Request('http://localhost/api/auth?email=a@test.com', {
      method: 'GET'
    });

    const res = await authGet(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user).toEqual({ id: 'user1' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('creates a user when missing', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ id: 'created' });

    const req = new Request('http://localhost/api/auth?email=b@test.com', {
      method: 'GET'
    });

    const res = await authGet(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user).toEqual({ id: 'created' });
    expect(mockCreateUser).toHaveBeenCalledWith({ email: 'b@test.com', phone: undefined });
  });
});
