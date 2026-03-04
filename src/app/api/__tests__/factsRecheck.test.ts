import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──
const mockDbConnect = vi.hoisted(() => vi.fn());
const mockGetAuthSession = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
const mockFactFind = vi.hoisted(() => vi.fn());
const mockFactVoteCountDocuments = vi.hoisted(() => vi.fn());
const mockReassessFact = vi.hoisted(() => vi.fn());
const mockFactNeedsReassessmentWithComments = vi.hoisted(() => vi.fn());

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
      isValidObjectId: vi.fn(() => true),
      models: {},
      model: vi.fn(),
    },
    Types: { ObjectId: MockObjectId },
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
  default: { find: mockFactFind },
}));
vi.mock("@/app/models/factVote", () => ({
  __esModule: true,
  default: { countDocuments: mockFactVoteCountDocuments },
}));
vi.mock("@/app/services/factReassessmentService", () => ({
  reassessFact: mockReassessFact,
  factNeedsReassessmentWithComments: mockFactNeedsReassessmentWithComments,
}));

import { NextRequest } from "next/server";

type FactRecheckModule = typeof import("@/app/api/admin/facts-recheck/route");

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
    sort: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  chain.exec.mockResolvedValue(value);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(value).then(onFulfilled, onRejected);
  return chain;
}

async function loadModule(env?: Record<string, string | undefined>): Promise<FactRecheckModule> {
  vi.resetModules();

  delete process.env.FACT_RECHECK_ENABLED;

  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  }

  return import("@/app/api/admin/facts-recheck/route");
}

function makeRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/admin/facts-recheck"), {
    method: "POST",
  });
}

describe("POST /api/admin/facts-recheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.FACT_RECHECK_ENABLED;
    vi.restoreAllMocks();
  });

  it("returns 403 when feature flag is disabled (default)", async () => {
    const { POST } = await loadModule({});
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("disabled");
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: null });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: "user@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ isAdmin: false }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("skips facts that have not changed since last check", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ isAdmin: true }));

    const mockFacts = [
      {
        _id: { toString: () => "fact-1" },
        status: "active",
        upvoteCount: 5,
        downvoteCount: 2,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 2,
        lastCheckedCommentCount: 0,
      },
    ];
    mockFactFind.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFacts) });
    mockFactVoteCountDocuments.mockReturnValue(execResult(0));
    mockFactNeedsReassessmentWithComments.mockReturnValue(false);

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.skipped).toBe(1);
    expect(data.processed).toBe(0);
    expect(mockReassessFact).not.toHaveBeenCalled();
  });

  it("processes facts that have enough new votes", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ isAdmin: true }));

    const mockFacts = [
      {
        _id: { toString: () => "fact-1" },
        status: "active",
        upvoteCount: 15,
        downvoteCount: 5,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
        lastCheckedCommentCount: 0,
      },
    ];
    mockFactFind.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFacts) });
    mockFactVoteCountDocuments.mockReturnValue(execResult(2));
    mockFactNeedsReassessmentWithComments.mockReturnValue(true);
    mockReassessFact.mockResolvedValue({
      action: "kept",
      rationale: "Accurate",
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(data.skipped).toBe(0);
    expect(data.results[0].action).toBe("kept");
    expect(mockReassessFact).toHaveBeenCalledWith(mockFacts[0], "system");
  });

  it("handles individual fact reassessment errors gracefully", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ isAdmin: true }));

    const mockFacts = [
      { _id: { toString: () => "fact-1" }, status: "active" },
      { _id: { toString: () => "fact-2" }, status: "active" },
    ];
    mockFactFind.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFacts) });
    mockFactVoteCountDocuments.mockReturnValue(execResult(5));
    mockFactNeedsReassessmentWithComments.mockReturnValue(true);
    mockReassessFact
      .mockRejectedValueOnce(new Error("AI failure"))
      .mockResolvedValueOnce({ action: "kept", rationale: "OK" });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].action).toBe("error");
    expect(data.results[0].error).toBe("AI failure");
    expect(data.results[1].action).toBe("kept");
  });

  it("processes facts that have new rationale comments", async () => {
    const { POST } = await loadModule({ FACT_RECHECK_ENABLED: "true" });
    mockGetAuthSession.mockResolvedValue({ email: "admin@test.com" });
    mockUserFindOne.mockReturnValue(chainableQuery({ isAdmin: true }));

    const mockFacts = [
      {
        _id: { toString: () => "fact-1" },
        status: "active",
        upvoteCount: 5,
        downvoteCount: 2,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 2,
        lastCheckedCommentCount: 0,
      },
    ];
    mockFactFind.mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFacts) });
    mockFactVoteCountDocuments.mockReturnValue(execResult(1));
    mockFactNeedsReassessmentWithComments.mockReturnValue(true);
    mockReassessFact.mockResolvedValue({
      action: "updated",
      updatedText: "Corrected fact",
      rationale: "Slightly inaccurate",
    });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(data.results[0].action).toBe("updated");
  });
});
