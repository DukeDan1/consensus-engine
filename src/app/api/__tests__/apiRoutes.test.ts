import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so hoisted mocks are initialized before import evaluation
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetServerSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockUserFind = vi.hoisted(() => vi.fn());
const mockUserFindById = vi.hoisted(() => vi.fn());
const mockUserFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockArgumentCreate = vi.hoisted(() => vi.fn());
const mockArgumentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockArgumentFind = vi.hoisted(() => vi.fn());
const mockArgumentFindById = vi.hoisted(() => vi.fn());
const mockArgumentAggregate = vi.hoisted(() => vi.fn());
const mockTopicFindById = vi.hoisted(() => vi.fn());
const mockTopicFindOne = vi.hoisted(() => vi.fn());
const mockTopicFind = vi.hoisted(() => vi.fn());
const mockTopicCountDocuments = vi.hoisted(() => vi.fn());
const mockTopicCreate = vi.hoisted(() => vi.fn());
const mockCommentCreate = vi.hoisted(() => vi.fn());
const mockCommentFind = vi.hoisted(() => vi.fn());
const mockCommentFindById = vi.hoisted(() => vi.fn());
const mockCommentFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockCommentDistinct = vi.hoisted(() => vi.fn());
const mockCommentAggregate = vi.hoisted(() => vi.fn());
const mockNotificationFind = vi.hoisted(() => vi.fn());
const mockNotificationInsertMany = vi.hoisted(() => vi.fn());
const mockNotificationUpdateMany = vi.hoisted(() => vi.fn());
const mockNotificationSubscriptionFind = vi.hoisted(() => vi.fn());
const mockNotificationSubscriptionFindOne = vi.hoisted(() => vi.fn());
const mockNotificationSubscriptionUpdateOne = vi.hoisted(() => vi.fn());
const mockUserFollowFind = vi.hoisted(() => vi.fn());
const mockUserFollowAggregate = vi.hoisted(() => vi.fn());
const mockUserFollowUpdateOne = vi.hoisted(() => vi.fn());
const mockUserFollowDeleteOne = vi.hoisted(() => vi.fn());
const mockVoteInit = vi.hoisted(() => vi.fn());
const mockVoteFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockTopicFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockTrackBackgroundTask = vi.hoisted(() => vi.fn());
const mockClassifyTextToOntology = vi.hoisted(() => vi.fn());
const mockClassificationToAssignments = vi.hoisted(() => vi.fn());
const mockGetAIAnalysisForArgument = vi.hoisted(() => vi.fn());
const mockFactFindOne = vi.hoisted(() => vi.fn());
const mockFactCreate = vi.hoisted(() => vi.fn());
const mockFactFind = vi.hoisted(() => vi.fn());
const mockGetSignedReadUrlFromUrl = vi.hoisted(() => vi.fn());
const mockDeleteFileFromUrl = vi.hoisted(() => vi.fn());
const mockFindUserByEmailOrPhone = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockHashPassword = vi.hoisted(() => vi.fn());
const mockComparePassword = vi.hoisted(() => vi.fn());
const mockMongooseConnect = vi.hoisted(() => vi.fn());
const mockCollection = vi.hoisted(() => vi.fn());
const mockAggregate = vi.hoisted(() => vi.fn());
const mockIsValidObjectId = vi.hoisted(() => vi.fn((val: any) => val !== 'bad'));
const mockModelsObj = vi.hoisted(() => ({} as Record<string, any>));
const mockModel = vi.hoisted(() => vi.fn((name: string, schema: any) => {
  mockModelsObj[name] = schema;
  return schema;
}));
const mockGetOntologyCategories = vi.hoisted(() => vi.fn());
const mockGetTopicSummary = vi.hoisted(() => vi.fn());
const mockNextAuth = vi.hoisted(() => vi.fn());
const mockGenerateProfileImage = vi.hoisted(() => vi.fn());
const mockCredentialsProvider = vi.hoisted(() => vi.fn((opts) => opts));
const mockMongoDbAdapter = vi.hoisted(() => vi.fn(() => 'adapter'));
const mockGetConnectedMongoClient = vi.hoisted(() => vi.fn(() => ({ client: 'mongo' })));
const mockHasTopicModeratorRole = vi.hoisted(() => vi.fn());
const mockMaybeAutoPromoteModerator = vi.hoisted(() => vi.fn());
const mockMaybeDemoteModeratorForTopic = vi.hoisted(() => vi.fn());
const mockNotifyModeratorStatusChange = vi.hoisted(() => vi.fn());
const mockIssueBearerToken = vi.hoisted(() => vi.fn());
const mockGetAuthTokenFromRequest = vi.hoisted(() => vi.fn());
let capturedNextAuthOptions: any = undefined;

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
    default: { connect: mockMongooseConnect, connection, Types: { ObjectId: MockObjectId }, isValidObjectId: mockIsValidObjectId, models: mockModelsObj, model: mockModel },
    connection,
    Types: { ObjectId: MockObjectId },
    isValidObjectId: mockIsValidObjectId,
    models: mockModelsObj,
    model: mockModel
  };
});

