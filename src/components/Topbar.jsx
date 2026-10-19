import React from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
export default function Topbar({
  active,
  setActive,
  mobileOpen,
  setMobileOpen,
}) {
  const links = [
    ["Models", "models"],
    ["Buy", "calculator"],
    ["Sell", "seller"],
    ["Docs", "docs"],
    ["Analytics", "analytics"],
  ];
  const go = (id) => {
    setActive(id);
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <header className="topbar">
      <a className="brand" href="#home" onClick={() => go("home")}>
        <span className="brandmark">◈</span>
        <span>
          SURPLUS<small>INTELLIGENCE</small>
        </span>
      </a>
      <nav className={mobileOpen ? "nav navopen" : "nav"}>
        {links.map(([l, id]) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => go(id)}
          >
            {l}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <button className="quiet" onClick={() => go("community")}>
          Community ↗
        </button>
        <button className="primary small" onClick={() => go("calculator")}>
          Launch app ↗
        </button>
      </div>
      <button
        className="mobile"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X /> : <Menu />}
      </button>
    </header>
  );
}
