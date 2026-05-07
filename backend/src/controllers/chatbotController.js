import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';
import { callLLM, isLikelyOffTopic, offTopicRefusal } from '../services/llmService.js';

/**
 * GET /api/chatbot/context
 * Returns role-appropriate booking data for the chatbot to display.
 * Customers get their own bookings; providers get their incoming/scheduled jobs.
 */
export const getChatbotContext = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const role = internalUser.role || req.user.role || 'customer';
    let bookings = [];

    if (role === 'provider') {
      // Look up provider profile
      const { data: providerProfile } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', internalUser.id)
        .maybeSingle();

      if (providerProfile) {
        const { data } = await supabase
          .from('bookings')
          .select(`
            id, status, scheduled_at, total_price, notes,
            service:services(name),
            customer:users!bookings_customer_id_fkey(full_name)
          `)
          .eq('provider_id', providerProfile.id)
          .order('scheduled_at', { ascending: true })
          .limit(10);

        bookings = data || [];
      }
    } else {
      // Customer sees their own bookings
      const { data } = await supabase
        .from('bookings')
        .select(`
          id, status, scheduled_at, total_price, notes,
          service:services(name),
          provider:providers(business_name)
        `)
        .eq('customer_id', internalUser.id)
        .order('scheduled_at', { ascending: false })
        .limit(10);

      bookings = data || [];
    }

    return res.json({
      success: true,
      data: { role, bookings },
    });

  } catch (err) {
    console.error('getChatbotContext error:', err);
    res.status(500).json({ success: false, error: 'Failed to load chatbot context' });
  }
};

/**
 * POST /api/chatbot/message
 * Body: { message: string, history?: [{role, content}] }
 * Auth: optional (guests allowed via optionalAuthenticate)
 *
 * Returns: { success: true, data: { text, contentType, faqAnswer, quickReplies } }
 *
 * The frontend is responsible for fetching real bookings via GET /chatbot/context
 * if contentType === 'order-cards' (the LLM never sees real UUIDs).
 */
export const postChatbotMessage = async (req, res) => {
  const { message, history = [] } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ success: false, error: 'message too long (max 1000 chars)' });
  }

  // Cheap pre-flight off-topic short-circuit (saves Groq quota)
  if (isLikelyOffTopic(message)) {
    return res.json({ success: true, data: offTopicRefusal() });
  }

  // ── Build context block injected into the user message ──────────────
  let contextBlock = '';

  if (req.user) {
    try {
      const internalUser = await getInternalUser(req.user.id, 'id, role, full_name');
      const role = internalUser?.role || req.user.role || 'customer';
      const firstName = (internalUser?.full_name || '').split(' ')[0] || '';
      contextBlock = `[Logged-in user role: ${role}${firstName ? `, first name: ${firstName}` : ''}]\n`;

      if (role === 'provider' && internalUser) {
        const { data: prov } = await supabase
          .from('providers')
          .select('id, business_name')
          .eq('user_id', internalUser.id)
          .maybeSingle();

        if (prov) {
          const { data: bookings } = await supabase
            .from('bookings')
            .select(`
              id, status, scheduled_at, total_price,
              service:services(name),
              customer:users!bookings_customer_id_fkey(full_name)
            `)
            .eq('provider_id', prov.id)
            .order('scheduled_at', { ascending: true })
            .limit(5);

          const count = bookings?.length || 0;
          contextBlock += `[Business: ${prov.business_name}]\n`;
          contextBlock += `[Provider has ${count} booking${count === 1 ? '' : 's'} in the system]\n`;
        }
      } else if (internalUser) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('customer_id', internalUser.id)
          .limit(10);

        const count = bookings?.length || 0;
        contextBlock += `[Customer has ${count} booking${count === 1 ? '' : 's'} in the system]\n`;
      }
    } catch (ctxErr) {
      console.warn('chatbot context build failed (continuing without):', ctxErr.message);
    }
  } else {
    contextBlock = '[User role: guest — not logged in]\n';
  }

  // Trim history to last 6 turns to keep prompt small
  const trimmedHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim(),
        )
        .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
    : [];

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: `${contextBlock}User question: ${message.trim()}` },
  ];

  try {
    const parsed = await callLLM(messages);
    return res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('LLM error:', err.message);
    return res.status(502).json({
      success: false,
      error: 'AI service unavailable. Please try again in a moment.',
    });
  }
};

export default { getChatbotContext, postChatbotMessage };
