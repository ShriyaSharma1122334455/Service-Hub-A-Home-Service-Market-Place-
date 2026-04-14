import { fileTypeFromBuffer } from 'file-type';
import { matchAssessmentToCatalog } from '../services/catalogMatchmaking.js';
import { normalizeVdaError } from '../utils/vdaErrorNormalizer.js';
import { retryWithBackoff } from '../utils/retryWithBackoff.js';
import { validateAndSanitizeVdaResponse } from '../utils/vdaResponseValidator.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const TASK_MAX_LENGTH = 500;

/**
 * POST /api/assessments/visual
 * Multipart: field "image" (file), optional "task" (string).
 * Proxies to VDA, then runs catalog matchmaking (stateless).
 */
export const assessVisualDamage = async (req, res) => {
  try {
    const baseUrl = process.env.VDA_SERVICE_URL?.replace(/\/$/, '');
    const serviceToken = process.env.VDA_SERVICE_API_KEY?.trim();
    if (!baseUrl) {
      return res.status(503).json({
        success: false,
        error: 'Visual assessment service is not configured (VDA_SERVICE_URL).',
      });
    }
    if (!serviceToken) {
      return res.status(503).json({
        success: false,
        error: 'Visual assessment service is not configured securely (VDA_SERVICE_API_KEY).',
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Image file is required (field name: image).',
      });
    }

    if (req.file.size > MAX_IMAGE_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'Image exceeds maximum size (10MB).',
      });
    }

    const mime = req.file.mimetype;
    if (mime !== 'image/jpeg' && mime !== 'image/png') {
      return res.status(400).json({
        success: false,
        error: 'Only JPEG and PNG images are allowed.',
      });
    }

    // Validate file content using magic bytes (prevents MIME type spoofing)
    let detectedType;
    try {
      detectedType = await fileTypeFromBuffer(req.file.buffer);
    } catch (err) {
      console.error('Failed to detect file type:', err);
      return res.status(400).json({
        success: false,
        error: 'Unable to verify file type. Please upload a valid image.',
      });
    }

    if (!detectedType || !['image/jpeg', 'image/png'].includes(detectedType.mime)) {
      return res.status(400).json({
        success: false,
        error: `File content does not match declared type. Expected JPEG or PNG.`,
      });
    }

    const task =
      typeof req.body?.task === 'string' && req.body.task.trim()
        ? req.body.task.trim()
        : 'I want an expert visual assessment for my goal.';

    if (task.length > TASK_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Task description too long. Maximum ${TASK_MAX_LENGTH} characters allowed.`,
      });
    }

    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const filename = `upload.${ext}`;

    const form = new FormData();
    form.append(
      'image',
      new Blob([req.file.buffer], { type: mime }),
      filename,
    );
    form.append('task', task);

    const vdaUrl = `${baseUrl}/assess`;
    let vdaRes;
    try {
      // Retry logic with exponential backoff (3 attempts, 1s/2s delays)
      vdaRes = await retryWithBackoff(
        async () => {
          const vdaController = new AbortController();
          const vdaTimeout = setTimeout(() => vdaController.abort(), 90_000);

          try {
            const response = await fetch(vdaUrl, {
              method: 'POST',
              headers: {
                'X-Service-Token': serviceToken,
              },
              body: form,
              signal: vdaController.signal,
            });
            clearTimeout(vdaTimeout);
            return response;
          } catch (fetchErr) {
            clearTimeout(vdaTimeout);
            throw fetchErr;
          }
        },
        {
          maxAttempts: 3,
          delays: [1000, 2000],
          onRetry: (error, attempt, delayMs) => {
            console.warn(`VDA service attempt ${attempt} failed, retrying in ${delayMs}ms:`, error.message);
          },
        },
      );
    } catch (fetchErr) {
      if (fetchErr?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          error: 'Visual assessment service timed out. Please try again.',
        });
      }
      throw fetchErr;
    }

    const vdaText = await vdaRes.text();
    let vdaJson;
    try {
      vdaJson = JSON.parse(vdaText);
    } catch {
      return res.status(502).json({
        success: false,
        error: 'Invalid response from visual assessment service.',
      });
    }

    if (!vdaRes.ok) {
      // Normalize error message to prevent information leakage
      const { userMessage, logDetails } = normalizeVdaError(vdaJson, vdaRes.status);

      // Log full error details server-side only
      console.error('VDA service error:', logDetails);

      // Return only sanitized message to client
      return res.status(vdaRes.status >= 400 && vdaRes.status < 600 ? vdaRes.status : 502).json({
        success: false,
        error: userMessage,
      });
    }

    // Validate and sanitize VDA response
    let validatedVda;
    try {
      validatedVda = validateAndSanitizeVdaResponse(vdaJson);
    } catch (validationErr) {
      console.error('VDA response validation failed:', validationErr.message);
      if (validationErr.validationErrors) {
        console.error('Validation errors:', validationErr.validationErrors);
      }
      return res.status(validationErr.statusCode || 502).json({
        success: false,
        error: 'Invalid response from visual assessment service.',
      });
    }

    const { assessment, recommendation, estimated_cost_usd, confidence_score } = validatedVda;

    const { recommended_services } = await matchAssessmentToCatalog(
      { assessment, recommendation },
      task,
    );

    const job_description = [
      jobSection('Summary', assessment),
      jobSection('Recommendation', recommendation),
      jobSection('Indicative cost (not a quote)', estimated_cost_usd),
      task && jobSection('Customer goal', task),
    ]
      .filter(Boolean)
      .join('\n\n');

    return res.json({
      success: true,
      data: {
        vda: {
          assessment,
          recommendation,
          estimated_cost_usd,
          confidence_score,
        },
        recommended_services,
        job_description,
      },
    });
  } catch (err) {
    console.error('assessVisualDamage error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to run visual assessment.',
    });
  }
};

function jobSection(title, body) {
  if (!body || String(body).trim() === '') return '';
  return `${title}:\n${String(body).trim()}`;
}

export default { assessVisualDamage };
