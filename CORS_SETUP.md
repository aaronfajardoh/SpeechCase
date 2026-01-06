# Firebase Storage CORS Configuration

The Firebase Storage bucket needs CORS configuration to allow thumbnail generation from localhost during development.

## Quick Fix: Configure CORS

Run this command (replace `speechcase.firebasestorage.app` with your actual bucket name if different):

```bash
gsutil cors set cors.json gs://speechcase.firebasestorage.app
```

Create a `cors.json` file in the project root with this content:

```json
[
  {
    "origin": ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
```

## Alternative: Use Production URL

If you're testing in production, add your production domain to the CORS configuration:

```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://localhost:5174", 
      "http://127.0.0.1:5173",
      "https://your-production-domain.com"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
```

## Verify CORS is Configured

```bash
gsutil cors get gs://speechcase.firebasestorage.app
```

## Note

You need `gsutil` installed and authenticated:
```bash
# Install gsutil (part of Google Cloud SDK)
# macOS: brew install google-cloud-sdk
# Then authenticate:
gcloud auth login
```