vi.mock('@/app/lib/mongoose', () => ({ dbConnect: mockDbConnect }));
vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/app/models/user', () => ({ __esModule: true, default: { findOne: mockUserFindOne, find: mockUserFind, findById: mockUserFindById, findOneAndUpdate: mockUserFindOneAndUpdate } }));
vi.mock('@/app/models/argument', () => ({ __esModule: true, default: { create: mockArgumentCreate, findByIdAndUpdate: mockArgumentFindByIdAndUpdate, find: mockArgumentFind, findById: mockArgumentFindById, aggregate: mockArgumentAggregate }, ArgumentSide: { for: 'for', against: 'against', neutral: 'neutral' } }));
vi.mock('@/app/models/topic', () => ({ __esModule: true, default: { countDocuments: mockTopicCountDocuments, findOne: mockTopicFindOne, findById: mockTopicFindById, find: mockTopicFind, create: mockTopicCreate, findByIdAndUpdate: mockTopicFindByIdAndUpdate } }));
vi.mock('@/app/models/comment', () => ({ __esModule: true, default: { create: mockCommentCreate, findById: mockCommentFindById, findByIdAndUpdate: mockCommentFindByIdAndUpdate, find: mockCommentFind, distinct: mockCommentDistinct, aggregate: mockCommentAggregate } }));
vi.mock('@/app/models/notification', () => ({ __esModule: true, default: { find: mockNotificationFind, insertMany: mockNotificationInsertMany, updateMany: mockNotificationUpdateMany } }));
vi.mock('@/app/models/notificationSubscription', () => ({
  __esModule: true,
  default: {
    find: mockNotificationSubscriptionFind,
    findOne: mockNotificationSubscriptionFindOne,
    updateOne: mockNotificationSubscriptionUpdateOne
  }
}));
vi.mock('@/app/models/userFollow', () => ({
  __esModule: true,
  default: {
    find: mockUserFollowFind,
    aggregate: mockUserFollowAggregate,
    updateOne: mockUserFollowUpdateOne,
    deleteOne: mockUserFollowDeleteOne,
  }
}));
vi.mock('@/app/models/vote', () => ({ __esModule: true, default: { init: mockVoteInit, findOneAndUpdate: mockVoteFindOneAndUpdate, countDocuments: mockVoteCountDocuments } }));
vi.mock('@/app/models/facts', () => ({ __esModule: true, default: { findOne: mockFactFindOne, create: mockFactCreate, find: mockFactFind } }));
vi.mock('@/app/services/gcsService', () => ({
  getSignedReadUrlFromUrl: mockGetSignedReadUrlFromUrl,
  deleteFileFromUrl: mockDeleteFileFromUrl,
}));
vi.mock('@/app/services/ontologyClassificationService', () => ({ classifyTextToOntology: mockClassifyTextToOntology, classificationToAssignments: mockClassificationToAssignments, getOntologyCategories: mockGetOntologyCategories }));
vi.mock('@/app/services/openaiService', () => ({ getAIAnalysisForArgument: mockGetAIAnalysisForArgument }));
vi.mock('@/app/services/topicSummaryService', () => ({ getTopicSummary: mockGetTopicSummary }));
vi.mock('@/app/services/topicModeratorService', () => ({
  hasTopicModeratorRole: mockHasTopicModeratorRole,
  maybeAutoPromoteModerator: mockMaybeAutoPromoteModerator,
  maybeDemoteModeratorForTopic: mockMaybeDemoteModeratorForTopic,
}));
vi.mock('@/app/services/moderatorNotificationService', () => ({ notifyModeratorStatusChange: mockNotifyModeratorStatusChange }));
vi.mock('@/app/services/openaiImageGenerationService', () => ({
  generateProfileImage: mockGenerateProfileImage,
  genderOptions: ['male', 'female'],
  hairColorOptions: ['black', 'dark brown', 'brown', 'light brown', 'blonde', 'red', 'auburn', 'grey', 'white'],
  ethnicityOptions: [
    'East Asian (light to medium skin tone)',
    'South Asian (medium to deep skin tone)',
    'Black (deep skin tone)',
    'White (light skin tone)',
    'Middle Eastern (medium skin tone)',
    'Latino (light to medium skin tone)',
    'Southeast Asian (medium skin tone)',
    'North African (medium to deep skin tone)',
  ],
}));
vi.mock('@/app/lib/backgroundTasks', () => ({ trackBackgroundTask: mockTrackBackgroundTask }));
vi.mock('@/app/services/authService', () => ({ findUserByEmailOrPhone: mockFindUserByEmailOrPhone, createUser: mockCreateUser }));
vi.mock('@/app/services/passwordService', () => ({ hashPassword: mockHashPassword, comparePassword: mockComparePassword }));
vi.mock('@/app/services/authTokenService', () => ({ issueBearerToken: mockIssueBearerToken, getAuthTokenFromRequest: mockGetAuthTokenFromRequest, AUTH_TOKEN_MAX_AGE_SECONDS: 30 * 24 * 60 * 60 }));
vi.mock('@next-auth/mongodb-adapter', () => ({ MongoDBAdapter: mockMongoDbAdapter }));
vi.mock('@/app/lib/mongodbClient', () => ({ getConnectedMongoClient: mockGetConnectedMongoClient }));
vi.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: mockCredentialsProvider }));
vi.mock('next-auth/next', () => ({ __esModule: true, default: (...args: any[]) => mockNextAuth(...args) }));

import { POST as argumentPost } from '@/app/api/argument/route';
import { POST as commentPost } from '@/app/api/comment/route';
import { GET as notificationsGet, PATCH as notificationsPatch } from '@/app/api/notifications/route';
import { GET as subscriptionsGet, POST as subscriptionsPost } from '@/app/api/notifications/subscriptions/route';
import { GET as topicsGet, POST as topicsPost } from '@/app/api/topics/route';
import { GET as topTopicsGet } from '@/app/api/top-topics/route';
import { POST as votePost } from '@/app/api/vote/route';
import { GET as authGet } from '@/app/api/auth/route';
import { POST as authLoginPost } from '@/app/api/auth/login/route';
import { GET as authProfileGet } from '@/app/api/auth/profile/route';
import { GET as authUserByEmailGet } from '@/app/api/auth/user-by-email/route';
import { GET as ontologyCategoriesGet } from '@/app/api/ontology/categories/route';
import { GET as topicDetailGet } from '@/app/api/topics/[id]/route';
import { GET as topicFactsGet } from '@/app/api/topics/[id]/facts/route';
import { GET as topicSummaryGet } from '@/app/api/topics/[id]/summary/route';
import { GET as topicModeratorsGet, POST as topicModeratorsPost, DELETE as topicModeratorsDelete, PATCH as topicModeratorsPatch } from '@/app/api/topics/[id]/moderators/route';
import { GET as searchGet } from '@/app/api/search/route';
import { GET as usersSearchGet } from '@/app/api/users/search/route';
import { POST as avatarGeneratePost } from '@/app/api/profile/avatar/generate/route';
import { POST as userUpdatePost } from '@/app/api/user/update/route';
import { POST as userIdPost } from '@/app/api/user/[id]/route';
let nextAuthImported = false;

