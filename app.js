/* ==========================================================================
 * RAVEONE CAREERS — APPLICATION SCRIPT
 * Frontend controller for career page + job detail
 * Author: Raveone Consultants
 * ==========================================================================
 *
 * ⚠️  BEFORE YOU DEPLOY:
 *     1. Deploy the Apps Script backend as a Web App
 *        (Execute as: Me · Access: Anyone)
 *     2. Copy the Web App URL (looks like: https://script.google.com/.../exec)
 *     3. Paste it into API_URL below
 *     4. Commit this file
 * ==========================================================================
 */

/* ==========================================================================
   CONFIG — EDIT THIS BEFORE DEPLOY
   ========================================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbzSX8aT_Vecff3ZJinj0wt-DU72NH9jmerdyN7DywmGlX401jssm87ZHS6QUnP8qG0y/exec";

/* ==========================================================================
   CONSTANTS
   ========================================================================== */
const SITE = {
  brand: "Raveone Careers",
  portal: "https://www.raveone.in",
  phone: "9148330565",
  email: "rajesh@raveone.in"
};

const STORAGE_KEYS = {
  savedJobs: "raveone_saved_jobs_v1"
};

const PAGE_SIZE = 10;

/* ==========================================================================
   GLOBAL STATE
   ========================================================================== */
const STATE = {
  jobs: [],
  filtered: [],
  displayed: 0,
  filters: {
    search: "",
    location: "",
    category: "",
    exp: "",
    company: "",
    type: ""
  },
  sort: "recent",
  currentJob: null
};

/* ==========================================================================
   UTILITIES
   ========================================================================== */

/**
 * Escape HTML — safe insertion into DOM.
 */
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Parse any date — returns "x days ago" / "today" / "yesterday".
 */
function daysAgo(dateVal) {
  if (!dateVal) return "";
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return diff + " days ago";
  if (diff < 30) return Math.floor(diff / 7) + " week" + (Math.floor(diff / 7) > 1 ? "s" : "") + " ago";
  if (diff < 60) return "1 month ago";
  return Math.floor(diff / 30) + " months ago";
}

/**
 * Clean up an experience value coming from the Jobs sheet.
 *   "Fresher" / "Freshers"   →  "0"
 *   "1 Yrs" / "5 Years"      →  "1" / "5"
 *   "10 yrs"                 →  "10"
 *   5 (number)               →  "5"
 *   "" / null / undefined    →  ""
 */
function cleanExp(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (/^freshers?$/i.test(s)) return "0";
  // strip "Yrs", "Years", "yrs." suffixes then keep digits/decimal only
  return s.replace(/\s*(yrs?|years?)\.?$/i, "").replace(/[^\d.]/g, "").trim();
}

/**
 * Format an experience range for display:
 *   (1, 2)        → "1–2 yrs"
 *   (0, 0)        → "0 yrs"  (fresher)
 *   ("Fresher","")→ "0 yrs"
 *   (5, 5)        → "5 yrs"
 *   (0, "")       → "0+ yrs"
 *   ("", "")      → "Any"
 */
function formatExpDisplay(min, max) {
  const minC = cleanExp(min);
  const maxC = cleanExp(max);
  if (!minC && !maxC) return "Any";
  if (minC === maxC) return minC + " yrs";
  if (minC && maxC) return minC + "–" + maxC + " yrs";
  if (minC) return minC + "+ yrs";
  return "Up to " + maxC + " yrs";
}

/**
 * Parse min years from experience string — used for filtering.
 *   "Fresher" → 0
 *   "1 Yrs"   → 1
 *   5         → 5
 */
function parseYears(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (/^freshers?$/i.test(s)) return 0;
  const n = parseFloat(s.replace(/\s*(yrs?|years?)\.?$/i, "").replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Clean salary display — collapse multiple ₹ into one.
 *   "₹₹18,870.31 – ₹₹18,870.31" → "₹18,870.31 – ₹18,870.31"
 */
function cleanSalary(v) {
  if (!v) return "";
  return String(v).replace(/₹+/g, "₹").trim();
}

/**
 * Clean a single skill chip — strip newlines, collapse whitespace, truncate.
 *   "About the Company:\nArphi Electronics..." → "About the Company: Arphi…"
 */
function cleanSkill(s) {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length < 4) return "";
  return t.length > 45 ? t.slice(0, 42) + "…" : t;
}

/**
 * Collapse all whitespace and trim — used for title, company, description.
 */
function cleanText(s) {
  if (!s) return "";
  return String(s).replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
}

/**
 * Compute salary max for sorting.
 */
function salaryMaxInLpa(job) {
  const max = parseFloat(String(job.maxSalary || job.minSalary || "").replace(/[^\d.]/g, ""));
  if (isNaN(max)) return 0;
  return max;
}

/**
 * Debounce helper.
 */
function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms || 200);
  };
}

/**
 * Safe localStorage wrappers.
 */
const Store = {
  get: function (key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : (fallback !== undefined ? fallback : null);
    } catch (e) { return fallback !== undefined ? fallback : null; }
  },
  set: function (key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
};

/* ==========================================================================
   API LAYER
   ========================================================================== */
