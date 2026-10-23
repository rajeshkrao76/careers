/* ==========================================================================
   RAVEONE CAREERS — app.js v2 (UI/UX improvements)
   ========================================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbzSX8aT_Vecff3ZJinj0wt-DU72NH9jmerdyN7DywmGlX401jssm87ZHS6QUnP8qG0y/exec";
const SITE = { brand: "Raveone Careers", portal: "https://www.raveone.in", phone: "9148330565", email: "rajesh@raveone.in" };
const STORAGE_KEYS = { savedJobs: "raveone_saved_jobs_v1", recent: "raveone_recent_jobs_v1", drafts: "raveone_drafts_v1" };
const PAGE_SIZE = 10;

const STATE = {
  jobs: [],
  filtered: [],
  displayed: 0,
  filters: { search: "", location: "", category: "", exp: "", company: "", type: "" },
  sort: "recent",
  currentJob: null
};

/* ===== Utilities ===== */
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function daysAgo(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return diff + " days ago";
  if (diff < 30) return Math.floor(diff / 7) + "w ago";
  return Math.floor(diff / 30) + "mo ago";
}
function isNewJob(job) {
  if (!job.postedDate) return false;
  const d = new Date(job.postedDate);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) < 3 * 86400000;
}
function cleanExp(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (/^freshers?$/i.test(s)) return "0";
  return s.replace(/\s*(yrs?|years?)\.?$/i, "").replace(/[^\d.]/g, "").trim();
}
function formatExpDisplay(min, max) {
  const mn = cleanExp(min), mx = cleanExp(max);
  if (!mn && !mx) return "Any";
  if (mn === mx) return mn + " yrs";
  if (mn && mx) return mn + "–" + mx + " yrs";
  if (mn) return mn + "+ yrs";
  return "Up to " + mx + " yrs";
}
function parseYears(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (/^freshers?$/i.test(s)) return 0;
  const n = parseFloat(s.replace(/\s*(yrs?|years?)\.?$/i, "").replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}
function cleanSalary(v) { return v ? String(v).replace(/₹+/g, "₹").trim() : ""; }
function cleanSkill(s) {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length < 4 ? "" : t.length > 45 ? t.slice(0, 42) + "…" : t;
}
function cleanText(s) { return s ? String(s).replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ") : ""; }
function salaryMaxInLpa(job) {
  const max = parseFloat(String(job.maxSalary || job.minSalary || "").replace(/[^\d.]/g, ""));
  return isNaN(max) ? 0 : max;
}
function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms || 200);
  };
}
const Store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (fb !== undefined ? fb : null); } catch (e) { return fb !== undefined ? fb : null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ===== API ===== */
const API = {
  normalizeJob: function (j) {
    if (!j) return j;
    if (!Array.isArray(j.skills)) j.skills = String(j.skills || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(j.benefits)) j.benefits = String(j.benefits || "").split(",").map(s => s.trim()).filter(Boolean);
    const isYes = v => v === true || String(v || "").toLowerCase().trim() === "yes";
    j.isUrgent = isYes(j.isUrgent); j.isFeatured = isYes(j.isFeatured); j.isRemote = isYes(j.isRemote);
    return j;
  },
  getJobs: function () {
    return fetch(API_URL + "?action=jobs").then(r => r.json())
      .then(jobs => Array.isArray(jobs) ? jobs.map(API.normalizeJob) : jobs)
      .catch(err => { console.error("getJobs failed:", err); throw err; });
  },
  getJob: function (jobId) {
    return API.getJobs().then(jobs => {
      if (!Array.isArray(jobs)) return { error: "not_found" };
      const t = String(jobId || "").toLowerCase().trim();
      return jobs.find(j => String(j.jobId || "").toLowerCase().trim() === t) || { error: "not_found" };
    });
  },
  submitApplication: function (payload) {
    return fetch(API_URL, {
      method: "POST", body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    }).then(r => r.json());
  }
};

/* ===== Saved / Share / Recent ===== */
const SaveShare = {
  getSaved() { return Store.get(STORAGE_KEYS.savedJobs, []); },
  isSaved(id) { return this.getSaved().indexOf(id) !== -1; },
  toggle(id) {
    const arr = this.getSaved();
    const idx = arr.indexOf(id);
    if (idx === -1) arr.push(id); else arr.splice(idx, 1);
    Store.set(STORAGE_KEYS.savedJobs, arr);
    return idx === -1;
  },
  addRecent(id) {
    let arr = Store.get(STORAGE_KEYS.recent, []);
    arr = arr.filter(x => x !== id);
    arr.unshift(id);
    Store.set(STORAGE_KEYS.recent, arr.slice(0, 8));
  },
  copyLink(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => this.toast("Link copied")).catch(() => this.fallbackCopy(url));
    else this.fallbackCopy(url);
  },
  fallbackCopy(url) {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); this.toast("Link copied"); } catch (e) {}
    document.body.removeChild(ta);
  },
  toast(msg) {
    const t = document.createElement("div");
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0F172A;color:#fff;padding:10px 20px;border-radius:999px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.2);opacity:0;transition:opacity .2s ease";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.style.opacity = "1");
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 1800);
  }
};