function chainableQuery<T>(value: T) {
  const query: any = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn()
  };
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  query.exec.mockResolvedValue(value);
  query.then = (onFulfilled: any, onRejected: any) => Promise.resolve(value).then(onFulfilled, onRejected);
  return query;
}

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function findChain<T>(value: T) {
  const chain: any = {
    sort: vi.fn(),
    limit: vi.fn(),
    populate: vi.fn(),
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn()
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.populate.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  chain.exec.mockResolvedValue(value);
  chain.then = (onFulfilled: any, onRejected: any) => Promise.resolve(value).then(onFulfilled, onRejected);
  return chain;
}

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.MONGODB_URI = 'mongodb://localhost/test';
  process.env.NEXTJS_APP_BASE_URL = 'http://localhost:3000';
  mockDbConnect.mockResolvedValue(undefined);
  mockMongooseConnect.mockResolvedValue(undefined);
  mockIsValidObjectId.mockImplementation((val: any) => val !== 'bad');
  mockClassifyTextToOntology.mockResolvedValue([]);
  mockClassificationToAssignments.mockReturnValue([]);
  mockGetServerSession.mockResolvedValue(null);
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
  mockArgumentFind.mockReturnValue(findChain([]));
  mockArgumentAggregate.mockResolvedValue([]);
  mockCommentFind.mockReturnValue(findChain([]));
  mockCommentDistinct.mockResolvedValue([]);
  mockCommentAggregate.mockResolvedValue([]);
  mockArgumentFindById.mockReturnValue(chainableQuery({ body: 'argument body' }));
  mockCommentFindById.mockReturnValue(chainableQuery(null));
  mockTopicFindByIdAndUpdate.mockReturnValue(chainableQuery(null));
  mockFactFind.mockReturnValue(findChain([]));
  mockNotificationFind.mockReturnValue(findChain([]));
  mockNotificationInsertMany.mockResolvedValue([]);
  mockNotificationUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockNotificationSubscriptionFind.mockReturnValue(findChain([]));
  mockNotificationSubscriptionFindOne.mockReturnValue(chainableQuery(null));
  mockNotificationSubscriptionUpdateOne.mockResolvedValue(undefined);
  mockUserFollowFind.mockReturnValue(findChain([]));
  mockUserFollowAggregate.mockResolvedValue([]);
  mockUserFollowUpdateOne.mockResolvedValue(undefined);
  mockUserFollowDeleteOne.mockResolvedValue(undefined);
  mockTopicFindById.mockReturnValue(chainableQuery(null));
  mockUserFindById.mockReturnValue(chainableQuery(null));
  mockUserFindOneAndUpdate.mockResolvedValue(undefined);
  mockHashPassword.mockResolvedValue('hashed');
  mockComparePassword.mockResolvedValue(true);
  mockHasTopicModeratorRole.mockReturnValue(false);
  mockMaybeAutoPromoteModerator.mockResolvedValue({ promoted: false });
  mockMaybeDemoteModeratorForTopic.mockResolvedValue({ demoted: false });
  mockNotifyModeratorStatusChange.mockResolvedValue(undefined);
  mockGetOntologyCategories.mockResolvedValue([]);
  mockGetTopicSummary.mockResolvedValue({ generatedAt: new Date('2024-01-01T00:00:00Z'), points: [] });
  mockGetSignedReadUrlFromUrl.mockImplementation(async (url: string) => `${url}?signed=1`);
  mockDeleteFileFromUrl.mockResolvedValue({ deleted: true });
  mockNextAuth.mockImplementation((options: any) => {
    if (!capturedNextAuthOptions) capturedNextAuthOptions = options;
    return async () => new Response('ok');
  });

  if (!nextAuthImported) {
    await import('@/app/api/auth/[...nextauth]/route');
    nextAuthImported = true;
  }
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

  it('validates required payload fields', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Test User' }));

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ body: 'missing topic' })
    });

    const res = await argumentPost(req as any);

    expect(res.status).toBe(400);
  });

  it('rejects invalid stance', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Test User' }));

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ topicId, body: 'hi', side: 'maybe' })
    });

    const res = await argumentPost(req as any);

    expect(res.status).toBe(400);
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
    expect(mockArgumentCreate).toHaveBeenCalledWith(expect.objectContaining({
      topic: expect.anything(),
      side: 'for',
      body: 'trimmed body',
      createdBy: 'user1',
      upvoteCount: 0,
      downvoteCount: 0,
      score: 0,
      ontologyCategories: expect.any(Array),
      visibility: expect.objectContaining({ status: expect.any(String) })
    }));
    expect(mockTrackBackgroundTask).toHaveBeenCalledTimes(2);
    expect(json).toMatchObject({
      id: 'arg1',
      side: 'for',
      body: 'trimmed body',
      createdBy: { _id: 'user1', name: 'Test User' },
      ontologyCategories: []
    });
    expect(json.createdAt).toBe(createdAt.toISOString());
  });

  it('returns moderator promotion details when auto-promoted', async () => {
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
    mockMaybeAutoPromoteModerator.mockResolvedValue({ promoted: true });

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ topicId, body: 'trimmed body', side: 'for' })
    });

    const res = await argumentPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.moderatorPromotion).toMatchObject({
      promoted: true,
      topicTitle: 'Topic title'
    });
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      action: 'promoted',
      source: 'auto',
      topicTitle: 'Topic title',
    }));
  });

  it('handles cast errors from persistence layer', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Test User' }));
    mockTopicFindById.mockReturnValue(chainableQuery({ title: 'Topic' }));
    mockArgumentCreate.mockRejectedValue({ name: 'CastError' });

    const req = new Request('http://localhost/api/argument', {
      method: 'POST',
      body: JSON.stringify({ topicId, body: 'content' })
    });

    const res = await argumentPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid ids/i);
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
    mockArgumentFindById.mockReturnValue(chainableQuery({ _id: argumentId, body: 'parent argument text' }));
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
    expect(mockCommentCreate).toHaveBeenCalledWith(expect.objectContaining({
      argument: expect.anything(),
      parent: undefined,
      body: 'hello world',
      createdBy: 'user1',
      ontologyCategories: expect.any(Array),
      visibility: expect.objectContaining({ status: expect.any(String) })
    }));
  });

  it('returns moderator promotion details when auto-promoted', async () => {
    const createdAt = new Date('2024-02-02T00:00:00.000Z');
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1', name: 'Commenter' }));
    mockArgumentFindById.mockReturnValue(chainableQuery({ _id: argumentId, body: 'parent argument text', topic: 'topic1' }));
    mockCommentCreate.mockResolvedValue({ _id: 'c1', body: 'hello world', createdAt, ontologyCategories: [] });
    mockMaybeAutoPromoteModerator.mockResolvedValue({ promoted: true });
    mockTopicFindById.mockReturnValue(chainableQuery({ title: 'Topic title' }));

    const req = new Request('http://localhost/api/comment', {
      method: 'POST',
      body: JSON.stringify({ argumentId, body: 'hello world' })
    });

    const res = await commentPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.moderatorPromotion).toMatchObject({ promoted: true, topicId: 'topic1' });
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      action: 'promoted',
      source: 'auto',
      topicTitle: 'Topic title',
    }));
  });
});

