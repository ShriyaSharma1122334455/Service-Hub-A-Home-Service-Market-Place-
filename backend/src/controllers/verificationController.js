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

const AI_SERVICES_URL = process.env.AI_SERVICES_URL || 'http://localhost:8001';
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
    const { userId } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('full_name, email, phone, date_of_birth')
      .eq('id', userId)
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
        dateOfBirth: user.date_of_birth || null,
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

    // Call AI OCR service at /ai/ocr/parse-id as multipart POST
    let ocrResult = null;
    try {
      const formData = new FormData();
      formData.append('document', new Blob([file.buffer], { type: file.mimetype }), `id-document.${ext}`);
      formData.append('document_type', documentType);

      const aiResp = await fetch(`${AI_SERVICES_URL}/ai/ocr/parse-id`, {
        method: 'POST',
        headers: {
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: formData,
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

    // Upsert a row in public.verifications
    const { data: verification, error: upsertError } = await supabase
      .from('verifications')
      .upsert(
        {
          user_id: internalUser.id,
          document_type: documentType,
          id_document_url: uploadResult.path,
          ocr_result: ocrResult,
          extracted_name: extractedName,
          extracted_dob: extractedDob,
          verification_status: 'pending',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (upsertError) {
      // Fallback: try find-then-update if upsert fails (no unique constraint)
      console.error('Verification upsert error:', upsertError.message);

      const { data: existing } = await supabase
        .from('verifications')
        .select('id')
        .eq('user_id', internalUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('verifications')
          .update({
            document_type: documentType,
            id_document_url: uploadResult.path,
            ocr_result: ocrResult,
            extracted_name: extractedName,
            extracted_dob: extractedDob,
            verification_status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('verifications').insert({
          user_id: internalUser.id,
          document_type: documentType,
          id_document_url: uploadResult.path,
          ocr_result: ocrResult,
          extracted_name: extractedName,
          extracted_dob: extractedDob,
          verification_status: 'pending',
        });
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
    return res.status(500).json({ success: false, data: null, error: 'Failed to process ID document' });
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
    const { data: verification } = await supabase
      .from('verifications')
      .select('id, id_document_url')
      .eq('user_id', internalUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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

    let idImageBuffer = null;
    try {
      const idResp = await fetch(idSignedResult.signedUrl);
      if (idResp.ok) {
        const arrBuf = await idResp.arrayBuffer();
        idImageBuffer = Buffer.from(arrBuf);
      }
    } catch (dlErr) {
      console.error('Failed to download ID image for face match:', dlErr.message);
    }

    if (!idImageBuffer) {
      return res.status(500).json({ success: false, data: null, error: 'Failed to retrieve ID document for face matching' });
    }

    // Call AI face match service at /ai/face/match as multipart POST
    let faceMatchResult = null;
    try {
      const formData = new FormData();
      formData.append('id_image', new Blob([idImageBuffer], { type: 'image/jpeg' }), 'id-document.jpg');
      formData.append('selfie', new Blob([file.buffer], { type: file.mimetype }), `selfie.${ext}`);

      const aiResp = await fetch(`${AI_SERVICES_URL}/ai/face/match`, {
        method: 'POST',
        headers: {
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: formData,
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
    return res.status(500).json({ success: false, data: null, error: 'Failed to process selfie' });
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
      .single();

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

    // Parse firstName and lastName from the extracted_name field in the OCR result
    const fullName = verification.extracted_name || internalUser.full_name;
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';

    // Call AI NSOPW check at /ai/nsopw/check as JSON POST
    let nsopwResult = null;
    try {
      const aiResp = await fetch(`${AI_SERVICES_URL}/ai/nsopw/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          firstName,
          lastName,
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

    // Update verification record: save nsopw_result, set status to pending, set submitted_at to now
    const now = new Date().toISOString();
    await supabase
      .from('verifications')
      .update({
        nsopw_result: nsopwResult,
        verification_status: 'pending',
        submitted_at: now,
        updated_at: now,
      })
      .eq('id', verification.id);

    // Also update the user's verification_status to pending
    await supabase
      .from('users')
      .update({ verification_status: 'pending' })
      .eq('id', internalUser.id);

    // If provider, update provider table too
    if (internalUser.role === 'provider') {
      await supabase
        .from('providers')
        .update({ verification_status: 'pending' })
        .eq('user_id', internalUser.id);
    }

    return res.json({
      success: true,
      data: {
        status: 'pending',
        submittedAt: now,
        nsopwResult,
      },
      error: null,
    });
  } catch (err) {
    console.error('submitVerification error:', err);
    return res.status(500).json({ success: false, data: null, error: 'Failed to submit verification' });
  }
};

// ── 5. GET /api/verification/status/:userId ──────────────────────────────

export const getStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: verification, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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
