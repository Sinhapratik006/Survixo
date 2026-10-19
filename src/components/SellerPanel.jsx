import React, { useState } from "react";
import { Server, ShieldCheck, Gauge, CircleDollarSign } from "lucide-react";
export default function SellerPanel() {
  const [capacity, setCapacity] = useState(60),
    [rate, setRate] = useState(1.2),
    [online, setOnline] = useState(true);
  const earnings = (capacity / 100) * rate * 720;
  return (
    <section className="section seller" id="seller">
      <div className="seller-copy">
        <div className="eyebrow">— FOR SELLERS</div>
        <h2>
          Turn idle capacity into <span>working capital.</span>
        </h2>
        <p>
          Preview a seller dashboard and estimate possible earnings from listed
          capacity. This is not a live account.
        </p>
        <ul>
          <li>
            <ShieldCheck /> Set your own pricing and limits
          </li>
          <li>
            <Gauge /> Track offer health and utilization
          </li>
          <li>
            <CircleDollarSign /> Estimate earnings before listing
          </li>
        </ul>
      </div>
      <div className="seller-card">
        <header>
          <span>
            <Server /> <b>Seller overview</b>
            <small>Sample workspace · this month</small>
          </span>
          <button
            className={online ? "status-button" : "status-button paused"}
            onClick={() => setOnline(!online)}
          >
            ● {online ? "Accepting offers" : "Paused"}
          </button>
        </header>
        <div className="seller-stats">
          <div>
            <small>Estimated earnings</small>
            <strong>
              ${Math.round(online ? earnings : 0).toLocaleString()}
              <em>/mo</em>
            </strong>
          </div>
          <div>
            <small>Capacity listed</small>
            <strong>{online ? capacity : 0}%</strong>
          </div>
        </div>
        <label>
          Capacity offered <b>{capacity}%</b>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={capacity}
            onChange={(e) => setCapacity(+e.target.value)}
          />
        </label>
        <label>
          Hourly earning rate <b>${rate.toFixed(2)}</b>
          <input
            type="range"
            min=".2"
            max="4"
            step=".1"
            value={rate}
            onChange={(e) => setRate(+e.target.value)}
          />
        </label>
        <footer>
          Demo estimate only. Actual earnings depend on demand, uptime, pricing,
          and costs.
        </footer>
      </div>
    </section>
  );
}
