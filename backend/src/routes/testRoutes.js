import express from 'express';
import { sendEmail } from '../services/emailService.js';

const router = express.Router();

// Test email endpoint with detailed logging
router.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    
    console.log('📧 Test email request received');
    console.log('   To:', to);
    console.log('   From:', process.env.FROM_EMAIL);
    console.log('   API Key:', process.env.RESEND_API_KEY ? 'Set (hidden)' : 'NOT SET!');
    
    if (!to) {
      return res.status(400).json({ error: 'Email address required' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ 
        error: 'Resend API key not configured',
        message: 'Please check your .env file'
      });
    }

    console.log('📤 Sending email...');
    
    const result = await sendEmail({
      to,
      subject: 'Test Email from ServiceHub',
      html: `
        <h1>Hello from ServiceHub!</h1>
        <p>This is a test email sent at ${new Date().toLocaleString()}</p>
        <p>If you received this, the email service is working correctly! ✅</p>
      `
    });

    console.log('📨 Email send result:', result);

    if (result.success) {
      res.json({ 
        message: 'Email sent successfully!', 
        id: result.id,
        to: to,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ Email failed:', result.error);
      res.status(500).json({ 
        error: 'Failed to send email', 
        details: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;