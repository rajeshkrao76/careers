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
 * ========================================================================== */

/* ==========================================================================
   CONFIG — EDIT THIS BEFORE DEPLOY
   ========================================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbw6Fa0O8yQppIzJ_b2rHyYnVAhwojZYd91-QAxuj0eVnU3be-qXrwzKfPmXNvxjOmLj/exec";
// Replace YOUR_DEPLOYMENT_ID with your actual Apps Script Web App deployment ID.

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
 * Parse any date — returns "x days ago" or "today".
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
 * Format date to "12 Oct 2026".
 */
function formatDate(dateVal) {
  if (!dateVal) return "";
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Extract min years from experience string.
 */
function parseYears(v) {
  const n = parseFloat(String(v || "").replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Compute salary range for filtering/sorting.
 */
function salaryMaxInLpa(job) {
  const max = parseFloat(String(job.maxSalary || job.minSalary || "").replace(/[^\d.]/g, ""));
  if (isNaN(max)) return 0;
  return max;
}

/**
 * Debounce function.
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
 * localStorage — safe wrappers.
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
   * Fetch all active jobs.
   */
  getJobs: function () {
    return fetch(API_URL + "?action=jobs")
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        console.error("API.getJobs failed:", err);
        throw err;
      });
  },

  /**
   * Fetch single job by ID.
   */
  getJob: function (jobId) {
    return fetch(API_URL + "?action=job&id=" + encodeURIComponent(jobId))
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        console.error("API.getJob failed:", err);
        throw err;
      });
  },

  /**
   * Submit candidate application.
   */
  submitApplication: function (payload) {
    return fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" } // Apps Script requires this
    })
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        console.error("API.submitApplication failed:", err);
        throw err;
      });
  }
};

/* ==========================================================================
   SHARED UI — header, mobile menu, save-jobs badge
   ========================================================================== */
