import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetAuthSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockFactFindOne = vi.hoisted(() => vi.fn());
const mockFactFind = vi.hoisted(() => vi.fn());
const mockFactVoteFind = vi.hoisted(() => vi.fn());
const mockFactVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockTopicFindById = vi.hoisted(() => vi.fn());
const mockHasTopicModeratorRole = vi.hoisted(() => vi.fn());
const mockReassessFact = vi.hoisted(() => vi.fn());
const mockFactNeedsReassessmentWithComments = vi.hoisted(() => vi.fn());
const mockArgumentAggregate = vi.hoisted(() => vi.fn());
const mockCommentAggregate = vi.hoisted(() => vi.fn());
const mockUserFollowAggregate = vi.hoisted(() => vi.fn());
const mockGetSignedReadUrlFromUrl = vi.hoisted(() => vi.fn());
const mockIsValidObjectId = vi.hoisted(() => vi.fn((val: any) => val !== "bad" && val !== "" && val !== undefined));

vi.mock("mongoose", () => {
  class MockObjectId {
    value: string;
    constructor(value: string = "mock-object-id") {
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
      models: {},
      model: vi.fn(),
    },
    Types: { ObjectId: MockObjectId },
    isValidObjectId: mockIsValidObjectId,
  };
});

vi.mock("@/app/lib/mongoose", () => ({ dbConnect: mockDbConnect }));
vi.mock("@/app/services/authSessionService", () => ({
  getAuthSession: mockGetAuthSession,
}));
vi.mock("@/app/models/user", () => ({
  __esModule: true,
  default: { findOne: mockUserFindOne },
}));
vi.mock("@/app/models/facts", () => ({
  __esModule: true,
  default: {
    findOne: mockFactFindOne,
    find: mockFactFind,
  },
}));
vi.mock("@/app/models/factVote", () => ({
  __esModule: true,
  default: {
    find: mockFactVoteFind,
    countDocuments: mockFactVoteCountDocuments,
  },
}));
vi.mock("@/app/models/topic", () => ({
  __esModule: true,
  default: { findById: mockTopicFindById },
}));
vi.mock("@/app/models/argument", () => ({
  __esModule: true,
  default: { aggregate: mockArgumentAggregate },
}));
vi.mock("@/app/models/comment", () => ({
  __esModule: true,
  default: { aggregate: mockCommentAggregate },
}));
vi.mock("@/app/models/userFollow", () => ({
  __esModule: true,
  default: { aggregate: mockUserFollowAggregate },
}));
vi.mock("@/app/services/gcsService", () => ({
  getSignedReadUrlFromUrl: mockGetSignedReadUrlFromUrl,
}));
vi.mock("@/app/services/topicModeratorService", () => ({
  hasTopicModeratorRole: mockHasTopicModeratorRole,
}));
vi.mock("@/app/services/factReassessmentService", () => ({
  reassessFact: mockReassessFact,
  factNeedsReassessmentWithComments: mockFactNeedsReassessmentWithComments,
}));

import {
  GET,
  PATCH,
  DELETE,
  POST,
} from "@/app/api/topics/[id]/facts/[factId]/route";
import { NextRequest } from "next/server";

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