describe('GET /api/notifications', () => {
  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await notificationsGet(new Request('http://localhost/api/notifications') as any);

    expect(res.status).toBe(401);
  });

  it('returns notifications with actor metadata', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));
    mockNotificationFind.mockReturnValue(findChain([
      {
        _id: 'notif1',
        type: 'comment_reply',
        actor: 'actor1',
        topic: 'topic1',
        argument: 'arg1',
        comment: 'comment1',
        message: 'Someone replied',
        topicTitle: 'Topic',
        argumentSnippet: 'Argument',
        commentSnippet: 'Reply',
        createdAt: new Date('2024-01-01T00:00:00Z')
      }
    ]));
    mockUserFind.mockReturnValue(findChain([
      { _id: 'actor1', name: 'Alice', avatarThumbUrl: 'https://example.com/avatar.png' }
    ]));

    const res = await notificationsGet(new Request('http://localhost/api/notifications') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0]).toMatchObject({
      id: 'notif1',
      message: 'Someone replied',
      href: '/topics/topic1#comment-comment1'
    });
    expect(json.notifications[0].actor?.name).toBe('Alice');
    expect(json.notifications[0].actor?.avatarUrl).toBe('https://example.com/avatar.png?signed=1');
  });
});

describe('PATCH /api/notifications', () => {
  it('marks notifications as read', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));
    mockNotificationUpdateMany.mockResolvedValue({ modifiedCount: 2 });

    const res = await notificationsPatch(new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: ['notif1', 'notif2'] })
    }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.updated).toBe(2);
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'user1' }),
      expect.anything()
    );
  });

  it('rejects empty selection', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));

    const res = await notificationsPatch(new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [] })
    }) as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no notifications selected/i);
  });
});

describe('GET /api/notifications/subscriptions', () => {
  const targetId = '507f1f77bcf86cd799439011';

  it('returns subscription status', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));
    mockNotificationSubscriptionFindOne.mockReturnValue(chainableQuery({ muted: false }));

    const res = await subscriptionsGet(new Request(`http://localhost/api/notifications/subscriptions?targetType=argument&targetId=${targetId}`) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.subscribed).toBe(true);
  });
});

describe('POST /api/notifications/subscriptions', () => {
  const targetId = '507f1f77bcf86cd799439011';

  it('updates subscription state', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));

    const res = await subscriptionsPost(new Request('http://localhost/api/notifications/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'argument', targetId, subscribe: true })
    }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.subscribed).toBe(true);
    expect(mockNotificationSubscriptionUpdateOne).toHaveBeenCalled();
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

  it('uses aggregation when category filters are provided', async () => {
    const countToArray = vi.fn().mockResolvedValue([{ count: 1 }]);
    const resultsToArray = vi.fn().mockResolvedValue([
      { _id: 't1', title: 'Topic 1', upvoteCount: 0, downvoteCount: 0, totalVotes: 0, creatorName: 'Alice', ontologyCategories: [] }
    ]);
    mockAggregate
      .mockReturnValueOnce({ toArray: countToArray })
      .mockReturnValueOnce({ toArray: resultsToArray });

    const res = await topicsGet({ url: 'http://localhost/api/topics?categoryId=cat1' } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockTopicCountDocuments).not.toHaveBeenCalled();
    expect(mockAggregate).toHaveBeenCalledTimes(2);
    expect(json.total).toBe(1);
    expect(json.topics).toHaveLength(1);
  });
});

