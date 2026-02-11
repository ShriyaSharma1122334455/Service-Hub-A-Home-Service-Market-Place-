import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send email using Resend
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    console.log('🔧 Attempting to send email via Resend...');
    
    // Resend returns { data, error }
    const { data, error } = await resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text: text || undefined
    });

    // Check if there was an error
    if (error) {
      console.error('❌ Resend API error:', error);
      return { success: false, error: error.message || error };
    }

    // Success!
    console.log('✅ Email sent successfully via Resend');
    console.log('   Email ID:', data?.id);
    
    return { 
      success: true, 
      id: data?.id,
      data: data
    };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send welcome email
 */
export const sendWelcomeEmail = async (userEmail, userName) => {
  const html = `
    <h1>Welcome to ServiceHub, ${userName}!</h1>
    <p>Thank you for joining ServiceHub.</p>
    <p>Best regards,<br>The ServiceHub Team</p>
  `;

  return await sendEmail({
    to: userEmail,
    subject: 'Welcome to ServiceHub!',
    html
  });
};

/**
 * Send booking confirmation
 */
export const sendBookingConfirmation = async (userEmail, bookingDetails) => {
  const { serviceName, providerName, scheduledAt, totalPrice } = bookingDetails;
  
  const html = `
    <h1>Booking Confirmed!</h1>
    <p>Your booking details:</p>
    <ul>
      <li><strong>Service:</strong> ${serviceName}</li>
      <li><strong>Provider:</strong> ${providerName}</li>
      <li><strong>Scheduled:</strong> ${new Date(scheduledAt).toLocaleString()}</li>
      <li><strong>Total:</strong> $${totalPrice}</li>
    </ul>
    <p>Best regards,<br>The ServiceHub Team</p>
  `;

  return await sendEmail({
    to: userEmail,
    subject: 'Booking Confirmation - ServiceHub',
    html
  });
};

export default { sendEmail, sendWelcomeEmail, sendBookingConfirmation };