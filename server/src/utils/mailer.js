const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

function getTransporter() {
  if (!transporter) {
    if (env.smtp.host) {
      transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
        // Fail fast if the SMTP host is unreachable; nodemailer's defaults
        // can hang a request for up to 2 minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    } else {
      // Dev fallback: no SMTP configured - messages are captured, not sent.
      transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }
  return transporter;
}

async function verifyMailer() {
  if (!env.smtp.host) {
    console.log('[mailer] SMTP_HOST not set - outbound email is disabled');
    return;
  }
  try {
    await getTransporter().verify();
    console.log(`[mailer] SMTP connection to ${env.smtp.host}:${env.smtp.port} verified`);
  } catch (err) {
    console.error(`[mailer] SMTP verification failed (${env.smtp.host}:${env.smtp.port}): ${err.message}`);
  }
}

module.exports = { getTransporter, verifyMailer };
