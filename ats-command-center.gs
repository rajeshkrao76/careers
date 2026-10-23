/* ==========================================================================
   ATS COMMAND CENTER — v2 (with ⌘K Command Palette)
   File: ats-command-center.gs
   ========================================================================== */

function showCommandCenter() {
  const html = getCommandCenterHtml_();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(1000).setHeight(740),
    "🚀 ATS Command Center");
}

/* ==========================================================================
   DASHBOARD DATA
   ========================================================================== */

function getCommandCenterData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");

  const intSh = ss.getSheetByName(SHEETS.INTERVIEWS);
  const candSh = ss.getSheetByName(SHEETS.CANDIDATES);

  const todayInterviews = [];
  if (intSh && intSh.getLastRow() >= 2) {
    const rows = intSh.getRange(2, 1, intSh.getLastRow() - 1, Math.max(19, intSh.getLastColumn())).getValues();
    rows.forEach(r => {
      const iso = String(r[15] || "");
      if (!iso) return;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return;
      const dStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (dStr === todayStr) {
        todayInterviews.push({
          interviewId: String(r[0]), candidateName: String(r[4] || ""),
          company: String(r[5] || ""), position: String(r[6] || ""),
          time: String(r[8] || ""), mode: String(r[9] || ""),
          response: String(r[16] || "Pending")
        });
      }
    });
    todayInterviews.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }

  const stats = { sourced: 0, submitted: 0, interview: 0, offered: 0, hired: 0, rejected: 0 };
  const staleSubmitted = [];
  if (candSh && candSh.getLastRow() >= 2) {
    const rows = candSh.getRange(2, 1, candSh.getLastRow() - 1, 19).getValues();
    rows.forEach((r, i) => {
      const status = String(r[5] || "").trim();
      if (status === "Sourced" || status === "JD Shared") stats.sourced++;
      if (status === "Submitted to Client") {
        stats.submitted++;
        const sub = r[18];
        if (sub instanceof Date && (now - sub) / 86400000 > 7) {
          staleSubmitted.push({
            rowNum: i + 2, appId: String(r[1]), candidateName: String(r[6]),
            jobTitle: String(r[3]), daysStale: Math.floor((now - sub) / 86400000)
          });
        }
      }
      if (status === "Interview Scheduled") stats.interview++;
      if (status === "Offered") stats.offered++;
      if (status === "Hired") stats.hired++;
      if (status === "Rejected") stats.rejected++;
    });
  }

  let freshCount = 0;
  if (candSh && candSh.getLastRow() >= 2) {
    const rows = candSh.getRange(2, 1, candSh.getLastRow() - 1, 19).getValues();
    rows.forEach(r => {
      const sub = r[18];
      if (sub instanceof Date && (now - sub) / 86400000 < 7) freshCount++;
    });
  }

  return {
    todayInterviews,
    staleSubmitted: staleSubmitted.slice(0, 5),
    stats,
    freshCount,
    today: Utilities.formatDate(now, Session.getScriptTimeZone(), "EEEE, dd MMM yyyy")
  };
}

/* ==========================================================================
   COMMAND PALETTE — SEARCH
   ========================================================================== */

