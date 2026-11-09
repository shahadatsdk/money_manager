// ======================== Money Manager - SQLite + Auth ========================
// Uses SQLite via db.js for persistent multi-user storage

// ---------- Category metadata ----------
const CATEGORIES = {
  salary: { label: "Salary", icon: "bi-cash-coin", color: "#10b981", types: ["income"] },
  freelance: { label: "Freelance", icon: "bi-laptop", color: "#0ea5e9", types: ["income"] },
  investment: { label: "Investment", icon: "bi-graph-up-arrow", color: "#8b5cf6", types: ["income"] },
  shopping: { label: "Shopping", icon: "bi-bag", color: "#f43f5e", types: ["expense"] },
  "eid-shopping": { label: "Eid Shopping", icon: "bi-gift", color: "#f59e0b", types: ["expense"] },
  groceries: { label: "Groceries", icon: "bi-basket", color: "#22c55e", types: ["expense"] },
  vegetables: { label: "Vegetables", icon: "bi-flower1", color: "#84cc16", types: ["expense"] },
  medicine: { label: "Medicine", icon: "bi-capsule", color: "#ef4444", types: ["expense"] },
  fish: { label: "Fish", icon: "bi-water", color: "#06b6d4", types: ["expense"] },
  meat: { label: "Meat", icon: "bi-bacon", color: "#f97316", types: ["expense"] },
  food: { label: "Food", icon: "bi-egg-fried", color: "#eab308", types: ["expense"] },
  snack: { label: "Snack", icon: "bi-cup-hot", color: "#d946ef", types: ["expense"] },
  lunch: { label: "Lunch", icon: "bi-egg", color: "#a16207", types: ["expense"] },
  dinner: { label: "Dinner", icon: "bi-moon-stars", color: "#7c3aed", types: ["expense"] },
  drink: { label: "Drink", icon: "bi-cup-straw", color: "#0d9488", types: ["expense"] },
  asset: { label: "Asset", icon: "bi-box-seam", color: "#6366f1", types: ["expense"] },
  "kitchen-item": { label: "Kitchen Item", icon: "bi-basket2", color: "#a3e635", types: ["expense"] },
  transport: { label: "Transport", icon: "bi-bus-front", color: "#0284c7", types: ["expense"] },
  utilities: { label: "Utilities", icon: "bi-lightning-charge", color: "#f59e0b", types: ["expense"] },
  entertainment: { label: "Entertainment", icon: "bi-controller", color: "#ec4899", types: ["expense"] },
  "household-expense": { label: "Household", icon: "bi-house", color: "#64748b", types: ["expense"] },
  "self-care-expense": { label: "Self Care", icon: "bi-scissors", color: "#f472b6", types: ["expense"] },
  other: { label: "Other", icon: "bi-three-dots", color: "#94a3b8", types: ["income", "expense"] },
};

const CATEGORY_ICONS = [
  "bi-tag", "bi-wallet2", "bi-cash-coin", "bi-credit-card", "bi-cart", "bi-bag",
  "bi-basket", "bi-cup-hot", "bi-egg-fried", "bi-cup-straw", "bi-lightning-charge",
  "bi-house", "bi-car-front", "bi-bus-front", "bi-fuel-pump", "bi-airplane",
  "bi-laptop", "bi-phone", "bi-tv", "bi-controller", "bi-music-note",
  "bi-book", "bi-mortarboard", "bi-briefcase", "bi-hospital", "bi-capsule",
  "bi-heart-pulse", "bi-scissors", "bi-gift", "bi-balloon", "bi-flower1",
  "bi-star", "bi-gem", "bi-piggy-bank", "bi-graph-up-arrow", "bi-shield-check"
];

const CATEGORY_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#0d9488", "#06b6d4",
  "#0284c7", "#3b82f6", "#64748b"
];

function catMeta(category) {
  if (!category) return { label: "Other", icon: "bi-tag", color: "#94a3b8", types: ["income", "expense"], isCustom: false };
  const lower = String(category).toLowerCase().trim();
  // Check user custom categories first
  const custom = (state.customCategories || []).find(
    (c) => c.id === category || c.name.toLowerCase() === lower || (c.key && c.key.toLowerCase() === lower)
  );
  if (custom) {
    return {
      id: custom.id,
      label: custom.name,
      icon: custom.icon || "bi-tag",
      color: custom.color || "#6366f1",
      types: custom.type === "both" ? ["income", "expense"] : [custom.type],
      isCustom: true,
      raw: custom,
    };
  }
  // Check default categories
  if (CATEGORIES[lower]) {
    return { ...CATEGORIES[lower], id: lower, isCustom: false };
  }
  // Fallback
  return {
    id: lower,
    label: category.charAt(0).toUpperCase() + category.slice(1),
    icon: "bi-tag",
    color: "#94a3b8",
    types: ["income", "expense"],
    isCustom: false,
  };
}

function getAllCategories(type = null) {
  const result = [];
  // Default categories
  Object.entries(CATEGORIES).forEach(([key, meta]) => {
    if (!type || meta.types.includes(type)) {
      result.push({
        id: key,
        key: key,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        types: meta.types,
        isCustom: false,
      });
    }
  });

  // User custom categories
  (state.customCategories || []).forEach((c) => {
    const types = c.type === "both" ? ["income", "expense"] : [c.type];
    if (!type || types.includes(type)) {
      result.push({
        id: c.id,
        key: c.name.toLowerCase(),
        label: c.name,
        icon: c.icon || "bi-tag",
        color: c.color || "#6366f1",
        types: types,
        isCustom: true,
        raw: c,
      });
    }
  });

  return result;
}

// ---------- App State ----------
const state = {
  currentUser: null,       // { id, name, mobile }
  view: "dashboard",
  transactions: [],
  budgets: [],
  customCategories: [],   // [ { id, user_id, name, type, icon, color, created_at } ]
  budgetMonth: currentMonthKey(),
  reportMonth: currentMonthKey(),
  reportTab: "monthly",
  editingTransactionId: null,
  editingBudgetId: null,
  txType: "income",
  charts: {},
  txModal: null,
  budgetModal: null,
  categoryModal: null,
  categoryModalCallback: null,
  selectedCatIcon: "bi-tag",
  selectedCatColor: "#6366f1",
};

// ---------- Helpers ----------
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return "\u09F3" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function shortMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1].slice(0, 3)} '${y.slice(2)}`;
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let toastTimer = null;
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const icon = toast.querySelector("i");
  toast.className = "toast-app show " + type;
  icon.className = "bi " + (type === "success" ? "bi-check-circle-fill" : type === "error" ? "bi-x-circle-fill" : "bi-info-circle-fill");
  document.getElementById("toast-message").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ---------- Activity logging ----------
// Fire-and-forget wrapper: an audit failure must never break a user action.
function logAction(action, options) {
  try {
    return Audit.log(action, options);
  } catch (err) {
    console.warn("logAction failed:", err);
    return Promise.resolve(null);
  }
}

function txnDetails(t) {
  return { type: t.type, category: t.category, amount: t.amount, date: t.date, description: t.description || "" };
}

// ======================== AUTH ========================
function showLogin() {
  document.getElementById("login-form").style.display = "block";
  document.getElementById("register-form").style.display = "none";
}

function showRegister() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
}

async function doLogin() {
  const mobile = document.getElementById("auth-login-mobile").value.trim();
  const password = document.getElementById("auth-login-password").value;

  if (!mobile) return showToast("Please enter your mobile number", "error");
  if (!password) return showToast("Please enter your password", "error");

  const result = await AppDB.loginUser(mobile, password);
  if (result.success) {
    state.currentUser = result.user;
    localStorage.setItem("mm_current_user", JSON.stringify(result.user));
    logAction("login", { entity: "auth", entityId: result.user.id, details: { mobile } });
    enterApp();
    showToast(`Welcome back, ${result.user.name}!`);
  } else {
    logAction("login_failed", { entity: "auth", details: { mobile, reason: result.message } });
    showToast(result.message, "error");
  }
}

