"""
tts.py - Flask backend for Text-to-Speech app.

Voice selection ladder (pyttsx3):
    1. Vietnamese voice if available.
    2. Voice matching requested gender (male/female).
    3. First available voice.
    4. Engine default.

Always falls back so /tts never fails just because of voice selection.
"""

import logging
import os
import tempfile
import threading

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pyttsx3
from gtts import gTTS   # thêm gTTS

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts-server")

app = Flask(__name__)
CORS(app)

tts_lock = threading.Lock()

MAX_TEXT_LENGTH = 3000
DEFAULT_RATE = 180
MIN_RATE = 80
MAX_RATE = 400

FEMALE_HINTS = ["female", "zira", "samantha", "victoria", "susan", "hazel", "linh", "an"]
MALE_HINTS = ["male", "david", "alex", "daniel", "mark", "george", "minh", "nam"]

def list_voices():
    engine = pyttsx3.init()
    try:
        return engine.getProperty("voices") or []
    finally:
        engine.stop()

def find_vietnamese_voice(voices):
    for v in voices:
        haystack = f"{getattr(v, 'name', '')} {getattr(v, 'id', '')}".lower()
        if "vietnam" in haystack or "vi-vn" in haystack or "vi_vn" in haystack:
            return v
        try:
            for lang in v.languages or []:
                lang_str = lang.decode("utf-8", "ignore") if isinstance(lang, bytes) else str(lang)
                if lang_str.lower().startswith("vi"):
                    return v
        except Exception:
            pass
    return None

def find_voice_by_gender(voices, gender):
    gender = (gender or "female").lower()
    for v in voices:
        vg = str(getattr(v, "gender", "") or "").lower()
        if gender in vg:
            return v
    hints = FEMALE_HINTS if gender == "female" else MALE_HINTS
    for v in voices:
        name = getattr(v, "name", "").lower()
        if any(h in name for h in hints):
            return v
    return None

def pick_voice(voices, gender):
    if not voices:
        return None, "system default"
    vn = find_vietnamese_voice(voices)
    if vn:
        return vn, f"Vietnamese ({vn.name})"
    g = find_voice_by_gender(voices, gender)
    if g:
        return g, f"{gender} fallback ({g.name})"
    return voices[0], f"default ({voices[0].name})"

def generate_wav(text, gender, rate, force_default=False):
    engine = pyttsx3.init()
    try:
        label = "system default"
        if not force_default:
            voices = engine.getProperty("voices")
            chosen, label = pick_voice(voices, gender)
            if chosen:
                engine.setProperty("voice", chosen.id)
        engine.setProperty("rate", rate)
        fd, wav_path = tempfile.mkstemp(suffix=".wav", prefix="tts_")
        os.close(fd)
        engine.save_to_file(text, wav_path)
        engine.runAndWait()
        if not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
            raise RuntimeError("Empty audio file.")
        return wav_path, label
    finally:
        engine.stop()

def convert_to_mp3(wav_path):
    if PYDUB_AVAILABLE:
        try:
            mp3_path = wav_path.rsplit(".", 1)[0] + ".mp3"
            AudioSegment.from_wav(wav_path).export(mp3_path, format="mp3")
            return mp3_path, "audio/mpeg", "output.mp3"
        except Exception:
            logger.warning("MP3 conversion failed; serving WAV.")
    return wav_path, "audio/wav", "output.wav"

def generate_with_gtts(text, lang="vi"):
    fd, mp3_path = tempfile.mkstemp(suffix=".mp3", prefix="tts_gtts_")
    os.close(fd)
    tts = gTTS(text, lang=lang)
    tts.save(mp3_path)
    return mp3_path, "audio/mpeg", "output.mp3", f"gTTS-{lang}"

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    voice_pref = data.get("voice", "female")
    rate = data.get("rate", DEFAULT_RATE)
    lang = data.get("lang", "en")  # thêm tham số lang

    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Empty text"}), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({"error": f"Text too long ({len(text)} chars). Limit {MAX_TEXT_LENGTH}."}), 400
    try:
        rate = int(rate)
    except Exception:
        rate = DEFAULT_RATE
    rate = max(MIN_RATE, min(rate, MAX_RATE))
    if voice_pref not in ("male", "female"):
        voice_pref = "female"

    with tts_lock:
        try:
            if lang == "vi":
                final_path, mimetype, download_name, voice_label = generate_with_gtts(text, lang="vi")
            else:
                wav_path, voice_label = generate_wav(text, voice_pref, rate)
                final_path, mimetype, download_name = convert_to_mp3(wav_path)
        except Exception:
            logger.exception("TTS generation failed.")
            return jsonify({"error": "Audio generation failed."}), 500

    response = send_file(final_path, mimetype=mimetype, as_attachment=False, download_name=download_name)
    safe_label = voice_label.encode("ascii", "ignore").decode()
    response.headers["X-Voice-Used"] = safe_label
    response.headers["Access-Control-Expose-Headers"] = "X-Voice-Used"

    paths_to_clean = {final_path}
    def cleanup(_exc=None):
        for p in paths_to_clean:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except OSError:
                logger.warning("Could not delete temp file: %s", p)
    response.call_on_close(cleanup)
    return response

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=False)
