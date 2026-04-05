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
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || null,
        dateOfBirth: null,
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
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, data: null, error: 'User not found' });
    }

    // Fetch the latest verification record
    const { data: verification } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification) {
      return res.status(400).json({ success: false, data: null, error: 'No verification record found. Please start the verification process.' });
    }

    // Confirm both id_document_url and selfie_url are saved
    if (!verification.id_document_url || !verification.selfie_url) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'You must complete the ID upload and selfie steps first.',
      });
    }

    // Setup payload for passing to AI service
    const fullName = verification.extracted_name || internalUser.full_name || 'Unknown User';

    // Call AI NSOPW check at /api/v1/verify/nsopw as JSON POST
    let nsopwResult = null;
    try {
      const aiResp = await fetch(`${AI_SERVICES_URL}/api/v1/verify/nsopw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          full_name: fullName,
          user_id: internalUser.id,
          state: null,
        }),
      });

      if (aiResp.ok) {
        nsopwResult = await aiResp.json();
      } else {
        const errText = await aiResp.text();
        console.error('AI NSOPW error:', aiResp.status, errText);
        nsopwResult = { nsopwStatus: 'pending', matchFound: false, matchDetails: [], error: 'NSOPW check returned an error' };
      }
    } catch (aiErr) {
      console.error('AI NSOPW unreachable:', aiErr.message);
      nsopwResult = { nsopwStatus: 'pending', matchFound: false, matchDetails: [], selfDeclarationRequired: true };
    }

    // Determine overall verification status automatically
    let finalStatus = 'pending';
    
    // Evaluate if everything passed perfectly
    const ocrPassed = verification.ocr_result?.status === 'verified';
    const facePassed = verification.face_match_result?.is_match === true || verification.face_match_score >= 90;
    const nsopwPassed = nsopwResult?.is_clear === true && nsopwResult?.status === 'verified';
    
    // Evaluate if there are any hard rejections
    const ocrFailed = verification.ocr_result?.status === 'rejected';
    const faceFailed = verification.face_match_result?.status === 'rejected';
    const nsopwFailed = nsopwResult?.status === 'rejected';

    if (ocrFailed || faceFailed || nsopwFailed) {
      finalStatus = 'failed';
    } else if (ocrPassed && facePassed && nsopwPassed) {
      finalStatus = 'verified';
    }

    // Update verification record: save nsopw_result, set status, set submitted_at to now
    const now = new Date().toISOString();
    await supabase
      .from('verifications')
      .update({
        nsopw_result: nsopwResult,
        verification_status: finalStatus,
        submitted_at: now,
        updated_at: now,
      })
      .eq('id', verification.id);

    // Also update the user's verification_status
    await supabase
      .from('users')
      .update({ verification_status: finalStatus })
      .eq('id', internalUser.id);

    // If provider, update provider table too
    if (internalUser.role === 'provider') {
      await supabase
        .from('providers')
        .update({ verification_status: finalStatus })
        .eq('user_id', internalUser.id);
    }

    return res.json({
      success: true,
      data: {
        status: finalStatus,
        submittedAt: now,
        nsopwResult,
      },
      error: null,
    });
  } catch (err) {
    console.error('submitVerification error:', err);
    return res.status(500).json({ success: false, data: null, error: err.stack || err.message || 'Failed to submit verification' });
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
