# Live Transcriber

Chrome extension (Manifest V3) that transcribes the audio of any browser tab in real time — for example a YouTube livestream — and shows the transcript in Chrome's side panel.

Speech-to-text is powered by [Deepgram](https://deepgram.com)'s streaming API.

## Features

- One click on the extension icon starts capturing the current tab's audio
- Live transcript with interim results and timestamps
- Audio keeps playing while it's being transcribed
- Copy or export the transcript to `.txt`
- Language (Spanish, English, multilingual) and model (`nova-3`, `nova-2`) selection
- The transcript survives closing and reopening the side panel

## How it works

```
 click on icon ──► background.js (service worker)
                    │  chrome.tabCapture.getMediaStreamId()
                    │  chrome.offscreen.createDocument()
                    ▼
                 offscreen.js
                    │  getUserMedia(tab stream) ──► AudioContext ──► speakers
                    │  MediaRecorder (webm/opus, 250 ms chunks)
                    ▼
                 WebSocket ──► wss://api.deepgram.com/v1/listen
                    │
                    ▼  transcripts (interim + final)
                 sidepanel.js  (UI)
```

Some design decisions forced by Manifest V3:

- **Capture starts from the toolbar icon.** `tabCapture` requires a user gesture on the extension action; a button inside the side panel doesn't qualify.
- **Audio is processed in an offscreen document.** MV3 service workers can't use `getUserMedia`, `AudioContext` or `MediaRecorder`, so the stream is handed to an offscreen document (`USER_MEDIA` reason).
- **Tab audio is re-routed to the speakers.** Capturing a tab mutes it, so the stream is connected back to `audioContext.destination`.
- **API key as WebSocket subprotocol.** Browsers can't set custom headers on WebSockets; Deepgram accepts `["token", API_KEY]` as subprotocols instead.
- **State lives in the offscreen document**, so the side panel can be closed and reopened without losing the transcript.

## Installation

1. Clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Pin the extension to the toolbar.

Requires Chrome 116+ (or another Chromium browser with `tabCapture`, `offscreen` and `sidePanel` support).

## Usage

1. Create a free API key at [console.deepgram.com](https://console.deepgram.com).
2. Click the extension icon to open the side panel, paste the key under **Configuración** and save.
3. Go to the tab you want to transcribe and **click the extension icon**. The badge shows `REC` while it's recording.
4. Use **Detener** to stop, then copy or export the transcript.

The API key is stored only in `chrome.storage.local` on your machine and is sent only to Deepgram.

## Tech stack

JavaScript · Chrome Extensions (Manifest V3) · `tabCapture` · Offscreen Documents · Side Panel API · Web Audio API · MediaRecorder · WebSockets · Deepgram streaming STT

## License

MIT