const API = {
  /**
   * Normalize a job object from the API.
   * Skills / benefits → arrays; boolean flags normalized.
   */
  normalizeJob: function (j) {
    if (!j) return j;

    if (!Array.isArray(j.skills)) {
      j.skills = String(j.skills || "")
        .split(",")
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }
    if (!Array.isArray(j.benefits)) {
      j.benefits = String(j.benefits || "")
        .split(",")
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }

    const isYes = function (v) {
      if (v === true) return true;
      const s = String(v || "").toLowerCase().trim();
      return s === "yes" || s === "true";
    };
    j.isUrgent   = isYes(j.isUrgent);
    j.isFeatured = isYes(j.isFeatured);
    j.isRemote   = isYes(j.isRemote);

    return j;
  },

  getJobs: function () {
    return fetch(API_URL + "?action=jobs")
      .then(function (r) { return r.json(); })
      .then(function (jobs) {
        if (Array.isArray(jobs)) return jobs.map(API.normalizeJob);
        return jobs;
      })
      .catch(function (err) {
        console.error("API.getJobs failed:", err);
        throw err;
      });
  },

  getJob: function (jobId) {
    return fetch(API_URL + "?action=job&id=" + encodeURIComponent(jobId))
      .then(function (r) { return r.json(); })
      .then(function (job) { return API.normalizeJob(job); })
      .catch(function (err) {
        console.error("API.getJob failed:", err);
        throw err;
      });
  },

  submitApplication: function (payload) {
    return fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    })
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        console.error("API.submitApplication failed:", err);
        throw err;
      });
  }
};

/* ==========================================================================
   SHARED UI
   ========================================================================== */
const UI = {
  page: function () {
    if (document.getElementById("jobsGrid")) return "index";
    if (document.getElementById("jobDetail")) return "job";
    if (document.getElementById("pageContent")) return "page";
    return "unknown";
  },

  initMobileMenu: function () {
    const toggle = document.getElementById("mobileToggle");
    const nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });

    nav.querySelectorAll(".nav-link").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  },

  initScrollEffect: function () {
    const header = document.getElementById("siteHeader");
    if (!header) return;
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        header.classList.toggle("scrolled", window.scrollY > 10);
        ticking = false;
      });
    }, { passive: true });
  },

  setYear: function () {
    const y = document.getElementById("footerYear");
    if (y) y.textContent = new Date().getFullYear();
  },

  initReveal: function () {
    if (!("IntersectionObserver" in window)) return;
    const els = document.querySelectorAll(".trust-card, .benefit-card, .blog-card, .process-step");
    if (!els.length) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.style.opacity = "1";
          e.target.style.transform = "translateY(0)";
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });

    els.forEach(function (el) {
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
      el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
      io.observe(el);
    });
  }
};

/* ==========================================================================
   SAVE / SHARE / COPY-LINK
   ========================================================================== */
const SaveShare = {
  getSaved: function () {
    return Store.get(STORAGE_KEYS.savedJobs, []);
  },

  isSaved: function (jobId) {
    return this.getSaved().indexOf(jobId) !== -1;
  },

  toggle: function (jobId) {
    const arr = this.getSaved();
    const idx = arr.indexOf(jobId);
    if (idx === -1) arr.push(jobId);
    else arr.splice(idx, 1);
    Store.set(STORAGE_KEYS.savedJobs, arr);
    return idx === -1;
  },

  initSaveButton: function (jobId) {
    const btn = document.getElementById("saveBtn");
    const label = document.getElementById("saveBtnText");
    if (!btn) return;

    const update = function () {
      if (SaveShare.isSaved(jobId)) {
        btn.classList.add("saved");
        if (label) label.textContent = "Saved";
      } else {
        btn.classList.remove("saved");
        if (label) label.textContent = "Save";
      }
    };

    btn.addEventListener("click", function () {
      const nowSaved = SaveShare.toggle(jobId);
      update();
      if (nowSaved) {
        if (label) label.textContent = "Saved ✓";
        setTimeout(update, 1200);
      }
    });

    update();
  },

  initShareButton: function (job) {
    const shareBtn = document.getElementById("shareBtn");
    const copyBtn = document.getElementById("copyLinkBtn");
    const popover = document.getElementById("sharePopover");
    const closeBtn = document.getElementById("shareClose");

    if (!shareBtn || !popover) return;

    const closePopover = function () { popover.hidden = true; };

    shareBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const rect = shareBtn.getBoundingClientRect();
      popover.style.top = (rect.bottom + 8) + "px";
      popover.style.right = "24px";
      popover.style.left = "auto";
      popover.hidden = !popover.hidden;
    });

    if (closeBtn) closeBtn.addEventListener("click", closePopover);

    document.addEventListener("click", function (e) {
      if (popover.hidden) return;
      if (popover.contains(e.target)) return;
      closePopover();
    });

    const pageUrl = window.location.href;
    const text = "Check out this job: " + job.title + " at " + (job.company || "Raveone") + " — " + job.location;

    const wa = document.getElementById("shareWhatsapp");
    if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(text + "\n" + pageUrl);

    const em = document.getElementById("shareEmail");
    if (em) em.href = "mailto:?subject=" + encodeURIComponent("Job: " + job.title) +
      "&body=" + encodeURIComponent(text + "\n\n" + pageUrl);

    const li = document.getElementById("shareLinkedin");
    if (li) li.href = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(pageUrl);

    const cp = document.getElementById("shareCopy");
    if (cp) cp.addEventListener("click", function () { SaveShare.copyLink(pageUrl); closePopover(); });

    if (copyBtn) copyBtn.addEventListener("click", function () { SaveShare.copyLink(pageUrl); });
  },

  copyLink: function (url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        SaveShare.toast("Link copied");
      }).catch(function () {
        SaveShare.fallbackCopy(url);
      });
    } else {
      SaveShare.fallbackCopy(url);
    }
  },

  fallbackCopy: function (url) {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); SaveShare.toast("Link copied"); } catch (e) {}
    document.body.removeChild(ta);
  },

  toast: function (msg) {
    const t = document.createElement("div");
    t.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:#0F172A;color:#fff;padding:10px 20px;border-radius:999px;" +
      "font-size:13px;font-weight:600;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.2);" +
      "opacity:0;transition:opacity .2s ease;";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = "1"; });
    setTimeout(function () {
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 300);
    }, 1800);
  }
};

