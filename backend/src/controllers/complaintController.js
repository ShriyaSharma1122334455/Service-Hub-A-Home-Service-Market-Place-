import supabase from '../config/supabase.js';
import { getInternalUser, profileNotFoundResponse } from '../utils/internalUser.js';

// Subject length bounds — generous enough for free-form text, tight enough
// to block accidental empty / pathological inputs.
const SUBJECT_MIN_LENGTH = 5;
const SUBJECT_MAX_LENGTH = 200;

// POST /api/complaints
export const createComplaint = async (req, res) => {
  try {
    const { subject, description, booking_id, priority } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ success: false, error: 'subject and description are required' });
    }

    const trimmedSubject = String(subject).trim();
    if (trimmedSubject.length < SUBJECT_MIN_LENGTH || trimmedSubject.length > SUBJECT_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subject length',
        message: `Subject must be between ${SUBJECT_MIN_LENGTH} and ${SUBJECT_MAX_LENGTH} characters.`,
      });
    }

    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const { data: complaint, error } = await supabase
      .from('complaints')
      .insert({
        user_id:     internalUser.id,
        booking_id:  booking_id || null,
        subject:     trimmedSubject,
        description,
        priority:    priority || 'MEDIUM',
        status:      'OPEN'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });

    return res.status(201).json({ success: true, data: complaint });

  } catch (err) {
    console.error('createComplaint error:', err);
    res.status(500).json({ success: false, error: 'Failed to create complaint' });
  }
};

// GET /api/complaints — user sees their own
export const listComplaints = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const { data: complaints, error } = await supabase
      .from('complaints')
      .select(`
        *,
        booking:bookings(id, scheduled_at, status)
      `)
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ success: false, error: error.message });

    return res.json({ success: true, count: complaints.length, data: complaints });

  } catch (err) {
    console.error('listComplaints error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch complaints' });
  }
};

// GET /api/complaints/:id
export const getComplaint = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) return profileNotFoundResponse(res);

    const { data: complaint, error } = await supabase
      .from('complaints')
      .select(`*, booking:bookings(id, scheduled_at, status)`)
      .eq('id', req.params.id)
      .eq('user_id', internalUser.id) // ensures user can only fetch their own
      .single();

    if (error || !complaint) {
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }

    return res.json({ success: true, data: complaint });

  } catch (err) {
    console.error('getComplaint error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch complaint' });
  }
};

export default { createComplaint, listComplaints, getComplaint };