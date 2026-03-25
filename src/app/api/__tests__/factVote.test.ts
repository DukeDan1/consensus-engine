import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetAuthSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockFactFindOne = vi.hoisted(() => vi.fn());
const mockFactFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockFactVoteInit = vi.hoisted(() => vi.fn());
const mockFactVoteFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockFactVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockFactVoteFindOne = vi.hoisted(() => vi.fn());
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
    findByIdAndUpdate: mockFactFindByIdAndUpdate,
  },
}));
vi.mock("@/app/models/factVote", () => ({
  __esModule: true,
  default: {
    init: mockFactVoteInit,
    findOneAndUpdate: mockFactVoteFindOneAndUpdate,
    countDocuments: mockFactVoteCountDocuments,
    findOne: mockFactVoteFindOne,
  },
}));

import { POST, GET } from "@/app/api/fact-vote/route";
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

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function makeRequest(body: Record<string, any>, method = "POST"): NextRequest {
  const url = new URL("http://localhost:3000/api/fact-vote");
  if (method === "GET" && body.factId) {
    url.searchParams.set("factId", body.factId);
  }
  return new NextRequest(url, {
    method,
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/fact-vote", () => {
  const userId = "507f1f77bcf86cd799439011";
  const factId = "507f1f77bcf86cd799439022";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
    mockFactVoteInit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 if not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue({ email: null });

    const req = makeRequest({ factId, value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 if user not found", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery(null));

    const req = makeRequest({ factId, value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid payload (missing factId)", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));

    const req = makeRequest({ value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid payload (bad value)", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));

    const req = makeRequest({ factId, value: 0 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid factId", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));
    mockIsValidObjectId.mockReturnValue(false);

    const req = makeRequest({ factId: "bad", value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 if fact not found or not active", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));
    mockFactFindOne.mockReturnValue(chainableQuery(null));

    const req = makeRequest({ factId, value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("successfully upvotes a fact", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));
    mockFactFindOne.mockReturnValue(chainableQuery({ _id: factId }));
    mockFactVoteFindOneAndUpdate.mockReturnValue(execResult(null));
    mockFactFindByIdAndUpdate.mockReturnValue(chainableQuery({ upvoteCount: 5, downvoteCount: 2 }));

    const req = makeRequest({ factId, value: 1 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.upvoteCount).toBe(5);
    expect(data.downvoteCount).toBe(2);
  });

  it("successfully downvotes a fact with a reason", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));
    mockFactFindOne.mockReturnValue(chainableQuery({ _id: factId }));
    mockFactVoteFindOneAndUpdate.mockReturnValue(execResult(null));
    mockFactFindByIdAndUpdate.mockReturnValue(chainableQuery({ upvoteCount: 3, downvoteCount: 7 }));

    const req = makeRequest({ factId, value: -1, reason: "This fact is misleading" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.upvoteCount).toBe(3);
    expect(data.downvoteCount).toBe(7);
  });

  it("handles duplicate key race condition gracefully", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));
    mockFactFindOne.mockReturnValue(chainableQuery({ _id: factId }));
    mockFactVoteFindOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockRejectedValue({ code: 11000 }),
    });
    mockFactVoteCountDocuments.mockReturnValueOnce(execResult(1)).mockReturnValueOnce(execResult(0));
    mockFactFindByIdAndUpdate.mockReturnValue(execResult(null));

    const req = makeRequest({ factId, value: 1 });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it("returns 400 for reason that is too long", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId, email: "test@test.com" }));

    const req = makeRequest({ factId, value: 1, reason: "x".repeat(2001) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/fact-vote", () => {
  const userId = "507f1f77bcf86cd799439011";
  const factId = "507f1f77bcf86cd799439022";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockIsValidObjectId.mockImplementation((val: any) => val !== "bad" && val !== "" && val !== undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 if not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue({ email: null });

    const req = makeRequest({ factId }, "GET");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid factId", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId }));
    mockIsValidObjectId.mockReturnValue(false);

    const url = new URL("http://localhost:3000/api/fact-vote?factId=bad");
    const req = new NextRequest(url, { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns null vote when user has not voted", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId }));
    mockFactVoteFindOne.mockReturnValue(chainableQuery(null));

    const url = new URL(`http://localhost:3000/api/fact-vote?factId=${factId}`);
    const req = new NextRequest(url, { method: "GET" });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.vote).toBeNull();
  });

  it("returns existing vote when user has voted", async () => {
    mockGetAuthSession.mockResolvedValue({ email: "test@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ _id: userId }));
    mockFactVoteFindOne.mockReturnValue(
      chainableQuery({ value: 1, reason: "Good fact" })
    );

    const url = new URL(`http://localhost:3000/api/fact-vote?factId=${factId}`);
    const req = new NextRequest(url, { method: "GET" });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.vote).toEqual({ value: 1, reason: "Good fact" });
  });
});
