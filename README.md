# Offline Voice Reader (pyttsx3 + Flask + React)

A fully offline text-to-speech app. No cloud API, no API key, no internet
connection required at runtime — it drives your operating system's own
speech engine via **pyttsx3** (SAPI5 on Windows, NSSpeechSynthesizer on
macOS, espeak/espeak-ng on Linux).

## Stack

- **Backend**: Python 3 + Flask + pyttsx3, single file `backend/tts.py`.
- **Frontend**: React + Vite, single main component `frontend/src/App.jsx`.

## Project structure

```
pyttsx3-app/
  backend/
    tts.py
    requirements.txt
  frontend/
    src/
      App.jsx
      App.css
      main.jsx
    index.html
    package.json
    vite.config.js
```

## How voice selection works

On each request, the backend picks a voice using this fallback ladder, so a
request should practically never fail just because of voice availability:

1. **Vietnamese voice**, if the OS has one installed (detected by name/id
   text like "Vietnam"/"vi-VN", or a declared `vi` language tag).
2. Otherwise, a voice matching your **Male/Female** selection (by declared
   gender metadata, or by common voice-name hints like "Zira"/"David").
3. Otherwise, whichever voice is **first** in the system's list.
4. If voice enumeration itself fails, the **engine's built-in default**.

The response includes an `X-Voice-Used` header describing which voice was
actually used, which the frontend displays under the audio player — so you
can always see whether a Vietnamese voice was found or it fell back.

**Important:** most systems do **not** ship a Vietnamese voice out of the
box. Windows 10/11 lets you add one for free: **Settings → Time & Language →
Speech → Manage voices → Add voices → Vietnamese (Vietnam)**. Without that,
the backend will automatically fall back to an English male/female voice —
it will still read Vietnamese text aloud, just with an English accent.

## 1. Set up the backend (Flask)

```bash
cd backend
python -m venv venv
```

Activate it:

- Windows: `venv\Scripts\activate`
- macOS/Linux: `source venv/bin/activate`

Install dependencies:

```bash
pip install -r requirements.txt
```

**Platform-specific extras:**

- **Windows**: `pyttsx3` uses `pywin32` under the hood, which pip installs
  automatically. Nothing else needed — SAPI5 ships with Windows.
- **macOS**: uses the built-in `NSSpeechSynthesizer` via `pyobjc`; usually
  works out of the box.
- **Linux**: install the espeak engine first, e.g. `sudo apt install
  espeak-ng` (Debian/Ubuntu) or the equivalent for your distro.
- **MP3 output**: the backend converts audio to MP3 using `pydub`, which
  needs the **ffmpeg** binary on your `PATH`. If ffmpeg isn't found, the
  backend automatically serves **WAV** instead of failing the request — the
  browser audio player and download both still work fine either way.

Run the server:

```bash
python tts.py
```

It starts at `http://127.0.0.1:5000`. Check it's alive:

```bash
curl http://127.0.0.1:5000/health
# -> {"ok": true}
```

## 2. Set up the frontend (React + Vite)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## 3. Use it

1. Type or paste Vietnamese (or any) text into the textarea.
2. Choose **Male** or **Female**.
3. Set the speech **rate** in words per minute (80–400; 180 is a natural
   default).
4. Click **▶ Listen**.
5. The app shows "Generating…" while pyttsx3 synthesizes the audio on your
   machine, then plays it automatically, shows which voice was actually
   used, and gives you an audio player plus a download link.

## API reference

### `POST /tts`

Request body:

```json
{ "text": "Xin chào, đây là bài kiểm tra.", "voice": "female", "rate": 180 }
```

- `voice`: `"male"` or `"female"` (used only as a fallback preference if no
  Vietnamese voice is found).
- `rate`: integer, words per minute, clamped to 80–400 server-side.

Response: audio bytes (`Content-Type: audio/mpeg` if MP3 conversion
succeeded, `audio/wav` otherwise), with a custom `X-Voice-Used` header. On
failure: JSON `{ "error": "..." }` with a 4xx/5xx status.

### `GET /health`

Response: `{ "ok": true }`.

## Troubleshooting

- **"Could not reach the server"**: make sure `python tts.py` is running and
  listening on `127.0.0.1:5000`, not a different host/port.
- **Audio comes out in English despite Vietnamese text**: your OS has no
  Vietnamese voice installed — see the Windows instructions above, or install
  a Vietnamese espeak-ng voice on Linux.
- **Requests seem to hang**: pyttsx3 drives a native, non-thread-safe engine.
  The backend already serializes requests with a lock and runs Flask with
  `threaded=False` to avoid this — don't remove that if you modify the code.
- **No sound / silent file**: some espeak-ng builds need the voice name
  passed exactly as enumerated; try restarting the backend so it re-scans
  installed voices.
- **CORS errors in the browser console**: confirm `flask-cors` is installed
  (`pip show flask-cors`) — the backend already calls `CORS(app)`.
