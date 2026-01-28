import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockSendNotificationEmails = vi.hoisted(() => vi.fn());

vi.mock("@/app/models/notification", () => ({
  default: {
    create: mockNotificationCreate,
  },
}));

vi.mock("@/app/services/notificationEmailService", () => ({
  sendNotificationEmails: mockSendNotificationEmails,
}));

import { notifyModeratorStatusChange } from "@/app/services/moderatorNotificationService";

describe("moderatorNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({});
    mockSendNotificationEmails.mockResolvedValue({});
    delete process.env.NEXTJS_APP_BASE_URL;
  });

  afterEach(() => {
    delete process.env.NEXTJS_APP_BASE_URL;
  });

  describe("notifyModeratorStatusChange", () => {
    const baseParams = {
      recipientId: "user-123",
      topicId: "topic-456",
      topicTitle: "Test Topic",
      action: "promoted" as const,
      source: "auto" as const,
    };

    it("does nothing when recipientId is missing", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        recipientId: "",
      });

      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(mockSendNotificationEmails).not.toHaveBeenCalled();
    });

    it("does nothing when topicId is missing", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        topicId: "",
      });

      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(mockSendNotificationEmails).not.toHaveBeenCalled();
    });

    it("creates notification for auto-promotion", async () => {
      await notifyModeratorStatusChange(baseParams);

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        recipient: "user-123",
        actor: undefined,
        type: "user_activity",
        topic: "topic-456",
        message: 'You were automatically promoted to moderator for "Test Topic".',
        topicTitle: "Test Topic",
      });
    });

    it("creates notification for admin promotion with actor name", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        source: "admin",
        actorId: "admin-789",
        actorName: "John Admin",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        recipient: "user-123",
        actor: "admin-789",
        type: "user_activity",
        topic: "topic-456",
        message: 'John Admin promoted you to moderator for "Test Topic".',
        topicTitle: "Test Topic",
      });
    });

    it("uses default admin name when actor name is missing", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        source: "admin",
        actorId: "admin-789",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'An administrator promoted you to moderator for "Test Topic".',
        })
      );
    });

    it("creates notification for admin removal", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        action: "removed",
        source: "admin",
        actorId: "admin-789",
        actorName: "Jane Admin",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Jane Admin removed you as a moderator for "Test Topic".',
        })
      );
    });

    it("creates notification for community removal", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        action: "removed",
        source: "community",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'You were removed as a moderator for "Test Topic" due to community feedback.',
        })
      );
    });

    it("creates notification for auto removal", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        action: "removed",
        source: "auto",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'You were removed as a moderator for "Test Topic".',
        })
      );
    });

    it("sends email notification", async () => {
      await notifyModeratorStatusChange(baseParams);

      expect(mockSendNotificationEmails).toHaveBeenCalledWith({
        recipientIds: ["user-123"],
        preferenceKey: "emailModeration",
        subject: "You're now a moderator",
        message: 'You were automatically promoted to moderator for "Test Topic".',
        actionUrl: "/topics/topic-456",
        actionLabel: "View topic",
        preview: 'You were automatically promoted to moderator for "Test Topic".',
      });
    });

    it("uses baseUrl from params for action URL", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        baseUrl: "https://example.com",
      });

      expect(mockSendNotificationEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          actionUrl: "https://example.com/topics/topic-456",
        })
      );
    });

    it("uses baseUrl from environment when not in params", async () => {
      process.env.NEXTJS_APP_BASE_URL = "https://env-example.com";

      await notifyModeratorStatusChange(baseParams);

      expect(mockSendNotificationEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          actionUrl: "https://env-example.com/topics/topic-456",
        })
      );
    });

    it("strips trailing slashes from baseUrl", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        baseUrl: "https://example.com///",
      });

      expect(mockSendNotificationEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          actionUrl: "https://example.com/topics/topic-456",
        })
      );
    });

    it("uses 'this topic' as fallback when topicTitle is empty", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        topicTitle: "",
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'You were automatically promoted to moderator for "this topic".',
        })
      );
    });

    it("handles notification creation failure gracefully", async () => {
      mockNotificationCreate.mockRejectedValueOnce(new Error("DB error"));

      // Should not throw
      await expect(notifyModeratorStatusChange(baseParams)).resolves.toBeUndefined();
    });

    it("handles email sending failure gracefully", async () => {
      mockSendNotificationEmails.mockRejectedValueOnce(new Error("Email error"));

      // Should not throw - email failures are caught internally
      await expect(notifyModeratorStatusChange(baseParams)).resolves.toBeUndefined();
    });

    it("sets correct subject for promotion", async () => {
      await notifyModeratorStatusChange(baseParams);

      expect(mockSendNotificationEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "You're now a moderator",
        })
      );
    });

    it("sets correct subject for removal", async () => {
      await notifyModeratorStatusChange({
        ...baseParams,
        action: "removed",
      });

      expect(mockSendNotificationEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Moderator access removed",
        })
      );
    });
  });
});
