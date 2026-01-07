# Firebase Storage CORS Configuration

This document explains how to configure CORS for Firebase Storage to allow your web app to access PDF files.

## Current Configuration

The CORS configuration is stored in `cors.json` and includes:
- Local development origins (localhost)
- Production origins (casediver.web.app, casediver.firebaseapp.com)

## Applying CORS Configuration

### Prerequisites

1. Install Google Cloud SDK (if not already installed):
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```

3. Set your project:
   ```bash
   gcloud config set project casediver
   ```

### Apply CORS Configuration

Run this command from the project root:

```bash
gsutil cors set cors.json gs://casediver.firebasestorage.app
```

### Verify CORS Configuration

To check the current CORS configuration:

```bash
gsutil cors get gs://casediver.firebasestorage.app
```

## What This Fixes

After applying this configuration, the following will work:
- ✅ PDF thumbnail generation in the dashboard
- ✅ Loading PDFs from Storage URLs
- ✅ Accessing PDF files from both localhost and production

## Troubleshooting

If you still see CORS errors after applying:

1. **Clear browser cache** - Old cached responses might not have CORS headers
2. **Wait a few minutes** - CORS changes can take a few minutes to propagate
3. **Verify the configuration** - Run `gsutil cors get` to confirm it was applied
4. **Check the bucket name** - Ensure you're using `casediver.firebasestorage.app`

## Alternative: Using Firebase Console

You can also configure CORS through the Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/storage/browser)
2. Select your bucket: `casediver.firebasestorage.app`
3. Click on the "Configuration" tab
4. Scroll to "Cross-origin resource sharing (CORS)"
5. Click "Edit" and paste the contents of `cors.json`
6. Click "Save"

