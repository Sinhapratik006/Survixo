import React, { useState } from "react";
const samples = {
  Python:
    'from openai import OpenAI\nimport os\n\nclient = OpenAI(\n  base_url="https://api.example.com/v1",\n  api_key=os.environ["SURPLUS_API_KEY"],\n)\n\nresponse = client.chat.completions.create(\n  model="deepseek-v4-flash",\n  messages=[{"role":"user","content":"Hello!"}],\n)\nprint(response.choices[0].message.content)',
  TypeScript:
    'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "https://api.example.com/v1",\n  apiKey: process.env.SURPLUS_API_KEY,\n});\n\nconst response = await client.chat.completions.create({\n  model: "deepseek-v4-flash",\n  messages: [{ role: "user", content: "Hello!" }],\n});',
  cURL: 'curl https://api.example.com/v1/chat/completions \\\n  -H "Authorization: Bearer $SURPLUS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"Hello!"}]}\'',
};
export default function CodePanel() {
  const [lang, setLang] = useState("Python"),
    [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(samples[lang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy code:", samples[lang]);
    }
  }
  return (
    <div className="codebox">
      <div className="codehead">
        <span>● ● ●</span>
        <span>
          quickstart.
          {lang === "Python" ? "py" : lang === "TypeScript" ? "ts" : "sh"}
        </span>
        <div>
          {Object.keys(samples).map((x) => (
            <button
              className={x === lang ? "sel" : ""}
              onClick={() => setLang(x)}
              key={x}
            >
              {x}
            </button>
          ))}
          <button onClick={copy}>{copied ? "Copied ✓" : "Copy ⧉"}</button>
        </div>
      </div>
      <pre>{samples[lang]}</pre>
      <footer>
        ● OpenAI-compatible pattern{" "}
        <span>Demo code · configure server-side</span>
      </footer>
    </div>
  );
}
