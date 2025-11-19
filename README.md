# 🎙️ SpeechCase

A React application that allows you to upload a PDF file and listen to it using text-to-speech technology. No API keys required!

## Features

- 📄 Upload PDF files
- 🔍 Extract text from PDF documents
- 🎧 Listen to PDF content using browser's built-in text-to-speech
- 🌍 **Multi-language support** - Automatically detects and supports English and Spanish
- 🔤 Manual language selection (Auto-detect, English, or Spanish)
- ⏯️ Play, pause, and stop controls
- 📱 Responsive design

## Technology Stack

- **React** - UI framework
- **Vite** - Build tool and dev server
- **PDF.js** - PDF text extraction (Mozilla's open-source library)
- **Web Speech API** - Text-to-speech (built into modern browsers, no API key needed!)

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to the URL shown in the terminal (usually `http://localhost:5173`)

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Browser Compatibility

The Web Speech API works best in:
- ✅ Chrome/Edge (best support)
- ✅ Safari
- ✅ Firefox

Note: Some browsers may have limited voice options or require user interaction before allowing speech synthesis.

## How It Works

1. **PDF Upload**: Select a PDF file from your device
2. **Text Extraction**: The app uses PDF.js to extract all text from the PDF
3. **Language Detection**: The app automatically detects if the PDF is in English or Spanish (or you can manually select)
4. **Text-to-Speech**: The extracted text is read aloud using the browser's built-in Web Speech API with the appropriate language voice
5. **Controls**: Use the play, pause, and stop buttons to control playback

## Language Support

The app supports:
- **English (en-US)**: Full support with native English voices
- **Spanish (es-ES)**: Full support with native Spanish voices
- **Auto-detect**: Automatically detects the language based on text patterns, accented characters, and common words

## No API Keys Required! 🎉

This app uses:
- **PDF.js** - Free, open-source library (no API key needed)
- **Web Speech API** - Built into modern browsers (no API key needed)

Enjoy listening to your PDFs!

