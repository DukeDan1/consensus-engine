// forgot-password.route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { EmailClient } from "@azure/communication-email";

// --- Mocks (hoisted by Vitest) ---
vi.mock("@/server/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    userPasswordResetCode: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@azure/communication-email", () => {
  const poller = { pollUntilDone: vi.fn().mockResolvedValue({ status: "Succeeded" }) };
  return {
    EmailClient: vi.fn().mockImplementation(() => ({
      beginSend: vi.fn().mockResolvedValue(poller),
    })),
  };
});

// Handy typed handles to mocked functions
type VMock = ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: VMock };
  userPasswordResetCode: { create: VMock };
};
const MockEmailClient = EmailClient as unknown as VMock;

const OLD_ENV = process.env;

describe("POST /api/forgot-password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING = "test-connection-string";
    process.env.NEXTJS_APP_BASE_URL = "https://test.url";

    // Provide crypto.randomUUID if your route uses it
    // (use defineProperty to avoid issues if crypto already exists / is readonly)
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: vi.fn(() => "uuid") },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.restoreAllMocks();
  });

  it("returns 400 if email is missing", async () => {
    const req = { json: vi.fn().mockResolvedValue({}) } as unknown as Request;

    const res = await POST(req);
    expect(res).toBeInstanceOf(NextResponse);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("You must enter an email address.");
  });

  it("returns 404 if user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = { json: vi.fn().mockResolvedValue({ email: "test@example.com" }) } as unknown as Request;

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("User not found.");
  });

  it("returns 500 if email sending fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, email: "test@example.com", name: "Test" });
    mockPrisma.userPasswordResetCode.create.mockResolvedValue({ code: "reset-code" });

    // Force EmailClient to report a Failed send
    MockEmailClient.mockImplementation(() => ({
      beginSend: vi.fn().mockResolvedValue({
        pollUntilDone: vi.fn().mockResolvedValue({ status: "Failed" }),
      }),
    }));

    const req = { json: vi.fn().mockResolvedValue({ email: "test@example.com" }) } as unknown as Request;

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to send reset email.");
  });

//   it("returns 200 and sends email if all is well", async () => {
//     mockPrisma.user.findUnique.mockResolvedValue({ id: 1, email: "test@example.com", name: "Test" });
//     mockPrisma.userPasswordResetCode.create.mockResolvedValue({ code: "reset-code" });

//     const req = { json: vi.fn().mockResolvedValue({ email: "test@example.com" }) } as unknown as Request;
//     const res = await POST(req); 
//     expect(res.status).toBe(200);
//     const json = await res.json();
//     expect(json.success).toBe(true);
//   });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("DB error"));

    const req = { json: vi.fn().mockResolvedValue({ email: "test@example.com" }) } as unknown as Request;

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Server error");
  });
});