function paletteSearch_(query) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const q = String(query || "").toLowerCase().trim();

  const results = { candidates: [], jobs: [], clients: [], actions: [] };

  // Always offer quick actions first when empty or short query
  if (q.length < 2) {
    results.actions = [
      { icon: "📧", label: "Change Status & Notify (current row)", id: "statusChange" },
      { icon: "📄", label: "Share JD — Single Candidate", id: "shareJd" },
      { icon: "📨", label: "Mail Merge — Send JD to Sourced", id: "mailMerge" },
      { icon: "📅", label: "Schedule & Send Interview Invite", id: "scheduleInterview" },
      { icon: "📅", label: "View Reschedule Requests", id: "viewReschedule" },
      { icon: "🔄", label: "Sync Pipeline & Job Analytics", id: "syncPipeline" },
      { icon: "💰", label: "Recalculate Billing", id: "billing" },
      { icon: "🌐", label: "Setup Candidate Portal", id: "setupPortal" }
    ];
    if (!q) return results;
  }

  // Candidates
  const candSh = ss.getSheetByName(SHEETS.CANDIDATES);
  if (candSh && candSh.getLastRow() >= 2) {
    const maxRows = Math.min(candSh.getLastRow() - 1, 500);
    const rows = candSh.getRange(2, 1, maxRows, 19).getValues();
    for (let i = 0; i < rows.length && results.candidates.length < 10; i++) {
      const r = rows[i];
      const hay = [r[6], r[8], r[7], r[1], r[3], r[0]].join(" ").toLowerCase();
      if (hay.indexOf(q) !== -1) {
        results.candidates.push({
          row: i + 2,
          appId: String(r[1] || ""),
          name: String(r[6] || ""),
          email: String(r[8] || ""),
          phone: String(r[7] || ""),
          jobTitle: String(r[3] || ""),
          jobId: String(r[0] || ""),
          status: String(r[5] || "")
        });
      }
    }
  }

  // Jobs
  const jobsSh = ss.getSheetByName(SHEETS.JOBS);
  if (jobsSh && jobsSh.getLastRow() >= 2) {
    const maxRows = Math.min(jobsSh.getLastRow() - 1, 500);
    const rows = jobsSh.getRange(2, 1, maxRows, 15).getValues();
    for (let i = 0; i < rows.length && results.jobs.length < 10; i++) {
      const r = rows[i];
      const hay = [r[0], r[1], r[2], r[4]].join(" ").toLowerCase();
      if (hay.indexOf(q) !== -1) {
        results.jobs.push({
          row: i + 2,
          jobId: String(r[0] || ""),
          title: String(r[1] || ""),
          company: String(r[4] || ""),
          location: String(r[2] || ""),
          status: String(r[8] || "")
        });
      }
    }
  }

  // Clients
  const clientSh = ss.getSheetByName(SHEETS.CLIENTS);
  if (clientSh && clientSh.getLastRow() >= 2) {
    const maxRows = Math.min(clientSh.getLastRow() - 1, 500);
    const rows = clientSh.getRange(2, 1, maxRows, 9).getValues();
    for (let i = 0; i < rows.length && results.clients.length < 8; i++) {
      const r = rows[i];
      const hay = [r[0], r[1], r[2], r[4]].join(" ").toLowerCase();
      if (hay.indexOf(q) !== -1) {
        results.clients.push({
          row: i + 2,
          clientId: String(r[0] || ""),
          contactName: String(r[1] || ""),
          companyName: String(r[4] || ""),
          email: String(r[2] || ""),
          phone: String(r[3] || "")
        });
      }
    }
  }

  // Actions (filtered)
  const allActions = [
    { icon: "📧", label: "Change Status & Notify (current row)", id: "statusChange", kws: "status change email notify" },
    { icon: "📄", label: "Share JD — Single Candidate", id: "shareJd", kws: "share jd email candidate" },
    { icon: "📨", label: "Mail Merge — Send JD to Sourced", id: "mailMerge", kws: "mail merge bulk sourced" },
    { icon: "📅", label: "Schedule & Send Interview Invite", id: "scheduleInterview", kws: "interview schedule invite" },
    { icon: "📅", label: "View Reschedule Requests", id: "viewReschedule", kws: "reschedule requests" },
    { icon: "🔄", label: "Sync Pipeline & Job Analytics", id: "syncPipeline", kws: "sync pipeline analytics" },
    { icon: "💰", label: "Recalculate Billing", id: "billing", kws: "billing financials" },
    { icon: "🌐", label: "Setup Candidate Portal", id: "setupPortal", kws: "portal setup" },
    { icon: "📊", label: "Recruiter Leaderboard", id: "leaderboard", kws: "leaderboard recruiter" },
    { icon: "💚", label: "Client Health Score", id: "clientHealth", kws: "health client" }
  ];
  allActions.forEach(a => {
    const hay = (a.label + " " + a.kws).toLowerCase();
    if (hay.indexOf(q) !== -1) results.actions.push({ icon: a.icon, label: a.label, id: a.id });
  });

  return results;
}

