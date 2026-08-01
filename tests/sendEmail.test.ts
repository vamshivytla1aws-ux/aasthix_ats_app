import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

vi.mock("@/lib/mailTransport", () => ({
  createSmtpTransport: () => null,
  getSmtpConfig: () => null,
}));

import { sendEmailMessage } from "@/lib/sendEmail";

describe("sendEmailMessage Resend delivery acknowledgement", () => {
  beforeEach(() => {
    resendSend.mockReset();
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "AASTHIX Talent <contact@aasthix.com>";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("does not report success when Resend resolves with an error", async () => {
    resendSend.mockResolvedValue({ data: null, error: { message: "Sender domain is not verified" } });

    const result = await sendEmailMessage({ to: ["candidate@example.com"], subject: "Interview", text: "Test" });

    expect(result).toEqual({ sent: false, reason: "send_failed", detail: "Sender domain is not verified" });
  });

  it("returns the provider message id after Resend accepts the email", async () => {
    resendSend.mockResolvedValue({ data: { id: "email_123" }, error: null });

    const result = await sendEmailMessage({ to: ["candidate@example.com"], subject: "Interview", text: "Test" });

    expect(result).toEqual({ sent: true, provider: "resend", messageId: "email_123" });
  });
});