describe('GET /api/search', () => {
  it('returns empty results for short queries', async () => {
    const res = await searchGet(new Request('http://localhost/api/search?q=a') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ topics: [], users: [] });
  });

  it('returns topic and user matches', async () => {
    mockTopicFind.mockReturnValue(findChain([
      { _id: 't1', title: 'Topic Match' },
    ]));
    mockUserFind.mockReturnValue(findChain([
      { _id: 'u1', name: 'User Match', nickname: null, avatarUrl: null },
    ]));

    const res = await searchGet(new Request('http://localhost/api/search?q=match') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topics).toHaveLength(1);
    expect(json.users).toHaveLength(1);
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

  it('returns moderator promotion details when auto-promoted', async () => {
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
    mockMaybeAutoPromoteModerator.mockResolvedValue({ promoted: true });

    const req = new Request('http://localhost/api/topics', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Topic', description: 'desc' })
    });

    const res = await topicsPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.moderatorPromotion).toMatchObject({
      promoted: true,
      topicId: 'topic1',
      topicTitle: 'New Topic'
    });
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      action: 'promoted',
      source: 'auto',
      topicTitle: 'New Topic',
    }));
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

  it('rejects unauthenticated users', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Argument', targetId, value: 1 })
    });

    const res = await votePost(req as any);

    expect(res.status).toBe(401);
  });

  it('returns 404 when user is missing', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'missing@test.com' } });
    mockUserFindOne.mockReturnValue(execResult(null));

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Argument', targetId, value: 1 })
    });

    const res = await votePost(req as any);

    expect(res.status).toBe(404);
  });

  it('records a vote and updates counts', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));
    mockVoteInit.mockResolvedValue(undefined);
    mockVoteFindOneAndUpdate.mockReturnValue(execResult(undefined));
    mockVoteCountDocuments
      .mockReturnValueOnce(execResult(3))
      .mockReturnValueOnce(execResult(1));
    mockArgumentFindByIdAndUpdate.mockReturnValue(execResult(undefined));

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

  it('demotes moderators and notifies when vote ratio triggers removal on arguments', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));
    mockVoteInit.mockResolvedValue(undefined);
    mockVoteFindOneAndUpdate.mockReturnValue(execResult(undefined));
    mockVoteCountDocuments
      .mockReturnValueOnce(execResult(3))
      .mockReturnValueOnce(execResult(1));
    mockArgumentFindByIdAndUpdate.mockReturnValue(execResult(undefined));
    mockArgumentFindById.mockReturnValue(chainableQuery({ createdBy: 'author1', topic: 'topic1' }));
    mockMaybeDemoteModeratorForTopic.mockResolvedValue({ demoted: true });
    mockTopicFindById.mockReturnValue(chainableQuery({ title: 'Topic title' }));

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Argument', targetId, value: 1 })
    });

    const res = await votePost(req as any);
    expect(res.status).toBe(200);
    // Wait for async demotion task to complete
    await vi.waitFor(() => {
      expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
        action: 'removed',
        source: 'community',
        topicTitle: 'Topic title',
      }));
    });
  });

  it('updates comment vote counts', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));
    mockVoteInit.mockResolvedValue(undefined);
    mockVoteFindOneAndUpdate.mockReturnValue(execResult(undefined));
    mockVoteCountDocuments
      .mockReturnValueOnce(execResult(0))
      .mockReturnValueOnce(execResult(2));
    mockCommentFindByIdAndUpdate.mockReturnValue(execResult(undefined));

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Comment', targetId, value: -1 })
    });

    const res = await votePost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ upvoteCount: 0, downvoteCount: 2 });
    expect(mockCommentFindByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), {
      upvoteCount: 0,
      downvoteCount: 2,
      score: -2
    });
  });

  it('demotes moderators and notifies when vote ratio triggers removal on comments', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(execResult({ _id: 'user1' }));
    mockVoteInit.mockResolvedValue(undefined);
    mockVoteFindOneAndUpdate.mockReturnValue(execResult(undefined));
    mockVoteCountDocuments
      .mockReturnValueOnce(execResult(0))
      .mockReturnValueOnce(execResult(2));
    mockCommentFindByIdAndUpdate.mockReturnValue(execResult(undefined));
    mockCommentFindById.mockReturnValue(chainableQuery({ createdBy: 'commenter1', argument: 'argument1' }));
    mockArgumentFindById.mockReturnValue(chainableQuery({ topic: 'topic1' }));
    mockMaybeDemoteModeratorForTopic.mockResolvedValue({ demoted: true });
    mockTopicFindById.mockReturnValue(chainableQuery({ title: 'Topic title' }));

    const req = new Request('http://localhost/api/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'Comment', targetId, value: -1 })
    });

    const res = await votePost(req as any);
    expect(res.status).toBe(200);
    // Wait for async demotion task to complete
    await vi.waitFor(() => {
      expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
        action: 'removed',
        source: 'community',
        topicTitle: 'Topic title',
      }));
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

  it('rejects missing identifiers', async () => {
    const req = new Request('http://localhost/api/auth', { method: 'GET' });

    const res = await authGet(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/missing email or phone/i);
    expect(mockFindUserByEmailOrPhone).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('handles phone-based lookup', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValue({ id: 'phone-user' });

    const req = new Request('http://localhost/api/auth?phone=123', { method: 'GET' });

    const res = await authGet(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user).toEqual({ id: 'phone-user' });
    expect(mockFindUserByEmailOrPhone).toHaveBeenCalledWith(undefined, '123');
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

describe('POST /api/auth/login', () => {
  it('validates email', async () => {
    const req = new Request('http://localhost/api/auth/login', { method: 'POST', body: JSON.stringify({}) });

    const res = await authLoginPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.message).toMatch(/valid email/i);
  });

  it('logs successful request and updates history', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    mockFindUserByEmailOrPhone.mockResolvedValue({
      _id: { toString: () => 'user1' },
      email: 'login@test.com',
      name: 'Test User',
      passwordHash: 'hashedpw',
      loginHistory: [],
      save,
    });
    mockComparePassword.mockResolvedValue(true);
    mockUserFindOne.mockResolvedValue({ loginHistory: [], save });
    mockIssueBearerToken.mockResolvedValue('test-token');

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: new Headers({ 'x-forwarded-for': '1.1.1.1' }),
      body: JSON.stringify({ email: 'login@test.com', password: 'password123' })
    });

    const res = await authLoginPost(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.token).toBe('test-token');
    expect(mockFindUserByEmailOrPhone).toHaveBeenCalledWith('login@test.com');
    expect(mockComparePassword).toHaveBeenCalledWith('password123', 'hashedpw');
  });
});