/* ==========================================================================
   INDEX PAGE CONTROLLER
   ========================================================================== */
const IndexPage = {
  init: function () {
    this.cacheEls();
    this.bindEvents();
    this.loadJobs();
  },

  cacheEls: function () {
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
      filtersCard: document.querySelector(".filters-card")
    };
  },

  bindEvents: function () {
    const self = this;

    if (this.el.searchForm) {
      this.el.searchForm.addEventListener("submit", function (e) {
        e.preventDefault();
        self.el.filterSearch.value = self.el.search.value;
        self.state.updateFilters();
        document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
      });
    }

    const debouncedFilter = debounce(function () {
      self.state.updateFilters();
    }, 250);

    if (this.el.filterSearch) this.el.filterSearch.addEventListener("input", debouncedFilter);
    if (this.el.search) this.el.search.addEventListener("input", debouncedFilter);

    ["filterLocation", "filterCategory", "filterExp", "filterCompany", "filterType"].forEach(function (k) {
      const el = self.el[k];
      if (el) el.addEventListener("change", function () { self.state.updateFilters(); });
    });

    if (this.el.sortSelect) {
      this.el.sortSelect.addEventListener("change", function () {
        STATE.sort = self.el.sortSelect.value;
        self.applySortAndRender();
      });
    }

    [this.el.clearFilters, this.el.emptyClear].forEach(function (b) {
      if (b) b.addEventListener("click", function () { self.state.clearAll(); });
    });

    if (this.el.loadMoreBtn) {
      this.el.loadMoreBtn.addEventListener("click", function () { self.renderNext(); });
    }

    if (this.el.popularTags) {
      this.el.popularTags.querySelectorAll(".popular-tag").forEach(function (tag) {
        tag.addEventListener("click", function () {
          const q = tag.getAttribute("data-q") || "";
          if (self.el.search) self.el.search.value = q;
          if (self.el.filterSearch) self.el.filterSearch.value = q;
          self.state.updateFilters();
          document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
        });
      });
    }

    if (this.el.mobileFilterBtn) {
      this.el.mobileFilterBtn.addEventListener("click", function () {
        self.el.filtersCard.classList.add("open");
        self.el.sheetBackdrop.hidden = false;
      });
    }
    if (this.el.sheetBackdrop) {
      this.el.sheetBackdrop.addEventListener("click", function () {
        self.el.filtersCard.classList.remove("open");
        self.el.sheetBackdrop.hidden = true;
      });
    }
  },

  state: {
    updateFilters: function () {
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
    },

    clearAll: function () {
      IndexPage.el.filterSearch.value = "";
      IndexPage.el.search.value = "";
      IndexPage.el.filterLocation.value = "";
      IndexPage.el.filterCategory.value = "";
      IndexPage.el.filterExp.value = "";
      IndexPage.el.filterCompany.value = "";
      IndexPage.el.filterType.value = "";
      IndexPage.state.updateFilters();
    }
  },

  loadJobs: function () {
    const self = this;
    API.getJobs()
      .then(function (jobs) {
        STATE.jobs = Array.isArray(jobs) ? jobs : [];
        self.hideSkeleton();
        self.populateFilters();
        self.updateStats();
        self.applyFilters();
      })
      .catch(function (err) {
        self.hideSkeleton();
        self.showError("Could not load jobs. Please refresh the page.");
      });
  },

  hideSkeleton: function () {
    if (this.el.skeleton) this.el.skeleton.hidden = true;
  },

  populateFilters: function () {
    const locSet = {};
    const catSet = {};
    const compSet = {};

    STATE.jobs.forEach(function (j) {
      if (j.location) {
        String(j.location).split(/[,/]/).map(function (s) { return s.trim(); })
          .filter(Boolean).forEach(function (l) { locSet[l] = (locSet[l] || 0) + 1; });
      }
      if (j.category) catSet[j.category] = (catSet[j.category] || 0) + 1;
      if (j.company)  compSet[j.company] = (compSet[j.company] || 0) + 1;
    });

    Object.keys(locSet).sort().forEach(function (l) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l + " (" + locSet[l] + ")";
      this.el.filterLocation.appendChild(opt);
    }, this);

    Object.keys(catSet).sort().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + catSet[c] + ")";
      this.el.filterCategory.appendChild(opt);
    }, this);

    Object.keys(compSet).sort().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + compSet[c] + ")";
      this.el.filterCompany.appendChild(opt);
    }, this);

    this.renderPopularTags();
  },

  renderPopularTags: function () {
    const container = this.el.popularTags;
    if (!container) return;

    const wordCount = {};
    const stopWords = {
      "and":"1","or":"1","the":"1","a":"1","an":"1","of":"1","for":"1","to":"1",
      "in":"1","on":"1","at":"1","by":"1","with":"1","as":"1","is":"1","are":"1",
      "be":"1","this":"1","that":"1","it":"1","its":"1","will":"1","can":"1",
      "must":"1","should":"1","able":"1","work":"1","working":"1","years":"1",
      "year":"1","experience":"1","candidate":"1","role":"1","job":"1","new":"1",
      "all":"1","any":"1","other":"1","than":"1","have":"1","has":"1","more":"1",
      "their":"1","also":"1","well":"1","good":"1","strong":"1","key":"1"
    };

    const addWords = function (text, weight) {
      if (!text) return;
      String(text).toLowerCase()
        .replace(/[^\w\s&+#.]/g, " ")
        .split(/\s+/)
        .forEach(function (w) {
          w = w.trim();
          if (!w || w.length < 2) return;
          if (stopWords[w]) return;
          if (/^\d+$/.test(w)) return;
          wordCount[w] = (wordCount[w] || 0) + (weight || 1);
        });
    };

    STATE.jobs.forEach(function (j) {
      addWords(j.category, 5);
      if (j.skills && j.skills.length) {
        j.skills.forEach(function (s) { addWords(s, 3); });
      }
      addWords(j.title, 2);
    });

    const self = this;
    const candidates = Object.keys(wordCount)
      .sort(function (a, b) { return wordCount[b] - wordCount[a]; })
      .filter(function (word) {
        return STATE.jobs.some(function (j) {
          const hay = [
            j.title, j.category, j.industry, j.description,
            (j.skills || []).join(" ")
          ].join(" ").toLowerCase();
          return hay.indexOf(word) !== -1;
        });
      })
      .slice(0, 7);

    if (!candidates.length) {
      container.style.display = "none";
      return;
    }

    const label = container.querySelector(".popular-label");
    container.innerHTML = "";
    if (label) container.appendChild(label);

    candidates.forEach(function (word) {
      const btn = document.createElement("button");
      btn.className = "popular-tag";
      btn.setAttribute("data-q", word);
      btn.textContent = self.capitalize(word);
      btn.addEventListener("click", function () {
        if (self.el.search) self.el.search.value = word;
        if (self.el.filterSearch) self.el.filterSearch.value = word;
        self.state.updateFilters();
        const jobsEl = document.getElementById("jobs");
        if (jobsEl) jobsEl.scrollIntoView({ behavior: "smooth" });
      });
      container.appendChild(btn);
    });
  },

  capitalize: function (s) {
    return String(s || "").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  },

  updateStats: function () {
    const clients = {};
    const cities = {};

    STATE.jobs.forEach(function (j) {
      if (j.company) clients[j.company] = 1;
      if (j.location) {
        String(j.location).split(/[,/]/).map(function (s) { return s.trim(); })
          .filter(Boolean).forEach(function (c) { cities[c] = 1; });
      }
    });

    if (this.el.statJobs) this.el.statJobs.textContent = STATE.jobs.length;
    if (this.el.statClients) this.el.statClients.textContent = Object.keys(clients).length;
    if (this.el.statCities) this.el.statCities.textContent = Object.keys(cities).length;
  },

  applyFilters: function () {
    const f = STATE.filters;

    let list = STATE.jobs.filter(function (j) {
      if (f.search) {
        const hay = [
          j.jobId, j.title, j.company, j.location, j.category,
          j.description, (j.skills || []).join(" "),
          j.industry, j.education
        ].join(" ").toLowerCase();
        if (hay.indexOf(f.search) === -1) return false;
      }

      if (f.location && String(j.location || "").toLowerCase().indexOf(f.location.toLowerCase()) === -1) return false;
      if (f.category && j.category !== f.category) return false;
      if (f.company && j.company !== f.company) return false;
      if (f.type && String(j.jobType || j.employmentType || "").toLowerCase() !== f.type.toLowerCase()) return false;

      if (f.exp) {
        const minExp = parseYears(j.minExp);
        if (f.exp === "0-2" && minExp > 2) return false;
        if (f.exp === "2-5" && (minExp < 2 || minExp > 5)) return false;
        if (f.exp === "5-10" && (minExp < 5 || minExp > 10)) return false;
        if (f.exp === "10+" && minExp < 10) return false;
      }

      return true;
    });

    STATE.filtered = list;
    this.applySortAndRender();
  },

  applySortAndRender: function () {
    const sort = STATE.sort;

    STATE.filtered.sort(function (a, b) {
      if (sort === "recent") {
        const da = new Date(a.postedDate || 0).getTime();
        const db = new Date(b.postedDate || 0).getTime();
        return db - da;
      }
      if (sort === "salary-high") {
        return salaryMaxInLpa(b) - salaryMaxInLpa(a);
      }
      if (sort === "exp-low") {
        return parseYears(a.minExp) - parseYears(b.minExp);
      }
      const aF = a.isFeatured ? 1 : 0;
      const bF = b.isFeatured ? 1 : 0;
      if (aF !== bF) return bF - aF;
      const aU = a.isUrgent ? 1 : 0;
      const bU = b.isUrgent ? 1 : 0;
      return bU - aU;
    });

    if (this.el.count) {
      this.el.count.textContent = STATE.filtered.length + " role" + (STATE.filtered.length === 1 ? "" : "s");
    }
    if (this.el.info) {
      this.el.info.textContent = STATE.filtered.length + " of " + STATE.jobs.length + " matching";
    }

    STATE.displayed = 0;
    this.el.grid.innerHTML = "";

    this.renderNext();
  },

  renderNext: function () {
    const start = STATE.displayed;
    const end = Math.min(start + PAGE_SIZE, STATE.filtered.length);
    const slice = STATE.filtered.slice(start, end);

    const frag = document.createDocumentFragment();
    slice.forEach(function (j) {
      frag.appendChild(IndexPage.buildCard(j));
    });
    this.el.grid.appendChild(frag);

    STATE.displayed = end;

    if (STATE.filtered.length === 0) {
      this.el.empty.hidden = false;
      this.el.loadMoreWrap.hidden = true;
    } else {
      this.el.empty.hidden = true;
      this.el.loadMoreWrap.hidden = (STATE.displayed >= STATE.filtered.length);
    }
  },

  /**
   * Build a job card — robust against messy data from the sheet.
   */
  buildCard: function (j) {
    const card = document.createElement("a");
    card.className = "job-card";
    card.href = "job.html?job=" + encodeURIComponent(j.jobId);

    // Clean up potentially messy fields
    const title    = cleanText(j.title) || "Untitled Role";
    const company  = cleanText(j.company) || "Raveone Client";
    const location = cleanText(j.location) || "India";
    const jobId    = cleanText(j.jobId);

    // Skills — filter empties, truncate, take first 3
    const allSkills = (j.skills || []).map(cleanSkill).filter(Boolean);
    const skills    = allSkills.slice(0, 3);
    const moreSkills = allSkills.length - skills.length;

    // Experience — normalize "Fresher" / "1 Yrs" / 5
    const expTxt = formatExpDisplay(j.minExp, j.maxExp);

    // Salary — clean double ₹
    const salaryTxt = cleanSalary(j.salaryDisplay) || "Not disclosed";

    // Posted date
    const postedTxt = j.postedDate ? daysAgo(j.postedDate) : "";

    // Description — collapse whitespace, truncate cleanly
    const descRaw = cleanText(j.description || "");
    const descTxt = descRaw.length > 200 ? descRaw.slice(0, 197) + "…" : descRaw;

    // Badges
    const badges = [];
    if (j.isUrgent)   badges.push('<span class="chip chip-amber">🔥 Urgent</span>');
    if (j.isFeatured) badges.push('<span class="chip chip-navy">⭐ Featured</span>');
    if (j.isRemote)   badges.push('<span class="chip chip-purple">🌐 Remote</span>');
    if (j.positions > 1) badges.push('<span class="chip chip-blue">' + j.positions + ' openings</span>');

    card.innerHTML = `
      <div class="job-card-head">
        <div class="job-card-title-wrap">
          <h3 class="job-card-title">${esc(title)}</h3>
          <div class="job-card-company">
            ${esc(company)}
            <span class="dot">•</span>
            ${esc(location)}
          </div>
        </div>
        <span class="job-card-id">${esc(jobId)}</span>
      </div>

      ${badges.length ? '<div class="job-card-badges">' + badges.join("") + '</div>' : ""}

      <p class="job-card-description">${esc(descTxt)}</p>

      ${skills.length ? `
      <div class="job-card-skills">
        ${skills.map(function (s) { return '<span class="skill-chip">' + esc(s) + '</span>'; }).join("")}
        ${moreSkills > 0 ? '<span class="skill-chip skill-chip-more">+' + moreSkills + '</span>' : ""}
      </div>` : ""}

      <div class="job-card-foot">
        <div class="job-card-meta">
          <span class="job-card-meta-item">💰 ${esc(salaryTxt)}</span>
          <span class="job-card-meta-item">🧭 ${esc(expTxt)}</span>
          ${postedTxt ? '<span class="job-card-meta-item">🗓 ' + esc(postedTxt) + '</span>' : ""}
        </div>
        <svg class="job-card-arrow" width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    `;

    return card;
  },

  showError: function (msg) {
    if (this.el.grid) {
      this.el.grid.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon">⚠️</div>' +
        '<h3 class="empty-title">Something went wrong</h3>' +
        '<p class="empty-text">' + esc(msg) + '</p>' +
        '</div>';
    }
  }
};

/* ==========================================================================
   JOB DETAIL PAGE CONTROLLER
   ========================================================================== */
const JobDetail = {
  init: function () {
    if (JobDetail.__initialized) return;
    JobDetail.__initialized = true;
    this.cacheEls();
    this.bindEvents();
    this.loadJob();
  },

  cacheEls: function () {
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

  bindEvents: function () {
    const self = this;

    if (this.el.uploadZone) {
      const zone = this.el.uploadZone;
      const input = this.el.fResume;

      ["dragenter", "dragover"].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
          e.preventDefault();
          zone.classList.add("dragging");
        });
      });

      ["dragleave", "drop"].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
          e.preventDefault();
          zone.classList.remove("dragging");
        });
      });

      zone.addEventListener("drop", function (e) {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          input.files = dt.files;
          self.updateUploadFileName();
        }
      });

      input.addEventListener("change", function () { self.updateUploadFileName(); });
    }

    if (this.el.mobileApplyBtn) {
      this.el.mobileApplyBtn.addEventListener("click", function () {
        const form = document.getElementById("applyForm");
        if (form) {
          form.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(function () {
            const name = document.getElementById("fName");
            if (name) name.focus();
          }, 400);
        }
      });
    }

    if (this.el.applyForm) {
      this.el.applyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        self.submitApplication();
      });
    }

    if (this.el.similarJobs) {
      this.el.similarJobs.addEventListener("click", function (e) {
        const card = e.target.closest("a");
        if (!card) return;
      });
    }
  },

  updateUploadFileName: function () {
    const input = this.el.fResume;
    const zone = this.el.uploadZone;
    const label = this.el.uploadFileName;
    if (!input || !zone || !label) return;

    if (input.files && input.files.length) {
      label.textContent = "✓ " + input.files[0].name;
      zone.classList.add("filled");
    } else {
      label.textContent = "";
      zone.classList.remove("filled");
    }
  },

  loadJob: function () {
    const jobId = this.getQueryParam("job");
    if (!jobId) {
      this.showError("No job selected.");
      return;
    }

    const self = this;
    API.getJob(jobId)
      .then(function (job) {
        if (!job || job.error) {
          self.showError("This job could not be found. It may have been filled or removed.");
          return;
        }
        self.render(job);
      })
      .catch(function () {
        self.showError("Could not load job details. Please refresh the page.");
      });
  },

  render: function (job) {
    STATE.currentJob = job;

    document.title = job.title + " at " + (job.company || "Raveone") + " — Raveone Careers";
    const metaDesc = (job.description || "").substring(0, 150).replace(/<[^>]*>/g, "") + "…";
    this.updateMetaTags(job, metaDesc);

    this.el.loading.hidden = true;
    this.el.content.hidden = false;

    this.el.jobIdChip.textContent = job.jobId;
    this.el.jobTypeChip.textContent = job.jobType || job.employmentType || "Full-Time";

    if (job.isUrgent) this.el.jobUrgentChip.hidden = false; else this.el.jobUrgentChip.hidden = true;
    if (job.positions > 1) {
      this.el.jobPositionsChip.textContent = job.positions + " openings";
      this.el.jobPositionsChip.hidden = false;
    } else this.el.jobPositionsChip.hidden = true;
    if (job.isRemote) this.el.jobRemoteChip.hidden = false; else this.el.jobRemoteChip.hidden = true;

    this.el.jobTitle.textContent = cleanText(job.title) || "Untitled Role";
    this.el.jobCompany.textContent = cleanText(job.company) || "Raveone Client";
    this.el.jobLocationTop.textContent = cleanText(job.location) || "India";
    if (job.industry) {
      this.el.jobIndustryTop.textContent = cleanText(job.industry);
      this.el.jobIndustryDot.hidden = false;
    } else {
      this.el.jobIndustryDot.hidden = true;
    }

    this.el.jobSalary.textContent = cleanSalary(job.salaryDisplay || job.salary) || "Not disclosed";
    this.el.jobExp.textContent = formatExpDisplay(job.minExp, job.maxExp);
    this.el.jobLocationMeta.textContent = cleanText(job.location) || "India";
    this.el.jobPostedDate.textContent = job.postedDate || "—";

    if (this.el.crumbCurrent) this.el.crumbCurrent.textContent = cleanText(job.title) || "Job";

    this.renderBlock("blockDescription", "jobDescription", job.description);
    this.renderBlock("blockRequirements", "jobRequirements", job.requirements);
    this.renderBlock("blockEducation", "jobEducation", job.education);
    this.renderBlock("blockIndustry", "jobIndustry", job.industry);

    if (job.skills && job.skills.length) {
      const cleanSkills = job.skills.map(cleanSkill).filter(Boolean);
      if (cleanSkills.length) {
        this.el.blockSkills.hidden = false;
        this.el.jobSkills.innerHTML = cleanSkills.map(function (s) {
          return '<span class="skill-chip">' + esc(s) + '</span>';
        }).join("");
      } else {
        this.el.blockSkills.hidden = true;
      }
    } else {
      this.el.blockSkills.hidden = true;
    }

    if (job.benefits && job.benefits.length) {
      const cleanBenefits = job.benefits.map(cleanSkill).filter(Boolean);
      if (cleanBenefits.length) {
        this.el.blockBenefits.hidden = false;
        this.el.jobBenefits.innerHTML = cleanBenefits.map(function (b) {
          return '<span class="benefit-item">✓ ' + esc(b) + '</span>';
        }).join("");
      } else {
        this.el.blockBenefits.hidden = true;
      }
    } else {
      this.el.blockBenefits.hidden = true;
    }

    this.renderCompany(job);

    if (job.applicationDeadline) {
      this.el.blockDeadline.hidden = false;
      this.el.jobDeadline.textContent = job.applicationDeadline;
    } else {
      this.el.blockDeadline.hidden = true;
    }

    if (this.el.fJobId) this.el.fJobId.value = job.jobId;

    const applySub = document.getElementById("applyCardSub");
    if (applySub) applySub.textContent = cleanText(job.company) + " • " + cleanText(job.location);

    if (this.el.mobileApplyBar) {
      this.el.mobileApplyBar.hidden = false;
      this.el.mobileJobTitle.textContent = cleanText(job.title);
      this.el.mobileJobSalary.textContent = cleanSalary(job.salaryDisplay || job.salary) || "";
    }

    SaveShare.initSaveButton(job.jobId);
    SaveShare.initShareButton(job);

    this.injectSchema(job);
    this.loadSimilar(job);
  },

  renderBlock: function (wrapId, targetId, value) {
    const wrap = document.getElementById(wrapId);
    const el = document.getElementById(targetId);
    if (!wrap || !el) return;
    if (value && String(value).trim()) {
      wrap.hidden = false;
      el.textContent = String(value);
    } else {
      wrap.hidden = true;
      el.textContent = "";
    }
  },

  renderCompany: function (job) {
    const companyName = cleanText(job.company);
    if (!companyName) {
      this.el.blockCompany.hidden = true;
      return;
    }
    this.el.blockCompany.hidden = false;
    this.el.companyName.textContent = companyName;

    const addr = document.getElementById("companyAddress");
    if (job.address) {
      addr.textContent = "📍 " + cleanText(job.address);
      addr.style.display = "";
    } else {
      addr.style.display = "none";
    }

    const web = this.el.companyWebsite;
    if (job.website) {
      let href = String(job.website);
      if (href.indexOf("http") !== 0) href = "https://" + href;
      web.href = href;
      web.textContent = "🌐 " + job.website + " ↗";
      web.style.display = "";
    } else {
      web.style.display = "none";
    }
  },

  updateMetaTags: function (job, metaDesc) {
    const url = window.location.href;

    const set = function (id, attr, val) {
      const el = document.getElementById(id);
      if (el) el.setAttribute(attr, val);
    };

    set("metaDescription", "content", metaDesc);
    set("canonicalLink", "href", url);
    set("ogTitleMeta", "content", document.title);
    set("ogDescription", "content", metaDesc);
    set("ogUrl", "content", url);
    set("twTitle", "content", document.title);
    set("twDescription", "content", metaDesc);
  },

  injectSchema: function (job) {
    const scriptUrl = window.location.origin + window.location.pathname;
    const today = new Date();
    const postedDate = job.postedDate ? this.toIsoDate(job.postedDate) : this.toIsoDate(today);
    const validThrough = this.toIsoDate(new Date(today.getTime() + 90 * 86400000));

    const empMap = {
      "full-time": "FULL_TIME", "part-time": "PART_TIME",
      "contract": "CONTRACTOR", "intern": "INTERN"
    };
    const empType = empMap[String(job.jobType || "Full-Time").toLowerCase()] || "FULL_TIME";

    const locParts = String(job.location || "").split(",").map(function (s) { return s.trim(); });
    const city = job.city || locParts[0] || "Bangalore";
    const region = job.state || (locParts.length > 1 ? locParts[locParts.length - 1] : "");

    const schema = {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": cleanText(job.title),
      "description": this.buildDescriptionHtml(job),
      "datePosted": postedDate,
      "validThrough": validThrough,
      "employmentType": empType,
      "hiringOrganization": {
        "@type": "Organization",
        "name": cleanText(job.company) || "Raveone Consultants",
        "sameAs": (job.website && String(job.website).indexOf("http") === 0)
          ? job.website : ("https://" + (job.website || SITE.portal)),
        "logo": "https://www.raveone.in/logo.png"
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": job.streetAddress || "",
          "addressLocality": city,
          "addressRegion": region,
          "postalCode": job.pin || "",
          "addressCountry": "IN"
        }
      },
      "identifier": {
        "@type": "PropertyValue",
        "name": "Raveone Consultants",
        "value": job.jobId
      },
      "directApply": true,
      "url": scriptUrl + "?job=" + encodeURIComponent(job.jobId)
    };

    const minS = parseFloat(String(job.minSalary || "").replace(/[^\d.]/g, ""));
    const maxS = parseFloat(String(job.maxSalary || "").replace(/[^\d.]/g, ""));
    if (minS || maxS) {
      schema.baseSalary = {
        "@type": "MonetaryAmount",
        "currency": "INR",
        "value": {
          "@type": "QuantitativeValue",
          "minValue": minS || maxS,
          "maxValue": maxS || minS,
          "unitText": "YEAR"
        }
      };
    }

    if (job.industry) schema.industry = cleanText(job.industry);

    if (job.isRemote) {
      schema.jobLocationType = "TELECOMMUTE";
      schema.applicantLocationRequirements = { "@type": "Country", "name": "India" };
    }

    const monthsExp = parseInt(job.minExpMonths, 10) || (parseYears(job.minExp) * 12);
    if (monthsExp > 0) {
      schema.experienceRequirements = {
        "@type": "OccupationalExperienceRequirements",
        "monthsOfExperience": monthsExp
      };
    }

    if (job.education) {
      schema.educationRequirements = {
        "@type": "EducationalOccupationalCredential",
        "credentialCategory": cleanText(job.education)
      };
    }

    const container = this.el.schemaContainer;
    if (container) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      container.appendChild(script);
    }
  },

  buildDescriptionHtml: function (job) {
    const parts = [];
    parts.push("<p><strong>" + esc(cleanText(job.title)) + "</strong> — " + esc(cleanText(job.location) || "India") + "</p>");
    if (job.description) {
      parts.push("<p>" + esc(job.description).replace(/\n/g, "</p><p>") + "</p>");
    }
    if (job.requirements) {
      parts.push("<p><strong>Requirements:</strong><br>" + esc(job.requirements).replace(/\n/g, "<br>") + "</p>");
    }
    if (job.education) {
      parts.push("<p><strong>Education:</strong> " + esc(job.education) + "</p>");
    }
    if (job.skills && job.skills.length) {
      parts.push("<p><strong>Skills:</strong> " + esc(job.skills.join(", ")) + "</p>");
    }
    return parts.join("");
  },

  toIsoDate: function (d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return new Date().toISOString().split("T")[0];
    return dt.toISOString().split("T")[0];
  },

  loadSimilar: function (job) {
    const self = this;
    API.getJobs()
      .then(function (jobs) {
        if (!Array.isArray(jobs)) return;
        const similar = jobs
          .filter(function (j) {
            return j.jobId !== job.jobId && (
              (j.category && j.category === job.category) ||
              (j.company && j.company === job.company) ||
              (j.location && job.location && j.location.split(",")[0].trim() === String(j.location).split(",")[0].trim())
            );
          })
          .slice(0, 3);

        if (!similar.length) {
          self.el.blockSimilar.hidden = true;
          return;
        }

        self.el.similarJobs.innerHTML = similar.map(function (j) {
          return `
            <a class="similar-card" href="job.html?job=${encodeURIComponent(j.jobId)}">
              <div class="similar-title">${esc(cleanText(j.title))}</div>
              <div class="similar-company">${esc(cleanText(j.company))} • ${esc(cleanText(j.location))}</div>
              <div class="similar-salary">${esc(cleanSalary(j.salaryDisplay) || "Not disclosed")}</div>
            </a>
          `;
        }).join("");
      })
      .catch(function () {
        self.el.blockSimilar.hidden = true;
      });
  },

  submitApplication: function () {
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
    if (!phone || phone.length !== 10 || !/^[6-9]/.test(phone)) return this.fieldError("fPhone", "Enter a valid 10-digit Indian mobile number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.fieldError("fEmail", "Enter a valid email address.");
    if (!totalExp) return this.fieldError("fTotalExp", "Total experience is required.");
    if (!noticePeriod) return this.fieldError("fNotice", "Notice period is required.");
    if (!fileInput.files || !fileInput.files.length) {
      SaveShare.toast("Please upload your resume.");
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      SaveShare.toast("Resume must be under 5 MB.");
      return;
    }
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (allowed.indexOf(ext) === -1) {
      SaveShare.toast("Resume must be PDF, DOC, DOCX, JPG, or PNG.");
      return;
    }

    const btn = this.el.submitBtn;
    const origText = btn.querySelector(".btn-apply-text") ? btn.querySelector(".btn-apply-text").textContent : "Submit";
    btn.disabled = true;
    if (btn.querySelector(".btn-apply-text")) {
      btn.querySelector(".btn-apply-text").textContent = "Submitting…";
    } else {
      btn.textContent = "Submitting…";
    }

    const reader = new FileReader();
    reader.onload = function (ev) {
      const base64 = String(ev.target.result).split(",")[1];
      const payload = {
        action: "submitCandidate",
        jobId: jobId,
        name: name,
        email: email,
        phone: phone,
        location: location,
        education: education,
        totalExp: totalExp,
        relExp: relExp,
        currentCtc: currentCtc,
        expectedCtc: expectedCtc,
        noticePeriod: noticePeriod,
        reasonLeaving: reasonLeaving,
        resumeData: base64,
        resumeName: file.name
      };

      API.submitApplication(payload)
        .then(function (res) {
          if (res && (res.ok || res.status === "success")) {
            self.showSuccess(res.applicationId || res.id);
          } else {
            throw new Error((res && (res.error || res.message)) || "Submission failed");
          }
        })
        .catch(function (err) {
          self.resetSubmitBtn(btn, origText);
          SaveShare.toast("⚠️ " + (err.message || "Submission failed. Please email your CV to " + SITE.email));
        });
    };
    reader.onerror = function () {
      self.resetSubmitBtn(btn, origText);
      SaveShare.toast("Could not read file. Please try again.");
    };
    reader.readAsDataURL(file);
  },

  fieldError: function (id, msg) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("error");
      el.focus();
      setTimeout(function () { el.classList.remove("error"); }, 3000);
    }
    SaveShare.toast(msg);
  },

  resetSubmitBtn: function (btn, origText) {
    btn.disabled = false;
    if (btn.querySelector(".btn-apply-text")) {
      btn.querySelector(".btn-apply-text").textContent = origText;
    } else {
      btn.textContent = origText;
    }
  },

  showSuccess: function (appId) {
    this.el.applyForm.hidden = true;
    this.el.applySuccess.hidden = false;
    if (this.el.successAppId) this.el.successAppId.textContent = appId || "—";
    this.el.applySuccess.scrollIntoView({ behavior: "smooth", block: "center" });
  },

  showError: function (msg) {
    this.el.loading.hidden = true;
    this.el.content.hidden = true;
    this.el.error.hidden = false;
    if (this.el.errorMsg) this.el.errorMsg.textContent = msg;
  },

  getQueryParam: function (key) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(key);
    } catch (e) {
      const m = window.location.search.match(new RegExp("[?&]" + key + "=([^&]+)"));
      return m ? decodeURIComponent(m[1]) : "";
    }
  }
};

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */
function raveoneBoot() {
  UI.setYear();
  UI.initMobileMenu();
  UI.initScrollEffect();
  UI.initReveal();

  const page = UI.page();
  if (page === "index") {
    IndexPage.init();
  } else if (page === "job") {
    if (!window.__jobDetailInitialized) {
      window.__jobDetailInitialized = true;
      JobDetail.init();
    }
  }
}

window.initJobDetail = function () {
  JobDetail.init();
};

window.RAVEONE_API_URL = API_URL;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", raveoneBoot);
} else {
  raveoneBoot();
}
