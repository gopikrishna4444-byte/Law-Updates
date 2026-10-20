(() => {
  "use strict";

  const LAWS = {
    "income-tax": { name: "Income Tax", cls: "it" },
    "gst": { name: "GST", cls: "gst" },
    "companies": { name: "Companies Act", cls: "co" },
  };
  const PAGE = 60;
  const $ = (s) => document.querySelector(s);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  // "New" = first seen by the fetcher after the user's previous visit.
  const previousVisit = store.get("lastVisit", null);
  store.set("lastVisit", new Date().toISOString());

  const state = {
    items: [], status: null, acts: null,
    tab: store.get("tab", "all"),
    cat: "all", q: "", shown: PAGE,
  };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  const monthKey = (it) => (it.date || (it.first_seen || "").slice(0, 10) || "").slice(0, 7);
  const monthLabel = (k) => {
    if (!k) return "Undated";
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };
  const ago = (iso) => {
    if (!iso) return "never";
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 36) return `${h} hr ago`;
    return fmtDate(iso);
  };
  const isNew = (it) => previousVisit && it.first_seen && it.first_seen > previousVisit;
  const highlight = (text, q) => {
    const safe = esc(text);
    if (!q) return safe;
    const words = q.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) return safe;
    return safe.replace(new RegExp(`(${words.map(esc).join("|")})`, "gi"), "<mark>$1</mark>");
  };
  const toast = (msg) => {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
  };

  // ---------- data ----------
  async function getJSON(path) {
    const r = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  async function load(manual = false) {
    const btn = $("#refresh");
    btn.classList.add("spin");
    try {
      const [u, s, a] = await Promise.allSettled([
        getJSON("data/updates.json"), getJSON("data/status.json"), getJSON("data/acts.json"),
      ]);
      if (u.status === "fulfilled") state.items = u.value.items || [];
      if (s.status === "fulfilled") state.status = s.value;
      if (a.status === "fulfilled") state.acts = a.value;
      if (u.status === "rejected" && !state.items.length) throw u.reason;
      if (manual) toast("Up to date");
    } catch (e) {
      toast(navigator.onLine ? "Couldn't load updates" : "Offline – showing saved copy");
    } finally {
      btn.classList.remove("spin");
      render();
    }
  }

  // ---------- rendering ----------
  function filtered() {
    const q = state.q.toLowerCase().trim();
    const words = q.split(/\s+/).filter(Boolean);
    return state.items.filter((it) => {
      if (state.tab !== "all" && it.law !== state.tab) return false;
      if (state.cat === "__new") { if (!isNew(it)) return false; }
      else if (state.cat !== "all" && it.category !== state.cat) return false;
      if (!words.length) return true;
      const hay = `${it.title} ${it.number || ""} ${it.category} ${LAWS[it.law]?.name || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function renderChips() {
    const chips = $("#chips");
    if (state.tab === "library") { chips.innerHTML = ""; chips.hidden = true; return; }
    chips.hidden = false;
    const pool = state.tab === "all" ? state.items : state.items.filter((i) => i.law === state.tab);
    const cats = [...new Set(pool.map((i) => i.category))].sort();
    const newCount = pool.filter(isNew).length;
    const list = [["all", "Everything"], ...(newCount ? [["__new", `New (${newCount})`]] : []), ...cats.map((c) => [c, c])];
    if (!list.some(([k]) => k === state.cat)) state.cat = "all";
    chips.innerHTML = list.map(([k, label]) =>
      `<button class="chip${k === state.cat ? " on" : ""}" data-cat="${esc(k)}">${esc(label)}</button>`).join("");
  }

  function renderBadges() {
    const counts = { all: 0 };
    state.items.forEach((i) => { if (isNew(i)) { counts.all++; counts[i.law] = (counts[i.law] || 0) + 1; } });
    document.querySelectorAll("[data-badge]").forEach((b) => {
      const n = counts[b.dataset.badge] || 0;
      b.textContent = n ? (n > 99 ? "99+" : n) : "";
    });
  }

  function renderHeader() {
    const s = state.status;
    const bad = s ? s.sources.filter((x) => !x.ok).length : 0;
    $("#checked").textContent = s
      ? `Checked ${ago(s.last_run)}${bad ? ` · ${bad} source${bad > 1 ? "s need" : " needs"} attention` : ""}`
      : "Income Tax · GST · Companies Act";
  }

  function renderFeed() {
    const feed = $("#feed");
    const list = filtered();
    if (!state.items.length) {
      feed.innerHTML = `<div class="empty"><h2>No updates yet</h2>
        <p>The first automatic check fills this list. It runs twice a day; you can also start it from GitHub (Actions → “Run workflow”).</p></div>`;
      return;
    }
    if (!list.length) {
      feed.innerHTML = `<div class="empty"><h2>Nothing matches</h2><p>Try a different word, or clear the filter.</p></div>`;
      return;
    }
    let html = "", lastMonth = null;
    list.slice(0, state.shown).forEach((it) => {
      const mk = monthKey(it);
      if (mk !== lastMonth) { html += `<div class="month">${esc(monthLabel(mk))}</div>`; lastMonth = mk; }
      const law = LAWS[it.law] || { name: it.law, cls: "" };
      const pdf = /\.pdf(\?|$)/i.test(it.url);
      html += `<a class="card ${law.cls}" href="${esc(it.url)}" target="_blank" rel="noopener">
        <div class="meta">
          ${isNew(it) ? '<span class="new">NEW</span>' : ""}
          ${state.tab === "all" ? `<span class="law">${esc(law.name)}</span>` : ""}
          <span>${esc(it.category)}</span>
          ${it.number ? `<span class="num">No. ${highlight(it.number, state.q)}</span>` : ""}
          <span class="when">${esc(fmtDate(it.date) || "Added " + fmtDate(it.first_seen))}</span>
        </div>
        <p class="title">${highlight(it.title, state.q)}</p>
        <span class="open">${pdf ? "Open PDF" : "Open on official site"} ›</span>
      </a>`;
    });
    if (list.length > state.shown) {
      html += `<button class="more" id="more">Show more (${list.length - state.shown} left)</button>`;
    }
    feed.innerHTML = html;
  }

  function renderLibrary() {
    const lib = $("#library");
    const groups = state.acts?.groups || [];
    let html = groups.map((g) => `
      <div class="group"><h2>${esc(g.title)}</h2>
        ${g.links.map((l) => `<a class="card link-card ${LAWS[g.law]?.cls || ""}" href="${esc(l.url)}" target="_blank" rel="noopener">
          <div class="name">${esc(l.name)}</div>${l.note ? `<div class="note">${esc(l.note)}</div>` : ""}</a>`).join("")}
      </div>`).join("");
    const s = state.status;
    if (s) {
      html += `<div class="group"><h2>Source check · ${esc(ago(s.last_run))}</h2><ul class="health">
        ${s.sources.map((x) => `<li><span class="st${x.ok ? "" : " bad"}"></span><div>
          <div class="src">${esc(LAWS[x.law]?.name || x.law)} – ${esc(x.category)}</div>
          <div class="msg">${esc(x.message)}</div></div></li>`).join("")}
      </ul></div>`;
    }
    html += `<p class="fine">All content links to official government websites. This app is an unofficial index for quick reference, not legal advice.</p>`;
    lib.innerHTML = html;
  }

  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
    const isLib = state.tab === "library";
    $("#feed").hidden = isLib; $("#library").hidden = !isLib;
    $(".search").hidden = isLib;
    renderHeader(); renderBadges(); renderChips();
    isLib ? renderLibrary() : renderFeed();
  }

  // ---------- events ----------
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]"); if (!b) return;
    state.tab = b.dataset.tab; state.cat = "all"; state.shown = PAGE;
    store.set("tab", state.tab); render(); window.scrollTo({ top: 0 });
  });
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cat]"); if (!c) return;
    state.cat = c.dataset.cat; state.shown = PAGE; render();
  });
  let qt;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; renderFeed(); }, 150);
  });
  $("#feed").addEventListener("click", (e) => {
    if (e.target.id === "more") { state.shown += PAGE; renderFeed(); }
  });
  $("#refresh").addEventListener("click", () => load(true));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  load();
})();
