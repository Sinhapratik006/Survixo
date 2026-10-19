import React, { useState } from "react";
import { TrendingUp } from "lucide-react";
export default function SavingsCalculator() {
  const [spend, setSpend] = useState(1000),
    [discount, setDiscount] = useState(71);
  const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const saved = (spend * discount) / 100;
  return (
    <section className="section" id="calculator">
      <div className="eyebrow">— SAVINGS ESTIMATOR</div>
      <div className="section-title">
        <div>
          <h2>
            Keep more of your <span>AI budget.</span>
          </h2>
          <p>Adjust your spend and estimated discount to see the difference.</p>
        </div>
      </div>
      <div className="calc">
        <div className="calc-input">
          <label>
            Monthly AI usage <strong>{fmt(spend)}</strong>
          </label>
          <input
            type="range"
            min="100"
            max="10000"
            step="100"
            value={spend}
            onChange={(e) => setSpend(+e.target.value)}
          />
          <div className="range-label">
            <span>$100</span>
            <span>$10,000</span>
          </div>
          <label>
            Estimated discount <strong>{discount}%</strong>
          </label>
          <input
            type="range"
            min="5"
            max="90"
            value={discount}
            onChange={(e) => setDiscount(+e.target.value)}
          />
          <div className="range-label">
            <span>5%</span>
            <span>90%</span>
          </div>
          <p>Estimate only. Actual prices vary by model and offer.</p>
        </div>
        <div className="calc-result">
          <small>
            <TrendingUp size={15} /> POTENTIAL MONTHLY SAVINGS
          </small>
          <strong>{fmt(saved)}</strong>
          <span>{discount}% below direct pricing</span>
          <hr />
          <div>
            <span>Direct provider estimate</span>
            <b>{fmt(spend)}</b>
          </div>
          <div>
            <span>Estimated marketplace cost</span>
            <b>{fmt(spend - saved)}</b>
          </div>
          <div>
            <span>Potential yearly savings</span>
            <b className="green">{fmt(saved * 12)}</b>
          </div>
        </div>
      </div>
    </section>
  );
}