function findChain<T>(value: T) {
  const chain: any = {
    sort: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.populate.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  chain.exec.mockResolvedValue(value);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(value).then(onFulfilled, onRejected);
  return chain;
}

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

const topicId = "507f1f77bcf86cd799439011";
const factId = "507f1f77bcf86cd799439022";
const userId = "507f1f77bcf86cd799439033";

function makeCtx() {
  return { params: Promise.resolve({ id: topicId, factId }) };
}

function makeRequest(body: Record<string, any> = {}, method = "GET"): NextRequest {
  const url = new URL("http://localhost:3000/api/topics/" + topicId + "/facts/" + factId);
  return new NextRequest(url, {
    method,
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

describe("GET /api/topics/:id/facts/:factId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  it("returns 400 for invalid IDs", async () => {
    const req = makeRequest({}, "GET");
    const ctx = { params: Promise.resolve({ id: "bad", factId }) };
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when fact not found", async () => {
    mockFactFindOne.mockReturnValue(chainableQuery(null));

    const req = makeRequest({}, "GET");
    const res = await GET(req, makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns fact with vote reasons and reassessment history", async () => {
    mockFactFindOne.mockReturnValue(
      chainableQuery({
        _id: { toString: () => factId },
        text: "Test fact",
        status: "active",
        upvoteCount: 10,
        downvoteCount: 2,
        score: 8,
        sourceArgument: { toString: () => "arg-1" },
        sourceComment: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
        reassessmentHistory: [
          {
            reassessedAt: new Date("2024-01-02"),
            action: "kept",
            rationale: "Verified",
            upvotesConsidered: 10,
            downvotesConsidered: 2,
            commentsConsidered: 3,
            triggeredBy: "system",
          },
        ],
      })
    );
    mockFactVoteFind.mockReturnValue(
      findChain([
        {
          _id: { toString: () => "vote-1" },
          value: 1,
          reason: "Accurate claim",
          createdAt: new Date("2024-01-01"),
          user: {
            _id: { toString: () => userId },
            name: "Test User",
            nickname: null,
            avatarUrl: "gs://bucket/avatar.png",
            avatarThumbUrl: "gs://bucket/avatar-thumb.png",
            createdAt: new Date("2023-06-01"),
          },
        },
        {
          _id: { toString: () => "vote-2" },
          value: -1,
          reason: "Misleading",
          createdAt: new Date("2024-01-01"),
          user: null,
        },
      ])
    );
    mockArgumentAggregate.mockResolvedValue([{ _id: { toString: () => userId }, count: 5, upvotes: 100 }]);
    mockCommentAggregate.mockResolvedValue([{ _id: { toString: () => userId }, count: 3, upvotes: 20 }]);
    mockUserFollowAggregate.mockResolvedValue([{ _id: { toString: () => userId }, count: 7 }]);
    mockGetSignedReadUrlFromUrl.mockImplementation(async (url: string) => `signed:${url}`);

    const req = makeRequest({}, "GET");
    const res = await GET(req, makeCtx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.fact.text).toBe("Test fact");
    expect(data.fact.upvoteCount).toBe(10);
    expect(data.fact.reassessmentHistory).toHaveLength(1);
    expect(data.fact.reassessmentHistory[0].action).toBe("kept");
    expect(data.voteReasons).toHaveLength(2);
    // First vote reason — user with signed URLs and stats
    expect(data.voteReasons[0].user.name).toBe("Test User");
    expect(data.voteReasons[0].user.avatarUrl).toBe("signed:gs://bucket/avatar.png");
    expect(data.voteReasons[0].user.avatarThumbUrl).toBe("signed:gs://bucket/avatar-thumb.png");
    expect(data.voteReasons[0].user.stats).toEqual({ posts: 5, comments: 3, upvotes: 120, followers: 7 });
    // Second vote reason — no user
    expect(data.voteReasons[1].user).toBeNull();
  });
});

describe("PATCH /api/topics/:id/facts/:factId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  it("returns 401 if not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue({ email: null });

    const req = makeRequest({ text: "Updated" }, "PATCH");
    const res = await PATCH(req, makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 403 if user is not admin or moderator", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "user@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: false })
    );
    mockTopicFindById.mockReturnValue(
      chainableQuery({ _id: topicId, moderators: [] })
    );
    mockHasTopicModeratorRole.mockReturnValue(false);

    const req = makeRequest({ text: "Updated" }, "PATCH");
    const res = await PATCH(req, makeCtx());
    expect(res.status).toBe(403);
  });

  it("allows admin to update fact text", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );

    const mockFact = {
      _id: { toString: () => factId },
      text: "Old text",
      status: "active",
      updatedAt: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFactFindOne.mockResolvedValue(mockFact);

    const req = makeRequest({ text: "Updated fact text" }, "PATCH");
    const res = await PATCH(req, makeCtx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockFact.text).toBe("Updated fact text");
    expect(mockFact.save).toHaveBeenCalled();
  });

  it("allows admin to remove a fact", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );

    const mockFact = {
      _id: { toString: () => factId },
      text: "Some fact",
      status: "active" as string,
      removedAt: undefined as Date | undefined,
      removedBy: undefined as any,
      removalReason: undefined as string | undefined,
      updatedAt: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFactFindOne.mockResolvedValue(mockFact);

    const req = makeRequest({ status: "removed", reason: "Inaccurate" }, "PATCH");
    const res = await PATCH(req, makeCtx());

    expect(res.status).toBe(200);
    expect(mockFact.status).toBe("removed");
    expect(mockFact.removalReason).toBe("Inaccurate");
  });

  it("allows moderator to update fact", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "mod@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: false })
    );
    mockTopicFindById.mockReturnValue(
      chainableQuery({ _id: topicId, moderators: [userId] })
    );
    mockHasTopicModeratorRole.mockReturnValue(true);

    const mockFact = {
      _id: { toString: () => factId },
      text: "Old fact",
      status: "active",
      updatedAt: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFactFindOne.mockResolvedValue(mockFact);

    const req = makeRequest({ text: "Corrected fact" }, "PATCH");
    const res = await PATCH(req, makeCtx());

    expect(res.status).toBe(200);
    expect(mockFact.text).toBe("Corrected fact");
  });
});

