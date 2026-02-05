import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter based on environment
// Supports Gmail (with App Password) or SendGrid
function createTransporter() {
  // Check if using SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // Check if using Gmail
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback for development - use ethereal for testing
  console.warn('No email configuration found. Emails will be logged to console.');
  return null;
}

const transporter = createTransporter();

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 */
export async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || 'Apex Legal <noreply@apex.law>';

  if (!transporter) {
    // Development fallback - log to console
    console.log('='.repeat(60));
    console.log('EMAIL (Development Mode)');
    console.log('='.repeat(60));
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text: ${text}`);
    console.log('='.repeat(60));
    return { messageId: 'dev-' + Date.now() };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetToken - The reset token (NOT hashed)
 * @param {string} firstName - User's first name
 */
export async function sendPasswordResetEmail(email, resetToken, firstName) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  const subject = 'Reset Your Apex Password';
  
  const text = `
Hi ${firstName || 'there'},

We received a request to reset your password for your Apex account.

Click the link below to reset your password. This link will expire in 1 hour.

${resetLink}

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

For security reasons, this link will expire in 1 hour.

Best regards,
The Apex Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #1a1a2e; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center;">
              <!-- Logo -->
              <svg width="48" height="48" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 4L28 28H4L16 4Z" fill="url(#grad)" stroke="#F59E0B" stroke-width="1.5"/>
                <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
                <defs>
                  <linearGradient id="grad" x1="16" y1="4" x2="16" y2="28">
                    <stop stop-color="#FBBF24"/>
                    <stop offset="1" stop-color="#F59E0B"/>
                  </linearGradient>
                </defs>
              </svg>
              <h1 style="margin: 20px 0 0; color: #ffffff; font-size: 24px; font-weight: 400;">Apex</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px;">
              <h2 style="margin: 0 0 15px; color: #ffffff; font-size: 20px; font-weight: 500;">Reset Your Password</h2>
              <p style="margin: 0 0 25px; color: #94a3b8; font-size: 15px; line-height: 1.6;">
                Hi ${firstName || 'there'},<br><br>
                We received a request to reset your password for your Apex account. Click the button below to choose a new password.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: #0a0a0f; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 25px 0 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                This link will expire in <strong style="color: #94a3b8;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.05);">
              <p style="margin: 0 0 10px; color: #64748b; font-size: 12px;">
                Can't click the button? Copy and paste this link:
              </p>
              <p style="margin: 0; color: #F59E0B; font-size: 11px; word-break: break-all;">
                ${resetLink}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center;">
              <p style="margin: 0; color: #475569; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Apex Legal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}
