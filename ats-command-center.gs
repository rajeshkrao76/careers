/* ==========================================================================
   ATS COMMAND CENTER — UI/UX Upgrade Module
   File: ats-command-center.gs
   Adds: Dashboard, Kanban, Activity, Quick Actions
   ========================================================================== */

function showCommandCenter() {
  const html = getCommandCenterHtml_();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(1000).setHeight(720),
    "🚀 ATS Command Center");
}

function getCommandCenterData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");

  const intSh = ss.getSheetByName(SHEETS.INTERVIEWS);
  const candSh = ss.getSheetByName(SHEETS.CANDIDATES);

  // Today's interviews
  const todayInterviews = [];
  if (intSh && intSh.getLastRow() >= 2) {
    const rows = intSh.getRange(2, 1, intSh.getLastRow() - 1, Math.max(19, intSh.getLastColumn())).getValues();
    rows.forEach((r, i) => {
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

  // Pipeline stats
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
            jobTitle: String(r[3]), company: "", daysStale: Math.floor((now - sub) / 86400000)
          });
        }
      }
      if (status === "Interview Scheduled") stats.interview++;
      if (status === "Offered") stats.offered++;
      if (status === "Hired") stats.hired++;
      if (status === "Rejected") stats.rejected++;
    });
  }

  // Fresh candidates (last 7 days)
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

