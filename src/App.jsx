import React, { useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  Activity,
  CircleDollarSign,
  Gauge,
  Heart,
  Bell,
  ShieldCheck,
  CheckCircle2,
  Github,
  MessageCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Topbar from "./components/Topbar.jsx";
import CodePanel from "./components/CodePanel.jsx";
import ModelMarketplace from "./components/ModelMarketplace.jsx";
import SavingsCalculator from "./components/SavingsCalculator.jsx";
import Playground from "./components/Playground.jsx";
import SellerPanel from "./components/SellerPanel.jsx";
const go = (id) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
function Metric({ icon: Icon, label, value, sub }) {
  return (
    <div className="metric">
      <Icon />
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  );
}
export default function App() {
  const [active, setActive] = useState("home"),
    [mobileOpen, setMobileOpen] = useState(false),
    [favorites, setFavorites] = useState([]),
    [budget, setBudget] = useState(250),
    [saved, setSaved] = useState(false);
  return (
    <div id="home" className="app">
      <div className="announcement">
        ● <b>MARKET UPDATE</b>{" "}
        <span>Explore the open market for AI inference</span>
        <button onClick={() => go("models")}>Browse models ↗</button>
      </div>
      <Topbar
        active={active}
        setActive={setActive}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main>
        <section className="hero">
          <div className="hero-grid" />
          <div className="hero-copy">
            <div className="eyebrow">
              — THE INFERENCE EXCHANGE{" "}
              <span className="market-open">● MARKET OPEN</span>
            </div>
            <h1>
              Open market
              <br />
              for <span>AI models.</span>
            </h1>
            <p>
              Your AI calls route to the best available price.
              <br />
              Your idle capacity gets a chance to earn.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => go("calculator")}>
                Buy inference ↗
              </button>
              <button className="outline" onClick={() => go("seller")}>
                Sell capacity ↗
              </button>
            </div>
            <div className="hero-proof">
              <i>A</i>
              <i>◈</i>
              <i>λ</i> One endpoint. Many providers.{" "}
              <span>· Built for builders</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orbit one" />
            <div className="orbit two" />
            <div className="orbit three" />
            <div className="router">
              <span>◈</span>
              <small>SURPLUS</small>
              <b>ROUTER</b>
              <em>● ACTIVE</em>
            </div>
            {[
              ["Anthropic", "A", "top"],
              ["DeepSeek", "D", "right"],
              ["Qwen", "Q", "bottom"],
              ["MiniMax", "M", "left"],
            ].map(([n, l, pos]) => (
              <div className={"node " + pos} key={n}>
                <i>{l}</i>
                <span>
                  <b>{n}</b>
                  <small>Available offers</small>
                </span>
                <em>●</em>
              </div>
            ))}
            <div className="float-price">
              ● Best sample offer
              <strong>
                $0.0006 <small>/ 1K tokens</small>
              </strong>
              <small>Illustrative price</small>
            </div>
          </div>
          <div className="hero-foot">
            <span>BUILT FOR THE OPEN MODEL ECONOMY</span>
            <span>
              OpenAI compatible　·　Provider agnostic　·　Cost conscious
            </span>
          </div>
        </section>
        <section className="metrics" id="analytics">
          <div className="metric-intro">
            <small>THE MARKET, IN MOTION</small>
            <b>Transparent by design.</b>
            <span>Illustrative snapshot</span>
          </div>
          <Metric
            icon={Boxes}
            label="Model offers"
            value="22,421"
            sub="demo catalog"
          />
          <Metric
            icon={Activity}
            label="Models listed"
            value="451"
            sub="multiple modalities"
          />
          <Metric
            icon={CircleDollarSign}
            label="Potential discount"
            value="Up to 90%"
            sub="varies by offer"
          />
          <Metric
            icon={Gauge}
            label="Routing uptime"
            value="99.9%"
            sub="target, not guarantee"
          />
        </section>
        <section className="section integrate" id="docs">
          <div>
            <div className="eyebrow">— TWO-MINUTE SETUP</div>
            <h2>
              Same SDK.
              <br />
              <span>New economics.</span>
            </h2>
            <p>
              Already using an OpenAI-compatible client? Change the base URL and
              route requests through a marketplace of offers.
            </p>
            <ol>
              <li>
                <b>01</b>
                <span>
                  <strong>One API key</strong>
                  <small>Use one key across supported models.</small>
                </span>
              </li>
              <li>
                <b>02</b>
                <span>
                  <strong>Keep your workflow</strong>
                  <small>Familiar clients and request shapes.</small>
                </span>
              </li>
              <li>
                <b>03</b>
                <span>
                  <strong>Choose your terms</strong>
                  <small>Compare offers and set a discount floor.</small>
                </span>
              </li>
            </ol>
            <button className="link" onClick={() => go("playground")}>
              Try the local playground →
            </button>
          </div>
          <CodePanel />
        </section>
        <div className="providers">
          <small>MODEL ECOSYSTEM</small>
          <b>Anthropic</b>
          <b>OpenAI</b>
          <b>Google</b>
          <b>Meta</b>
          <b>DeepSeek</b>
          <b>Mistral</b>
          <b>Alibaba</b>
          <b>MiniMax</b>
          <b>+ more</b>
        </div>
        <ModelMarketplace favorites={favorites} setFavorites={setFavorites} />
        <SavingsCalculator />
        <Playground />
        <SellerPanel />
        <section className="section features">
          <div className="eyebrow">— CONTROL YOUR WORKFLOW</div>
          <h2>
            Small features. <span>Better decisions.</span>
          </h2>
          <p>
            Useful tools for comparing offers and keeping usage predictable.
          </p>
          <div className="feature-grid">
            <article>
              <Heart />
              <h3>Saved models</h3>
              <p>Favorite models in the marketplace to build a shortlist.</p>
              <b>{favorites.length} saved</b>
              <button onClick={() => go("models")}>Manage →</button>
            </article>
            <article>
              <Bell />
              <h3>Budget threshold</h3>
              <p>Set a monthly spend target and preview a reminder.</p>
              <label>
                Monthly budget <b>${budget}</b>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={budget}
                  onChange={(e) => {
                    setBudget(+e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <button onClick={() => setSaved(true)}>
                {saved ? "Budget saved" : "Save budget target"}
              </button>
              {saved && (
                <small className="green">
                  <CheckCircle2 size={13} /> Saved for this session.
                </small>
              )}
            </article>
            <article>
              <ShieldCheck />
              <h3>Trust-aware routing</h3>
              <p>
                Design for health checks, provider controls, and transparent
                offer status.
              </p>
              <b className="green">● Concept preview</b>
              <button onClick={() => go("models")}>View offers →</button>
            </article>
          </div>
        </section>
        <section className="cta" id="community">
          <div className="eyebrow">— THE MARKET IS OPEN</div>
          <h2>
            Every model.
            <br />
            <span>More room to build.</span>
          </h2>
          <p>
            Compare models, estimate your costs, and explore the marketplace
            concept.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go("models")}>
              Explore models ↗
            </button>
            <button className="outline" onClick={() => go("docs")}>
              Read quickstart ↗
            </button>
          </div>
          <small>
            <Sparkles size={13} /> React frontend prototype. Live services are
            not connected.
          </small>
        </section>
      </main>
      <footer>
        <div className="footer-top">
          <b className="brand">
            ◈ SURPLUS<small>INTELLIGENCE</small>
          </b>
          <p>
            An independent frontend concept inspired by an open market for AI
            inference.
          </p>
          <nav>
            <button onClick={() => go("models")}>Models</button>
            <button onClick={() => go("calculator")}>Savings calculator</button>
            <button onClick={() => go("seller")}>Seller preview</button>
            <button onClick={() => go("playground")}>Playground</button>
          </nav>
          <div>
            <a href="https://github.com" aria-label="GitHub">
              <Github />
            </a>
            <a href="https://discord.com" aria-label="Community">
              <MessageCircle />
            </a>
            <a
              href="https://www.surplusintelligence.ai/"
              aria-label="Original site"
            >
              <ExternalLink />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 · Independent demo project</span>
          <span>Demo values only · No live account or payments</span>
          <button onClick={() => go("home")}>Back to top ↑</button>
        </div>
      </footer>
    </div>
  );
}
