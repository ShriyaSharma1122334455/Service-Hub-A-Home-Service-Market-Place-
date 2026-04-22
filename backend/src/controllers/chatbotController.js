import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

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

export default { getChatbotContext };
