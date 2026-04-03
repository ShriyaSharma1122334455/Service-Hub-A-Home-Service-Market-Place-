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

// ── 1. GET /api/verification/prefill/:userId ─────────────────────────────

export const getPrefill = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('full_name, email, phone')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Only return safe, non-sensitive fields
    return res.json({
      success: true,
      data: {
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || null,
      },
    });
  } catch (err) {
    console.error('getPrefill error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch prefill data' });
  }
};

// ── 2. POST /api/verification/upload-id ──────────────────────────────────

export const uploadId = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Field name must be "document".' });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp`,
      });
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size: 5MB' });
    }

    // Get internal user
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const documentType = req.body.documentType || 'drivers_license';

    // Upload to Supabase Storage
    const ext = mimeToExt(file.mimetype);
    const destPath = generateVerificationPath(internalUser.id, 'id-document', ext);
    const uploadResult = await uploadVerificationDocument(file.buffer, file.mimetype, destPath);

    if (!uploadResult.success) {
      return res.status(500).json({ success: false, error: uploadResult.error });
    }

    // Get a signed URL for the AI service to download the image
    const signedResult = await getSignedUrl(uploadResult.path, 600);
    if (!signedResult.success) {
      return res.status(500).json({ success: false, error: 'Failed to generate signed URL for AI processing' });
    }

    // Call AI OCR service
    let ocrResult = null;
    try {
      const aiResp = await fetch(`${AI_SERVICES_URL}/api/v1/verify/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': AI_INTERNAL_KEY,
        },
        body: JSON.stringify({
          image_url: signedResult.signedUrl,
          document_type: documentType,
          user_id: internalUser.id,
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

    // Upsert the Verification record
    const extractedName = ocrResult?.extracted_data?.full_name || null;
    const extractedDob = ocrResult?.extracted_data?.date_of_birth || null;

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
      // If upsert fails because there's no unique constraint on user_id,
      // try insert then update pattern
      console.error('Verification upsert error:', upsertError.message);

      // Try to find existing record
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
    });
  } catch (err) {
    console.error('uploadId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process ID document' });
  }
};

// ── 3. POST /api/verification/upload-selfie ──────────────────────────────

export const uploadSelfie = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Field name must be "selfie".' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp`,
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size: 5MB' });
    }

    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Upload selfie to storage
    const ext = mimeToExt(file.mimetype);
    const destPath = generateVerificationPath(internalUser.id, 'selfie', ext);
    const uploadResult = await uploadVerificationDocument(file.buffer, file.mimetype, destPath);

    if (!uploadResult.success) {
      return res.status(500).json({ success: false, error: uploadResult.error });
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
        error: 'Please upload your ID document first before taking a selfie.',
      });
    }

    // Get signed URLs for both images
    const idSignedResult = await getSignedUrl(verification.id_document_url, 600);
    const selfieSignedResult = await getSignedUrl(uploadResult.path, 600);

    if (!idSignedResult.success || !selfieSignedResult.success) {
      return res.status(500).json({ success: false, error: 'Failed to generate signed URLs for AI processing' });
    }

    // Call AI face match service
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
          user_id: internalUser.id,
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

    // Update verification record
    await supabase
      .from('verifications')
      .update({
        selfie_url: uploadResult.path,
        face_match_result: faceMatchResult,
      })
      .eq('id', verification.id);

    return res.json({
      success: true,
      data: {
        faceMatchResult,
        selfiePath: uploadResult.path,
      },
    });
  } catch (err) {
    console.error('uploadSelfie error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process selfie' });
  }
};

// ── 4. POST /api/verification/submit ─────────────────────────────────────

export const submitVerification = async (req, res) => {
  try {
    const internalUser = await getInternalUser(req.user.id);
    if (!internalUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
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
      return res.status(400).json({ success: false, error: 'No verification record found. Please start the verification process.' });
    }

    if (!verification.id_document_url) {
      return res.status(400).json({ success: false, error: 'ID document not uploaded yet.' });
    }

    if (!verification.selfie_url) {
      return res.status(400).json({ success: false, error: 'Selfie not uploaded yet.' });
    }

    // Call NSOPW check using extracted name
    const fullName = verification.extracted_name || internalUser.full_name;
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
          state: null,
          user_id: internalUser.id,
        }),
      });

      if (aiResp.ok) {
        nsopwResult = await aiResp.json();
      } else {
        const errText = await aiResp.text();
        console.error('AI NSOPW error:', aiResp.status, errText);
        nsopwResult = { status: 'manual_review', error: 'NSOPW check returned an error' };
      }
    } catch (aiErr) {
      console.error('AI NSOPW unreachable:', aiErr.message);
      nsopwResult = { status: 'manual_review', is_clear: true, used_fallback: true };
    }

    // Update verification record
    const now = new Date().toISOString();
    await supabase
      .from('verifications')
      .update({
        nsopw_result: nsopwResult,
        verification_status: 'pending',
        submitted_at: now,
      })
      .eq('id', verification.id);

    // Also update the user's and provider's verification_status to pending
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
        message: 'Verification submitted successfully. Your identity is under review.',
        submittedAt: now,
        nsopwResult,
      },
    });
  } catch (err) {
    console.error('submitVerification error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit verification' });
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
      });
    }

    return res.json({ success: true, data: verification });
  } catch (err) {
    console.error('getStatus error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch verification status' });
  }
};

export default { getPrefill, uploadId, uploadSelfie, submitVerification, getStatus };
