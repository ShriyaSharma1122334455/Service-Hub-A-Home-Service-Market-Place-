/**
 * @fileoverview Verification controller for the identity verification pipeline.
 *
 * Handles:
 *  - getPrefill:          Pre-populate the verification form with user data
 *  - uploadId:            Upload ID document → call AI OCR
 *  - uploadSelfie:        Upload selfie → call AI face match
 *  - submitVerification:  Final submission → call NSOPW check
 *  - getStatus:           Retrieve verification status for a user
 *
 * Response shape: { success: boolean, data: object|null, error: string|null }
 *
 * @module controllers/verificationController
 */

import supabase from '../config/supabase.js';
import {
  uploadVerificationDocument,
  generateVerificationPath,
  getSignedUrl,
} from '../services/supabaseVerificationStorage.js';

const AI_SERVICES_URL = process.env.AI_SERVICES_URL || 'http://localhost:8000';
const AI_INTERNAL_KEY = process.env.AI_INTERNAL_API_KEY || 'change-me-in-production';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Resolve Supabase auth id → internal public.users row */
const getInternalUser = async (supabaseId) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role')
    .eq('supabase_id', supabaseId)
    .single();
  if (error) return null;
  return data;
};

/** Map mimetype to file extension */
const mimeToExt = (mime) => {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return map[mime] || 'jpg';
};

/** Allowed image mimetypes */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Maximum file size in bytes (5 MB) */
const MAX_FILE_SIZE = 5242880;

// ── 1. GET /api/verification/prefill/:userId ─────────────────────────────

export const getPrefill = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('full_name, email, phone')
      .eq('id', internalUser.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    // Only return safe, non-sensitive fields — never password, tokens, supabase_id
    return res.json({
      success: true,
      data: {
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        date_of_birth: null,
      },
      error: null,
    });
  } catch (err) {
    console.error('getPrefill error:', err);
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch prefill data' });
  }
};

// ── 2. POST /api/verification/upload-id ──────────────────────────────────

export const uploadId = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, data: null, error: 'No file uploaded. Field name must be "document".' });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp`,
      });
    }

    // Validate file size (5 MB = 5242880 bytes)
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, data: null, error: 'File too large. Maximum size: 5MB' });
    }

    // Get internal user
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    const documentType = req.body.documentType || 'drivers_license';

    // Upload to Supabase Storage — path: userId/id-document-timestamp.ext
    const ext = mimeToExt(file.mimetype);
    const destPath = generateVerificationPath(internalUser.id, 'id-document', ext);
    const uploadResult = await uploadVerificationDocument(file.buffer, file.mimetype, destPath);

    if (!uploadResult.success) {
      return res.status(500).json({ success: false, data: null, error: uploadResult.error });
    }

    // Generate a signed URL for AI service to download the private file
    const idSignedResult = await getSignedUrl(uploadResult.path, 600);
    if (!idSignedResult.success) {
      return res.status(500).json({ success: false, data: null, error: 'Failed to generate signed URL for ID document' });
    }

    // Call AI OCR service at /api/v1/verify/document as JSON POST
    let ocrResult = null;
    try {
      const aiResp = await fetch(`${AI_SERVICES_URL}/api/v1/verify/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          image_url: idSignedResult.signedUrl,
          document_type: documentType,
          user_id: internalUser.id
        }),
      });

      if (aiResp.ok) {
        ocrResult = await aiResp.json();
      } else {
        const errText = await aiResp.text();
        console.error('AI OCR service error:', aiResp.status, errText);
        ocrResult = { status: 'manual_review', error: 'OCR service returned an error' };
      }
    } catch (aiErr) {
      console.error('AI OCR service unreachable:', aiErr.message);
      ocrResult = { status: 'manual_review', error: 'OCR service unavailable' };
    }

    // Extract parsed fields from OCR result
    const extractedName = ocrResult?.extractedName || ocrResult?.extracted_data?.full_name || null;
    const extractedDob = ocrResult?.extractedDOB || ocrResult?.extracted_data?.date_of_birth || null;

    // Save verification record — find existing or create new
    const verificationPayload = {
      document_type: documentType,
      id_document_url: uploadResult.path,
      ocr_result: ocrResult,
      extracted_name: extractedName,
      extracted_dob: extractedDob,
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
    };

    // Check if a verification record already exists for this user
    const { data: existing } = await supabase
      .from('verifications')
      .select('id')
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update the existing record
      const { error: updateError } = await supabase
        .from('verifications')
        .update(verificationPayload)
        .eq('id', existing.id);
      if (updateError) {
        console.error('Verification update error:', updateError.message);
      }
    } else {
      // Insert a new record
      const { error: insertError } = await supabase
        .from('verifications')
        .insert({ user_id: internalUser.id, ...verificationPayload });
      if (insertError) {
        console.error('Verification insert error:', insertError.message);
      }
    }

    return res.json({
      success: true,
      data: {
        ocrResult,
        extractedName,
        extractedDob,
        documentPath: uploadResult.path,
      },
      error: null,
    });
  } catch (err) {
    console.error('uploadId error:', err);
    return res.status(500).json({ success: false, data: null, error: err.stack || err.message || 'Failed to process ID document' });
  }
};

