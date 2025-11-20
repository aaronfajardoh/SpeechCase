import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import textToSpeech from '@google-cloud/text-to-speech';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json({ limit: '10mb' }));

// Initialize Google Cloud TTS client
// On Heroku, use GOOGLE_APPLICATION_CREDENTIALS env var or GOOGLE_CREDENTIALS JSON string
// For local development, fall back to keyFilename if env vars are not set
let clientConfig = {};

if (process.env.GOOGLE_CREDENTIALS) {
  // If credentials are provided as a JSON string in environment variable
  try {
    clientConfig.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } catch (error) {
    console.error('Error parsing GOOGLE_CREDENTIALS:', error);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // If path to credentials file is provided
  clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
} else {
  // Fall back to local file (for development)
  const keyFile = join(__dirname, 'speechcase-1ff2439d1c93.json');
  if (existsSync(keyFile)) {
    clientConfig.keyFilename = keyFile;
  } else {
    console.warn('No Google Cloud credentials found. TTS functionality will not work.');
  }
}

const client = new textToSpeech.TextToSpeechClient(clientConfig);

// Helper function to split text into chunks under 5000 bytes
function splitTextIntoChunks(text, maxBytes = 4500) {
  const chunks = [];
  let currentChunk = '';
  let currentBytes = 0;

  // Split by sentences first, then by words if needed
  const sentences = text.match(/[^.!?]+[.!?]+[\])'"`'"]*|.+/g) || [text];

  for (const sentence of sentences) {
    const sentenceBytes = Buffer.byteLength(sentence, 'utf8');

    // If a single sentence is too long, split by words
    if (sentenceBytes > maxBytes) {
      const words = sentence.split(/(\s+)/);
      for (const word of words) {
        const wordBytes = Buffer.byteLength(word, 'utf8');
        
        if (currentBytes + wordBytes > maxBytes && currentChunk) {
          chunks.push(currentChunk);
          currentChunk = word;
          currentBytes = wordBytes;
        } else {
          currentChunk += word;
          currentBytes += wordBytes;
        }
      }
    } else {
      // If adding this sentence would exceed the limit, save current chunk
      if (currentBytes + sentenceBytes > maxBytes && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
        currentBytes = sentenceBytes;
      } else {
        currentChunk += sentence;
        currentBytes += sentenceBytes;
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Endpoint to get text chunks (for streaming)
app.post('/api/tts/chunks', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    const textBytes = Buffer.byteLength(text, 'utf8');
    const maxBytes = 4500;
    
    if (textBytes <= maxBytes) {
      return res.json({ chunks: [text] });
    }
    
    const chunks = splitTextIntoChunks(text, maxBytes);
    res.json({ chunks });
  } catch (error) {
    console.error('Error splitting text:', error);
    res.status(500).json({ error: 'Failed to split text', details: error.message });
  }
});

// Google TTS endpoint for Spanish text
app.post('/api/tts', async (req, res) => {
  try {
    const { text, rate = 1.0 } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Check if text exceeds 5000 bytes
    const textBytes = Buffer.byteLength(text, 'utf8');
    const maxBytes = 4500; // Use 4500 to be safe (under 5000 limit)

    if (textBytes <= maxBytes) {
      // Text is small enough, process normally
      const request = {
        input: { text },
        voice: {
          languageCode: 'es-US',
          name: 'es-US-Neural2-B',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: rate,
          pitch: 0.0,
          volumeGainDb: 0.0,
        },
      };

      const [response] = await client.synthesizeSpeech(request);
      const audioContent = response.audioContent;

      res.json({
        audioContent: audioContent.toString('base64'),
        mimeType: 'audio/mpeg',
      });
    } else {
      // Text is too long, split into chunks
      console.log(`Text is ${textBytes} bytes, splitting into chunks...`);
      const chunks = splitTextIntoChunks(text, maxBytes);
      console.log(`Split into ${chunks.length} chunks`);

      const audioChunks = [];

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        const request = {
          input: { text: chunk },
          voice: {
            languageCode: 'es-US',
            name: 'es-US-Neural2-B',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: rate,
            pitch: 0.0,
            volumeGainDb: 0.0,
          },
        };

        const [response] = await client.synthesizeSpeech(request);
        audioChunks.push(response.audioContent.toString('base64'));
      }

      // Return array of audio chunks
      res.json({
        audioChunks: audioChunks,
        mimeType: 'audio/mpeg',
      });
    }
  } catch (error) {
    console.error('Error with Google TTS:', error);
    res.status(500).json({ error: 'Failed to generate speech', details: error.message });
  }
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// Handle React Router - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

