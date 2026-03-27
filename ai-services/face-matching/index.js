const express = require('express');
const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');
const sharp = require('sharp');
const dotenv = require('dotenv');

// Load environment variables from parent directory if needed
dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
app.use(express.json());

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function compressImage(buffer) {
  return sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

app.post('/ai/rekognition/face-match', async (req, res) => {
  try {
    const { idImageUrl, selfieUrl } = req.body;
    if (!idImageUrl || !selfieUrl) {
      return res.status(400).json({ error: 'idImageUrl and selfieUrl are required' });
    }

    let idBytes = await downloadImage(idImageUrl);
    let selfieBytes = await downloadImage(selfieUrl);

    // Call Rekognition CompareFaces with Compression fallback
    let comparisonResult;
    try {
      comparisonResult = await attemptCompareFaces(idBytes, selfieBytes);
    } catch (error) {
      if (error.name === 'ImageTooLargeException') {
        // Compress before retry
        idBytes = await compressImage(idBytes);
        selfieBytes = await compressImage(selfieBytes);
        try {
          comparisonResult = await attemptCompareFaces(idBytes, selfieBytes);
        } catch (retryError) {
          return handleRekognitionError(retryError, res);
        }
      } else {
        return handleRekognitionError(error, res);
      }
    }

    const faceMatches = comparisonResult.FaceMatches || [];
    const unmatchedFaces = comparisonResult.UnmatchedFaces || [];

    if (faceMatches.length === 0 && unmatchedFaces.length === 0) {
      // No face detected in the selfie
      return res.json({
        matched: false,
        similarity: 0,
        confidence: 'low',
        faceDetectedInId: true,
        faceDetectedInSelfie: false,
        checkedAt: new Date().toISOString()
      });
    }

    if (faceMatches.length === 0) {
      // Face found in selfie but does not match ID
      return res.json({
        matched: false,
        similarity: 0,
        confidence: 'low',
        faceDetectedInId: true,
        faceDetectedInSelfie: true,
        checkedAt: new Date().toISOString()
      });
    }

    const similarity = faceMatches[0].Similarity || 0;
    let confidence = 'low';
    if (similarity >= 90) confidence = 'high';
    else if (similarity >= 75) confidence = 'medium';

    return res.json({
      matched: similarity >= 90,
      similarity: Number(similarity.toFixed(2)),
      confidence,
      faceDetectedInId: true,
      faceDetectedInSelfie: true,
      checkedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Face Match Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function attemptCompareFaces(idBytes, selfieBytes) {
  const command = new CompareFacesCommand({
    SourceImage: { Bytes: idBytes },
    TargetImage: { Bytes: selfieBytes },
    SimilarityThreshold: 90,
  });
  return rekognition.send(command);
}

function handleRekognitionError(error, res) {
  console.error("Rekognition Error:", error);
  if (error.name === 'InvalidParameterException') {
    return res.json({
      matched: false,
      similarity: 0,
      confidence: 'low',
      faceDetectedInId: false,
      faceDetectedInSelfie: false,
      checkedAt: new Date().toISOString()
    });
  }
  if (error.name === 'ThrottlingException') {
    return res.json({
      matched: false,
      similarity: 0,
      confidence: 'low',
      pending: true, // Let backend know it's pending
      status: 'pending',
      faceDetectedInId: false,
      faceDetectedInSelfie: false,
      checkedAt: new Date().toISOString()
    });
  }
  return res.status(500).json({ error: error.message });
}

// Support being run directly or being imported
const port = process.env.FACE_MATCH_PORT || 8002;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Face Match Service running on port ${port}`);
  });
}

module.exports = app;