/* ==========================================================================
   COMMAND PALETTE — ACTION DISPATCH
   ========================================================================== */

function paletteExecute_(actionId, params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  params = params || {};

  // Navigation actions — highlight row in target sheet
  if (actionId === "gotoCandidate") {
    const sh = ss.getSheetByName(SHEETS.CANDIDATES);
    if (sh) {
      sh.activate();
      sh.getRange(params.row, 1).activate();
    }
    return { ok: true };
  }
  if (actionId === "gotoJob") {
    const sh = ss.getSheetByName(SHEETS.JOBS);
    if (sh) {
      sh.activate();
      sh.getRange(params.row, 1).activate();
    }
    return { ok: true };
  }
  if (actionId === "gotoClient") {
    const sh = ss.getSheetByName(SHEETS.CLIENTS);
    if (sh) {
      sh.activate();
      sh.getRange(params.row, 1).activate();
    }
    return { ok: true };
  }

  // Menu function dispatcher
  const map = {
    statusChange: "openStatusChangeModal",
    shareJd: "openJdSharingModal",
    mailMerge: "openJdMailMergeModal",
    scheduleInterview: "openInterviewInviteModal",
    viewReschedule: "showRescheduleRequests",
    syncPipeline: "syncPipelineCounts",
    billing: "calculateBillingAndFinancials",
    setupPortal: "setupPortalSheetsV2",
    leaderboard: "refreshRecruiterDashboard",
    clientHealth: "refreshClientHealth"
  };

  const fnName = map[actionId];
  if (!fnName) return { ok: false, error: "Unknown action" };

  try {
    const fn = this[fnName];
    if (typeof fn === "function") {
      fn();
      return { ok: true };
    }
    return { ok: false, error: "Function not available: " + fnName };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ==========================================================================
   COMMAND CENTER HTML
   ========================================================================== */

function getCommandCenterHtml_() {
  return `<!DOCTYPE html><html><head><base target="_top">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Inter', sans-serif; }
    body { background: #F8FAFC; }
    .tab { cursor: pointer; padding: 10px 16px; font-weight: 700; font-size: 13px; color: #64748B; border-bottom: 2px solid transparent; }
    .tab.active { color: #1A365D; border-bottom-color: #1A365D; }
    .tab:hover { color: #1A365D; }

    /* Command palette overlay */
    .palette-bg { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); z-index: 100; display: none; align-items: flex-start; justify-content: center; padding-top: 80px; }
    .palette-bg.open { display: flex; }
    .palette-box { background: #fff; border-radius: 14px; width: 640px; max-width: 92vw; box-shadow: 0 30px 80px -20px rgba(0,0,0,.5); overflow: hidden; }
    .palette-input-wrap { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #E2E8F0; }
    .palette-input { flex: 1; border: none; outline: none; font-size: 15px; font-weight: 500; color: #0F172A; background: transparent; font-family: inherit; }
    .palette-input::placeholder { color: #94A3B8; }
    .palette-kbd { font-size: 10px; font-weight: 800; color: #64748B; border: 1px solid #CBD5E1; background: #F1F5F9; padding: 3px 6px; border-radius: 4px; }
    .palette-results { max-height: 460px; overflow-y: auto; padding: 8px; }
    .palette-section { padding: 8px 12px 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #94A3B8; }
    .palette-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background .1s; }
    .palette-item:hover, .palette-item.active { background: #EFF6FF; }
    .palette-item.active { background: #1A365D; color: #fff; }
    .palette-item.active .palette-item-meta,
    .palette-item.active .palette-item-tag { color: #CBD5E1 !important; }
    .palette-item.active .palette-item-tag { background: rgba(255,255,255,.15) !important; color: #fff !important; }
    .palette-item-icon { flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .palette-item-body { flex: 1; min-width: 0; }
    .palette-item-title { font-size: 13.5px; font-weight: 700; line-height: 1.3; }
    .palette-item-meta { font-size: 11px; color: #64748B; font-weight: 500; margin-top: 2px; }
    .palette-item-tag { padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 800; letter-spacing: .3px; background: #F1F5F9; color: #64748B; flex-shrink: 0; }
    .palette-empty { text-align: center; padding: 40px 20px; color: #94A3B8; font-size: 13px; }
    .palette-footer { padding: 10px 16px; border-top: 1px solid #E2E8F0; background: #F8FAFC; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748B; }
  </style>
  </head><body>

  <!-- Header -->
  <div class="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1A365D] to-[#2A5487] flex items-center justify-center text-white font-black">R</div>
      <div>
        <div class="text-sm font-black text-slate-900">Command Center</div>
        <div class="text-[11px] text-slate-500" id="todayLabel">—</div>
      </div>
    </div>
    <div class="flex gap-2">
      <button onclick="openPalette()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5">
        🔍 Search <span style="font-size:10px;background:rgba(255,255,255,.2);padding:1px 5px;border-radius:3px;font-weight:800">⌘K</span>
      </button>
      <button onclick="refresh()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-bold">🔄 Refresh</button>
      <button onclick="google.script.host.close()" class="px-3 py-1.5 bg-slate-800 text-white rounded-md text-xs font-bold">Close</button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="bg-white border-b px-6">
    <div class="flex gap-1 -mb-px">
      <div class="tab active" data-tab="today" onclick="switchTab('today')">☀️ Today</div>
      <div class="tab" data-tab="pipeline" onclick="switchTab('pipeline')">📊 Pipeline</div>
      <div class="tab" data-tab="kanban" onclick="switchTab('kanban')">🗂 Kanban</div>
      <div class="tab" data-tab="activity" onclick="switchTab('activity')">⚡ Activity</div>
    </div>
  </div>

  <!-- Today panel -->
  <div class="p-6" id="panel-today">
    <div class="grid grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Sourced</div><div class="text-3xl font-black text-slate-900 mt-1" id="statSourced">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Submitted</div><div class="text-3xl font-black text-amber-600 mt-1" id="statSubmitted">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Interviews</div><div class="text-3xl font-black text-purple-600 mt-1" id="statInterview">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Offers / Hired</div><div class="text-3xl font-black text-green-600 mt-1" id="statOffer">—</div></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-black text-slate-900 mb-3">📅 Today's Interviews</h3>
        <div id="todayInterviews" class="space-y-2"></div>
      </div>
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-black text-slate-900 mb-3">⏰ Needs Attention</h3>
        <div id="needsAttention" class="space-y-2"></div>
      </div>
    </div>
  </div>

  <!-- Pipeline panel -->
  <div class="p-6 hidden" id="panel-pipeline">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Pipeline by Stage</h3>
      <div id="pipelineSummary" class="grid grid-cols-6 gap-3"></div>
    </div>
  </div>

  <!-- Kanban panel -->
  <div class="p-6 hidden" id="panel-kanban">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Pipeline Kanban</h3>
      <div class="grid grid-cols-4 gap-3" id="kanbanBoard"></div>
    </div>
  </div>

  <!-- Activity panel -->
  <div class="p-6 hidden" id="panel-activity">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Recent Activity</h3>
      <div id="activityFeed" class="space-y-2"></div>
    </div>
  </div>

  <!-- Command Palette overlay -->
  <div class="palette-bg" id="paletteBg">
    <div class="palette-box">
      <div class="palette-input-wrap">
        <span style="font-size:16px">🔍</span>
        <input type="text" id="paletteInput" class="palette-input" placeholder="Search candidates, jobs, clients, actions…" autocomplete="off">
        <span class="palette-kbd">Esc</span>
      </div>
      <div class="palette-results" id="paletteResults">
        <div class="palette-empty">Type to search…</div>
      </div>
      <div class="palette-footer">
        <span>↑↓ navigate · ⏎ select · Esc close</span>
        <span id="paletteCount"></span>
      </div>
    </div>
  </div>

  <script>
    let data = null;
    let paletteItems = [];       // flattened navigable list
    let paletteActiveIndex = -1;
    let paletteDebounceTimer = null;

    /* ---------- Dashboard ---------- */
    function refresh() {
      google.script.run.withSuccessHandler(d => { data = d; render(); }).getCommandCenterData_();
    }
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      ['today','pipeline','kanban','activity'].forEach(t => {
        document.getElementById('panel-' + t).classList.toggle('hidden', t !== name);
      });
    }
    function esc(s) { return String(s == null ? "" : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function render() {
      document.getElementById('todayLabel').textContent = data.today;
      document.getElementById('statSourced').textContent = data.stats.sourced;
      document.getElementById('statSubmitted').textContent = data.stats.submitted;
      document.getElementById('statInterview').textContent = data.stats.interview;
      document.getElementById('statOffer').textContent = (data.stats.offered + data.stats.hired);

      document.getElementById('todayInterviews').innerHTML = data.todayInterviews.length
        ? data.todayInterviews.map(i => \`<div class="flex items-center justify-between p-3 border rounded-lg">
            <div class="flex-1 min-w-0"><div class="text-xs font-black">\${esc(i.candidateName)}</div>
            <div class="text-[11px] text-slate-500 truncate">\${esc(i.position)} · \${esc(i.company)}</div></div>
            <div class="text-right flex-shrink-0 ml-2"><div class="text-xs font-black text-[#1A365D]">\${esc(i.time)}</div>
            <div class="text-[10px] font-bold text-slate-500">\${esc(i.mode)}</div></div></div>\`).join('')
        : '<div class="text-center text-slate-400 text-xs py-6">No interviews today</div>';

      document.getElementById('needsAttention').innerHTML = data.staleSubmitted.length
        ? data.staleSubmitted.map(s => \`<div class="flex items-center justify-between p-3 border rounded-lg bg-amber-50 border-amber-200">
            <div class="flex-1 min-w-0"><div class="text-xs font-black">\${esc(s.candidateName)}</div>
            <div class="text-[11px] text-slate-500">\${esc(s.jobTitle)}</div></div>
            <div class="text-[11px] font-black text-amber-700">\${s.daysStale}d</div></div>\`).join('')
        : '<div class="text-center text-slate-400 text-xs py-6">All caught up ✨</div>';

      const stages = ['sourced','submitted','interview','offered','hired','rejected'];
      const colors = ['#3B82F6','#F59E0B','#8B5CF6','#16A34A','#0F172A','#DC2626'];
      document.getElementById('pipelineSummary').innerHTML = stages.map((s,i) =>
        \`<div class="text-center"><div class="text-[10px] font-bold uppercase text-slate-500">\${s}</div>
        <div class="text-2xl font-black" style="color:\${colors[i]}">\${data.stats[s] || 0}</div></div>\`).join('');

      document.getElementById('kanbanBoard').innerHTML = ['Sourced','Submitted','Interview','Offered'].map(col => \`
        <div class="bg-slate-50 rounded-lg p-3 border">
          <div class="text-[10px] font-black uppercase text-slate-600 mb-2">\${col}</div>
          <div class="text-2xl font-black text-slate-900">\${
            col === 'Sourced' ? data.stats.sourced
            : col === 'Submitted' ? data.stats.submitted
            : col === 'Interview' ? data.stats.interview
            : (data.stats.offered + data.stats.hired)
          }</div>
        </div>\`).join('');

      document.getElementById('activityFeed').innerHTML = '<div class="text-center text-slate-400 text-xs py-6">Loading…</div>';
      google.script.run.withSuccessHandler(acts => {
        document.getElementById('activityFeed').innerHTML = acts.length
          ? acts.map(a => \`<div class="flex items-center gap-3 p-3 border rounded-lg">
              <div class="w-2 h-2 rounded-full" style="background:\${a.color}"></div>
              <div class="flex-1"><div class="text-xs font-bold">\${esc(a.title)}</div>
              <div class="text-[11px] text-slate-500">\${esc(a.detail)}</div></div>
              <div class="text-[10px] font-bold text-slate-400 whitespace-nowrap">\${esc(a.when)}</div></div>\`).join('')
          : '<div class="text-center text-slate-400 text-xs py-6">No activity</div>';
      }).getActivityFeed_();
    }

    /* ---------- Command Palette ---------- */
    function openPalette() {
      document.getElementById('paletteBg').classList.add('open');
      const input = document.getElementById('paletteInput');
      input.value = "";
      input.focus();
      paletteActiveIndex = -1;
      doPaletteSearch("");
    }
    function closePalette() {
      document.getElementById('paletteBg').classList.remove('open');
    }

    document.getElementById('paletteBg').addEventListener('click', e => {
      if (e.target.id === 'paletteBg') closePalette();
    });

    document.getElementById('paletteInput').addEventListener('input', function () {
      clearTimeout(paletteDebounceTimer);
      paletteDebounceTimer = setTimeout(() => {
        doPaletteSearch(this.value);
      }, 120);
    });

    document.getElementById('paletteInput').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); movePaletteSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); movePaletteSelection(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (paletteActiveIndex >= 0 && paletteActiveIndex < paletteItems.length) {
          executePaletteItem(paletteItems[paletteActiveIndex]);
        }
        return;
      }
    });

    // Global shortcut: ⌘K / Ctrl+K
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      }
      if (e.key === 'Escape' && document.getElementById('paletteBg').classList.contains('open')) {
        closePalette();
      }
    });

    function doPaletteSearch(query) {
      google.script.run.withSuccessHandler(res => renderPaletteResults(res, query)).paletteSearch_(query);
    }

    function renderPaletteResults(res, query) {
      const results = document.getElementById('paletteResults');
      paletteItems = [];
      let html = '';

      function section(title) {
        if (html) html += '<div style="height:4px"></div>';
        html += '<div class="palette-section">' + title + '</div>';
      }
      function item(icon, title, meta, tag, itemObj) {
        const idx = paletteItems.length;
        paletteItems.push(itemObj);
        return \`<div class="palette-item" data-idx="\${idx}" onclick="executePaletteItemAt(\${idx})">
          <div class="palette-item-icon">\${icon}</div>
          <div class="palette-item-body">
            <div class="palette-item-title">\${esc(title)}</div>
            \${meta ? '<div class="palette-item-meta">' + esc(meta) + '</div>' : ''}
          </div>
          \${tag ? '<span class="palette-item-tag">' + esc(tag) + '</span>' : ''}
        </div>\`;
      }

      if (res.actions && res.actions.length) {
        section('Actions');
        res.actions.forEach(a => {
          html += item(a.icon, a.label, '', 'Action', { kind: 'action', id: a.id, label: a.label });
        });
      }
      if (res.candidates && res.candidates.length) {
        section('Candidates');
        res.candidates.forEach(c => {
          html += item('👤', c.name, c.jobTitle + ' · ' + c.status, 'Candidate',
            { kind: 'candidate', row: c.row, appId: c.appId, label: c.name });
        });
      }
      if (res.jobs && res.jobs.length) {
        section('Jobs');
        res.jobs.forEach(j => {
          html += item('💼', j.title, j.company + ' · ' + j.location, j.jobId,
            { kind: 'job', row: j.row, jobId: j.jobId, label: j.title });
        });
      }
      if (res.clients && res.clients.length) {
        section('Clients');
        res.clients.forEach(c => {
          html += item('🏢', c.companyName, c.contactName, c.clientId,
            { kind: 'client', row: c.row, clientId: c.clientId, label: c.companyName });
        });
      }

      if (!paletteItems.length) {
        html = '<div class="palette-empty">No matches for "' + esc(query) + '"</div>';
      }

      results.innerHTML = html;
      document.getElementById('paletteCount').textContent = paletteItems.length + ' result' + (paletteItems.length === 1 ? '' : 's');
      paletteActiveIndex = paletteItems.length ? 0 : -1;
      highlightActiveItem();
    }

    function highlightActiveItem() {
      document.querySelectorAll('.palette-item').forEach((el, i) => {
        el.classList.toggle('active', i === paletteActiveIndex);
      });
      const active = document.querySelector('.palette-item.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function movePaletteSelection(dir) {
      if (!paletteItems.length) return;
      paletteActiveIndex += dir;
      if (paletteActiveIndex < 0) paletteActiveIndex = paletteItems.length - 1;
      if (paletteActiveIndex >= paletteItems.length) paletteActiveIndex = 0;
      highlightActiveItem();
    }

    function executePaletteItemAt(idx) {
      if (idx >= 0 && idx < paletteItems.length) {
        executePaletteItem(paletteItems[idx]);
      }
    }

    function executePaletteItem(item) {
      closePalette();

      if (item.kind === 'candidate') {
        google.script.run.withSuccessHandler(() => {
          google.script.host.close();
        }).paletteExecute_("gotoCandidate", { row: item.row });
        return;
      }
      if (item.kind === 'job') {
        google.script.run.withSuccessHandler(() => {
          google.script.host.close();
        }).paletteExecute_("gotoJob", { row: item.row });
        return;
      }
      if (item.kind === 'client') {
        google.script.run.withSuccessHandler(() => {
          google.script.host.close();
        }).paletteExecute_("gotoClient", { row: item.row });
        return;
      }
      if (item.kind === 'action') {
        google.script.run.withSuccessHandler(res => {
          if (res && res.ok) {
            google.script.host.close();
          } else {
            alert('Action failed: ' + (res && res.error || 'unknown'));
          }
        }).withFailureHandler(err => {
          alert('Action failed: ' + err.message);
        }).paletteExecute_(item.id, {});
      }
    }

    /* ---------- Activity feed (unchanged from previous) ---------- */
    function getActivityFeed_() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const candSh = ss.getSheetByName(SHEETS.CANDIDATES);
      if (!candSh || candSh.getLastRow() < 2) return [];
      const rows = candSh.getRange(Math.max(2, candSh.getLastRow() - 30), 1, Math.min(30, candSh.getLastRow() - 1), 19).getValues();
      const out = [];
      const colorMap = {
        "Sourced": "#3B82F6", "JD Shared": "#3B82F6", "Shortlisted": "#F59E0B",
        "Submitted to Client": "#F59E0B", "Interview Scheduled": "#8B5CF6",
        "Offered": "#16A34A", "Hired": "#0F172A", "Rejected": "#DC2626", "Withdrawn": "#94A3B8"
      };
      rows.forEach(r => {
        const status = String(r[5] || "").trim();
        const submitted = r[18];
        if (!(submitted instanceof Date)) return;
        const daysAgo = Math.floor((new Date() - submitted) / 86400000);
        out.push({
          title: String(r[6] || "") + " — " + status,
          detail: String(r[3] || ""),
          color: colorMap[status] || "#64748B",
          when: daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : daysAgo + "d ago"
        });
      });
      return out.slice(0, 20);
    }

    // Boot
    refresh();
  </script>
  </body></html>`;
}