// ── 3. POST /api/verification/upload-selfie ──────────────────────────────

export const uploadSelfie = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, data: null, error: 'No file uploaded. Field name must be "selfie".' });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp`,
      });
    }

    // Validate file size (5 MB = 5242880 bytes)
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, data: null, error: 'File too large. Maximum size: 5MB' });
    }

    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    // Upload selfie to storage — path: userId/selfie-timestamp.ext
    const ext = mimeToExt(file.mimetype);
    const destPath = generateVerificationPath(internalUser.id, 'selfie', ext);
    const uploadResult = await uploadVerificationDocument(file.buffer, file.mimetype, destPath);

    if (!uploadResult.success) {
      return res.status(500).json({ success: false, data: null, error: uploadResult.error });
    }

    // Get existing verification record to find the ID document
    const { data: verification, error: lookupError } = await supabase
      .from('verifications')
      .select('id, id_document_url')
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('Verification lookup error:', lookupError.message);
    }

    if (!verification?.id_document_url) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Please upload your ID document first before taking a selfie.',
      });
    }

    // Download the stored ID document so we can send both buffers to AI
    const idSignedResult = await getSignedUrl(verification.id_document_url, 600);
    if (!idSignedResult.success) {
      return res.status(500).json({ success: false, data: null, error: 'Failed to generate signed URL for ID document' });
    }

    // Generate a signed URL for the newly uploaded selfie
    const selfieSignedResult = await getSignedUrl(uploadResult.path, 600);
    if (!selfieSignedResult.success) {
      return res.status(500).json({ success: false, data: null, error: 'Failed to generate signed URL for selfie' });
    }

    // Call AI face match service at /api/v1/verify/face as JSON POST
    let faceMatchResult = null;
    try {
      const aiResp = await fetch(`${AI_SERVICES_URL}/api/v1/verify/face`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          id_image_url: idSignedResult.signedUrl,
          selfie_url: selfieSignedResult.signedUrl,
          user_id: internalUser.id
        }),
      });

      if (aiResp.ok) {
        faceMatchResult = await aiResp.json();
      } else {
        const errText = await aiResp.text();
        console.error('AI Face Match error:', aiResp.status, errText);
        faceMatchResult = { status: 'manual_review', error: 'Face matching service returned an error' };
      }
    } catch (aiErr) {
      console.error('AI Face Match unreachable:', aiErr.message);
      faceMatchResult = { status: 'manual_review', error: 'Face matching service unavailable' };
    }

    // Update verification record with selfie_url and face_match_result
    await supabase
      .from('verifications')
      .update({
        selfie_url: uploadResult.path,
        face_match_result: faceMatchResult,
        face_match_score: faceMatchResult?.similarity_score || 0.0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', verification.id);

    return res.json({
      success: true,
      data: {
        faceMatchResult,
        selfiePath: uploadResult.path,
      },
      error: null,
    });
  } catch (err) {
    console.error('uploadSelfie error:', err);
    return res.status(500).json({ success: false, data: null, error: err.stack || err.message || 'Failed to process selfie' });
  }
};

// ── 4. POST /api/verification/submit ─────────────────────────────────────

export const submitVerification = async (req, res) => {
  try {
    // ── Step 1: Resolve the authenticated user ───────────────────────────
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    const userId = internalUser.id;

    // ── Step 2: Query the verification record ────────────────────────────
    const { data: verification } = await supabase
      .from('verifications')
      .select('id, id_document_url, selfie_url, ocr_result')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No verification record found, please complete the ID upload step first.',
      });
    }

    if (!verification.id_document_url) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'ID document has not been uploaded yet.',
      });
    }

    if (!verification.selfie_url) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Selfie has not been uploaded yet.',
      });
    }

    // ── Step 3: Parse firstName / lastName from ocr_result ───────────────
    const ocrResult = verification.ocr_result || {};
    const extractedName = ocrResult.extractedName || null;

    let firstName = '';
    let lastName = '';

    if (extractedName && typeof extractedName === 'string') {
      const spaceIndex = extractedName.indexOf(' ');
      if (spaceIndex !== -1) {
        firstName = extractedName.substring(0, spaceIndex);
        lastName = extractedName.substring(spaceIndex + 1);
      } else {
        firstName = '';
        lastName = extractedName;
      }
    }

    // ── Step 4: Parse state from ocr_result ──────────────────────────────
    let state = null;

    // Try issuingState first — must be exactly two uppercase letters
    const issuingState = ocrResult.issuingState || null;
    if (issuingState && typeof issuingState === 'string' && /^[A-Z]{2}$/.test(issuingState)) {
      state = issuingState;
    }

    // Fallback: try to extract state from address field
    if (!state && ocrResult.address && typeof ocrResult.address === 'string') {
      const stateMatch = ocrResult.address.match(/,\s([A-Z]{2})(?:\s\d{5})?/);
      if (stateMatch) {
        state = stateMatch[1];
      }
    }

    // ── Step 4b: Extract ZIP code from OCR address for NSOPW search ─────
    let zipCode = null;
    const ocrAddress = ocrResult.address || ocrResult.extracted_data?.address || '';
    if (typeof ocrAddress === 'string') {
      const zipMatch = ocrAddress.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (zipMatch) {
        zipCode = zipMatch[1];
      }
    }

    // ── Step 5: Call AI NSOPW check at /ai/nsopw/check ───────────────────
    let nsopwResult = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const aiResp = await fetch(`${AI_SERVICES_URL}/ai/nsopw/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          state,
          zipCode,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResp.ok) {
        nsopwResult = await aiResp.json();
      } else {
        console.error('NSOPW service returned HTTP', aiResp.status);
        nsopwResult = { nsopwStatus: 'pending', matchFound: false, matchDetails: [] };
      }
    } catch (aiErr) {
      console.error('NSOPW service request failed:', aiErr.name);
      nsopwResult = { nsopwStatus: 'pending', matchFound: false, matchDetails: [] };
    }

    // ── Step 6: Read nsopwStatus and update DB accordingly ───────────────
    const nsopwStatus = nsopwResult?.nsopwStatus || 'pending';
    const now = new Date().toISOString();

    if (nsopwStatus === 'fail') {
      // ── FAIL: potential match found — flag for review ────────────────
      await supabase
        .from('verifications')
        .update({
          nsopw_result: nsopwResult,
          verification_status: 'failed',
          submitted_at: now,
          updated_at: now,
        })
        .eq('id', verification.id);

      await supabase
        .from('users')
        .update({ verification_status: 'failed' })
        .eq('id', userId);

      const { data: providerRow } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (providerRow) {
        await supabase
          .from('providers')
          .update({ verification_status: 'failed' })
          .eq('user_id', userId);
      }

      return res.status(200).json({
        success: true,
        data: {
          status: 'failed',
          message: 'Background check found a potential match. This account has been flagged for review.',
        },
        error: null,
      });
    }

    if (nsopwStatus === 'pass') {
      // ── PASS: no records found — set to pending for final review ─────
      await supabase
        .from('verifications')
        .update({
          nsopw_result: nsopwResult,
          verification_status: 'pending',
          submitted_at: now,
          updated_at: now,
        })
        .eq('id', verification.id);

      await supabase
        .from('users')
        .update({ verification_status: 'pending' })
        .eq('id', userId);

      const { data: providerRow } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (providerRow) {
        await supabase
          .from('providers')
          .update({ verification_status: 'pending' })
          .eq('user_id', userId);
      }

      return res.status(200).json({
        success: true,
        data: {
          status: 'pending',
          message: 'Verification submitted successfully and is under review.',
        },
        error: null,
      });
    }

    // ── PENDING: NSOPW check could not be completed ─────────────────────
    await supabase
      .from('verifications')
      .update({
        nsopw_result: nsopwResult,
        verification_status: 'pending',
        submitted_at: now,
        updated_at: now,
      })
      .eq('id', verification.id);

    await supabase
      .from('users')
      .update({ verification_status: 'pending' })
      .eq('id', userId);

    const { data: providerRow } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (providerRow) {
      await supabase
        .from('providers')
        .update({ verification_status: 'pending' })
        .eq('user_id', userId);
    }

    return res.status(200).json({
      success: true,
      data: {
        status: 'pending',
        note: 'NSOPW check could not be completed at this time and will be retried.',
      },
      error: null,
    });
  } catch (err) {
    console.error('submitVerification error:', err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Internal server error during verification submission.',
    });
  }
};

// ── 5. GET /api/verification/status/:userId ──────────────────────────────

export const getStatus = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    const { data: verification, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !verification) {
      // No verification record means unverified
      return res.json({
        success: true,
        data: { verification_status: 'unverified' },
        error: null,
      });
    }

    return res.json({ success: true, data: verification, error: null });
  } catch (err) {
    console.error('getStatus error:', err);
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch verification status' });
  }
};

export default { getPrefill, uploadId, uploadSelfie, submitVerification, getStatus };