/* ===== UI helpers ===== */
const UI = {
  page() {
    if (document.getElementById("jobsGrid")) return "index";
    if (document.getElementById("jobDetail")) return "job";
    if (document.getElementById("pageContent")) return "page";
    return "unknown";
  },
  initMobileMenu() {
    const toggle = document.getElementById("mobileToggle"), nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", e => {
      if (!nav.classList.contains("open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false");
    });
  },
  initScrollEffect() {
    const header = document.getElementById("siteHeader");
    if (!header) return;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { header.classList.toggle("scrolled", window.scrollY > 10); ticking = false; });
    }, { passive: true });
  },
  setYear() { const y = document.getElementById("footerYear"); if (y) y.textContent = new Date().getFullYear(); },
  initKeyboard() {
    document.addEventListener("keydown", e => {
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        const s = document.getElementById("heroSearch") || document.getElementById("filterSearch");
        if (s) { e.preventDefault(); s.focus(); }
      }
    });
  }
};

/* ===== INDEX PAGE ===== */
const IndexPage = {
  init() {
    this.cacheEls(); this.bindEvents(); this.loadJobs(); this.renderRecent();
  },
  cacheEls() {
    this.el = {
      search: document.getElementById("heroSearch"),
      grid: document.getElementById("jobsGrid"),
      skeleton: document.getElementById("skeletonGrid"),
      empty: document.getElementById("emptyState"),
      loadMoreWrap: document.getElementById("loadMoreWrap"),
      loadMoreBtn: document.getElementById("loadMoreBtn"),
      count: document.getElementById("listCount"),
      info: document.getElementById("filterInfo"),
      statJobs: document.getElementById("statJobs"),
      statClients: document.getElementById("statClients"),
      statCities: document.getElementById("statCities"),
      filterSearch: document.getElementById("filterSearch"),
      filterLocation: document.getElementById("filterLocation"),
      filterCategory: document.getElementById("filterCategory"),
      filterExp: document.getElementById("filterExp"),
      filterCompany: document.getElementById("filterCompany"),
      filterType: document.getElementById("filterType"),
      clearFilters: document.getElementById("clearFilters"),
      emptyClear: document.getElementById("emptyClear"),
      sortSelect: document.getElementById("sortSelect"),
      popularTags: document.getElementById("popularTags"),
      searchForm: document.getElementById("searchForm"),
      mobileFilterBtn: document.getElementById("mobileFilterBtn"),
      sheetBackdrop: document.getElementById("sheetBackdrop"),
      filtersCard: document.querySelector(".filters-card"),
      activeFiltersBar: document.getElementById("activeFiltersBar"),
      recentlyViewed: document.getElementById("recentlyViewed")
    };
  },
  bindEvents() {
    const self = this;
    if (this.el.searchForm) {
      this.el.searchForm.addEventListener("submit", e => {
        e.preventDefault();
        if (self.el.filterSearch) self.el.filterSearch.value = self.el.search.value;
        self.state.updateFilters();
        document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
      });
    }
    const debounced = debounce(() => self.state.updateFilters(), 250);
    if (this.el.filterSearch) this.el.filterSearch.addEventListener("input", debounced);
    if (this.el.search) this.el.search.addEventListener("input", debounced);
    ["filterLocation","filterCategory","filterExp","filterCompany","filterType"].forEach(k => {
      const el = self.el[k];
      if (el) el.addEventListener("change", () => self.state.updateFilters());
    });
    if (this.el.sortSelect) {
      this.el.sortSelect.addEventListener("change", () => { STATE.sort = self.el.sortSelect.value; self.applySortAndRender(); });
    }
    [this.el.clearFilters, this.el.emptyClear].forEach(b => { if (b) b.addEventListener("click", () => self.state.clearAll()); });
    if (this.el.loadMoreBtn) this.el.loadMoreBtn.addEventListener("click", () => self.renderNext());
    if (this.el.popularTags) {
      this.el.popularTags.addEventListener("click", e => {
        const t = e.target.closest(".popular-tag");
        if (!t) return;
        const q = t.getAttribute("data-q") || "";
        if (self.el.search) self.el.search.value = q;
        if (self.el.filterSearch) self.el.filterSearch.value = q;
        self.state.updateFilters();
        document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
      });
    }
    if (this.el.mobileFilterBtn) {
      this.el.mobileFilterBtn.addEventListener("click", () => {
        self.el.filtersCard.classList.add("open");
        self.el.sheetBackdrop.hidden = false;
      });
    }
    if (this.el.sheetBackdrop) {
      this.el.sheetBackdrop.addEventListener("click", () => {
        self.el.filtersCard.classList.remove("open");
        self.el.sheetBackdrop.hidden = true;
      });
    }
    // Delegate save/share clicks on cards
    if (this.el.grid) {
      this.el.grid.addEventListener("click", e => {
        const saveBtn = e.target.closest(".card-save-btn");
        if (saveBtn) {
          e.preventDefault(); e.stopPropagation();
          const id = saveBtn.getAttribute("data-id");
          SaveShare.toggle(id);
          saveBtn.classList.toggle("saved");
          SaveShare.toast(saveBtn.classList.contains("saved") ? "Saved" : "Removed");
          return;
        }
        const shareBtn = e.target.closest(".card-share-btn");
        if (shareBtn) {
          e.preventDefault(); e.stopPropagation();
          const id = shareBtn.getAttribute("data-id");
          const j = STATE.jobs.find(x => x.jobId === id);
          if (j) {
            const url = window.location.origin + "/job.html?job=" + encodeURIComponent(id);
            const text = j.title + " at " + j.company + " — " + url;
            window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
          }
        }
      });
    }
  },
  state: {
    updateFilters() {
      STATE.filters.search = (IndexPage.el.filterSearch.value || IndexPage.el.search.value || "").trim().toLowerCase();
      STATE.filters.location = IndexPage.el.filterLocation.value;
      STATE.filters.category = IndexPage.el.filterCategory.value;
      STATE.filters.exp = IndexPage.el.filterExp.value;
      STATE.filters.company = IndexPage.el.filterCompany.value;
      STATE.filters.type = IndexPage.el.filterType.value;
      if (IndexPage.el.search && IndexPage.el.search.value !== IndexPage.el.filterSearch.value) {
        IndexPage.el.search.value = IndexPage.el.filterSearch.value;
      }
      IndexPage.applyFilters();
      IndexPage.renderActiveFilters();
    },
    clearAll() {
      ["filterSearch","search","filterLocation","filterCategory","filterExp","filterCompany","filterType"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      IndexPage.state.updateFilters();
    }
  },
  loadJobs() {
    API.getJobs().then(jobs => {
      STATE.jobs = Array.isArray(jobs) ? jobs : [];
      this.hideSkeleton();
      this.populateFilters();
      this.updateStats();
      this.applyFilters();
    }).catch(() => { this.hideSkeleton(); this.showError("Could not load jobs."); });
  },
  hideSkeleton() { if (this.el.skeleton) this.el.skeleton.hidden = true; },
  populateFilters() {
    const locs = {}, cats = {}, comps = {};
    STATE.jobs.forEach(j => {
      if (j.location) String(j.location).split(/[,/]/).map(s => s.trim()).filter(Boolean).forEach(l => locs[l] = (locs[l] || 0) + 1);
      if (j.category) cats[j.category] = (cats[j.category] || 0) + 1;
      if (j.company) comps[j.company] = (comps[j.company] || 0) + 1;
    });
    Object.keys(locs).sort().forEach(l => {
      const o = document.createElement("option"); o.value = l; o.textContent = l + " (" + locs[l] + ")";
      this.el.filterLocation.appendChild(o);
    });
    Object.keys(cats).sort().forEach(c => {
      const o = document.createElement("option"); o.value = c; o.textContent = c + " (" + cats[c] + ")";
      this.el.filterCategory.appendChild(o);
    });
    Object.keys(comps).sort().forEach(c => {
      const o = document.createElement("option"); o.value = c; o.textContent = c + " (" + comps[c] + ")";
      this.el.filterCompany.appendChild(o);
    });
    this.renderPopularTags();
  },
  renderPopularTags() {
    const container = this.el.popularTags;
    if (!container) return;
    const counts = {};
    const stop = { and:1, or:1, the:1, a:1, an:1, of:1, for:1, to:1, in:1, on:1, at:1, by:1, with:1, as:1, is:1, are:1, be:1, this:1, that:1, it:1, its:1, will:1, can:1, must:1, should:1, able:1, work:1, working:1, years:1, year:1, experience:1, candidate:1, role:1, job:1, new:1, all:1, any:1, other:1, than:1, have:1, has:1, more:1, their:1, also:1, well:1, good:1, strong:1, key:1 };
    const add = (t, w) => { if (!t) return; String(t).toLowerCase().replace(/[^\w\s&+#.]/g, " ").split(/\s+/).forEach(w2 => {
      w2 = w2.trim();
      if (!w2 || w2.length < 2 || stop[w2] || /^\d+$/.test(w2)) return;
      counts[w2] = (counts[w2] || 0) + (w || 1);
    }); };
    STATE.jobs.forEach(j => { add(j.category, 5); (j.skills || []).forEach(s => add(s, 3)); add(j.title, 2); });
    const candidates = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 7);
    if (!candidates.length) { container.style.display = "none"; return; }
    container.innerHTML = '<span class="popular-label">Popular:</span>';
    candidates.forEach(w => {
      const btn = document.createElement("button");
      btn.className = "popular-tag";
      btn.setAttribute("data-q", w);
      btn.textContent = w.replace(/\b\w/g, c => c.toUpperCase());
      container.appendChild(btn);
    });
  },
  updateStats() {
    const clients = {}, cities = {};
    STATE.jobs.forEach(j => {
      if (j.company) clients[j.company] = 1;
      if (j.location) String(j.location).split(/[,/]/).map(s => s.trim()).filter(Boolean).forEach(c => cities[c] = 1);
    });
    if (this.el.statJobs) this.el.statJobs.textContent = STATE.jobs.length;
    if (this.el.statClients) this.el.statClients.textContent = Object.keys(clients).length;
    if (this.el.statCities) this.el.statCities.textContent = Object.keys(cities).length;
  },
  applyFilters() {
    const f = STATE.filters;
    let list = STATE.jobs.filter(j => {
      if (f.search) {
        const hay = [j.jobId, j.title, j.company, j.location, j.category, j.description, (j.skills || []).join(" "), j.industry, j.education].join(" ").toLowerCase();
        if (hay.indexOf(f.search) === -1) return false;
      }
      if (f.location && String(j.location || "").toLowerCase().indexOf(f.location.toLowerCase()) === -1) return false;
      if (f.category && j.category !== f.category) return false;
      if (f.company && j.company !== f.company) return false;
      if (f.type && String(j.jobType || j.employmentType || "").toLowerCase() !== f.type.toLowerCase()) return false;
      if (f.exp) {
        const mn = parseYears(j.minExp);
        if (f.exp === "0-2" && mn > 2) return false;
        if (f.exp === "2-5" && (mn < 2 || mn > 5)) return false;
        if (f.exp === "5-10" && (mn < 5 || mn > 10)) return false;
        if (f.exp === "10+" && mn < 10) return false;
      }
      return true;
    });
    STATE.filtered = list;
    this.applySortAndRender();
  },
  applySortAndRender() {
    const s = STATE.sort;
    STATE.filtered.sort((a, b) => {
      if (s === "recent") return new Date(b.postedDate || 0) - new Date(a.postedDate || 0);
      if (s === "salary-high") return salaryMaxInLpa(b) - salaryMaxInLpa(a);
      if (s === "exp-low") return parseYears(a.minExp) - parseYears(b.minExp);
      const aF = a.isFeatured ? 1 : 0, bF = b.isFeatured ? 1 : 0;
      if (aF !== bF) return bF - aF;
      return (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0);
    });
    if (this.el.count) this.el.count.textContent = STATE.filtered.length + " role" + (STATE.filtered.length === 1 ? "" : "s");
    if (this.el.info) this.el.info.textContent = STATE.filtered.length + " of " + STATE.jobs.length + " matching";
    STATE.displayed = 0;
    this.el.grid.innerHTML = "";
    this.renderNext();
  },
  renderNext() {
    const start = STATE.displayed, end = Math.min(start + PAGE_SIZE, STATE.filtered.length);
    const frag = document.createDocumentFragment();
    STATE.filtered.slice(start, end).forEach(j => frag.appendChild(IndexPage.buildCard(j)));
    this.el.grid.appendChild(frag);
    STATE.displayed = end;
    if (STATE.filtered.length === 0) { this.el.empty.hidden = false; this.el.loadMoreWrap.hidden = true; }
    else { this.el.empty.hidden = true; this.el.loadMoreWrap.hidden = STATE.displayed >= STATE.filtered.length; }
  },
  buildCard(j) {
    const card = document.createElement("a");
    card.className = "job-card";
    card.href = "job.html?job=" + encodeURIComponent(j.jobId);
    card.addEventListener("click", () => SaveShare.addRecent(j.jobId));
    const title = cleanText(j.title) || "Untitled Role";
    const company = cleanText(j.company) || "Raveone Client";
    const location = cleanText(j.location) || "India";
    const jobId = cleanText(j.jobId);
    const allSkills = (j.skills || []).map(cleanSkill).filter(Boolean);
    const skills = allSkills.slice(0, 3);
    const moreSkills = allSkills.length - skills.length;
    const expTxt = formatExpDisplay(j.minExp, j.maxExp);
    const salaryTxt = cleanSalary(j.salaryDisplay) || "Not disclosed";
    const postedTxt = j.postedDate ? daysAgo(j.postedDate) : "";
    const descRaw = cleanText(j.description || "");
    const descTxt = descRaw.length > 200 ? descRaw.slice(0, 197) + "…" : descRaw;
    const badges = [];
    if (isNewJob(j)) badges.push('<span class="chip chip-green">✨ New</span>');
    if (j.isUrgent) badges.push('<span class="chip chip-amber">🔥 Urgent</span>');
    if (j.isFeatured) badges.push('<span class="chip chip-navy">⭐ Featured</span>');
    if (j.isRemote) badges.push('<span class="chip chip-purple">🌐 Remote</span>');
    if (j.positions > 1) badges.push('<span class="chip chip-blue">' + j.positions + ' openings</span>');
    const saved = SaveShare.isSaved(j.jobId);

    card.innerHTML = `
      <div class="job-card-head">
        <div class="job-card-title-wrap">
          <h3 class="job-card-title">${esc(title)}</h3>
          <div class="job-card-company">${esc(company)} <span class="dot">•</span> ${esc(location)}</div>
        </div>
        <div class="job-card-actions">
          <button class="card-save-btn${saved ? ' saved' : ''}" data-id="${esc(j.jobId)}" title="Save job">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="card-share-btn" data-id="${esc(j.jobId)}" title="Share on WhatsApp">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
          </button>
          <span class="job-card-id">${esc(jobId)}</span>
        </div>
      </div>
      ${badges.length ? '<div class="job-card-badges">' + badges.join("") + '</div>' : ""}
      <p class="job-card-description">${esc(descTxt)}</p>
      ${skills.length ? `<div class="job-card-skills">
        ${skills.map(s => '<span class="skill-chip">' + esc(s) + '</span>').join("")}
        ${moreSkills > 0 ? '<span class="skill-chip skill-chip-more">+' + moreSkills + '</span>' : ""}
      </div>` : ""}
      <div class="job-card-foot">
        <div class="job-card-meta">
          <span class="job-card-meta-item">💰 ${esc(salaryTxt)}</span>
          <span class="job-card-meta-item">🧭 ${esc(expTxt)}</span>
          ${postedTxt ? '<span class="job-card-meta-item">🗓 ' + esc(postedTxt) + '</span>' : ""}
        </div>
        <svg class="job-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>`;
    return card;
  },
  renderActiveFilters() {
    const bar = this.el.activeFiltersBar;
    if (!bar) return;
    const f = STATE.filters;
    const chips = [];
    if (f.search) chips.push({ label: 'Search: ' + f.search, key: 'search' });
    if (f.location) chips.push({ label: f.location, key: 'location' });
    if (f.category) chips.push({ label: f.category, key: 'category' });
    if (f.exp) chips.push({ label: f.exp + ' yrs', key: 'exp' });
    if (f.company) chips.push({ label: f.company, key: 'company' });
    if (f.type) chips.push({ label: f.type, key: 'type' });
    if (!chips.length) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    bar.innerHTML = chips.map(c => `
      <span class="active-filter-chip">
        ${esc(c.label)}
        <button onclick="IndexPage.removeFilter('${c.key}')" aria-label="Remove">×</button>
      </span>`).join("") + `<button class="clear-all-chips" onclick="IndexPage.state.clearAll()">Clear all</button>`;
  },
  removeFilter(key) {
    const map = {
      search: ['filterSearch','search'],
      location: ['filterLocation'],
      category: ['filterCategory'],
      exp: ['filterExp'],
      company: ['filterCompany'],
      type: ['filterType']
    };
    (map[key] || []).forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    this.state.updateFilters();
  },
  renderRecent() {
    const wrap = this.el.recentlyViewed;
    if (!wrap) return;
    const ids = Store.get(STORAGE_KEYS.recent, []);
    if (!ids.length) { wrap.style.display = "none"; return; }
    const jobs = ids.map(id => STATE.jobs.find(j => j.jobId === id)).filter(Boolean);
    if (!jobs.length) { wrap.style.display = "none"; return; }
    wrap.innerHTML = '<div class="section-eyebrow">🕒 Recently viewed</div><div class="recent-row">' +
      jobs.map(j => `<a class="recent-card" href="job.html?job=${encodeURIComponent(j.jobId)}">
        <div class="recent-title">${esc(cleanText(j.title))}</div>
        <div class="recent-meta">${esc(cleanText(j.company))} · ${esc(cleanText(j.location))}</div>
      </a>`).join("") + '</div>';
    wrap.style.display = "block";
  },
  showError(msg) {
    if (this.el.grid) this.el.grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3 class="empty-title">Something went wrong</h3><p class="empty-text">' + esc(msg) + '</p></div>';
  }
};

