/**
 * @fileoverview Supabase Storage service for verification documents.
 *
 * Uploads ID documents and selfies to a PRIVATE Supabase Storage bucket
 * called "verification-documents". These files are never exposed via
 * public URL — only the backend (service-role) can access them.
 *
 * @module services/supabaseVerificationStorage
 */

import supabase from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = 'verification-documents';

/**
 * Allowed MIME types for verification documents.
 */
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Maximum file size in bytes (5 MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Upload a verification document to private Supabase Storage.
 *
 * @param {Buffer} fileBuffer  - Raw file bytes
 * @param {string} mimetype    - MIME type (e.g. "image/jpeg")
 * @param {string} destPath    - Destination path inside the bucket
 *                               (e.g. "userId/id-document.jpg")
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
export const uploadVerificationDocument = async (fileBuffer, mimetype, destPath) => {
  // Validate MIME type
  if (!ALLOWED_MIMETYPES.includes(mimetype)) {
    return {
      success: false,
      error: `Invalid file type: ${mimetype}. Allowed: ${ALLOWED_MIMETYPES.join(', ')}`,
    };
  }

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: 5MB`,
    };
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(destPath, fileBuffer, {
        contentType: mimetype,
        upsert: true,  // overwrite if re-uploading
      });

    if (error) {
      console.error('Supabase Storage upload error:', error.message);
      return { success: false, error: error.message };
    }

    // Return the path — NOT a public URL (these are sensitive documents)
    return { success: true, path: data.path };
  } catch (err) {
    console.error('Upload verification document error:', err);
    return { success: false, error: 'Failed to upload verification document' };
  }
};

/**
 * Generate a unique destination path for a verification file.
 *
 * @param {string} userId   - The user's UUID
 * @param {string} fileType - "id-document" or "selfie"
 * @param {string} ext      - File extension (e.g. "jpg", "png")
 * @returns {string} The destination path
 */
export const generateVerificationPath = (userId, fileType, ext) => {
  const unique = uuidv4().slice(0, 8);
  return `${userId}/${fileType}-${unique}.${ext}`;
};

/**
 * Get a temporary signed URL for a private verification document.
 * Used when the AI service needs to download the image for processing.
 *
 * @param {string} filePath - Path in the bucket
 * @param {number} expiresIn - Seconds until URL expires (default: 300 = 5 min)
 * @returns {Promise<{ success: boolean, signedUrl?: string, error?: string }>}
 */
export const getSignedUrl = async (filePath, expiresIn = 300) => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, signedUrl: data.signedUrl };
  } catch (err) {
    console.error('Get signed URL error:', err);
    return { success: false, error: 'Failed to generate signed URL' };
  }
};

export default {
  uploadVerificationDocument,
  generateVerificationPath,
  getSignedUrl,
};