async function doRegister() {
  const name = document.getElementById("auth-reg-name").value.trim();
  const mobile = document.getElementById("auth-reg-mobile").value.trim();
  const password = document.getElementById("auth-reg-password").value;
  const confirm = document.getElementById("auth-reg-confirm").value;

  if (!name) return showToast("Please enter your name", "error");
  if (!mobile) return showToast("Please enter your mobile number", "error");
  if (mobile.length < 11) return showToast("Enter a valid 11-digit mobile number", "error");
  if (!password) return showToast("Please create a password", "error");
  if (password.length < 4) return showToast("Password must be at least 4 characters", "error");
  if (password !== confirm) return showToast("Passwords do not match", "error");

  const result = await AppDB.registerUser(name, mobile, password);
  if (result.success) {
    state.currentUser = result.user;
    localStorage.setItem("mm_current_user", JSON.stringify(result.user));
    logAction("register", { entity: "auth", entityId: result.user.id, details: { mobile, name } });
    enterApp();
    showToast(`Welcome, ${result.user.name}! Account created successfully.`);
  } else {
    logAction("register_failed", { entity: "auth", details: { mobile, reason: result.message } });
    showToast(result.message, "error");
  }
}

function doLogout() {
  // Logged before the session is cleared so the record keeps the user id.
  logAction("logout", { entity: "auth", entityId: state.currentUser ? state.currentUser.id : null });
  state.currentUser = null;
  state.transactions = [];
  state.budgets = [];
  state.customCategories = [];
  localStorage.removeItem("mm_current_user");
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.body.classList.remove("app-active");
  showLogin();
  // Clear form fields
  document.getElementById("auth-login-mobile").value = "";
  document.getElementById("auth-login-password").value = "";
  showToast("Logged out successfully");
}

async function enterApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "flex";
  // Bottom nav & FAB visibility on mobile is CSS-driven (body.app-active),
  // so it also responds to rotation/resize — not just the login-time width.
  document.body.classList.add("app-active");

  // Update sidebar user info
  if (state.currentUser) {
    document.getElementById("sidebar-user-name").textContent = state.currentUser.name;
    document.getElementById("sidebar-user-mobile").textContent = state.currentUser.mobile;
    document.getElementById("sidebar-user-avatar").textContent = state.currentUser.name.charAt(0).toUpperCase();
  }

  // Load user data from SQLite
  await loadUserData();
  logAction("session_open", { entity: "session", entityId: state.currentUser ? state.currentUser.id : null });
  Audit.scheduleMirror(0);
  switchView("dashboard");
}

async function loadUserData() {
  if (!state.currentUser) return;
  state.customCategories = await AppDB.getCategories(state.currentUser.id);
  state.transactions = await AppDB.getTransactions(state.currentUser.id);
  state.budgets = await AppDB.getBudgets(state.currentUser.id);
}