/* ===== JOB DETAIL ===== */
const JobDetail = {
  init() {
    if (JobDetail.__initialized) return;
    JobDetail.__initialized = true;
    this.cacheEls(); this.bindEvents(); this.loadJob();
  },
  cacheEls() {
    this.el = {
      loading: document.getElementById("jobLoading"),
      error: document.getElementById("jobError"),
      errorMsg: document.getElementById("errorMessage"),
      content: document.getElementById("jobContent"),
      schemaContainer: document.getElementById("jobSchemaContainer"),
      jobIdChip: document.getElementById("jobIdChip"),
      jobTypeChip: document.getElementById("jobTypeChip"),
      jobUrgentChip: document.getElementById("jobUrgentChip"),
      jobPositionsChip: document.getElementById("jobPositionsChip"),
      jobRemoteChip: document.getElementById("jobRemoteChip"),
      jobTitle: document.getElementById("jobTitle"),
      jobCompany: document.getElementById("jobCompany"),
      jobLocationTop: document.getElementById("jobLocationTop"),
      jobIndustryTop: document.getElementById("jobIndustryTop"),
      jobIndustryDot: document.getElementById("jobIndustryDot"),
      jobSalary: document.getElementById("jobSalary"),
      jobExp: document.getElementById("jobExp"),
      jobLocationMeta: document.getElementById("jobLocationMeta"),
      jobPostedDate: document.getElementById("jobPostedDate"),
      crumbCurrent: document.getElementById("crumbCurrent"),
      blockDescription: document.getElementById("blockDescription"),
      jobDescription: document.getElementById("jobDescription"),
      blockRequirements: document.getElementById("blockRequirements"),
      jobRequirements: document.getElementById("jobRequirements"),
      blockSkills: document.getElementById("blockSkills"),
      jobSkills: document.getElementById("jobSkills"),
      blockEducation: document.getElementById("blockEducation"),
      jobEducation: document.getElementById("jobEducation"),
      blockBenefits: document.getElementById("blockBenefits"),
      jobBenefits: document.getElementById("jobBenefits"),
      blockIndustry: document.getElementById("blockIndustry"),
      jobIndustry: document.getElementById("jobIndustry"),
      blockCompany: document.getElementById("blockCompany"),
      companyCard: document.getElementById("companyCard"),
      companyName: document.getElementById("companyName"),
      companyAddress: document.getElementById("companyAddress"),
      companyWebsite: document.getElementById("companyWebsite"),
      blockDeadline: document.getElementById("blockDeadline"),
      jobDeadline: document.getElementById("jobDeadline"),
      blockSimilar: document.getElementById("blockSimilar"),
      similarJobs: document.getElementById("similarJobs"),
      applyForm: document.getElementById("applyForm"),
      applySuccess: document.getElementById("applySuccess"),
      successAppId: document.getElementById("successAppId"),
      fJobId: document.getElementById("fJobId"),
      submitBtn: document.getElementById("submitBtn"),
      fResume: document.getElementById("fResume"),
      uploadZone: document.getElementById("uploadZone"),
      uploadFileName: document.getElementById("uploadFileName"),
      mobileApplyBar: document.getElementById("mobileApplyBar"),
      mobileJobTitle: document.getElementById("mobileJobTitle"),
      mobileJobSalary: document.getElementById("mobileJobSalary"),
      mobileApplyBtn: document.getElementById("mobileApplyBtn")
    };
  },
  bindEvents() {
    const self = this;
    if (this.el.uploadZone && this.el.fResume) {
      const zone = this.el.uploadZone, input = this.el.fResume;
      ["dragenter","dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("dragging"); }));
      ["dragleave","drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("dragging"); }));
      zone.addEventListener("drop", e => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          self.updateUploadFileName();
        }
      });
      input.addEventListener("change", () => self.updateUploadFileName());
    }
    if (this.el.mobileApplyBtn) {
      this.el.mobileApplyBtn.addEventListener("click", () => {
        const form = document.getElementById("applyForm");
        if (form) {
          form.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => { const n = document.getElementById("fName"); if (n) n.focus(); }, 400);
        }
      });
    }
    if (this.el.applyForm) {
      this.el.applyForm.addEventListener("submit", e => { e.preventDefault(); self.submitApplication(); });
      // Auto-fill from portal profile if logged in
      try {
        const tok = localStorage.getItem("raveone_portal_token");
        if (tok) {
          fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "portalGetProfile", token: tok }),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          }).then(r => r.json()).then(res => {
            if (!res.ok || !res.profile) return;
            const p = res.profile;
            const set = (id, v) => { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; };
            set("fName", p.name); set("fPhone", (p.phone || "").replace(/^\+?91/, "").replace(/\D/g, ""));
            set("fEmail", p.email); set("fLocation", p.location); set("fEducation", p.education);
            set("fTotalExp", p.totalExp); set("fRelExp", p.relExp);
            set("fCurrentCtc", p.currentCtc); set("fExpectedCtc", p.expectedCtc);
            set("fNotice", p.noticePeriod); set("fReason", p.reasonLeaving);
          }).catch(() => {});
        }
      } catch (e) {}
    }
  },
  updateUploadFileName() {
    const input = this.el.fResume, zone = this.el.uploadZone, label = this.el.uploadFileName;
    if (!input || !zone || !label) return;
    if (input.files && input.files.length) { label.textContent = "✓ " + input.files[0].name; zone.classList.add("filled"); }
    else { label.textContent = ""; zone.classList.remove("filled"); }
  },
  loadJob() {
    const jobId = this.getQueryParam("job");
    if (!jobId) return this.showError("No job selected.");
    API.getJob(jobId).then(job => {
      if (!job || job.error) return this.showError("This job could not be found.");
      this.render(job);
    }).catch(() => this.showError("Could not load job details."));
  },
  render(job) {
    STATE.currentJob = job;
    document.title = job.title + " at " + (job.company || "Raveone") + " — Raveone Careers";
    this.el.loading.hidden = true; this.el.content.hidden = false;
    this.el.jobIdChip.textContent = job.jobId;
    this.el.jobTypeChip.textContent = job.jobType || job.employmentType || "Full-Time";
    this.el.jobUrgentChip.hidden = !job.isUrgent;
    if (job.positions > 1) { this.el.jobPositionsChip.textContent = job.positions + " openings"; this.el.jobPositionsChip.hidden = false; }
    else this.el.jobPositionsChip.hidden = true;
    this.el.jobRemoteChip.hidden = !job.isRemote;
    this.el.jobTitle.textContent = cleanText(job.title) || "Untitled Role";
    this.el.jobCompany.textContent = cleanText(job.company) || "Raveone Client";
    this.el.jobLocationTop.textContent = cleanText(job.location) || "India";
    if (job.industry) { this.el.jobIndustryTop.textContent = cleanText(job.industry); this.el.jobIndustryDot.hidden = false; }
    else this.el.jobIndustryDot.hidden = true;
    this.el.jobSalary.textContent = cleanSalary(job.salaryDisplay || job.salary) || "Not disclosed";
    this.el.jobExp.textContent = formatExpDisplay(job.minExp, job.maxExp);
    this.el.jobLocationMeta.textContent = cleanText(job.location) || "India";
    this.el.jobPostedDate.textContent = job.postedDate || "—";
    if (this.el.crumbCurrent) this.el.crumbCurrent.textContent = cleanText(job.title) || "Job";
    this.renderBlock("blockDescription","jobDescription", job.description);
    this.renderBlock("blockRequirements","jobRequirements", job.requirements);
    this.renderBlock("blockEducation","jobEducation", job.education);
    this.renderBlock("blockIndustry","jobIndustry", job.industry);
    if (job.skills && job.skills.length) {
      const sk = job.skills.map(cleanSkill).filter(Boolean);
      if (sk.length) { this.el.blockSkills.hidden = false; this.el.jobSkills.innerHTML = sk.map(s => '<span class="skill-chip">' + esc(s) + '</span>').join(""); }
      else this.el.blockSkills.hidden = true;
    } else this.el.blockSkills.hidden = true;
    if (job.benefits && job.benefits.length) {
      const bs = job.benefits.map(cleanSkill).filter(Boolean);
      if (bs.length) { this.el.blockBenefits.hidden = false; this.el.jobBenefits.innerHTML = bs.map(b => '<span class="benefit-item">✓ ' + esc(b) + '</span>').join(""); }
      else this.el.blockBenefits.hidden = true;
    } else this.el.blockBenefits.hidden = true;
    this.renderCompany(job);
    if (job.applicationDeadline) { this.el.blockDeadline.hidden = false; this.el.jobDeadline.textContent = job.applicationDeadline; }
    else this.el.blockDeadline.hidden = true;
    if (this.el.fJobId) this.el.fJobId.value = job.jobId;
    if (this.el.mobileApplyBar) {
      this.el.mobileApplyBar.hidden = false;
      this.el.mobileJobTitle.textContent = cleanText(job.title);
      this.el.mobileJobSalary.textContent = cleanSalary(job.salaryDisplay || job.salary) || "";
    }
    this.injectSchema(job);
    this.loadSimilar(job);
    try { SaveShare.addRecent(job.jobId); } catch (e) {}
  },
  renderBlock(wrapId, targetId, value) {
    const wrap = document.getElementById(wrapId), el = document.getElementById(targetId);
    if (!wrap || !el) return;
    if (value && String(value).trim()) { wrap.hidden = false; el.textContent = String(value); }
    else { wrap.hidden = true; el.textContent = ""; }
  },
  renderCompany(job) {
    const name = cleanText(job.company);
    if (!name) { this.el.blockCompany.hidden = true; return; }
    this.el.blockCompany.hidden = false;
    this.el.companyName.textContent = name;
    const addr = document.getElementById("companyAddress");
    if (job.address) { addr.textContent = "📍 " + cleanText(job.address); addr.style.display = ""; }
    else addr.style.display = "none";
    const web = this.el.companyWebsite;
    if (job.website) {
      let href = String(job.website);
      if (href.indexOf("http") !== 0) href = "https://" + href;
      web.href = href; web.textContent = "🌐 " + job.website + " ↗"; web.style.display = "";
    } else web.style.display = "none";
  },
  injectSchema(job) {
    const scriptUrl = window.location.origin + window.location.pathname;
    const today = new Date();
    const postedDate = job.postedDate ? this.toIsoDate(job.postedDate) : this.toIsoDate(today);
    const validThrough = this.toIsoDate(new Date(today.getTime() + 90 * 86400000));
    const empMap = { "full-time":"FULL_TIME", "part-time":"PART_TIME", "contract":"CONTRACTOR", "intern":"INTERN" };
    const empType = empMap[String(job.jobType || "Full-Time").toLowerCase()] || "FULL_TIME";
    const locParts = String(job.location || "").split(",").map(s => s.trim());
    const city = locParts[0] || "Bangalore";
    const region = locParts.length > 1 ? locParts[locParts.length - 1] : "";
    const schema = {
      "@context": "https://schema.org/", "@type": "JobPosting",
      "title": cleanText(job.title), "description": this.buildDescriptionHtml(job),
      "datePosted": postedDate, "validThrough": validThrough, "employmentType": empType,
      "hiringOrganization": { "@type": "Organization", "name": cleanText(job.company) || "Raveone Consultants",
        "sameAs": job.website && String(job.website).indexOf("http") === 0 ? job.website : "https://" + (job.website || SITE.portal),
        "logo": "https://www.raveone.in/logo.png" },
      "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": city, "addressRegion": region, "addressCountry": "IN" } },
      "identifier": { "@type": "PropertyValue", "name": "Raveone Consultants", "value": job.jobId },
      "directApply": true,
      "url": scriptUrl + "?job=" + encodeURIComponent(job.jobId)
    };
    const minS = parseFloat(String(job.minSalary || "").replace(/[^\d.]/g, ""));
    const maxS = parseFloat(String(job.maxSalary || "").replace(/[^\d.]/g, ""));
    if (minS || maxS) {
      schema.baseSalary = { "@type": "MonetaryAmount", "currency": "INR",
        "value": { "@type": "QuantitativeValue", "minValue": minS || maxS, "maxValue": maxS || minS, "unitText": "YEAR" } };
    }
    if (job.industry) schema.industry = cleanText(job.industry);
    if (this.el.schemaContainer) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      this.el.schemaContainer.appendChild(script);
    }
  },
  buildDescriptionHtml(job) {
    const parts = ["<p><strong>" + esc(cleanText(job.title)) + "</strong> — " + esc(cleanText(job.location) || "India") + "</p>"];
    if (job.description) parts.push("<p>" + esc(job.description).replace(/\n/g, "</p><p>") + "</p>");
    if (job.requirements) parts.push("<p><strong>Requirements:</strong><br>" + esc(job.requirements).replace(/\n/g, "<br>") + "</p>");
    if (job.education) parts.push("<p><strong>Education:</strong> " + esc(job.education) + "</p>");
    if (job.skills && job.skills.length) parts.push("<p><strong>Skills:</strong> " + esc(job.skills.join(", ")) + "</p>");
    return parts.join("");
  },
  toIsoDate(d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return new Date().toISOString().split("T")[0];
    return dt.toISOString().split("T")[0];
  },
  loadSimilar(job) {
    API.getJobs().then(jobs => {
      if (!Array.isArray(jobs)) return;
      const similar = jobs.filter(j => j.jobId !== job.jobId && (
        (j.category && j.category === job.category) ||
        (j.company && j.company === job.company) ||
        (j.location && job.location && j.location.split(",")[0].trim() === String(j.location).split(",")[0].trim())
      )).slice(0, 3);
      if (!similar.length) { this.el.blockSimilar.hidden = true; return; }
      this.el.similarJobs.innerHTML = similar.map(j => `
        <a class="similar-card" href="job.html?job=${encodeURIComponent(j.jobId)}">
          <div class="similar-title">${esc(cleanText(j.title))}</div>
          <div class="similar-company">${esc(cleanText(j.company))} • ${esc(cleanText(j.location))}</div>
          <div class="similar-salary">${esc(cleanSalary(j.salaryDisplay) || "Not disclosed")}</div>
        </a>`).join("");
    }).catch(() => { this.el.blockSimilar.hidden = true; });
  },
  submitApplication() {
    const self = this;
    const name = document.getElementById("fName").value.trim();
    const phone = document.getElementById("fPhone").value.trim().replace(/[^\d]/g, "");
    const email = document.getElementById("fEmail").value.trim();
    const location = document.getElementById("fLocation").value.trim();
    const education = document.getElementById("fEducation").value.trim();
    const totalExp = document.getElementById("fTotalExp").value.trim();
    const relExp = document.getElementById("fRelExp").value.trim();
    const currentCtc = document.getElementById("fCurrentCtc").value.trim();
    const expectedCtc = document.getElementById("fExpectedCtc").value.trim();
    const noticePeriod = document.getElementById("fNotice").value.trim();
    const reasonLeaving = document.getElementById("fReason").value.trim();
    const jobId = this.el.fJobId.value;
    const fileInput = this.el.fResume;
    if (!name || name.length < 2) return this.fieldError("fName", "Please enter your full name.");
    if (!phone || phone.length !== 10 || !/^[6-9]/.test(phone)) return this.fieldError("fPhone", "Enter a valid 10-digit mobile number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.fieldError("fEmail", "Enter a valid email.");
    if (!totalExp) return this.fieldError("fTotalExp", "Total experience is required.");
    if (!noticePeriod) return this.fieldError("fNotice", "Notice period is required.");
    if (!fileInput.files || !fileInput.files.length) { SaveShare.toast("Please upload your resume."); return; }
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) { SaveShare.toast("Resume must be under 5 MB."); return; }
    const allowed = [".pdf",".doc",".docx",".jpg",".jpeg",".png"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (allowed.indexOf(ext) === -1) { SaveShare.toast("Resume must be PDF, DOC, DOCX, JPG, or PNG."); return; }

    const btn = this.el.submitBtn;
    const txtSpan = btn.querySelector(".btn-apply-text");
    const origText = txtSpan ? txtSpan.textContent : btn.textContent;
    btn.disabled = true;
    if (txtSpan) txtSpan.textContent = "Submitting…"; else btn.textContent = "Submitting…";

    const reader = new FileReader();
    reader.onload = function (ev) {
      const base64 = String(ev.target.result).split(",")[1];
      const payload = {
        action: "submitCandidate", jobId, name, email, phone, location, education, totalExp,
        relExp, currentCtc, expectedCtc, noticePeriod, reasonLeaving,
        resumeData: base64, resumeName: file.name
      };
      API.submitApplication(payload).then(res => {
        if (res && (res.ok || res.status === "success")) self.showSuccess(res.applicationId || res.id);
        else throw new Error((res && (res.error || res.message)) || "Submission failed");
      }).catch(err => {
        self.resetSubmitBtn(btn, origText);
        SaveShare.toast("⚠️ " + (err.message || "Submission failed"));
      });
    };
    reader.onerror = () => { self.resetSubmitBtn(btn, origText); SaveShare.toast("Could not read file."); };
    reader.readAsDataURL(file);
  },
  fieldError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.classList.add("error"); el.focus(); setTimeout(() => el.classList.remove("error"), 3000); }
    SaveShare.toast(msg);
  },
  resetSubmitBtn(btn, origText) {
    btn.disabled = false;
    const span = btn.querySelector(".btn-apply-text");
    if (span) span.textContent = origText; else btn.textContent = origText;
  },
  showSuccess(appId) {
    this.el.applyForm.hidden = true;
    this.el.applySuccess.hidden = false;
    if (this.el.successAppId) this.el.successAppId.textContent = appId || "—";
    this.el.applySuccess.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  showError(msg) {
    this.el.loading.hidden = true;
    this.el.content.hidden = true;
    this.el.error.hidden = false;
    if (this.el.errorMsg) this.el.errorMsg.textContent = msg;
  },
  getQueryParam(key) {
    try { return new URL(window.location.href).searchParams.get(key); }
    catch (e) {
      const m = window.location.search.match(new RegExp("[?&]" + key + "=([^&]+)"));
      return m ? decodeURIComponent(m[1]) : "";
    }
  }
};

/* ===== BOOT ===== */
function raveoneBoot() {
  UI.setYear(); UI.initMobileMenu(); UI.initScrollEffect(); UI.initKeyboard();
  const page = UI.page();
  if (page === "index") IndexPage.init();
  else if (page === "job") { if (!window.__jobDetailInitialized) { window.__jobDetailInitialized = true; JobDetail.init(); } }
}
window.initJobDetail = function () { JobDetail.init(); };
window.RAVEONE_API_URL = API_URL;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", raveoneBoot);
else raveoneBoot();
