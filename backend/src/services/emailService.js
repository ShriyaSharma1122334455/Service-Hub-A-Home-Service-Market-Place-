import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    console.log('🔧 Attempting to send email via Gmail...');
    const info = await transporter.sendMail({
      from: `ServiceHub <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || undefined,
    });
    console.log('✅ Email sent successfully via Gmail');
    console.log('   Message ID:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};

export const sendWelcomeEmail = async (userEmail, userName) => {
  return await sendEmail({
    to: userEmail,
    subject: 'Welcome to ServiceHub!',
    html: `<h1>Welcome to ServiceHub, ${userName}!</h1><p>Thank you for joining ServiceHub.</p><p>Best regards,<br>The ServiceHub Team</p>`,
  });
};

export const sendBookingConfirmation = async (userEmail, bookingDetails) => {
  const { serviceName, providerName, scheduledAt, totalPrice } = bookingDetails;
  return await sendEmail({
    to: userEmail,
    subject: 'Booking Confirmation - ServiceHub',
    html: `
      <h1>Booking Confirmed!</h1>
      <ul>
        <li><strong>Service:</strong> ${serviceName}</li>
        <li><strong>Provider:</strong> ${providerName}</li>
        <li><strong>Scheduled:</strong> ${new Date(scheduledAt).toLocaleString()}</li>
        <li><strong>Total:</strong> $${totalPrice}</li>
      </ul>
      <p>Best regards,<br>The ServiceHub Team</p>
    `,
  });
};

export const sendBookingReminderEmail = async ({
  to, customerName, serviceName, providerName, scheduledAt, address
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <div style="background:#0d9488;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:22px;">⏰ Booking Reminder</h1>
          <p style="color:#ccfbf1;margin:4px 0 0;">Your appointment is tomorrow</p>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px;color:#334155;">Hi <strong>${customerName}</strong>,</p>
          <p style="color:#475569;">This is a reminder that you have a service appointment scheduled for <strong>tomorrow</strong>.</p>
          <div style="background:#f8fafc;border-left:4px solid #0d9488;border-radius:8px;padding:20px;margin:24px 0;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Service</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${serviceName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Provider</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${providerName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Date</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${dateStr}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Time</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${timeStr}</td></tr>
              ${address ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Address</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${address}</td></tr>` : ''}
            </table>
          </div>
          <p style="color:#475569;font-size:14px;">Please make sure someone is available at the address during this time.</p>
          <p style="color:#94a3b8;font-size:13px;margin-top:32px;">— The ServiceHub Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    subject: `Reminder: ${serviceName} appointment tomorrow at ${timeStr}`,
    html,
    text: `Hi ${customerName}, reminder: ${serviceName} with ${providerName} is tomorrow (${dateStr} at ${timeStr})${address ? ' at ' + address : ''}.`,
  });
};

export default { sendEmail, sendWelcomeEmail, sendBookingConfirmation, sendBookingReminderEmail };