// ======================== View switching ========================
function switchView(view) {
  if (state.view !== view) logAction("view_open", { entity: "view", entityId: view });
  state.view = view;
  const viewIds = {
    dashboard: "view-dashboard",
    transactions: "view-transactions",
    budgets: "view-budgets",
    reports: "view-reports",
    categories: "view-categories",
    account: "view-account",
  };
  Object.entries(viewIds).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hide", key !== view);
  });
  document.querySelectorAll(".nav-link[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".bn-item[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  switch (view) {
    case "dashboard": loadDashboard(); break;
    case "transactions": loadTransactionsView(); break;
    case "budgets": loadBudgetsView(); break;
    case "reports": loadReportsView(); break;
    case "categories": loadCategoriesView(); break;
    case "account": loadAccountView(); break;
  }
}

// ======================== Account ========================
function loadAccountView() {
  const u = state.currentUser;
  if (!u) return;
  document.getElementById("account-avatar").textContent = (u.name || "U").charAt(0).toUpperCase();
  document.getElementById("account-name").textContent = u.name;
  document.getElementById("account-mobile").textContent = u.mobile;
  const count = (state.customCategories || []).length;
  const summaryEl = document.getElementById("account-cat-summary");
  if (summaryEl) {
    summaryEl.textContent = `${count} custom categor${count === 1 ? "y" : "ies"} created`;
  }
  loadAuditView();
}

// ======================== Activity log (audit trail) ========================
const AUDIT_ACTION_LABELS = {
  login: "Logged in",
  login_failed: "Login failed",
  register: "Account created",
  register_failed: "Registration failed",
  logout: "Logged out",
  session_open: "Session opened",
  view_open: "Opened view",
  transaction_create: "Transaction added",
  transaction_update: "Transaction updated",
  transaction_delete: "Transaction deleted",
  budget_create: "Budget created",
  budget_update: "Budget updated",
  budget_delete: "Budget deleted",
  budget_month_change: "Budget month changed",
  category_create: "Category created",
  category_delete: "Category deleted",
  report_tab: "Report tab switched",
  report_month_change: "Report month changed",
  data_export: "Backup exported",
  data_import: "Backup imported",
};

function auditIcon(action) {
  if (action.startsWith("transaction")) return "bi-arrow-left-right";
  if (action.startsWith("budget")) return "bi-pie-chart";
  if (action.startsWith("category")) return "bi-tags";
  if (action.startsWith("data_")) return "bi-database";
  if (action.startsWith("report")) return "bi-calendar3";
  if (action === "view_open") return "bi-grid-1x2";
  if (action === "session_open" || action.startsWith("login") || action.startsWith("logout") || action.startsWith("register")) return "bi-shield-lock";
  return "bi-dot";
}

function formatAuditTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function auditDetail(r) {
  const d = r.details && typeof r.details === "object" ? r.details : {};
  if (r.action.startsWith("transaction")) {
    return `${d.type === "income" ? "+" : "\u2212"}${formatCurrency(d.amount)} \u00b7 ${catMeta(d.category).label}${d.description ? " \u00b7 " + d.description : ""}`;
  }
  if (r.action === "budget_create" || r.action === "budget_update" || r.action === "budget_delete") {
    return `${catMeta(d.category).label} \u00b7 ${formatCurrency(d.amount)}${d.month ? " \u00b7 " + monthLabel(d.month) : " \u00b7 recurring"}`;
  }
  if (r.action === "budget_month_change" || r.action === "report_month_change") {
    return d.month && String(d.month).length === 7 ? monthLabel(d.month) : "";
  }
  if (r.action === "category_create" || r.action === "category_delete") return d.name || "";
  if (r.action === "data_export" || r.action === "data_import") {
    return `${d.transactions || 0} transactions \u00b7 ${d.budgets || 0} budgets \u00b7 ${d.categories || 0} categories`;
  }
  if (r.action === "login_failed" || r.action === "register_failed") return d.reason || "";
  if (r.action === "view_open" || r.action === "report_tab") return r.entity_id ? String(r.entity_id) : "";
  return "";
}

function auditRow(r) {
  const label = AUDIT_ACTION_LABELS[r.action] || String(r.action || "action").replace(/_/g, " ");
  const detail = auditDetail(r);
  return `<div class="audit-row"><div class="audit-dot"><i class="bi ${auditIcon(String(r.action || ""))}"></i></div><div class="audit-main"><div class="audit-title">${escapeHtml(label)}${r.platform ? `<span class="audit-src">${escapeHtml(r.platform)}</span>` : ""}</div>${detail ? `<div class="audit-detail">${escapeHtml(detail)}</div>` : ""}</div><div class="audit-time">${escapeHtml(formatAuditTime(r.created_at))}</div></div>`;
}

async function loadAuditView() {
  const listEl = document.getElementById("audit-list");
  if (!listEl) return;
  const statusEl = document.getElementById("audit-status");
  if (statusEl) {
    const ok = Audit.status === "ok";
    const err = Audit.status === "error";
    statusEl.textContent = Audit.statusLabel();
    statusEl.style.background = ok ? "var(--success-light)" : err ? "var(--danger-light)" : "#eef0f7";
    statusEl.style.color = ok ? "var(--success)" : err ? "var(--danger)" : "var(--text-muted)";
    statusEl.title = Audit.apiBase
      ? `Sync server: ${Audit.apiBase}`
      : "No sync server reachable — records are stored in the local database only";
  }
  try {
    const rows = await Audit.list(25);
    listEl.innerHTML = rows.length
      ? rows.map(auditRow).join("")
      : `<div class="empty-state py-4"><i class="bi bi-clock-history"></i><p>No activity recorded yet.</p></div>`;
  } catch (err) {
    listEl.innerHTML = `<p class="text-danger mb-0" style="font-size:12px;">Could not load activity: ${escapeHtml(err.message)}</p>`;
  }
}

async function syncAuditNow() {
  if (!Audit.apiBase) {
    return showToast("No sync server configured — actions are saved locally only", "info");
  }
  const sent = await Audit.flush();
  const mirrored = await Audit.mirrorSnapshot();
  await loadAuditView();
  if (sent || mirrored) showToast("Activity and data synced to JSON + MySQL", "success");
  else showToast("Server unreachable — kept in the local queue", "error");
}

async function exportAuditLog() {
  try {
    const rows = await Audit.list(1000);
    const payload = {
      app_name: "Money Manager",
      exported_at: new Date().toISOString(),
      user: state.currentUser ? { id: state.currentUser.id, name: state.currentUser.name } : null,
      api_base: Audit.apiBase,
      pending_sync: Audit.queue.length,
      records: rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `money-manager-activity-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${rows.length} activity record${rows.length === 1 ? "" : "s"}`);
  } catch (err) {
    showToast("Export failed: " + err.message, "error");
  }
}

async function clearAuditLog() {
  if (!confirm("Clear your local activity log?\n(Records already written to the JSON file / MySQL are kept.)")) return;
  try {
    await Audit.clear();
    loadAuditView();
    showToast("Activity log cleared");
  } catch (err) {
    showToast("Could not clear log: " + err.message, "error");
  }
}

// ======================== Dashboard ========================
function loadDashboard() {
  try {
    const summary = getSummary();
    const trends = getTrends(6);
    document.getElementById("total-income").textContent = formatCurrency(summary.total_income);
    document.getElementById("total-expense").textContent = formatCurrency(summary.total_expense);
    document.getElementById("total-saved").textContent = formatCurrency(summary.balance);
    document.getElementById("hero-balance").textContent = formatCurrency(summary.balance);

    const currentMonth = currentMonthKey();
    let monthIncome = 0, monthExpense = 0;
    state.transactions.forEach((t) => {
      if (String(t.date).slice(0, 7) === currentMonth) {
        if (t.type === "income") monthIncome += t.amount;
        else monthExpense += t.amount;
      }
    });
    document.getElementById("hero-income").textContent = formatCurrency(monthIncome);
    document.getElementById("hero-expense").textContent = formatCurrency(monthExpense);
    document.getElementById("hero-saving").textContent = formatCurrency(monthIncome - monthExpense);

    renderTrendChart(trends);
    renderCategoryChart(summary);

    const recent = [...state.transactions]
      .sort((a, b) => (b.date + (b.created_at || "")).localeCompare(a.date + (a.created_at || "")))
      .slice(0, 6);
    document.getElementById("recent-transactions").innerHTML = recent.length ? txnRows(recent) : emptyState("No transactions yet");
    renderDashboardBudgets();
  } catch (err) {
    console.error("Dashboard error:", err);
    showToast("Failed to load dashboard: " + err.message, "error");
  }
}

function renderDashboardBudgets() {
  try {
    const budgets = getBudgetsWithSpent(state.budgetMonth);
    const el = document.getElementById("dashboard-budgets");
    if (!budgets.length) {
      el.innerHTML = '<div class="empty-state"><i class="bi bi-pie-chart"></i><p>No budgets set yet.<br>Create one to start tracking.</p></div>';
      return;
    }
    el.innerHTML = budgets.slice(0, 4).map(budgetRow).join("");
  } catch (_) {
    document.getElementById("dashboard-budgets").innerHTML = emptyState("Could not load budgets");
  }
}

function renderTrendChart(trends) {
  const ctx = document.getElementById("trend-chart");
  if (state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: trends.map((t) => shortMonthLabel(t.month)),
      datasets: [
        { label: "Income", data: trends.map((t) => t.income), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.12)", fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#10b981", borderWidth: 2.5 },
        { label: "Expense", data: trends.map((t) => t.expense), borderColor: "#f43f5e", backgroundColor: "rgba(244,63,94,0.10)", fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#f43f5e", borderWidth: 2.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16, font: { family: "Inter", size: 12 } } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${formatCurrency(c.raw)}` } } },
      scales: { y: { beginAtZero: true, grid: { color: "#eef0f7" }, ticks: { font: { family: "Inter", size: 11 }, callback: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) } }, x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11 } } } },
    },
  });
}