const UI = {
  /**
   * Detect page type from DOM.
   */
  page: function () {
    if (document.getElementById("jobsGrid")) return "index";
    if (document.getElementById("jobDetail")) return "job";
    if (document.getElementById("pageContent")) return "page";
    return "unknown";
  },

  /**
   * Setup mobile menu toggle.
   */
  initMobileMenu: function () {
    const toggle = document.getElementById("mobileToggle");
    const nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close menu on outside click
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });

    // Close on nav link click
    nav.querySelectorAll(".nav-link").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  },

  /**
   * Shrink header on scroll.
   */
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

  /**
   * Set footer year.
   */
  setYear: function () {
    const y = document.getElementById("footerYear");
    if (y) y.textContent = new Date().getFullYear();
  },

  /**
   * Init a smooth appear for elements as they scroll in.
   */
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
  /**
   * Get saved jobs array.
   */
  getSaved: function () {
    return Store.get(STORAGE_KEYS.savedJobs, []);
  },

  /**
   * Check if a job is saved.
   */
  isSaved: function (jobId) {
    return this.getSaved().indexOf(jobId) !== -1;
  },

  /**
   * Toggle save state for a job.
   */
  toggle: function (jobId) {
    const arr = this.getSaved();
    const idx = arr.indexOf(jobId);
    if (idx === -1) arr.push(jobId);
    else arr.splice(idx, 1);
    Store.set(STORAGE_KEYS.savedJobs, arr);
    return idx === -1; // true if just saved
  },

  /**
   * Init save button on job detail page.
   */
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
        // Small toast-like feedback
        const orig = label ? label.textContent : "";
        if (label) label.textContent = "Saved ✓";
        setTimeout(update, 1200);
      }
    });

    update();
  },

  /**
   * Init share button (opens popover).
   */
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

    // Populate share links
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
  /**
   * Entry point.
   */
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

    // Hero search — sync with filter input
    if (this.el.searchForm) {
      this.el.searchForm.addEventListener("submit", function (e) {
        e.preventDefault();
        self.el.filterSearch.value = self.el.search.value;
        self.state.updateFilters();
        document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
      });
    }

    // Filter search — debounced
    const debouncedFilter = debounce(function () {
      self.state.updateFilters();
    }, 250);

    if (this.el.filterSearch) this.el.filterSearch.addEventListener("input", debouncedFilter);
    if (this.el.search) this.el.search.addEventListener("input", debouncedFilter);

    // Filter dropdowns
    ["filterLocation", "filterCategory", "filterExp", "filterCompany", "filterType"].forEach(function (k) {
      const el = self.el[k];
      if (el) el.addEventListener("change", function () { self.state.updateFilters(); });
    });

    // Sort
    if (this.el.sortSelect) {
      this.el.sortSelect.addEventListener("change", function () {
        STATE.sort = self.el.sortSelect.value;
        self.applySortAndRender();
      });
    }

    // Clear buttons
    [this.el.clearFilters, this.el.emptyClear].forEach(function (b) {
      if (b) b.addEventListener("click", function () { self.state.clearAll(); });
    });

    // Load more
    if (this.el.loadMoreBtn) {
      this.el.loadMoreBtn.addEventListener("click", function () { self.renderNext(); });
    }

    // Popular tags
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

    // Mobile filter sheet
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

      // Sync hero search <-> filter search
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

  /**
   * Fetch jobs from API.
   */
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
      // Locations
      if (j.location) {
        String(j.location).split(/[,/]/).map(function (s) { return s.trim(); })
          .filter(Boolean).forEach(function (l) { locSet[l] = (locSet[l] || 0) + 1; });
      }
      // Categories
      if (j.category) catSet[j.category] = (catSet[j.category] || 0) + 1;
      // Companies
      if (j.company) compSet[j.company] = (compSet[j.company] || 0) + 1;
    });

    // Location options
    Object.keys(locSet).sort().forEach(function (l) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = l + " (" + locSet[l] + ")";
      this.el.filterLocation.appendChild(opt);
    }, this);

    // Category options
    Object.keys(catSet).sort().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + catSet[c] + ")";
      this.el.filterCategory.appendChild(opt);
    }, this);

    // Company options
    Object.keys(compSet).sort().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + compSet[c] + ")";
      this.el.filterCompany.appendChild(opt);
    }, this);

    // NEW: Auto-generate popular tags from live data
    this.renderPopularTags();
  },

  /**
   * Auto-detect the top 7 keywords from live jobs and render as Popular tags.
   * Only shows tags that have at least 1 matching job — no dead buttons.
   */
  renderPopularTags: function () {
    const container = this.el.popularTags;
    if (!container) return;

    // 1. Score every word across all jobs
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
          if (/^\d+$/.test(w)) return; // skip pure numbers
          wordCount[w] = (wordCount[w] || 0) + (weight || 1);
        });
    };

    // 2. Score from categories (weight 5), skills (weight 3), titles (weight 2)
    STATE.jobs.forEach(function (j) {
      addWords(j.category, 5);
      if (j.skills && j.skills.length) {
        j.skills.forEach(function (s) { addWords(s, 3); });
      }
      addWords(j.title, 2);
    });

    // 3. Pick top 7 words that actually match at least 1 live job
    const self = this;
    const candidates = Object.keys(wordCount)
      .sort(function (a, b) { return wordCount[b] - wordCount[a]; })
      .filter(function (word) {
        // Double-check the word returns results
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

    // 4. Render the tags
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
      // Text search
      if (f.search) {
        const hay = [
          j.jobId, j.title, j.company, j.location, j.category,
          j.description, (j.skills || []).join(" "),
          j.industry, j.education
        ].join(" ").toLowerCase();
        if (hay.indexOf(f.search) === -1) return false;
      }

      // Location
      if (f.location && String(j.location || "").toLowerCase().indexOf(f.location.toLowerCase()) === -1) return false;

      // Category
      if (f.category && j.category !== f.category) return false;

      // Company
      if (f.company && j.company !== f.company) return false;

      // Job type
      if (f.type && String(j.jobType || j.employmentType || "").toLowerCase() !== f.type.toLowerCase()) return false;

      // Experience
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

    // Sort
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
      // relevance: featured first, then urgent
      const aF = a.isFeatured ? 1 : 0;
      const bF = b.isFeatured ? 1 : 0;
      if (aF !== bF) return bF - aF;
      const aU = a.isUrgent ? 1 : 0;
      const bU = b.isUrgent ? 1 : 0;
      return bU - aU;
    });

    // Update counts
    if (this.el.count) {
      this.el.count.textContent = STATE.filtered.length + " role" + (STATE.filtered.length === 1 ? "" : "s");
    }
    if (this.el.info) {
      this.el.info.textContent = STATE.filtered.length + " of " + STATE.jobs.length + " matching";
    }

    // Reset display
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

    // Empty state
    if (STATE.filtered.length === 0) {
      this.el.empty.hidden = false;
      this.el.loadMoreWrap.hidden = true;
    } else {
      this.el.empty.hidden = true;
      this.el.loadMoreWrap.hidden = (STATE.displayed >= STATE.filtered.length);
    }
  },

  buildCard: function (j) {
    const card = document.createElement("a");
    card.className = "job-card";
    card.href = "job.html?job=" + encodeURIComponent(j.jobId);

    const skills = (j.skills || []).slice(0, 3);
    const moreSkills = (j.skills || []).length - skills.length;
    const expTxt = (j.minExp || j.maxExp) ? (j.minExp + "–" + j.maxExp + " yrs") : "Any";
    const postedTxt = j.postedDate ? daysAgo(j.postedDate) : "";

    const badges = [];
    if (j.isUrgent) badges.push('<span class="chip chip-amber">🔥 Urgent</span>');
    if (j.isFeatured) badges.push('<span class="chip chip-navy">⭐ Featured</span>');
    if (j.isRemote) badges.push('<span class="chip chip-purple">🌐 Remote</span>');
    if (j.positions > 1) badges.push('<span class="chip chip-blue">' + j.positions + ' openings</span>');

    card.innerHTML = `
      <div class="job-card-head">
        <div class="job-card-title-wrap">
          <h3 class="job-card-title">${esc(j.title)}</h3>
          <div class="job-card-company">
            ${esc(j.company || "Raveone Client")}
            <span class="dot">•</span>
            ${esc(j.location || "India")}
          </div>
        </div>
        <span class="job-card-id">${esc(j.jobId)}</span>
      </div>

      ${badges.length ? '<div class="job-card-badges">' + badges.join("") + '</div>' : ""}

      <p class="job-card-description">${esc(j.description || "")}</p>

      ${skills.length ? `
      <div class="job-card-skills">
        ${skills.map(function (s) { return '<span class="skill-chip">' + esc(s) + '</span>'; }).join("")}
        ${moreSkills > 0 ? '<span class="skill-chip skill-chip-more">+' + moreSkills + '</span>' : ""}
      </div>` : ""}

      <div class="job-card-foot">
        <div class="job-card-meta">
          <span class="job-card-meta-item">💰 ${esc(j.salaryDisplay || "Not disclosed")}</span>
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

      // Hero
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

      // Content blocks
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

      // Apply
      applyForm: document.getElementById("applyForm"),
      applySuccess: document.getElementById("applySuccess"),
      successAppId: document.getElementById("successAppId"),
      fJobId: document.getElementById("fJobId"),
      submitBtn: document.getElementById("submitBtn"),
      fResume: document.getElementById("fResume"),
      uploadZone: document.getElementById("uploadZone"),
      uploadFileName: document.getElementById("uploadFileName"),

      // Mobile apply bar
      mobileApplyBar: document.getElementById("mobileApplyBar"),
      mobileJobTitle: document.getElementById("mobileJobTitle"),
      mobileJobSalary: document.getElementById("mobileJobSalary"),
      mobileApplyBtn: document.getElementById("mobileApplyBtn")
    };
  },

  bindEvents: function () {
    const self = this;

    // Upload zone — drag & drop
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

    // Mobile apply bar — scroll to form
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

    // Apply form submit
    if (this.el.applyForm) {
      this.el.applyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        self.submitApplication();
      });
    }

    // Similar job cards — delegate click
    if (this.el.similarJobs) {
      this.el.similarJobs.addEventListener("click", function (e) {
        const card = e.target.closest("a");
        if (!card) return;
        // Let browser navigate naturally
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

    // Update title & meta
    document.title = job.title + " at " + (job.company || "Raveone") + " — Raveone Careers";
    const metaDesc = (job.description || "").substring(0, 150).replace(/<[^>]*>/g, "") + "…";
    this.updateMetaTags(job, metaDesc);

    // Hide loading, show content
    this.el.loading.hidden = true;
    this.el.content.hidden = false;

    // Hero chips
    this.el.jobIdChip.textContent = job.jobId;
    this.el.jobTypeChip.textContent = job.jobType || job.employmentType || "Full-Time";

    if (job.isUrgent) this.el.jobUrgentChip.hidden = false; else this.el.jobUrgentChip.hidden = true;
    if (job.positions > 1) {
      this.el.jobPositionsChip.textContent = job.positions + " openings";
      this.el.jobPositionsChip.hidden = false;
    } else this.el.jobPositionsChip.hidden = true;
    if (job.isRemote) this.el.jobRemoteChip.hidden = false; else this.el.jobRemoteChip.hidden = true;

    // Hero text
    this.el.jobTitle.textContent = job.title;
    this.el.jobCompany.textContent = job.company || "Raveone Client";
    this.el.jobLocationTop.textContent = job.location || "India";
    if (job.industry) {
      this.el.jobIndustryTop.textContent = job.industry;
      this.el.jobIndustryDot.hidden = false;
    } else {
      this.el.jobIndustryDot.hidden = true;
    }

    // Quick meta
    this.el.jobSalary.textContent = job.salaryDisplay || job.salary || "Not disclosed";
    this.el.jobExp.textContent = (job.minExp || job.maxExp) ? (job.minExp + "–" + job.maxExp + " yrs") : "Any";
    this.el.jobLocationMeta.textContent = job.location || "India";
    this.el.jobPostedDate.textContent = job.postedDate || "—";

    // Breadcrumb
    if (this.el.crumbCurrent) this.el.crumbCurrent.textContent = job.title;

    // Content blocks
    this.renderBlock("blockDescription", "jobDescription", job.description);
    this.renderBlock("blockRequirements", "jobRequirements", job.requirements);
    this.renderBlock("blockEducation", "jobEducation", job.education);
    this.renderBlock("blockIndustry", "jobIndustry", job.industry);

    // Skills
    if (job.skills && job.skills.length) {
      this.el.blockSkills.hidden = false;
      this.el.jobSkills.innerHTML = job.skills.map(function (s) {
        return '<span class="skill-chip">' + esc(s) + '</span>';
      }).join("");
    } else {
      this.el.blockSkills.hidden = true;
    }

    // Benefits
    if (job.benefits && job.benefits.length) {
      this.el.blockBenefits.hidden = false;
      this.el.jobBenefits.innerHTML = job.benefits.map(function (b) {
        return '<span class="benefit-item">✓ ' + esc(b) + '</span>';
      }).join("");
    } else {
      this.el.blockBenefits.hidden = true;
    }

    // Company card
    this.renderCompany(job);

    // Deadline
    if (job.applicationDeadline) {
      this.el.blockDeadline.hidden = false;
      this.el.jobDeadline.textContent = job.applicationDeadline;
    } else {
      this.el.blockDeadline.hidden = true;
    }

    // Apply form — hidden jobId
    if (this.el.fJobId) this.el.fJobId.value = job.jobId;

    // Apply card subtitle
    const applySub = document.getElementById("applyCardSub");
    if (applySub) applySub.textContent = job.company + " • " + job.location;

    // Mobile apply bar
    if (this.el.mobileApplyBar) {
      this.el.mobileApplyBar.hidden = false;
      this.el.mobileJobTitle.textContent = job.title;
      this.el.mobileJobSalary.textContent = job.salaryDisplay || job.salary || "";
    }

    // Save/Share
    SaveShare.initSaveButton(job.jobId);
    SaveShare.initShareButton(job);

    // Schema injection
    this.injectSchema(job);

    // Similar jobs
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
    if (!job.company) {
      this.el.blockCompany.hidden = true;
      return;
    }
    this.el.blockCompany.hidden = false;
    this.el.companyName.textContent = job.company;

    const addr = document.getElementById("companyAddress");
    if (job.address) {
      addr.textContent = "📍 " + job.address;
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

  /**
   * Inject Google Jobs JSON-LD schema.
   * Fully compliant with Google Jobs structured data requirements.
   */
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
      "title": job.title,
      "description": this.buildDescriptionHtml(job),
      "datePosted": postedDate,
      "validThrough": validThrough,
      "employmentType": empType,
      "hiringOrganization": {
        "@type": "Organization",
        "name": job.company || "Raveone Consultants",
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

    // Base salary
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

    // Industry
    if (job.industry) schema.industry = job.industry;

    // Remote
    if (job.isRemote) {
      schema.jobLocationType = "TELECOMMUTE";
      schema.applicantLocationRequirements = { "@type": "Country", "name": "India" };
    }

    // Experience
    const monthsExp = parseInt(job.minExpMonths, 10) || (parseYears(job.minExp) * 12);
    if (monthsExp > 0) {
      schema.experienceRequirements = {
        "@type": "OccupationalExperienceRequirements",
        "monthsOfExperience": monthsExp
      };
    }

    // Education
    if (job.education) {
      schema.educationRequirements = {
        "@type": "EducationalOccupationalCredential",
        "credentialCategory": job.education
      };
    }

    // Inject
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
    parts.push("<p><strong>" + esc(job.title) + "</strong> — " + esc(job.location || "India") + "</p>");
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
    // Fetch all jobs and filter similar
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
              <div class="similar-title">${esc(j.title)}</div>
              <div class="similar-company">${esc(j.company)} • ${esc(j.location)}</div>
              <div class="similar-salary">${esc(j.salaryDisplay || "Not disclosed")}</div>
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

    // Gather values
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

    // Validation (Poka-Yoke)
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

    // Busy state
    const btn = this.el.submitBtn;
    const origText = btn.querySelector(".btn-apply-text") ? btn.querySelector(".btn-apply-text").textContent : "Submit";
    btn.disabled = true;
    if (btn.querySelector(".btn-apply-text")) {
      btn.querySelector(".btn-apply-text").textContent = "Submitting…";
    } else {
      btn.textContent = "Submitting…";
    }

    // Read file as base64
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
          if (res && res.ok) {
            self.showSuccess(res.applicationId);
          } else {
            throw new Error((res && res.error) || "Submission failed");
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
    // Scroll into view
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
  // Shared UI
  UI.setYear();
  UI.initMobileMenu();
  UI.initScrollEffect();
  UI.initReveal();

  // Page-specific
  const page = UI.page();
  if (page === "index") {
    IndexPage.init();
  } else if (page === "job") {
    JobDetail.init();
  }
}

/**
 * Expose to inline scripts on job.html
 */
window.initJobDetail = function () {
  if (!STATE.currentJob) {
    JobDetail.init();
  }
};
window.RAVEONE_API_URL = API_URL;

/* ==========================================================================
   RUN
   ========================================================================== */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", raveoneBoot);
} else {
  raveoneBoot();
}