describe('GET /api/auth/profile', () => {
  it('returns static profile message', async () => {
    const res = await authProfileGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toMatch(/profile api route/i);
  });
});

describe('GET /api/auth/user-by-email', () => {
  it('requires email', async () => {
    const res = await authUserByEmailGet(new Request('http://localhost/api/auth/user-by-email') as any);
    expect(res.status).toBe(400);
  });

  it('returns id when found', async () => {
    mockUserFindOne.mockResolvedValue({ _id: { toString: () => 'abc123' } });
    const res = await authUserByEmailGet(new Request('http://localhost/api/auth/user-by-email?email=a@test.com') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: 'abc123' });
  });
});

describe('GET /api/ontology/categories', () => {
  it('filters by search term', async () => {
    mockGetOntologyCategories.mockResolvedValue([
      { id: '1', label: 'Climate', description: 'Earth weather' },
      { id: '2', label: 'Economy', description: 'Finance' }
    ]);

    const res = await ontologyCategoriesGet(new Request('http://localhost/api/ontology/categories?q=clim') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.categories).toHaveLength(1);
    expect(json.categories[0].id).toBe('1');
  });

  it('filters by ids', async () => {
    mockGetOntologyCategories.mockResolvedValue([
      { id: '1', label: 'One', description: '' },
      { id: '2', label: 'Two', description: '' }
    ]);

    const res = await ontologyCategoriesGet(new Request('http://localhost/api/ontology/categories?id=2') as any);
    const json = await res.json();

    expect(json.categories).toEqual([{ id: '2', label: 'Two', description: '' }]);
  });
});