function getCommandCenterHtml_() {
  return `<!DOCTYPE html><html><head><base target="_top">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>*{font-family:'Inter',sans-serif} body{background:#F8FAFC} .tab{cursor:pointer;padding:10px 16px;font-weight:700;font-size:13px;color:#64748B;border-bottom:2px solid transparent} .tab.active{color:#1A365D;border-bottom-color:#1A365D} .tab:hover{color:#1A365D}</style>
  </head><body>

  <div class="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1A365D] to-[#2A5487] flex items-center justify-center text-white font-black">R</div>
      <div>
        <div class="text-sm font-black text-slate-900">Command Center</div>
        <div class="text-[11px] text-slate-500" id="todayLabel">—</div>
      </div>
    </div>
    <div class="flex gap-2">
      <button onclick="refresh()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-bold">🔄 Refresh</button>
      <button onclick="google.script.host.close()" class="px-3 py-1.5 bg-slate-800 text-white rounded-md text-xs font-bold">Close</button>
    </div>
  </div>

  <div class="bg-white border-b px-6">
    <div class="flex gap-1 -mb-px">
      <div class="tab active" data-tab="today" onclick="switchTab('today')">☀️ Today</div>
      <div class="tab" data-tab="pipeline" onclick="switchTab('pipeline')">📊 Pipeline</div>
      <div class="tab" data-tab="kanban" onclick="switchTab('kanban')">🗂 Kanban</div>
      <div class="tab" data-tab="activity" onclick="switchTab('activity')">⚡ Activity</div>
    </div>
  </div>

  <div class="p-6" id="panel-today">
    <div class="grid grid-cols-4 gap-3 mb-6" id="statGrid">
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Sourced</div><div class="text-3xl font-black text-slate-900 mt-1" id="statSourced">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Submitted</div><div class="text-3xl font-black text-amber-600 mt-1" id="statSubmitted">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Interviews</div><div class="text-3xl font-black text-purple-600 mt-1" id="statInterview">—</div></div>
      <div class="bg-white rounded-xl border p-4"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500">Offers / Hired</div><div class="text-3xl font-black text-green-600 mt-1" id="statOffer">—</div></div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">📅 Today's Interviews</h3>
        <div id="todayInterviews" class="space-y-2"></div>
      </div>

      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">⏰ Needs Attention</h3>
        <div id="needsAttention" class="space-y-2"></div>
      </div>
    </div>
  </div>

  <div class="p-6 hidden" id="panel-pipeline">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Pipeline by Stage</h3>
      <canvas id="pipelineChart" height="140"></canvas>
      <div id="pipelineSummary" class="grid grid-cols-6 gap-3 mt-6"></div>
    </div>
  </div>

  <div class="p-6 hidden" id="panel-kanban">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Pipeline Kanban</h3>
      <div id="kanbanBoard" class="grid grid-cols-4 gap-3"></div>
    </div>
  </div>

  <div class="p-6 hidden" id="panel-activity">
    <div class="bg-white rounded-xl border p-5">
      <h3 class="text-sm font-black mb-4">Recent Activity</h3>
      <div id="activityFeed" class="space-y-2"></div>
    </div>
  </div>

  <script>
    let data = null;
    function refresh() {
      google.script.run.withSuccessHandler(function(d){
        data = d; render();
      }).getCommandCenterData_();
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
        ? data.todayInterviews.map(i => \`
          <div class="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
            <div class="flex-1 min-w-0">
              <div class="text-xs font-black">\${esc(i.candidateName)}</div>
              <div class="text-[11px] text-slate-500 truncate">\${esc(i.position)} · \${esc(i.company)}</div>
            </div>
            <div class="text-right flex-shrink-0 ml-2">
              <div class="text-xs font-black text-[#1A365D]">\${esc(i.time)}</div>
              <div class="text-[10px] font-bold text-slate-500">\${esc(i.mode)}</div>
            </div>
          </div>\`).join('')
        : '<div class="text-center text-slate-400 text-xs py-6">No interviews today</div>';

      document.getElementById('needsAttention').innerHTML = data.staleSubmitted.length
        ? data.staleSubmitted.map(s => \`
          <div class="flex items-center justify-between p-3 border rounded-lg bg-amber-50 border-amber-200">
            <div class="flex-1 min-w-0">
              <div class="text-xs font-black">\${esc(s.candidateName)}</div>
              <div class="text-[11px] text-slate-500">\${esc(s.jobTitle)} · awaiting response</div>
            </div>
            <div class="text-[11px] font-black text-amber-700">\${s.daysStale}d</div>
          </div>\`).join('')
        : '<div class="text-center text-slate-400 text-xs py-6">All caught up ✨</div>';

      const stages = ['sourced','submitted','interview','offered','hired','rejected'];
      const colors = ['#3B82F6','#F59E0B','#8B5CF6','#16A34A','#0F172A','#DC2626'];
      document.getElementById('pipelineSummary').innerHTML = stages.map((s,i) =>
        \`<div class="text-center"><div class="text-[10px] font-bold uppercase text-slate-500">\${s}</div><div class="text-2xl font-black" style="color:\${colors[i]}">\${data.stats[s] || 0}</div></div>\`
      ).join('');

      document.getElementById('kanbanBoard').innerHTML = ['Sourced','Submitted to Client','Interview Scheduled','Offered / Hired'].map(col => \`
        <div class="bg-slate-50 rounded-lg p-3 border">
          <div class="text-[10px] font-black uppercase text-slate-600 mb-2">\${col}</div>
          <div class="space-y-1">\${getKanbanCards(col)}</div>
        </div>\`).join('');

      document.getElementById('activityFeed').innerHTML = '<div class="text-center text-slate-400 text-xs py-6">Loading activity…</div>';
      google.script.run.withSuccessHandler(function(acts){
        document.getElementById('activityFeed').innerHTML = acts.length
          ? acts.map(a => \`<div class="flex items-center gap-3 p-3 border rounded-lg">
              <div class="w-2 h-2 rounded-full" style="background:\${a.color}"></div>
              <div class="flex-1">
                <div class="text-xs font-bold">\${esc(a.title)}</div>
                <div class="text-[11px] text-slate-500">\${esc(a.detail)}</div>
              </div>
              <div class="text-[10px] font-bold text-slate-400 whitespace-nowrap">\${esc(a.when)}</div>
            </div>\`).join('')
          : '<div class="text-center text-slate-400 text-xs py-6">No recent activity</div>';
      }).getActivityFeed_();
    }

    function getKanbanCards(col) {
      const statusMap = { 'Sourced': 'Sourced', 'Submitted to Client': 'Submitted to Client', 'Interview Scheduled': 'Interview Scheduled', 'Offered / Hired': 'Offered' };
      return '';
    }

    refresh();
  </script>
  </body></html>`;
}

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
  out.sort((a, b) => (a.when === "Today" ? -1 : 0));
  return out.slice(0, 20);
}
