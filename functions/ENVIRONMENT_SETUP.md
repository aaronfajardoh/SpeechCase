# Environment Variables Setup for Firebase Cloud Functions

This document explains how to set up environment variables for your Firebase Cloud Functions.

## Required Environment Variables

### 1. OPENAI_API_KEY
Your OpenAI API key for generating embeddings and chat completions.

**Setting via Firebase CLI:**
```bash
firebase functions:config:set openai.api_key="your-openai-api-key-here"
```

**Setting via .env file (for local development):**
Create a `.env` file in the `functions/` directory:
```
OPENAI_API_KEY=your-openai-api-key-here
```

**Note:** For production, use Firebase Functions config. For local development with emulators, use `.env` file.

### 2. GOOGLE_APPLICATION_CREDENTIALS (Optional - for TTS)
Path to Google Cloud service account JSON file for Text-to-Speech API.

**Setting via Firebase CLI:**
```bash
firebase functions:config:set google.application_credentials="path/to/service-account.json"
```

**For Cloud Functions deployment:**
The service account JSON should be stored securely. You can:
1. Store it in Firebase Storage and reference it
2. Use Firebase Functions secrets (recommended for production)
3. Set it as an environment variable in the Firebase Console

**Using Firebase Secrets (Recommended):**
```bash
# First, create a secret
echo -n '{"type":"service_account",...}' | firebase functions:secrets:set GOOGLE_CREDENTIALS

# Then reference it in your function code
```

## Accessing Environment Variables in Code

### Using Firebase Functions Config (v1 style - deprecated but still works)
```javascript
const functions = require('firebase-functions');
const apiKey = functions.config().openai.api_key;
```

### Using Environment Variables (v2 style - recommended)
```javascript
const apiKey = process.env.OPENAI_API_KEY;
```

## Local Development Setup

1. **Install dependencies:**
   ```bash
   cd functions
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cd functions
   touch .env
   ```

3. **Add your variables to `.env`:**
   ```
   OPENAI_API_KEY=sk-...
   GOOGLE_APPLICATION_CREDENTIALS=./path/to/credentials.json
   ```

4. **Run Firebase emulators:**
   ```bash
   firebase emulators:start --only functions
   ```

## Production Deployment

1. **Set config variables:**
   ```bash
   firebase functions:config:set openai.api_key="sk-..."
   ```

2. **Deploy functions:**
   ```bash
   firebase deploy --only functions
   ```

## Important Notes

- **Never commit `.env` files or API keys to version control**
- Add `.env` to your `.gitignore` file
- For production, use Firebase Functions config or secrets
- The `GOOGLE_APPLICATION_CREDENTIALS` can be a path (local) or JSON string (cloud)

## Troubleshooting

### "OPENAI_API_KEY not configured" error
- Check that the environment variable is set: `firebase functions:config:get`
- For local development, ensure `.env` file exists and is loaded
- Restart Firebase emulators after changing `.env`

### "Invalid OpenAI API key" error
- Verify your API key is correct at https://platform.openai.com/account/api-keys
- Ensure there are no extra spaces or quotes in the config value
- Check that your OpenAI account has sufficient credits