function renderCategoryChart(summary) {
  const ctx = document.getElementById("category-chart");
  if (state.charts.category) state.charts.category.destroy();
  const entries = Object.entries(summary.expense_by_category || {}).sort((a, b) => b[1] - a[1]);
  const legendEl = document.getElementById("category-legend");
  if (!entries.length) {
    legendEl.innerHTML = '<p class="text-muted text-center mb-0">No expense data available</p>';
    if (ctx) { state.charts.category = new Chart(ctx, { type: "doughnut", data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] }, options: { responsive: true, maintainAspectRatio: false } }); }
    return;
  }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const colors = entries.map(([cat]) => catMeta(cat).color);
  const labels = entries.map(([cat]) => catMeta(cat).label);
  state.charts.category = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: entries.map(([, v]) => v), backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${formatCurrency(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)` } } } },
  });
  legendEl.innerHTML = entries.map(([cat, value]) => `<div class="legend-row"><span class="dot" style="background:${catMeta(cat).color}"></span><span class="l-label">${escapeHtml(catMeta(cat).label)}</span><span class="l-pct">${((value / total) * 100).toFixed(1)}%</span><span class="l-value">${formatCurrency(value)}</span></div>`).join("");
}

// ======================== Transaction rows ========================
function txnRows(transactions) {
  return transactions.map((t) => {
    const meta = catMeta(t.category);
    const isIncome = t.type === "income";
    const id = t.id;
    return `<div class="txn-row"><div class="txn-avatar" style="background:${meta.color}"><i class="bi ${meta.icon}"></i></div><div class="txn-info"><div class="txn-title">${escapeHtml(t.description || meta.label)}</div><div class="txn-sub"><span class="cat-badge" style="background:${meta.color}18;color:${meta.color}"><i class="bi ${meta.icon}"></i> ${escapeHtml(meta.label)}</span></div></div><div class="txn-amount"><div class="amount ${isIncome ? "in" : "out"}">${isIncome ? "+" : "\u2212"}${formatCurrency(t.amount)}</div><div class="date">${formatDate(t.date)}</div></div><div class="txn-actions"><button class="icon-btn" title="Edit" onclick="openTransactionModal('${id}')"><i class="bi bi-pencil"></i></button><button class="icon-btn danger" title="Delete" onclick="deleteTransaction('${id}')"><i class="bi bi-trash"></i></button></div></div>`;
  }).join("");
}

function emptyState(text) {
  return `<div class="empty-state"><i class="bi bi-inbox"></i><p>${text}</p></div>`;
}

// ======================== Transactions view ========================
function loadTransactionsView() {
  try { populateCategoryFilter(); applyTransactionFilters(); }
  catch (err) { console.error("Transactions error:", err); showToast("Failed to load transactions: " + err.message, "error"); }
}

function populateCategoryFilter() {
  const select = document.getElementById("txn-category-filter");
  const current = select.value;
  const allAvailable = getAllCategories();
  const catMap = new Map();
  allAvailable.forEach((c) => catMap.set(c.key.toLowerCase(), c.label));
  state.transactions.forEach((t) => {
    const k = t.category.toLowerCase();
    if (!catMap.has(k)) {
      catMap.set(k, catMeta(k).label);
    }
  });
  const sorted = Array.from(catMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  select.innerHTML = `<option value="">All Categories</option>` + sorted.map(([k, label]) => `<option value="${escapeHtml(k)}">${escapeHtml(label)}</option>`).join("");
  select.value = current;
}

function applyTransactionFilters() {
  const search = (document.getElementById("txn-search").value || "").toLowerCase().trim();
  const type = document.getElementById("txn-type-filter").value;
  const category = document.getElementById("txn-category-filter").value;
  const month = document.getElementById("txn-month-filter").value;
  const filtered = state.transactions.filter((t) => {
    if (search && !(t.description || "").toLowerCase().includes(search)) return false;
    if (type && t.type !== type) return false;
    if (category && t.category.toLowerCase() !== category) return false;
    if (month && String(t.date).slice(0, 7) !== month) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => (b.date + (b.created_at || "")).localeCompare(a.date + (a.created_at || "")));
  const totalIn = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  document.getElementById("txn-count").textContent = `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
  document.getElementById("txn-total-income").textContent = `In: ${formatCurrency(totalIn)}`;
  document.getElementById("txn-total-expense").textContent = `Out: ${formatCurrency(totalOut)}`;
  document.getElementById("transactions-list").innerHTML = sorted.length ? txnRows(sorted) : emptyState("No transactions match your filters");
}

// ======================== Add / Edit transaction ========================
function openTransactionModal(id) {
  state.editingTransactionId = id || null;
  const editing = id ? state.transactions.find((t) => t.id === id) : null;
  document.getElementById("transaction-modal-title").textContent = editing ? "Edit Transaction" : "Add Transaction";
  setTxType(editing ? editing.type : "income");
  renderCategoryPicker(editing ? editing.type : state.txType, editing ? editing.category : null);
  document.getElementById("tx-amount").value = editing ? editing.amount : "";
  document.getElementById("tx-date").value = editing ? editing.date : new Date().toISOString().slice(0, 10);
  document.getElementById("tx-description").value = editing ? editing.description || "" : "";
  document.getElementById("tx-submit-btn").innerHTML = editing ? '<i class="bi bi-check-lg me-1"></i> Update' : '<i class="bi bi-check-lg me-1"></i> Save';
  if (!state.txModal) { state.txModal = new bootstrap.Modal(document.getElementById("transaction-modal")); }
  state.txModal.show();
}

function setTxType(type) {
  state.txType = type === "expense" ? "expense" : "income";
  document.getElementById("tx-type-income").classList.toggle("active", state.txType === "income");
  document.getElementById("tx-type-expense").classList.toggle("active", state.txType === "expense");
}

function renderCategoryPicker(type, selected) {
  const container = document.getElementById("category-picker");
  const cats = getAllCategories(type);
  const chipsHtml = cats.map((cat) => {
    const isSelected = selected ? (selected.toLowerCase() === cat.key.toLowerCase() || selected === cat.id) : false;
    return `<button type="button" class="category-chip ${isSelected ? "selected" : ""}" data-cat="${escapeHtml(cat.key)}" onclick="selectTxCategory('${escapeHtml(cat.key)}')">
      <span class="cc-avatar" style="background:${cat.color}"><i class="bi ${cat.icon}"></i></span>
      <span class="cc-label">${escapeHtml(cat.label)}</span>
    </button>`;
  }).join("");

  const addChip = `<button type="button" class="category-chip add-cat-chip" onclick="openCategoryModal('${type}', (cat) => selectTxCategory(cat.name.toLowerCase()))">
    <span class="cc-avatar" style="background:var(--primary-light); color:var(--primary);"><i class="bi bi-plus-lg"></i></span>
    <span class="cc-label">+ New Category</span>
  </button>`;

  container.innerHTML = chipsHtml + addChip;
}

function selectTxCategory(key) {
  document.querySelectorAll("#category-picker .category-chip").forEach((chip) => {
    chip.classList.toggle("selected", chip.dataset.cat === key);
  });
}

function getSelectedCategory() {
  const chip = document.querySelector("#category-picker .category-chip.selected");
  return chip ? chip.dataset.cat : null;
}

