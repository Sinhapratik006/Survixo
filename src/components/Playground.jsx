import React, { useState } from "react";
import { Play, Copy } from "lucide-react";
import { models } from "../data/models.js";
export default function Playground() {
  const [model, setModel] = useState("DeepSeek V4 Flash"),
    [prompt, setPrompt] = useState(
      "Give me three ways to reduce latency in a React app.",
    ),
    [response, setResponse] = useState(""),
    [busy, setBusy] = useState(false);
  function run() {
    setBusy(true);
    setResponse("");
    window.setTimeout(() => {
      setResponse(
        `Demo response for: ${prompt}\n\n1. Lazy-load routes and split large bundles.\n2. Cache repeatable requests and avoid unnecessary re-renders.\n3. Serve static assets through a CDN and measure performance.\n\nSimulated response only; connect a backend for real inference.`,
      );
      setBusy(false);
    }, 650);
  }
  return (
    <section className="section" id="playground">
      <div className="eyebrow">— TRY THE ROUTER · LOCAL DEMO</div>
      <div className="section-title">
        <div>
          <h2>
            One prompt. <span>A clearer workflow.</span>
          </h2>
          <p>
            Choose a model and run a simulated request. Nothing is sent to an
            API.
          </p>
        </div>
      </div>
      <div className="playground">
        <div className="playform">
          <label>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models
                .filter((m) => m.type === "Text")
                .map((m) => (
                  <option key={m.id}>{m.name}</option>
                ))}
            </select>
          </label>
          <label>
            Your prompt
            <textarea
              rows="5"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <small>{prompt.length} characters · local demo only</small>
          <button
            className="primary run"
            onClick={run}
            disabled={busy || !prompt.trim()}
          >
            <Play size={14} />
            {busy ? "Running demo…" : "Run sample request"}
          </button>
        </div>
        <div className="response">
          <div>
            ● RESPONSE{" "}
            {response && (
              <button onClick={() => navigator.clipboard?.writeText(response)}>
                <Copy size={13} /> Copy
              </button>
            )}
          </div>
          {busy ? (
            <p className="empty">Generating a demo response…</p>
          ) : response ? (
            <pre>{response}</pre>
          ) : (
            <p className="empty">Your response will appear here.</p>
          )}
          <footer>
            ~650 ms simulated <span>{model}</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
