import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

export function getSmtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(SMTP_PORT);
  if (!Number.isFinite(port) || port <= 0) return null;

  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    from: SMTP_FROM || SMTP_USER,
  };
}

export function createSmtpTransport() {
  const config = getSmtpConfig();
  if (!config) return null;

  const transportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    family: 4,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: {
      servername: config.host,
    },
  } as SMTPTransport.Options & { family: number };

  return nodemailer.createTransport(transportOptions as SMTPTransport.Options);
}
