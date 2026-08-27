import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:5000";
const MIN_RATE = 80;
const MAX_RATE = 400;
const DEFAULT_RATE = 180;

export default function App() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("female");
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [lang, setLang] = useState("en"); // thêm state cho ngôn ngữ

  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [voiceUsed, setVoiceUsed] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendOnline, setBackendOnline] = useState(true);

  const audioRef = useRef(null);
  const previousUrlRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setBackendOnline(Boolean(data.ok)))
      .catch(() => setBackendOnline(false));
  }, []);

  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, []);

  async function handleListen() {
    setErrorMessage("");

    if (!text.trim()) {
      setErrorMessage("Please enter some text before generating audio.");
      return;
    }

    setIsGenerating(true);
    setAudioUrl(null);
    setVoiceUsed("");

    try {
      const response = await fetch(`${API_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate, lang }), // gửi thêm lang
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Server responded with status ${response.status}.`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = objectUrl;

      setAudioUrl(objectUrl);
      setVoiceUsed(response.headers.get("X-Voice-Used") || "");
      setBackendOnline(true);

      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
    } catch (err) {
      if (err instanceof TypeError) {
        setBackendOnline(false);
        setErrorMessage(
          "Could not reach the server. Is the Flask backend running at http://127.0.0.1:5000?"
        );
      } else {
        setErrorMessage(err.message || "Something went wrong while generating audio.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRateChange(e) {
    const value = e.target.value;
    if (value === "") {
      setRate("");
      return;
    }
    const num = parseInt(value, 10);
    if (!Number.isNaN(num)) setRate(num);
  }

  function handleRateBlur() {
    if (rate === "" || rate < MIN_RATE) setRate(MIN_RATE);
    else if (rate > MAX_RATE) setRate(MAX_RATE);
  }

  return (
    <div className="page">
      <main className="deck">
        <div className="deck-top">
          <div className="reels" aria-hidden="true">
            <span className={`reel ${isGenerating ? "spinning" : ""}`} />
            <span className={`reel ${isGenerating ? "spinning" : ""}`} />
          </div>
          <div className="deck-title">
            <h1>Offline Voice Reader</h1>
            <p className="tagline">Local text-to-speech · pyttsx3 · no cloud, no API key</p>
          </div>
        </div>

        {!backendOnline && (
          <div className="banner banner-warning">
            ⚠️ Backend not responding. Start it with <code>python tts.py</code> — it
            should be running at <code>http://127.0.0.1:5000</code>.
          </div>
        )}

        <label className="field-label" htmlFor="text-input">
          Text (Vietnamese or any installed language)
        </label>
        <textarea
          id="text-input"
          className="textarea"
          placeholder="Nhập văn bản tiếng Việt cần đọc…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
        />
        <div className="char-count">{text.length} / 3000 characters</div>

        <div className="controls-row">
          <div className="control-group">
            <label className="field-label" htmlFor="voice-select">
              Voice
            </label>
            <select
              id="voice-select"
              className="select"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>

          <div className="control-group">
            <label className="field-label" htmlFor="rate-input">
              Rate ({MIN_RATE}–{MAX_RATE} wpm)
            </label>
            <input
              id="rate-input"
              type="number"
              className="rate-input"
              min={MIN_RATE}
              max={MAX_RATE}
              value={rate}
              onChange={handleRateChange}
              onBlur={handleRateBlur}
            />
          </div>

          <div className="control-group">
            <label className="field-label" htmlFor="lang-select">
              Language
            </label>
            <select
              id="lang-select"
              className="select"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
        </div>

        <button className="listen-btn" onClick={handleListen} disabled={isGenerating}>
          {isGenerating ? "Generating…" : "▶ Listen"}
        </button>

        <div className="led-strip" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`led ${isGenerating ? "lit" : ""}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            />
          ))}
        </div>

        {errorMessage && (
          <p className="error-text" role="alert">
            {errorMessage}
          </p>
        )}

        {audioUrl && (
          <div className="audio-section">
            {voiceUsed && (
              <p className="voice-used">
                Voice used: <strong>{voiceUsed}</strong>
              </p>
            )}
            <audio ref={audioRef} className="audio-player" controls src={audioUrl}>
              Your browser does not support the audio element.
            </audio>
            <a className="download-link" href={audioUrl} download="output.mp3">
              Download audio
            </a>
          </div>
        )}

        <footer className="footer">Powered by pyttsx3 and Flask · runs fully offline</footer>
      </main>
    </div>
  );
}