describe('GET /api/profile/[userId]', () => {
  const userId = '507f1f77bcf86cd799439011';

  it('rejects invalid id', async () => {
    mockIsValidObjectId.mockReturnValueOnce(false);
    const profileModule = await import('@/app/api/profile/[userId]/route');
    const res = await profileModule.GET(new Request('http://localhost/api/profile/bad') as any, { params: { userId: 'bad' } } as any);
    expect(res.status).toBe(400);
  });

  it('returns profile data', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const userDoc = { _id: { toString: () => userId }, name: 'User', nickname: 'Nick', createdAt: new Date('2024-01-01') };
    mockUserFindById.mockReturnValue(chainableQuery(userDoc));

    const argumentId = 'arg1';
    mockArgumentFind.mockReturnValue(findChain([
      {
        _id: argumentId,
        body: 'argument',
        createdAt: new Date('2024-01-02'),
        upvoteCount: 1,
        downvoteCount: 0,
        score: 1,
        side: 'for',
        createdBy: { name: 'User' },
        ontologyCategories: []
      }
    ]));

    mockCommentFind.mockReturnValue(findChain([
      {
        _id: 'c1',
        body: 'comment',
        argument: { _id: argumentId, body: 'argument', topic: { _id: 't1', title: 'Topic' } },
        createdAt: new Date('2024-01-03'),
        upvoteCount: 0,
        downvoteCount: 0,
        score: 0,
        createdBy: { name: 'User' },
        ontologyCategories: []
      }
    ]));

    const res = await (await import('@/app/api/profile/[userId]/route')).GET(new Request(`http://localhost/api/profile/${userId}`) as any, { params: { userId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user.id).toBe(userId);
    expect(json.recentArguments).toHaveLength(1);
    expect(json.recentComments).toHaveLength(1);
  });
});

describe('GET /api/topics/[id]', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('validates id', async () => {
    mockIsValidObjectId.mockReturnValueOnce(false);
    const res = await topicDetailGet(new Request('http://localhost/api/topics/bad') as any, { params: { id: 'bad' } } as any);
    expect(res.status).toBe(400);
  });

  it('returns topic details with comments and facts', async () => {
    const topicDoc = { _id: topicId, title: 'T', description: 'D', createdBy: { name: 'Creator' }, ontologyCategories: [], isActive: true, argumentCounts: {}, score: 1, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') };
    mockTopicFindById.mockReturnValue(findChain(topicDoc));

    const argumentId = 'arg1';
    mockArgumentFind.mockReturnValue(findChain([
      { _id: argumentId, side: 'pro', body: 'b', createdBy: { name: 'A' }, upvoteCount: 1, downvoteCount: 0, score: 1, createdAt: new Date('2024-01-02'), ontologyCategories: [], aiAnalysis: {} }
    ]));

    mockCommentFind.mockReturnValue(findChain([
      { _id: 'c1', argument: argumentId, body: 'c', createdBy: { name: 'C' }, createdAt: new Date('2024-01-03'), upvoteCount: 0, downvoteCount: 0, score: 0, ontologyCategories: [] }
    ]));

    mockFactFind.mockReturnValue(findChain([
      { _id: 'f1', text: 'fact', sourceArgument: argumentId, createdAt: new Date('2024-01-04') }
    ]));

    const res = await topicDetailGet(new Request(`http://localhost/api/topics/${topicId}?num_arguments=5&ordering=newest`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topic.id).toBe(topicId);
    expect(json.arguments[0].commentCount).toBe(1);
    expect(json.facts).toHaveLength(1);
    expect(json.meta.ordering).toBe('newest');
  });

  it('exposes viewer moderation metadata when moderator', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'viewer@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'viewer1', isAdmin: false }));
    mockHasTopicModeratorRole.mockReturnValue(true);

    const topicDoc = { _id: topicId, title: 'T', createdBy: { _id: 'creator1', name: 'Creator' }, moderators: ['viewer1'], isActive: true, ontologyCategories: [], argumentCounts: {}, score: 1 };
    mockTopicFindById.mockReturnValue(findChain(topicDoc));
    mockArgumentFind.mockReturnValue(findChain([]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockFactFind.mockReturnValue(findChain([]));

    const res = await topicDetailGet(new Request(`http://localhost/api/topics/${topicId}?num_arguments=5&ordering=relevant&includeModeration=1`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.meta.viewer).toEqual({ id: 'viewer1', isAdmin: false, isModerator: true, canModerate: true });
  });

  it('includes subscription state for authenticated viewers', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'viewer@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'viewer1', isAdmin: false }));
    const topicDoc = { _id: topicId, title: 'T', createdBy: { name: 'Creator' }, ontologyCategories: [], isActive: true, argumentCounts: {}, score: 1 };
    mockTopicFindById.mockReturnValue(findChain(topicDoc));

    const argumentId = 'arg1';
    mockArgumentFind.mockReturnValue(findChain([
      { _id: argumentId, side: 'pro', body: 'b', createdBy: { _id: 'creator1', name: 'A' }, upvoteCount: 1, downvoteCount: 0, score: 1, createdAt: new Date('2024-01-02'), ontologyCategories: [], aiAnalysis: {} }
    ]));
    mockCommentFind.mockReturnValue(findChain([]));
    mockFactFind.mockReturnValue(findChain([]));
    mockNotificationSubscriptionFind.mockReturnValue(findChain([
      { targetType: 'topic', targetId: topicId, muted: false },
      { targetType: 'argument', targetId: argumentId, muted: true }
    ]));

    const res = await topicDetailGet(new Request(`http://localhost/api/topics/${topicId}?num_arguments=5&ordering=newest`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topic.subscription.isSubscribed).toBe(true);
    expect(json.arguments[0].subscription.isSubscribed).toBe(false);
  });
});

describe('GET /api/topics/[id]/facts', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('rejects bad id', async () => {
    mockIsValidObjectId.mockReturnValueOnce(false);
    const res = await topicFactsGet(new Request('http://localhost/api/topics/bad/facts') as any, { params: { id: 'bad' } } as any);
    expect(res.status).toBe(400);
  });

  it('returns facts list', async () => {
    mockTopicFindById.mockReturnValue(findChain({
      _id: topicId,
      isActive: true,
      visibility: { status: 'visible' }
    }));
    mockFactFind.mockReturnValue(findChain([
      { _id: 'f1', text: 'fact', sourceArgument: 'arg1', createdAt: new Date('2024-01-01') }
    ]));

    const res = await topicFactsGet(new Request(`http://localhost/api/topics/${topicId}/facts`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.facts[0].id).toBe('f1');
  });
});

describe('GET /api/topics/[id]/summary', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('returns summary', async () => {
    mockTopicFindById.mockReturnValue(findChain({
      _id: topicId,
      isActive: true,
      visibility: { status: 'visible' }
    }));
    mockGetTopicSummary.mockResolvedValue({ generatedAt: new Date('2024-01-05'), points: { for: [], against: [], neutral: [] } });

    const res = await topicSummaryGet(new Request(`http://localhost/api/topics/${topicId}/summary`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topicId).toBe(topicId);
    expect(json.points).toEqual({ for: [], against: [], neutral: [] });
  });
});

describe('POST /api/profile/avatar/generate', () => {
  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await avatarGeneratePost(new Request('http://localhost/api/profile/avatar/generate', {
      method: 'POST',
      body: JSON.stringify({ gender: 'female', age: 30, hairColor: 'brown', ethnicitySkin: 'White (light skin tone)' })
    }) as any);

    expect(res.status).toBe(401);
  });

  it('validates payload', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));
    const res = await avatarGeneratePost(new Request('http://localhost/api/profile/avatar/generate', {
      method: 'POST',
      body: JSON.stringify({ gender: 'unknown', age: 10, hairColor: 'purple', ethnicitySkin: 'Unknown' })
    }) as any);

    expect(res.status).toBe(400);
    expect(mockGenerateProfileImage).not.toHaveBeenCalled();
  });

describe('GET /api/users/search', () => {
  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await usersSearchGet(new Request('http://localhost/api/users/search?q=test') as any);
    expect(res.status).toBe(401);
  });

  it('returns results for admins', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'admin1', isAdmin: true }));
    mockUserFind.mockReturnValue(findChain([
      { _id: 'u1', name: 'User One', email: 'user@example.com' }
    ]));

    const res = await usersSearchGet(new Request('http://localhost/api/users/search?q=user') as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(1);
    expect(json.users[0]).toMatchObject({ id: 'u1', name: 'User One', email: 'user@example.com' });
  });
});

describe('GET /api/topics/[id]/moderators', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('rejects non-admins', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1', isAdmin: false }));

    const res = await topicModeratorsGet(new Request(`http://localhost/api/topics/${topicId}/moderators`) as any, { params: { id: topicId } } as any);
    expect(res.status).toBe(403);
  });

  it('returns moderators for admins', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'admin1', isAdmin: true }));
    mockTopicFindById.mockReturnValue(chainableQuery({ moderators: ['u1'], autoModeratorEnabled: true }));
    mockUserFind.mockReturnValue(findChain([
      { _id: 'u1', name: 'Mod', email: 'mod@example.com' }
    ]));

    const res = await topicModeratorsGet(new Request(`http://localhost/api/topics/${topicId}/moderators`) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.moderators).toHaveLength(1);
    expect(json.autoModeratorEnabled).toBe(true);
  });
});