describe("DELETE /api/topics/:id/facts/:factId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  it("returns 401 if not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue({ email: null });

    const req = makeRequest({}, "DELETE");
    const res = await DELETE(req, makeCtx());
    expect(res.status).toBe(401);
  });

  it("marks fact as removed", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );

    const mockFact = {
      _id: { toString: () => factId },
      text: "Fact to delete",
      status: "active" as string,
      removedAt: undefined as Date | undefined,
      removedBy: undefined as any,
      removalReason: undefined as string | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFactFindOne.mockResolvedValue(mockFact);

    const req = makeRequest({}, "DELETE");
    const res = await DELETE(req, makeCtx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockFact.status).toBe("removed");
    expect(mockFact.removedBy).toBe(userId);
  });

  it("returns 404 when fact not found", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );
    mockFactFindOne.mockResolvedValue(null);

    const req = makeRequest({}, "DELETE");
    const res = await DELETE(req, makeCtx());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/topics/:id/facts/:factId (manual reassessment)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  it("returns 401 if not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue({ email: null });

    const req = makeRequest({}, "POST");
    const res = await POST(req, makeCtx());
    expect(res.status).toBe(401);
  });

  it("triggers reassessment for moderator", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );

    const mockFact = {
      _id: { toString: () => factId },
      text: "Fact to reassess",
      status: "active",
    };
    mockFactFindOne.mockResolvedValue(mockFact);
    mockReassessFact.mockResolvedValue({
      action: "kept",
      rationale: "Confirmed accurate",
      model: "gpt-5.4",
    });

    const req = makeRequest({}, "POST");
    const res = await POST(req, makeCtx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.result.action).toBe("kept");
    expect(data.updatedFact).toBeDefined();
    expect(data.updatedFact.text).toBe("Fact to reassess");
    expect(mockReassessFact).toHaveBeenCalledWith(mockFact, "moderator", userId);
  });

  it("returns 500 if reassessment fails", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(
      chainableQuery({ _id: userId, isAdmin: true })
    );

    const mockFact = {
      _id: { toString: () => factId },
      text: "Fact",
      status: "active",
    };
    mockFactFindOne.mockResolvedValue(mockFact);
    mockReassessFact.mockRejectedValue(new Error("AI failure"));

    const req = makeRequest({}, "POST");
    const res = await POST(req, makeCtx());
    expect(res.status).toBe(500);
  });
});
