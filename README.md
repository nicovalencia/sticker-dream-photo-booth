# Sticker Dream

![](./dream.png)

A voice-activated sticker printer. Press and hold the button, describe what you want, and it generates a black and white coloring page sticker that prints to a thermal printer.

## How it works

1. Hold the button and speak (max 15 seconds)
2. Whisper transcribes your voice
3. Google Imagen generates a coloring page based on your description
4. Image displays in browser and prints to USB thermal printer

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```
GEMINI_API_KEY=your_api_key_here
```

3. Setup your thermal printer:
   - **For Phomemo printers**: Download and install the official drivers from [phomemo.com/pages/drivers](https://phomemo.com/pages/drivers) before connecting your printer
   - After installing drivers, connect the USB thermal printer to your Mac
   - Add the printer in **System Settings > Printers & Scanners**
   - Currently only supports USB printers on macOS

## Running

Start the backend server:

```bash
npm run server
```

Start the frontend (in another terminal):

```bash
npm run dev
```

Open `http://localhost:5173`.

To use your phone, you'll need to visit the page on your local network. Since it uses microphone access, this needs to be a secure origin. I use Cloudflare tunnels for this.

## Printers

TLDR: [The Phomemo](https://amzn.to/4hOmqki) PM2 will work great over USB.

**Important**: For Phomemo printers, you must install the official drivers from [phomemo.com/pages/drivers](https://phomemo.com/pages/drivers) before the printer will be recognized by macOS.

While any printer will work, I'm using a 4x6 thermal printer with 4x6 shipping labels. These printers are fast, cheap and don't require ink.

Note: This project currently only supports USB printers on macOS. Bluetooth support and other platforms are not yet implemented. I'd love to get this working with these cheap Niimbot / Bluetooth "Cat printer", though those labels are plastic and not colour-able.

## Tips

The image prints right away, which is magical. Sometimes you can goof up. In this case, simply say "CANCEL", "ABORT" or "START OVER" as part of your recording.

## Ideas

It would be great if this was more portable. That app has 2 pieces: Client and Server. The TTS happens on the client. The Gemini API calls and printing happens on the server.

The server does not do anything computationally expensive - just API calls -, so it could theoretically be run on Raspberry PI or an ESP32, which may require re-writing in C++. The server also sends the data to the printer - so there would need to be drivers or use a lower level protocol use ESC/POS.

It could not be run 100% on an iphone browser as WebSerial / Web USB isn't supported on Safari. Perhaps it could as a react native app?