describe('POST /api/topics/[id]/moderators', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('adds moderator and notifies', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'admin1', isAdmin: true, name: 'Admin' }));
    mockUserFindById.mockReturnValue(chainableQuery({ _id: 'u1', name: 'Mod', email: 'mod@example.com' }));
    mockTopicFindById.mockReturnValue(chainableQuery({ moderators: [], title: 'Topic title' }));
    mockTopicFindByIdAndUpdate.mockReturnValue(execResult(undefined));

    const res = await topicModeratorsPost(new Request(`http://localhost/api/topics/${topicId}/moderators`, {
      method: 'POST',
      body: JSON.stringify({ identifier: 'u1' })
    }) as any, { params: { id: topicId } } as any);

    expect(res.status).toBe(200);
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      action: 'promoted',
      source: 'admin',
      topicTitle: 'Topic title'
    }));
  });
});

describe('DELETE /api/topics/[id]/moderators', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('removes moderator and notifies', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'admin1', isAdmin: true, name: 'Admin' }));
    mockUserFindById.mockReturnValue(chainableQuery({ _id: 'u1', name: 'Mod', email: 'mod@example.com' }));
    mockUserFind.mockReturnValue(findChain([{ _id: 'u1', name: 'Mod', email: 'mod@example.com' }]));
    mockTopicFindById.mockReturnValue(chainableQuery({ moderators: ['u1'], title: 'Topic title' }));
    mockTopicFindByIdAndUpdate.mockReturnValue(execResult(undefined));

    const res = await topicModeratorsDelete(new Request(`http://localhost/api/topics/${topicId}/moderators`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: 'u1' })
    }) as any, { params: { id: topicId } } as any);

    expect(res.status).toBe(200);
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      action: 'removed',
      source: 'admin',
      topicTitle: 'Topic title'
    }));
  });
});

describe('PATCH /api/topics/[id]/moderators', () => {
  const topicId = '507f1f77bcf86cd799439011';

  it('updates auto moderator flag', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'admin1', isAdmin: true }));
    mockTopicFindByIdAndUpdate.mockReturnValue(chainableQuery({ autoModeratorEnabled: false }));

    const res = await topicModeratorsPatch(new Request(`http://localhost/api/topics/${topicId}/moderators`, {
      method: 'PATCH',
      body: JSON.stringify({ autoModeratorEnabled: false })
    }) as any, { params: { id: topicId } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.autoModeratorEnabled).toBe(false);
  });
});

  it('returns generated image', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: 'user1' }));
    mockGenerateProfileImage.mockResolvedValue('base64-data');

    const res = await avatarGeneratePost(new Request('http://localhost/api/profile/avatar/generate', {
      method: 'POST',
      body: JSON.stringify({ gender: 'female', age: 32, hairColor: 'brown', ethnicitySkin: 'White (light skin tone)' })
    }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.base64).toBe('base64-data');
    expect(mockGenerateProfileImage).toHaveBeenCalledWith({
      gender: 'female',
      age: 32,
      hairColor: 'brown',
      ethnicitySkin: 'White (light skin tone)'
    }, 'user1');
  });
});

describe('POST /api/user/update', () => {
  it('requires auth', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await userUpdatePost(new Request('http://localhost/api/user/update', { method: 'POST', body: JSON.stringify({ name: 'New' }) }) as any);
    expect(res.status).toBe(401);
  });

  it('applies allowed updates', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOneAndUpdate.mockReturnValue(chainableQuery({ name: 'New' }));

    const res = await userUpdatePost(new Request('http://localhost/api/user/update', { method: 'POST', body: JSON.stringify({ name: 'New' }) }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.name).toBe('New');
    expect(mockUserFindOneAndUpdate).toHaveBeenCalled();
  });

  it('persists avatarModeration on self updates', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOneAndUpdate.mockReturnValue(chainableQuery({
      avatarModeration: { status: 'flagged', reasons: [], flaggedAt: new Date('2024-01-01T00:00:00Z') }
    }));

    const res = await userUpdatePost(new Request('http://localhost/api/user/update', {
      method: 'POST',
      body: JSON.stringify({
        avatarModeration: { status: 'flagged', reasons: [], flaggedAt: '2024-01-01T00:00:00Z' }
      })
    }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.avatarModeration?.status).toBe('flagged');
    expect(mockUserFindOneAndUpdate).toHaveBeenCalled();
  });
});

describe('POST /api/user/[id]', () => {
  it('requires auth', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await userIdPost(new Request('http://localhost/api/user/1', { method: 'POST', body: JSON.stringify({ name: 'New' }) }) as any);
    expect(res.status).toBe(401);
  });

  it('updates allowed fields', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockUserFindOneAndUpdate.mockReturnValue(chainableQuery({ name: 'Updated' }));

    const res = await userIdPost(new Request('http://localhost/api/user/1', { method: 'POST', body: JSON.stringify({ name: 'Updated' }) }) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.name).toBe('Updated');
  });
});

describe('auth [...nextauth] config', () => {
  it('authorizes new user with consent', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValueOnce(null);
    mockCreateUser.mockResolvedValueOnce({ _id: { toString: () => 'u1' }, email: 'e', name: 'n', passwordHash: 'h' });

    const user = await capturedNextAuthOptions.providers[0].authorize({ email: 'e', password: 'pw', gdprConsent: true });

    expect(mockCreateUser).toHaveBeenCalled();
    expect(user?.id).toBe('u1');
  });

  it('rejects without consent', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValueOnce(null);

    const user = await capturedNextAuthOptions.providers[0].authorize({ email: 'e', password: 'pw', gdprConsent: false });

    expect(user).toBeNull();
  });

  it('creates missing user on signIn callback', async () => {
    mockFindUserByEmailOrPhone.mockResolvedValueOnce(null);
    mockCreateUser.mockResolvedValueOnce({ id: 'created' });

    const result = await capturedNextAuthOptions.callbacks.signIn({ user: { email: 'new@test.com', name: 'New' } } as any);

    expect(result).toBe(true);
    expect(mockCreateUser).toHaveBeenCalled();
  });
});
