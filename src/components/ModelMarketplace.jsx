import React, { useMemo, useState } from "react";
import { Heart, Search, ArrowUpRight } from "lucide-react";
import { models, money } from "../data/models.js";
export default function ModelMarketplace({ favorites, setFavorites }) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All"),
    [sort, setSort] = useState("discount"),
    [compare, setCompare] = useState([]);
  const shown = useMemo(
    () =>
      models
        .filter(
          (m) =>
            (type === "All" || m.type === type) &&
            `${m.name} ${m.provider}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "discount"
            ? b.discount - a.discount
            : sort === "price"
              ? a.price - b.price
              : a.name.localeCompare(b.name),
        ),
    [query, type, sort],
  );
  const toggle = (id) =>
    setCompare((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length < 3
          ? [...s, id]
          : s,
    );
  return (
    <section className="section" id="models">
      <div className="eyebrow">— LIVE MARKETPLACE · DEMO DATA</div>
      <div className="section-title">
        <div>
          <h2>
            Find your next <span>best model.</span>
          </h2>
          <p>Compare model prices, categories, and indicative discounts.</p>
        </div>
        <b>
          {shown.length.toString().padStart(2, "0")} <small>models shown</small>
        </b>
      </div>
      <div className="controls">
        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models or providers..."
          />
        </label>
        <div className="filters">
          {["All", "Text", "Image", "Audio", "Video"].map((t) => (
            <button
              className={type === t ? "selected" : ""}
              onClick={() => setType(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="discount">Highest discount</option>
          <option value="price">Lowest output price</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      {compare.length > 0 && (
        <div className="comparebar">
          {compare.length}/3 models selected{" "}
          <button onClick={() => setCompare([])}>Clear comparison</button>
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>MODEL / PROVIDER</th>
              <th>TYPE</th>
              <th>OUTPUT / 1M</th>
              <th>DIRECT PRICE</th>
              <th>DISCOUNT</th>
              <th>STATUS</th>
              <th>COMPARE</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="model">
                    <i>{m.provider[0]}</i>
                    <span>
                      <strong>{m.name}</strong>
                      <small>{m.provider}</small>
                    </span>
                  </div>
                </td>
                <td>{m.type}</td>
                <td className="price">
                  {money(m.price)}
                  <small>per 1M output</small>
                </td>
                <td className="strikethrough">{money(m.direct)}</td>
                <td>
                  <b className="discount">−{m.discount}%</b>
                </td>
                <td>
                  <span
                    className={
                      m.status === "Healthy" ? "health" : "health limited"
                    }
                  >
                    ● {m.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button
                      className={favorites.includes(m.id) ? "fav on" : "fav"}
                      onClick={() =>
                        setFavorites((s) =>
                          s.includes(m.id)
                            ? s.filter((x) => x !== m.id)
                            : [...s, m.id],
                        )
                      }
                      aria-label="Favorite model"
                    >
                      <Heart
                        size={15}
                        fill={
                          favorites.includes(m.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                    <button
                      className={
                        compare.includes(m.id) ? "compare on" : "compare"
                      }
                      onClick={() => toggle(m.id)}
                    >
                      {compare.includes(m.id) ? "✓" : "+"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <p className="empty">No matching models. Try another search.</p>
        )}
      </div>
      {compare.length > 0 && (
        <div className="comparecards" id="comparison">
          <h3>Side-by-side comparison</h3>
          {models
            .filter((m) => compare.includes(m.id))
            .map((m) => (
              <article key={m.id}>
                <strong>{m.name}</strong>
                <p>{m.provider}</p>
                <b>{money(m.price)} / 1M output</b>
                <p>
                  {m.discount}% discount · {m.latency} latency
                </p>
              </article>
            ))}
        </div>
      )}
      <p className="disclaimer">
        Prices are illustrative demo data, not live offers.{" "}
        <button
          onClick={() => {
            setQuery("");
            setType("All");
          }}
        >
          Reset filters ↗
        </button>
      </p>
    </section>
  );
}
