import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetAuthSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockTopicFindById = vi.hoisted(() => vi.fn());
const mockHasTopicModeratorRole = vi.hoisted(() => vi.fn());
const mockFactFindOne = vi.hoisted(() => vi.fn());
const mockFactFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockFactVoteFindOne = vi.hoisted(() => vi.fn());
const mockFactVoteCountDocuments = vi.hoisted(() => vi.fn());
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
vi.mock("@/app/services/authSessionService", () => ({ getAuthSession: mockGetAuthSession }));
vi.mock("@/app/models/user", () => ({
  __esModule: true,
  default: { findOne: mockUserFindOne },
}));
vi.mock("@/app/models/topic", () => ({
  __esModule: true,
  default: { findById: mockTopicFindById },
}));
vi.mock("@/app/services/topicModeratorService", () => ({
  hasTopicModeratorRole: mockHasTopicModeratorRole,
}));
vi.mock("@/app/models/facts", () => ({
  __esModule: true,
  default: {
    findOne: mockFactFindOne,
    findByIdAndUpdate: mockFactFindByIdAndUpdate,
  },
}));
vi.mock("@/app/models/factVote", () => ({
  __esModule: true,
  default: {
    findOne: mockFactVoteFindOne,
    countDocuments: mockFactVoteCountDocuments,
  },
}));

import { DELETE } from "@/app/api/topics/[id]/facts/[factId]/votes/[voteId]/route";

const topicId = "507f1f77bcf86cd799439011";
const factId = "507f1f77bcf86cd799439022";
const voteId = "507f1f77bcf86cd799439044";
const userId = "507f1f77bcf86cd799439033";

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

function makeRequest() {
  const url = new URL(`http://localhost:3000/api/topics/${topicId}/facts/${factId}/votes/${voteId}`);
  return new NextRequest(url, { method: "DELETE" });
}

function makeCtx() {
  return { params: Promise.resolve({ id: topicId, factId, voteId }) };
}

describe("DELETE /api/topics/:id/facts/:factId/votes/:voteId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  it("blocks cross-topic vote reason deletion even for moderator of URL topic", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "mod@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, isAdmin: false }));
    mockTopicFindById.mockReturnValue(chainableQuery({ _id: topicId, moderators: [userId] }));
    mockHasTopicModeratorRole.mockReturnValue(true);

    // factId does NOT belong to topicId from URL
    mockFactFindOne.mockReturnValue(chainableQuery(null));

    const res = await DELETE(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Fact not found");
    expect(mockFactVoteFindOne).not.toHaveBeenCalled();
  });

  it("allows deletion when fact belongs to topic and user is admin", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, isAdmin: true }));

    mockFactFindOne.mockReturnValue(chainableQuery({ _id: factId, topic: topicId }));

    const vote = {
      reason: "Old reason",
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFactVoteFindOne.mockResolvedValue(vote);
    mockFactVoteCountDocuments
      .mockReturnValueOnce(execResult(4))
      .mockReturnValueOnce(execResult(1));
    mockFactFindByIdAndUpdate.mockReturnValue(execResult({}));

    const res = await DELETE(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(vote.reason).toBeUndefined();
    expect(vote.save).toHaveBeenCalled();
    expect(mockFactFindByIdAndUpdate).toHaveBeenCalled();
  });
});
