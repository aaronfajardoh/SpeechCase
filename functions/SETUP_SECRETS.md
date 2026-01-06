# Setting Up Firebase Secrets for Cloud Functions

## Required Secrets

### 1. OPENAI_API_KEY (Required)

Set your OpenAI API key:

```bash
echo -n "your-openai-api-key" | firebase functions:secrets:set OPENAI_API_KEY
```

### 2. Google API Keys (Optional - for Character Images)

If you want character images to be generated/fetched, set these optional secrets:

**Google Custom Search API** (for searching real images):
```bash
echo -n "your-google-search-api-key" | firebase functions:secrets:set GOOGLE_SEARCH_API_KEY
echo -n "your-google-search-engine-id" | firebase functions:secrets:set GOOGLE_SEARCH_ENGINE_ID
```

**Google AI API** (for generating images if search fails):
```bash
echo -n "your-google-ai-api-key" | firebase functions:secrets:set GOOGLE_AI_KEY
```

**Note:** Character images will work even without these keys - characters will just display without images (using avatar placeholders instead).

### Step 3: Redeploy Functions

After setting secrets, redeploy your functions:

```bash
firebase deploy --only functions
```

## Alternative: Using Environment Variables in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`speechcase`)
3. Go to **Functions** → **Configuration**
4. Add environment variable: `OPENAI_API_KEY` = `your-api-key`
5. Redeploy functions

## Verify Secret is Set

```bash
firebase functions:secrets:access OPENAI_API_KEY
```

## Troubleshooting

If you still get 500 errors after setting the secret:
1. Check Firebase Functions logs in the console
2. Verify the secret name matches exactly: `OPENAI_API_KEY`
3. Make sure you redeployed after setting the secret

