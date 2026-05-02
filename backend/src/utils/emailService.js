import { Resend } from 'resend';

// Lazy singleton — avoids throwing at import time when RESEND_API_KEY is absent (e.g. in tests)
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.EMAIL_FROM || 'ServiceHub <noreply@servicehub.app>';

export async function sendBookingConfirmation(booking, customerEmail) {
  const { id, scheduled_at, total_price } = booking;
  await getResend().emails.send({
    from: FROM,
    to: customerEmail,
    subject: 'Your booking has been confirmed — ServiceHub',
    html: `
      <p>Great news! Your booking has been <strong>confirmed</strong> by the provider.</p>
      <ul>
        <li><strong>Booking ID:</strong> ${id}</li>
        <li><strong>Scheduled:</strong> ${new Date(scheduled_at).toLocaleString()}</li>
        <li><strong>Total:</strong> $${total_price}</li>
      </ul>
      <p>We'll see you then!</p>
    `,
  });
}

export async function sendBookingCancellation(booking, customerEmail) {
  const { id, cancellation_reason } = booking;
  await getResend().emails.send({
    from: FROM,
    to: customerEmail,
    subject: 'Booking cancelled — ServiceHub',
    html: `
      <p>Unfortunately, your booking has been <strong>cancelled</strong>.</p>
      <ul>
        <li><strong>Booking ID:</strong> ${id}</li>
        ${cancellation_reason ? `<li><strong>Reason:</strong> ${cancellation_reason}</li>` : ''}
      </ul>
      <p>Please visit ServiceHub to book again at your convenience.</p>
    `,
  });
}

export async function sendBookingCompletion(booking, customerEmail) {
  const { id, completed_at, total_price } = booking;
  await getResend().emails.send({
    from: FROM,
    to: customerEmail,
    subject: 'Service completed — ServiceHub',
    html: `
      <p>Your service has been <strong>completed</strong>. Thank you for using ServiceHub!</p>
      <ul>
        <li><strong>Booking ID:</strong> ${id}</li>
        <li><strong>Completed:</strong> ${new Date(completed_at).toLocaleString()}</li>
        <li><strong>Total charged:</strong> $${total_price}</li>
      </ul>
      <p>We'd love your feedback — leave a review on the provider's profile.</p>
    `,
  });
}