async function submitTransaction() {
  const category = getSelectedCategory();
  const amount = parseFloat(document.getElementById("tx-amount").value);
  const date = document.getElementById("tx-date").value;
  const description = document.getElementById("tx-description").value.trim();
  if (!category) return showToast("Please select a category", "error");
  if (!amount || amount <= 0) return showToast("Enter a valid amount", "error");
  if (!date) return showToast("Pick a date", "error");
  const editingId = state.editingTransactionId;
  try {
    if (editingId) {
      const index = state.transactions.findIndex((t) => t.id === editingId);
      if (index !== -1) {
        const updated = { ...state.transactions[index], type: state.txType.toLowerCase(), category: category.toLowerCase(), amount, date, description };
        state.transactions[index] = updated;
        await AppDB.saveTransaction(state.currentUser.id, updated);
        logAction("transaction_update", { entity: "transaction", entityId: editingId, details: txnDetails(updated) });
        showToast("Transaction updated");
      }
    } else {
      const newTx = { id: generateId(), type: state.txType.toLowerCase(), category: category.toLowerCase(), amount, date, description, created_at: new Date().toISOString().replace("T", " ").slice(0, 19) };
      state.transactions.push(newTx);
      await AppDB.saveTransaction(state.currentUser.id, newTx);
      logAction("transaction_create", { entity: "transaction", entityId: newTx.id, details: txnDetails(newTx) });
      showToast("Transaction added");
    }
    Audit.scheduleMirror();
    state.txModal.hide();
    if (state.view === "dashboard") loadDashboard();
    else if (state.view === "transactions") applyTransactionFilters();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteTransaction(id) {
  if (!confirm("Delete this transaction?")) return;
  const removed = state.transactions.find((t) => t.id === id);
  try {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    await AppDB.deleteTransaction(state.currentUser.id, id);
    logAction("transaction_delete", { entity: "transaction", entityId: id, details: removed ? txnDetails(removed) : null });
    Audit.scheduleMirror();
    showToast("Transaction deleted");
    if (state.view === "dashboard") loadDashboard();
    else if (state.view === "transactions") applyTransactionFilters();
  } catch (err) { showToast(err.message, "error"); }
}

// ======================== Budgets ========================
function budgetRow(b) {
  const meta = catMeta(b.category);
  const pct = Math.min(b.percent, 100);
  const over = b.spent > b.amount;
  const warn = !over && b.percent >= 80;
  const barColor = over ? "#f43f5e" : warn ? "#f59e0b" : "#6366f1";
  const status = over ? `<span class="text-danger fw-bold">Over by ${formatCurrency(b.spent - b.amount)}</span>` : warn ? `<span class="text-warning fw-bold">Getting close</span>` : `<span>${formatCurrency(b.remaining)} left</span>`;
  return `<div class="budget-item"><div class="budget-head"><div class="b-left"><span class="txn-avatar" style="width:36px;height:36px;font-size:15px;background:${meta.color}"><i class="bi ${meta.icon}"></i></span><div><div class="b-title">${escapeHtml(meta.label)} ${b.month ? `<span class="cat-badge" style="background:var(--primary-light);color:var(--primary)">${escapeHtml(monthLabel(b.month))}</span>` : ""}</div><div class="b-sub">${formatCurrency(b.spent)} of ${formatCurrency(b.amount)}</div></div></div><div class="b-right">${status}</div><div class="txn-actions"><button class="icon-btn" title="Edit" onclick="openBudgetModal('${b.id}')"><i class="bi bi-pencil"></i></button><button class="icon-btn danger" title="Delete" onclick="deleteBudget('${b.id}')"><i class="bi bi-trash"></i></button></div></div><div class="progress-app"><div class="bar" style="width:${pct}%;background:${barColor}"></div></div></div>`;
}

function loadBudgetsView() {
  try {
    const budgets = getBudgetsWithSpent(state.budgetMonth);
    state.budgets = budgets;
    document.getElementById("budget-month-label").textContent = monthLabel(state.budgetMonth);
    const totalAmount = budgets.reduce((s, b) => s + b.amount, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
    const totalPct = totalAmount ? (totalSpent / totalAmount) * 100 : 0;
    document.getElementById("budget-total-label").textContent = "Total Budget";
    document.getElementById("budget-total-sub").textContent = `${budgets.length} categor${budgets.length === 1 ? "y" : "ies"} tracked`;
    document.getElementById("budget-total-amount").textContent = `${formatCurrency(totalSpent)} / ${formatCurrency(totalAmount)}`;
    document.getElementById("budget-total-status").textContent = totalSpent > totalAmount ? "Over budget!" : `${formatCurrency(totalAmount - totalSpent)} remaining`;
    const bar = document.getElementById("budget-total-bar");
    bar.style.width = `${Math.min(totalPct, 100)}%`;
    bar.style.background = totalSpent > totalAmount ? "#f43f5e" : totalPct >= 80 ? "#f59e0b" : "#6366f1";
    document.getElementById("budgets-list").innerHTML = budgets.length ? budgets.map(budgetRow).join("") : emptyState("No budgets yet. Add one to control your spending.");
  } catch (err) { showToast("Failed to load budgets: " + err.message, "error"); }
}

function navigateBudgetMonth(direction) {
  const [y, m] = state.budgetMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + direction, 1);
  state.budgetMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  logAction("budget_month_change", { entity: "budget", details: { month: state.budgetMonth, direction } });
  loadBudgetsView();
}

function populateBudgetCategories(selectedKey) {
  const select = document.getElementById("budget-category");
  const expenseCats = getAllCategories("expense");
  select.innerHTML = `<option value="">Select category</option>` + expenseCats.map((cat) => `<option value="${escapeHtml(cat.key)}">${escapeHtml(cat.label)} ${cat.isCustom ? "(Custom)" : ""}</option>`).join("");
  if (selectedKey) {
    select.value = selectedKey;
  }
}

function openBudgetModal(id) {
  state.editingBudgetId = id || null;
  const editing = id ? state.budgets.find((b) => b.id === id) : null;
  document.getElementById("budget-modal-title").textContent = editing ? "Edit Budget" : "Add Budget";
  populateBudgetCategories(editing ? editing.category : null);
  document.getElementById("budget-amount").value = editing ? editing.amount : "";
  document.getElementById("budget-submit-btn").innerHTML = editing ? '<i class="bi bi-check-lg me-1"></i> Update' : '<i class="bi bi-check-lg me-1"></i> Save';
  if (editing) {
    const recurring = !editing.month;
    document.getElementById("budget-recurring").checked = recurring;
    document.getElementById("budget-month").value = editing.month || state.budgetMonth;
    toggleBudgetMonthWrap();
  } else {
    document.getElementById("budget-recurring").checked = true;
    document.getElementById("budget-month").value = state.budgetMonth;
    toggleBudgetMonthWrap();
  }
  if (!state.budgetModal) { state.budgetModal = new bootstrap.Modal(document.getElementById("budget-modal")); }
  state.budgetModal.show();
}

function toggleBudgetMonthWrap() {
  const recurring = document.getElementById("budget-recurring").checked;
  document.getElementById("budget-month-wrap").classList.toggle("hide", recurring);
}

async function submitBudget() {
  const category = document.getElementById("budget-category").value;
  const amount = parseFloat(document.getElementById("budget-amount").value);
  const recurring = document.getElementById("budget-recurring").checked;
  const month = recurring ? "" : document.getElementById("budget-month").value;
  if (!category) return showToast("Select a category", "error");
  if (!amount || amount <= 0) return showToast("Enter a valid amount", "error");
  const editingId = state.editingBudgetId;
  try {
    if (editingId) {
      const index = state.budgets.findIndex((b) => b.id === editingId);
      if (index !== -1) {
        const updated = { ...state.budgets[index], category: category.toLowerCase(), amount, month };
        state.budgets[index] = updated;
        await AppDB.saveBudget(state.currentUser.id, updated);
        logAction("budget_update", { entity: "budget", entityId: editingId, details: { category: updated.category, amount, month } });
        showToast("Budget updated");
      }
    } else {
      // Check for duplicate
      const duplicate = state.budgets.find((b) => b.category === category.toLowerCase() && b.month === month);
      if (duplicate) return showToast("A budget already exists for this category and month", "error");
      const newBudget = { id: generateId(), category: category.toLowerCase(), amount, month };
      state.budgets.push(newBudget);
      await AppDB.saveBudget(state.currentUser.id, newBudget);
      logAction("budget_create", { entity: "budget", entityId: newBudget.id, details: { category: newBudget.category, amount, month } });
      showToast("Budget created");
    }
    Audit.scheduleMirror();
    state.budgetModal.hide();
    loadBudgetsView();
    if (state.view === "dashboard") renderDashboardBudgets();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteBudget(id) {
  if (!confirm("Delete this budget?")) return;
  const removed = state.budgets.find((b) => b.id === id);
  try {
    state.budgets = state.budgets.filter((b) => b.id !== id);
    await AppDB.deleteBudget(state.currentUser.id, id);
    logAction("budget_delete", { entity: "budget", entityId: id, details: removed ? { category: removed.category, amount: removed.amount, month: removed.month || "" } : null });
    Audit.scheduleMirror();
    showToast("Budget deleted");
    loadBudgetsView();
    if (state.view === "dashboard") renderDashboardBudgets();
    else if (state.view === "reports") loadReportsView();
  } catch (err) { showToast(err.message, "error"); }
}

// ======================== Reports ========================
function setReportTab(tab) {
  if (state.reportTab !== tab) logAction("report_tab", { entity: "report", entityId: tab });
  state.reportTab = tab;
  document.getElementById("report-monthly-tab").classList.toggle("active", tab === "monthly");
  document.getElementById("report-daily-tab").classList.toggle("active", tab === "daily");
  document.getElementById("report-monthly-section").classList.toggle("hide", tab !== "monthly");
  document.getElementById("report-daily-section").classList.toggle("hide", tab !== "daily");
  document.getElementById("report-month-nav").classList.toggle("hide", tab !== "daily");
  loadReportsView();
}

function loadReportsView() {
  const alerts = document.getElementById("report-alerts");
  alerts.innerHTML = "";
  if (state.budgets.length) {
    const alertsList = getBudgetAlerts(state.reportTab === "monthly" ? state.reportMonth : null);
    if (alertsList.length) {
      alerts.innerHTML = alertsList.map((a) => {
        const color = a.over ? "var(--danger)" : "var(--warning)";
        const icon = a.over ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill";
        const title = a.over ? "Over budget!" : "Getting close to your budget";
        const msg = a.over
          ? `${escapeHtml(catMeta(a.category).label)} is ${formatCurrency(a.spent - a.amount)} over your ${formatCurrency(a.amount)} budget`
          : `${escapeHtml(catMeta(a.category).label)} has used ${a.percent.toFixed(0)}% of its ${formatCurrency(a.amount)} budget (${formatCurrency(a.spent)} spent)`;
        return `<div class="alert alert-app" style="border-left:4px solid ${color}"><i class="bi ${icon} me-2" style="color:${color}"></i><strong>${title}</strong> ${msg}</div>`;
      }).join("");
    }
  }
  if (state.reportTab === "monthly") loadMonthlyReport();
  else { document.getElementById("report-month-label").textContent = monthLabel(state.reportMonth); loadDailyReport(); }
}

function loadMonthlyReport() {
  const body = document.getElementById("monthly-report-body");
  try {
    const monthly = getMonthlyReport();
    const sorted = Object.entries(monthly).sort((a, b) => b[0].localeCompare(a[0]));
    if (!sorted.length) { body.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No data available</td></tr>`; return; }
    body.innerHTML = sorted.map(([month, data]) => {
      const balanceClass = data.balance >= 0 ? "text-success" : "text-danger";
      return `<tr><td class="fw-semibold">${escapeHtml(monthLabel(month))}</td><td class="text-success fw-semibold">${formatCurrency(data.income)}</td><td class="text-danger fw-semibold">${formatCurrency(data.expense)}</td><td class="${balanceClass} fw-bold">${formatCurrency(data.balance)}</td><td class="text-end">${data.transactions}</td></tr>`;
    }).join("");
  } catch (err) { body.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Failed to load report</td></tr>`; }
}

function loadDailyReport() {
  const section = document.getElementById("report-daily-section");
  try {
    const daily = getDailyReport(state.reportMonth);
    const sorted = Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0]));
    if (!sorted.length) { section.innerHTML = `<div class="card-app"><div class="card-body-app">${emptyState("No transactions for this month")}</div></div>`; return; }
    section.innerHTML = sorted.map(([date, data]) => {
      const details = data.details || [];
      return `<div class="day-card"><div class="day-head"><h6>${escapeHtml(formatDate(date))}</h6><div class="d-flex gap-2 flex-wrap"><span class="cat-badge" style="background:var(--success-light);color:var(--success)"><i class="bi bi-arrow-down-circle"></i> ${formatCurrency(data.income)}</span><span class="cat-badge" style="background:var(--danger-light);color:var(--danger)"><i class="bi bi-arrow-up-circle"></i> ${formatCurrency(data.expense)}</span><span class="cat-badge" style="background:var(--primary-light);color:var(--primary)"><i class="bi bi-wallet2"></i> ${formatCurrency(data.balance)}</span></div></div><div class="day-body">${txnRows(details)}</div></div>`;
    }).join("");
  } catch (err) { section.innerHTML = `<div class="card-app"><div class="card-body-app"><p class="text-danger text-center mb-0">Failed to load daily report</p></div></div>`; }
}

function navigateReportMonth(direction) {
  const [y, m] = state.reportMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + direction, 1);
  state.reportMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  logAction("report_month_change", { entity: "report", details: { month: state.reportMonth, direction } });
  loadReportsView();
}

// ======================== Data Functions ========================
function getSummary() {
  const transactions = state.transactions;
  let totalIncome = 0, totalExpense = 0;
  const categoryTotals = {};
  transactions.forEach((t) => {
    if (t.type === "income") totalIncome += t.amount;
    else if (t.type === "expense") { totalExpense += t.amount; categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount; }
  });
  return { total_income: totalIncome, total_expense: totalExpense, balance: totalIncome - totalExpense, expense_by_category: categoryTotals };
}

function getTrends(months = 6) {
  const transactions = state.transactions;
  const now = new Date();
  const monthKeys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const trends = monthKeys.map((key) => ({ month: key, income: 0, expense: 0, balance: 0 }));
  const indexByMonth = {};
  monthKeys.forEach((key, i) => { indexByMonth[key] = i; });
  transactions.forEach((t) => {
    if (t.date.length >= 7) {
      const monthKey = t.date.slice(0, 7);
      if (indexByMonth[monthKey] !== undefined) {
        const idx = indexByMonth[monthKey];
        if (t.type === "income") trends[idx].income += t.amount;
        else if (t.type === "expense") trends[idx].expense += t.amount;
        trends[idx].balance = trends[idx].income - trends[idx].expense;
      }
    }
  });
  return trends;
}

function getMonthlyReport() {
  const transactions = state.transactions;
  const monthlyData = {};
  transactions.forEach((t) => {
    if (t.date.length >= 7) {
      const month = t.date.slice(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0, transactions: 0, balance: 0 };
      if (t.type === "income") monthlyData[month].income += t.amount;
      else monthlyData[month].expense += t.amount;
      monthlyData[month].transactions++;
      monthlyData[month].balance = monthlyData[month].income - monthlyData[month].expense;
    }
  });
  return monthlyData;
}

function getDailyReport(month) {
  const transactions = state.transactions.filter((t) => {
    if (month && t.date.length >= 7) return t.date.slice(0, 7) === month;
    return true;
  });
  const dailyData = {};
  transactions.forEach((t) => {
    const dateKey = t.date;
    if (!dailyData[dateKey]) dailyData[dateKey] = { income: 0, expense: 0, transactions: 0, balance: 0, details: [] };
    if (t.type === "income") dailyData[dateKey].income += t.amount;
    else dailyData[dateKey].expense += t.amount;
    dailyData[dateKey].transactions++;
    dailyData[dateKey].balance = dailyData[dateKey].income - dailyData[dateKey].expense;
    dailyData[dateKey].details.push(t);
  });
  return dailyData;
}

function getBudgetsWithSpent(month) {
  const budgets = state.budgets;
  const transactions = state.transactions;
  const spentByCategory = {};
  transactions.forEach((t) => {
    if (t.type === "expense" && t.date.length >= 7 && t.date.slice(0, 7) === month) {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
    }
  });
  return budgets
    .filter((b) => { if (b.month && b.month !== month) return false; return true; })
    .map((b) => {
      const spent = spentByCategory[b.category] || 0;
      return { id: b.id, category: b.category, amount: b.amount, month: b.month, spent, remaining: b.amount - spent, percent: b.amount > 0 ? (spent / b.amount) * 100 : 0 };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

// ======================== Budget alerts ========================
function getBudgetAlerts(month) {
  const alerts = [];
  state.budgets.forEach((b) => {
    const spent = (state.transactions || [])
      .filter((t) => t.type === "expense" && t.date.slice(0, 7) === month && (!b.month || b.month === month))
      .reduce((s, t) => s + t.amount, 0);
    const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    if (percent >= 100) alerts.push({ category: b.category, spent, amount: b.amount, percent, over: true });
    else if (percent >= 80) alerts.push({ category: b.category, spent, amount: b.amount, percent, over: false });
  });
  return alerts.sort((a, b) => b.percent - a.percent);
}

// ======================== Export / Import ========================
async function exportDatabase() {
  try {
    if (!state.currentUser) return showToast("Please log in first", "error");
    const data = await AppDB.exportUserDb(state.currentUser.id, await Audit.list(500));
    logAction("data_export", {
      entity: "backup",
      details: {
        transactions: (data.transactions || []).length,
        budgets: (data.budgets || []).length,
        categories: (data.categories || []).length,
        activity: (data.activity || []).length,
      },
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `money-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Database exported successfully!");
  } catch (err) { showToast("Export failed: " + err.message, "error"); }
}

async function importDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await AppDB.importUserDb(state.currentUser.id, data);
    logAction("data_import", {
      entity: "backup",
      details: {
        transactions: (data.transactions || []).length,
        budgets: (data.budgets || []).length,
        categories: (data.categories || []).length,
        activity: (data.activity || []).length,
      },
    });
    await loadUserData();
    Audit.scheduleMirror(0);
    showToast("Database imported successfully!");
    switchView(state.view);
  } catch (err) { showToast(err.message || "Import failed", "error"); }
  event.target.value = "";
}

// ======================== Categories Management ========================
function loadCategoriesView() {
  try {
    const customList = document.getElementById("custom-categories-list");
    const defaultList = document.getElementById("default-categories-list");
    const countEl = document.getElementById("custom-cat-count");

    const customCats = state.customCategories || [];
    if (countEl) countEl.textContent = customCats.length;

    // Render Custom Categories
    if (customCats.length === 0) {
      customList.innerHTML = `<div class="empty-state py-4 w-100" style="grid-column: 1 / -1;"><i class="bi bi-tags"></i><p>No custom categories yet.<br>Create categories unique to your account!</p><button class="btn btn-primary-app btn-sm mt-3" onclick="openCategoryModal()"><i class="bi bi-plus-lg me-1"></i> Add Custom Category</button></div>`;
    } else {
      customList.innerHTML = customCats.map((c) => {
        const typeLabel = c.type === "both" ? "Income & Expense" : c.type === "income" ? "Income" : "Expense";
        const typeIcon = c.type === "income" ? "bi-arrow-down-circle" : c.type === "expense" ? "bi-arrow-up-circle" : "bi-arrow-left-right";
        const typeColor = c.type === "income" ? "var(--success)" : c.type === "expense" ? "var(--danger)" : "var(--primary)";
        const key = c.name.toLowerCase();
        const txCount = state.transactions.filter((t) => t.category.toLowerCase() === key || t.category === c.id).length;

        return `<div class="cat-manage-item">
          <div class="d-flex align-items-center gap-3 min-w-0">
            <div class="txn-avatar" style="background:${c.color || "#6366f1"}; width:40px; height:40px; font-size:18px;">
              <i class="bi ${c.icon || "bi-tag"}"></i>
            </div>
            <div style="min-width:0;">
              <div class="fw-bold fs-6 text-truncate">${escapeHtml(c.name)}</div>
              <div class="d-flex gap-2 align-items-center mt-1 flex-wrap">
                <span class="cat-badge" style="background:${typeColor}18; color:${typeColor};">
                  <i class="bi ${typeIcon}"></i> ${typeLabel}
                </span>
                <span class="text-muted" style="font-size:11px;">${txCount} transaction${txCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
          <div class="d-flex gap-1 ms-2">
            <button class="icon-btn danger" title="Delete Category" onclick="deleteCustomCategory('${c.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>`;
      }).join("");
    }

    // Render Default Categories
    defaultList.innerHTML = Object.entries(CATEGORIES).map(([key, meta]) => {
      const typeLabel = meta.types.length > 1 ? "Income & Expense" : meta.types[0] === "income" ? "Income" : "Expense";
      const typeIcon = meta.types.length > 1 ? "bi-arrow-left-right" : meta.types[0] === "income" ? "bi-arrow-down-circle" : "bi-arrow-up-circle";
      const typeColor = meta.types.length > 1 ? "var(--primary)" : meta.types[0] === "income" ? "var(--success)" : "var(--danger)";
      return `<div class="cat-manage-item" style="opacity: 0.88;">
        <div class="d-flex align-items-center gap-3 min-w-0">
          <div class="txn-avatar" style="background:${meta.color}; width:40px; height:40px; font-size:18px;">
            <i class="bi ${meta.icon}"></i>
          </div>
          <div style="min-width:0;">
            <div class="fw-bold fs-6 text-truncate">${escapeHtml(meta.label)}</div>
            <div class="d-flex gap-2 align-items-center mt-1">
              <span class="cat-badge" style="background:${typeColor}18; color:${typeColor};">
                <i class="bi ${typeIcon}"></i> ${typeLabel}
              </span>
              <span class="cat-badge" style="background:#eef0f7; color:var(--text-muted);">Default</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Categories view error:", err);
    showToast("Failed to load categories: " + err.message, "error");
  }
}

function openCategoryModal(defaultType = "expense", callback = null) {
  state.categoryModalCallback = callback;
  state.selectedCatIcon = "bi-tag";
  state.selectedCatColor = "#6366f1";
  
  // Set default type
  const typeValue = ["income", "expense", "both"].includes(defaultType) ? defaultType : "expense";
  const typeRadio = document.getElementById(`cat-type-${typeValue}`);
  if (typeRadio) typeRadio.checked = true;

  document.getElementById("cat-name").value = "";
  renderCategoryIconGrid();
  renderCategoryColorPalette();
  updateCategoryPreview();

  if (!state.categoryModal) {
    state.categoryModal = new bootstrap.Modal(document.getElementById("category-modal"));
  }
  state.categoryModal.show();
  setTimeout(() => {
    const input = document.getElementById("cat-name");
    if (input) input.focus();
  }, 350);
}

function renderCategoryIconGrid() {
  const container = document.getElementById("cat-icon-grid");
  if (!container) return;
  container.innerHTML = CATEGORY_ICONS.map((icon) => {
    const isSelected = icon === state.selectedCatIcon;
    return `<button type="button" class="icon-grid-item ${isSelected ? "selected" : ""}" data-icon="${icon}" onclick="selectCategoryIcon('${icon}')">
      <i class="bi ${icon}"></i>
    </button>`;
  }).join("");
}

function selectCategoryIcon(icon) {
  state.selectedCatIcon = icon;
  document.querySelectorAll("#cat-icon-grid .icon-grid-item").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.icon === icon);
  });
  updateCategoryPreview();
}

function renderCategoryColorPalette() {
  const container = document.getElementById("cat-color-picker");
  if (!container) return;
  container.innerHTML = CATEGORY_COLORS.map((color) => {
    const isSelected = color === state.selectedCatColor;
    return `<button type="button" class="color-swatch ${isSelected ? "selected" : ""}" style="background:${color}" data-color="${color}" onclick="selectCategoryColor('${color}')"></button>`;
  }).join("");
}

function selectCategoryColor(color) {
  state.selectedCatColor = color;
  document.querySelectorAll("#cat-color-picker .color-swatch").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.color === color);
  });
  updateCategoryPreview();
}

function updateCategoryPreview() {
  const nameInput = document.getElementById("cat-name");
  const rawName = nameInput ? nameInput.value.trim() : "";
  const displayName = rawName || "Category Name";
  
  const typeRadio = document.querySelector('input[name="cat-type-radio"]:checked');
  const typeVal = typeRadio ? typeRadio.value : "expense";

  const color = state.selectedCatColor || "#6366f1";
  const icon = state.selectedCatIcon || "bi-tag";

  const avatar = document.getElementById("cat-preview-avatar");
  const nameEl = document.getElementById("cat-preview-name");
  const iconEl = document.getElementById("cat-preview-icon");
  const badge = document.getElementById("cat-preview-badge");
  const typeText = document.getElementById("cat-preview-type-text");
  const typeIcon = document.getElementById("cat-preview-type-icon");

  if (avatar) avatar.style.background = color;
  if (nameEl) nameEl.textContent = displayName;
  if (iconEl) iconEl.className = `bi ${icon}`;

  const typeLabel = typeVal === "both" ? "Income & Expense" : typeVal === "income" ? "Income" : "Expense";
  const typeIconClass = typeVal === "income" ? "bi-arrow-down-circle" : typeVal === "expense" ? "bi-arrow-up-circle" : "bi-arrow-left-right";

  if (typeText) typeText.textContent = typeLabel;
  if (typeIcon) typeIcon.className = `bi ${typeIconClass} me-1`;
  if (badge) {
    badge.style.background = `${color}18`;
    badge.style.color = color;
  }
}

async function submitCategory() {
  const nameInput = document.getElementById("cat-name");
  const name = nameInput ? nameInput.value.trim() : "";
  if (!name) return showToast("Please enter a category name", "error");

  const typeRadio = document.querySelector('input[name="cat-type-radio"]:checked');
  const type = typeRadio ? typeRadio.value : "expense";
  const icon = state.selectedCatIcon || "bi-tag";
  const color = state.selectedCatColor || "#6366f1";

  // Duplicate check for this registered user
  const lower = name.toLowerCase();
  const duplicate = (state.customCategories || []).find((c) => c.name.toLowerCase() === lower);
  if (duplicate) {
    return showToast(`You already have a category named "${name}"`, "error");
  }
  // Block shadowing a built-in category (keeps pickers unambiguous)
  if (CATEGORIES[lower]) {
    return showToast(`"${name}" is already a default category — choose a different name`, "error");
  }

  try {
    const newCategory = {
      id: "cat_" + generateId(),
      name: name,
      type: type,
      icon: icon,
      color: color,
      created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    const saved = await AppDB.saveCategory(state.currentUser.id, newCategory);
    if (!saved) throw new Error("Could not save category to database");

    state.customCategories.push(newCategory);
    logAction("category_create", { entity: "category", entityId: newCategory.id, details: { name, type, icon, color } });
    Audit.scheduleMirror();
    showToast(`Category "${name}" created successfully!`);

    if (state.categoryModal) {
      state.categoryModal.hide();
    }

    // If a callback was provided (e.g. from transaction modal or budget modal), call it
    if (typeof state.categoryModalCallback === "function") {
      const cb = state.categoryModalCallback;
      state.categoryModalCallback = null;
      cb(newCategory);
    }

    // Re-render pickers / views
    if (state.txModal && document.getElementById("transaction-modal").classList.contains("show")) {
      renderCategoryPicker(state.txType, newCategory.name.toLowerCase());
    }
    if (state.budgetModal && document.getElementById("budget-modal").classList.contains("show")) {
      populateBudgetCategories(newCategory.name.toLowerCase());
    }

    if (state.view === "categories") loadCategoriesView();
    else if (state.view === "transactions") populateCategoryFilter();
    else if (state.view === "budgets") loadBudgetsView();
    else if (state.view === "dashboard") loadDashboard();
    else if (state.view === "account") loadAccountView();
  } catch (err) {
    console.error("submitCategory error:", err);
    showToast("Failed to save category: " + err.message, "error");
  }
}

async function deleteCustomCategory(id) {
  const cat = (state.customCategories || []).find((c) => c.id === id);
  const catName = cat ? cat.name : "this category";
  if (!confirm(`Delete custom category "${catName}"?\n(Your existing transactions will keep their history)`)) return;

  try {
    await AppDB.deleteCategory(state.currentUser.id, id);
    state.customCategories = state.customCategories.filter((c) => c.id !== id);
    logAction("category_delete", { entity: "category", entityId: id, details: { name: catName } });
    Audit.scheduleMirror();
    showToast(`Category "${catName}" deleted`);

    if (state.view === "categories") loadCategoriesView();
    else if (state.view === "transactions") { populateCategoryFilter(); applyTransactionFilters(); }
    else if (state.view === "budgets") loadBudgetsView();
    else if (state.view === "dashboard") loadDashboard();
    else if (state.view === "account") loadAccountView();
  } catch (err) {
    showToast("Failed to delete category: " + err.message, "error");
  }
}

// ======================== INIT ========================
document.addEventListener("DOMContentLoaded", async function () {
  // Initialize SQLite database
  await AppDB.init();
  // Start the activity log (loads any queued records from previous sessions)
  Audit.init();

  const authScreen = document.getElementById("auth-screen");
  const loadingEl = document.getElementById("auth-loading");
  const loginForm = document.getElementById("login-form");

  // Show login form after DB is ready
  loadingEl.style.display = "none";

  // Check for existing session
  const savedUser = localStorage.getItem("mm_current_user");
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      // Verify user still exists in DB
      const dbUser = await AppDB.getUser(user.id);
      if (dbUser) {
        state.currentUser = dbUser;
        enterApp();
      }
    } catch (e) { /* fall through to login */ }
  }

  // Show login form (only when no session was restored)
  if (!state.currentUser) {
    loginForm.style.display = "block";
  }

  // Allow Enter key to submit forms
  document.getElementById("auth-login-password").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  document.getElementById("auth-reg-confirm").addEventListener("keydown", (e) => { if (e.key === "Enter") doRegister(); });

  // Navigation
  document.querySelectorAll(".nav-link[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.querySelectorAll(".bn-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Transaction modal
  document.getElementById("tx-type-income").addEventListener("click", () => { setTxType("income"); renderCategoryPicker("income", getSelectedCategory()); });
  document.getElementById("tx-type-expense").addEventListener("click", () => { setTxType("expense"); renderCategoryPicker("expense", getSelectedCategory()); });
  document.getElementById("tx-submit-btn").addEventListener("click", submitTransaction);

  // Budget modal
  document.getElementById("budget-recurring").addEventListener("change", toggleBudgetMonthWrap);
  document.getElementById("budget-submit-btn").addEventListener("click", submitBudget);

  // Category modal live preview listeners
  const catNameInput = document.getElementById("cat-name");
  if (catNameInput) {
    catNameInput.addEventListener("input", updateCategoryPreview);
  }
  document.querySelectorAll('input[name="cat-type-radio"]').forEach((radio) => {
    radio.addEventListener("change", updateCategoryPreview);
  });

  // Budget month nav
  document.getElementById("budget-prev-month").addEventListener("click", () => navigateBudgetMonth(-1));
  document.getElementById("budget-next-month").addEventListener("click", () => navigateBudgetMonth(1));

  // Report nav
  document.getElementById("report-prev-month").addEventListener("click", () => navigateReportMonth(-1));
  document.getElementById("report-next-month").addEventListener("click", () => navigateReportMonth(1));

  // Transaction filters
  ["txn-search", "txn-type-filter", "txn-category-filter", "txn-month-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyTransactionFilters);
  });
});

// Expose for inline onclick handlers
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doLogout = doLogout;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.openTransactionModal = openTransactionModal;
window.openBudgetModal = openBudgetModal;
window.openCategoryModal = openCategoryModal;
window.submitCategory = submitCategory;
window.deleteCustomCategory = deleteCustomCategory;
window.selectCategoryIcon = selectCategoryIcon;
window.selectCategoryColor = selectCategoryColor;
window.populateBudgetCategories = populateBudgetCategories;
window.loadCategoriesView = loadCategoriesView;
window.deleteTransaction = deleteTransaction;
window.deleteBudget = deleteBudget;
window.selectTxCategory = selectTxCategory;
window.switchView = switchView;
window.setReportTab = setReportTab;
window.exportDatabase = exportDatabase;
window.importDatabase = importDatabase;
window.loadAccountView = loadAccountView;
window.loadAuditView = loadAuditView;
window.syncAuditNow = syncAuditNow;
window.exportAuditLog = exportAuditLog;
window.clearAuditLog = clearAuditLog;
