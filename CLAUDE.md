# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sticker Dream is a voice-activated sticker printer. Users press and hold a button, describe what they want (max 15 seconds), and the system generates a black and white coloring page sticker that prints to a thermal printer.

## Development Commands

```bash
# Install dependencies
npm install

# Start backend server (port 3000)
npm run server

# Start frontend dev server (port 7767, in separate terminal)
npm run dev
```

The frontend proxies `/api` requests to the backend server at `http://localhost:3000`.

## Architecture

The application has a client-server architecture:

### Client (src/client.ts)
- Runs in the browser at `http://localhost:7767`
- Handles voice recording using MediaRecorder API (press-and-hold button, max 15 seconds)
- Performs speech-to-text transcription using Hugging Face Transformers (Xenova/whisper-tiny.en) **running locally in the browser**
- Sends transcribed text to backend via `/api/generate` endpoint
- Displays generated images returned from the backend
- **Abort words**: If transcript contains "BLANK", "NO IMAGE", "NO STICKER", "CANCEL", "ABORT", or "START OVER", generation is cancelled

### Server (src/server.ts)
- Hono backend running on port 3000
- `/api/generate` endpoint accepts POST requests with `{ prompt: string }`
- Uses Google Imagen AI (via @google/genai) to generate black and white coloring pages
- Imagen model: `imagen-4.0-generate-001` (configurable, other options: imagen-3, imagen-4-fast, imagen-4-ultra)
- Prompt format: "A black and white kids coloring page. <image-description>{prompt}</image-description> {prompt}"
- Config: 1 image, 9:16 aspect ratio
- Automatically prints to USB thermal printer via print module
- Returns PNG image buffer to client (even if printing fails)

### Printing (src/print.ts)
- macOS-specific CUPS printing utilities using `lp`, `lpstat`, `cupsenable`, etc.
- `printToUSB()`: Finds first available USB printer and prints
- `watchAndResumePrinters()`: Background loop that auto-resumes paused printers every 1 second (runs on server startup)
- Supports printing from file paths or Buffer objects (creates temp files for buffers)
- Printer options: copies, media size, grayscale, fitToPage, custom CUPS options
- **Important**: Currently only supports USB printers on macOS

## Environment Variables

Required `.env` file:
```
GEMINI_API_KEY=your_api_key_here
```

## Mobile/HTTPS Access

To use on mobile devices with microphone access:
- Access via local network IP
- Requires secure origin (HTTPS) for microphone permissions
- README suggests using Cloudflare tunnels for secure access
- Vite config allows `local.wesbos.com` as allowed host

## Hardware Requirements

- USB thermal printer connected to macOS machine
- Recommended: 4x6 thermal printer with 4x6 shipping labels (fast, cheap, no ink)
- Phomemo PM2 works over bluetooth or USB
- Currently does not support Niimbot/bluetooth "Cat printer" (plastic labels aren't colorable)

## Key Technical Patterns

1. **Client-side transcription**: Whisper runs in the browser, not on the server
2. **Fail-safe printing**: Image generation succeeds even if printing fails
3. **Auto-recovery**: Background watcher automatically resumes paused printers
4. **Temporary file handling**: Buffers are written to temp files for CUPS, then cleaned up
5. **User cancellation**: Specific abort words detected in transcript to skip generation
