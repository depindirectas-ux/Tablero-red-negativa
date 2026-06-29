const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

let dashboard = null;
let baseDashboard = null;
let selectedState = "";
let selectedTrendEvent = "__total__";
let selectedDailyEvents = ["__total__"];
let selectedMapDays = [];
let dailyEventMenuOpen = false;
let mexicoGeoJson = null;
let mexicoGeoJsonLoading = false;
const INDICATOR_COLORS = { 4: "#1F8A70", 3: "#F2994A", 2: "#F2C94C", 1: "#D64545", 0: "#BFC6C3" };

const loading = $("#loading");
const message = $("#message");
const weekStart = $("#weekStart");
const SAVED_DB = "redNegativaDashboardDb";
const SAVED_STORE = "saved";
const SAVED_SOURCE_KEY = "latestSource";
const SHARED_ENDPOINT = "/.netlify/functions/shared-dashboard";

function assetUrl(name) {
  return window.INLINE_ASSETS?.[name] || `assets/${name}`;
}

function hydrateInlineAssets() {
  const assetNames = ["imss-bienestar.png", "coordinacion.png", "vigilancia.png", "mundial.jpeg", "copa.jpeg"];
  for (const name of assetNames) {
    document.querySelectorAll(`img[src$="${name}"]`).forEach(image => {
      image.src = assetUrl(name);
    });
  }
}

function showMessage(text, type = "success") {
  if (!message) return;
  message.textContent = text;
  message.className = `message ${type}`;
  window.setTimeout(() => { message.className = "message"; }, 6000);
}

function openSavedDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador no permite guardar la base localmente."));
      return;
    }
    const request = indexedDB.open(SAVED_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SAVED_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No fue posible abrir el almacenamiento local."));
  });
}

async function savedDbGet(key) {
  if (!("indexedDB" in window) && "localStorage" in window) {
    const raw = localStorage.getItem(`${SAVED_DB}:${key}`);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await openSavedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVED_STORE, "readonly");
    const request = tx.objectStore(SAVED_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("No fue posible leer la base guardada."));
    tx.oncomplete = () => db.close();
  });
}

async function savedDbSet(key, value) {
  if (!("indexedDB" in window) && "localStorage" in window) {
    localStorage.setItem(`${SAVED_DB}:${key}`, JSON.stringify(value));
    return;
  }
  const db = await openSavedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVED_STORE, "readwrite");
    tx.objectStore(SAVED_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("No fue posible guardar la base.")); };
  });
}

function timestampValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

async function loadSavedDashboard(minUpdatedAt = "") {
  if (typeof window.buildDashboardFromSource !== "function") return false;
  try {
    const source = await savedDbGet(SAVED_SOURCE_KEY);
    if (!source?.headers?.length || !source?.records?.length) return false;
    if (minUpdatedAt && timestampValue(source.savedAt) <= timestampValue(minUpdatedAt)) return false;
    dashboard = window.buildDashboardFromSource(source, "");
    baseDashboard = dashboard;
    selectedState = "";
    selectedTrendEvent = "__total__";
    selectedDailyEvents = ["__total__"];
    selectedMapDays = [];
    render();
    showMessage(`Base guardada "${source.fileName || "base cargada"}" restaurada en este navegador.`);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

async function fetchSharedSource() {
  if (typeof window.buildDashboardFromSource !== "function") return null;
  try {
    const response = await fetch(SHARED_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.source?.headers?.length && payload?.source?.records?.length ? payload.source : null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function loadSharedDashboard() {
  const source = await fetchSharedSource();
  if (!source) return false;
  dashboard = window.buildDashboardFromSource(source, "");
  baseDashboard = dashboard;
  selectedState = "";
  selectedTrendEvent = "__total__";
  selectedDailyEvents = ["__total__"];
  selectedMapDays = [];
  render();
  showMessage(`Base compartida "${source.fileName || "base cargada"}" restaurada desde Netlify.`);
  return true;
}

async function saveSharedSource(source) {
  if (!source?.headers?.length || !source?.records?.length) return false;
  let token = window.RED_NEGATIVA_UPDATE_TOKEN || "";
  const headers = { "content-type": "application/json" };
  if (token) headers["x-update-token"] = token;
  let response = await fetch(SHARED_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ source }),
  });
  if (response.status === 404) return false;
  if (response.status === 401 && !token) {
    token = window.prompt("Clave para actualizar la base compartida en Netlify:");
    if (!token) return false;
    response = await fetch(SHARED_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-update-token": token },
      body: JSON.stringify({ source }),
    });
  }
  if (!response.ok) {
    let text = "No fue posible guardar la base compartida en Netlify.";
    try {
      const payload = await response.json();
      text = payload.error || text;
    } catch (error) {
      console.warn(error);
    }
    throw new Error(text);
  }
  return true;
}

function displayDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function saturdayStart(value) {
  const date = new Date(`${value}T12:00:00`);
  const mondayBased = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - ((mondayBased - 5 + 7) % 7));
  return isoDate(date);
}

function weekFromStart(start) {
  const startDate = new Date(`${saturdayStart(start)}T12:00:00`);
  const days = [];
  const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);
    days.push({
      iso: isoDate(current),
      weekday: names[current.getDay()],
      short: `${String(current.getDate()).padStart(2, "0")}/${String(current.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return { start: days[0].iso, end: days[6].iso, days };
}

function indicatorFromCaseDays(caseDays, excluded = false) {
  if (excluded) return { quartile: 0, indicator: "No incluido", color: "#BFC6C3", pct: 0 };
  if (caseDays >= 6) return { quartile: 4, indicator: "Sobresaliente", color: "#1F8A70", pct: 85 };
  if (caseDays >= 4) return { quartile: 3, indicator: "Adecuado", color: "#F2994A", pct: 57 };
  if (caseDays >= 2) return { quartile: 2, indicator: "Inadecuado", color: "#F2C94C", pct: 42 };
  return { quartile: 1, indicator: "Precario", color: "#D64545", pct: 0 };
}

function recalculateCoverageForWeek(start) {
  if (!dashboard?.coverageHistory?.length) return;
  const week = weekFromStart(start);
  const selectedSet = new Set(week.days.map(day => day.iso));
  const byState = new Map();
  const selected = selectedState || dashboard.selectedState || "";
  const states = selected ? [selected] : dashboard.states;

  for (const state of states) {
    byState.set(state, {
      state,
      selected: Boolean(selected && state === selected),
      days: week.days.map(day => ({ date: day.iso, hasRecord: false, count: 0, cases: 0 })),
    });
  }

  for (const item of dashboard.coverageHistory) {
    if (!selectedSet.has(item.date) || !byState.has(item.state)) continue;
    const row = byState.get(item.state);
    const day = row.days.find(cell => cell.date === item.date);
    if (!day) continue;
    day.hasRecord = Boolean(item.hasRecord);
    day.count = Number(item.count || 0);
    day.cases = Number(item.cases || 0);
  }

  dashboard.week = week;
  dashboard.coverage = Array.from(byState.values());
  dashboard.entityPerformance = buildPerformanceFromCoverage(dashboard.coverage);
  dashboard.topStates = dashboard.entityPerformance
    .filter(item => !item.excluded)
    .sort((a, b) => b.coveragePct - a.coveragePct || a.label.localeCompare(b.label, "es"));
}

function buildPerformanceFromCoverage(rows) {
  return (rows || []).map(row => {
    const expected = Math.max(row.days?.length || 0, 1);
    const records = (row.days || []).filter(day => day.hasRecord).length;
    const caseDays = (row.days || []).filter(day => (day.cases || 0) > 0).length;
    const totalCases = (row.days || []).reduce((sum, day) => sum + Number(day.cases || 0), 0);
    const rnDays = (row.days || []).filter(day => day.hasRecord && !(day.cases > 0)).length;
    const srDays = expected - records;
    const level = indicatorFromCaseDays(caseDays, Boolean(row.excluded));
    return {
      label: row.state,
      state: row.state,
      value: records,
      records,
      expected,
      caseDays,
      rnDays,
      srDays,
      totalCases,
      rawRecords: records,
      coveragePct: level.pct,
      quartile: level.quartile,
      indicator: level.indicator,
      color: level.color,
      stars: "★".repeat(level.quartile),
      selected: Boolean(row.selected),
      excluded: Boolean(row.excluded),
    };
  });
}

async function fetchDashboard(start = "") {
  let response = await fetch("dashboard.json", { cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible leer dashboard.json.");
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (text.trim().startsWith("<")) {
    throw new Error("Netlify está devolviendo HTML en lugar de dashboard.json. Vuelva a publicar el ZIP actualizado.");
  }
  const payload = JSON.parse(text);
  if (!response.ok) throw new Error(payload.error || "No fue posible leer la base.");
  dashboard = payload;
  baseDashboard = payload;
  if (selectedState) dashboard.selectedState = selectedState;
  if (start) recalculateCoverageForWeek(start);
  render();
}

function render() {
  $("#updatedAt").textContent = displayDate(dashboard.updatedAt);
  const fileName = $("#fileName");
  if (fileName) fileName.textContent = "";
  $("#reports").textContent = formatter.format(dashboard.kpis.reports);
  $("#cases").textContent = formatter.format(dashboard.kpis.cases);
  $("#outbreaks").textContent = formatter.format(dashboard.kpis.outbreaks);
  $("#deaths").textContent = formatter.format(dashboard.kpis.deaths);
  $("#dataRange").textContent = dashboard.dateRange.min
    ? `Periodo disponible: ${displayDate(dashboard.dateRange.min)} - ${displayDate(dashboard.dateRange.max)}`
    : "Periodo disponible: —";

  renderStateFilter();
  weekStart.value = dashboard.week.start;
  const weekLabel = $("#weekLabel");
  if (weekLabel) weekLabel.textContent = `Del ${displayDate(dashboard.week.start)} al ${displayDate(dashboard.week.end)}`;
  selectedMapDays = selectedMapDays.filter(day => dashboard.week.days.some(item => item.iso === day));
  if (!selectedMapDays.length) selectedMapDays = dashboard.week.days.map(day => day.iso);

  renderDailyEventFilter();
  renderDailyEventBars();
  renderEventBars("#casesChart", dashboard.topCases || [], "Enfermedades o eventos", "Número de casos");
  renderEventBars("#outbreaksChart", dashboard.topOutbreaks || [], "Enfermedades o eventos", "Número de brotes");
  renderEventBars("#deathsChart", dashboard.topDeaths || [], "Enfermedades o eventos", "Número de defunciones");
  renderTrendEventFilter();
  renderEventTrend();
  renderMapDayFilter();
  renderMexicoMap();
  renderQuartileScale();
  renderMapPeriod();
  renderDailyMosaic();
}

function renderStateFilter() {
  const select = $("#stateFilter");
  const current = selectedState || dashboard.selectedState || "";
  select.innerHTML = `<option value="">Todas las Coordinaciones estatales</option>` +
    dashboard.states.map(state => `<option value="${escapeHtml(state)}">${escapeHtml(state)}</option>`).join("");
  select.value = current;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

function niceAxisMax(value) {
  const max = Math.ceil(value || 0);
  if (max <= 4) return 4;
  return niceMax(max);
}

function integerTicks(max, target = 4) {
  const ceiling = Math.max(1, Math.ceil(max || 1));
  const step = Math.max(1, Math.ceil(ceiling / target));
  const ticks = [];
  for (let value = 0; value <= ceiling; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] !== ceiling) ticks.push(ceiling);
  return ticks;
}

function axisTicks(max, target = 4) {
  const ceiling = Math.max(1, max || 1);
  if (ceiling <= 8) return integerTicks(ceiling, target);
  const step = Math.ceil(ceiling / target);
  const ticks = [];
  for (let value = 0; value < ceiling; value += step) ticks.push(value);
  ticks.push(ceiling);
  return ticks;
}

function renderEventBars(selector, items, yLabel, xLabel) {
  const container = $(selector);
  if (!items.length) {
    container.innerHTML = '<div class="chart-empty">Sin datos para mostrar</div>';
    return;
  }
  const colors = dashboard.eventColors || {};
  const max = niceMax(Math.max(...items.map(item => item.value), 1));
  container.className = "chart event-bars";
  container.innerHTML = `<div class="bar-axis-y">${escapeHtml(yLabel)}</div><div class="bar-chart-body">` + items.map(item => {
    const color = colors[item.label] || item.color || "#006b59";
    return `<div class="bar-row event-row" title="${escapeHtml(item.label)}: ${formatter.format(item.value)}">
      <span class="bar-label"><i style="background:${color}"></i>${escapeHtml(item.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, item.value / max * 100)}%;background:${color}"></div></div>
      <span class="bar-value">${formatter.format(item.value)}</span>
    </div>`;
  }).join("") + `</div><div class="bar-axis-x">${escapeHtml(xLabel)}</div>`;
}

function renderStateRanking() {
  const container = $("#statesChart");
  const items = getSelectedPeriodPerformance();
  if (!items.length) {
    container.innerHTML = '<div class="chart-empty">Sin datos para mostrar</div>';
    return;
  }
  const selectedStateName = dashboard.selectedState || "";
  const labels = { 4: "Sobresaliente", 3: "Adecuado", 2: "Inadecuado", 1: "Precario" };
  const groups = [4, 3, 2, 1].map(stars => ({
    stars,
    states: items.filter(item => (item.quartile || 0) === stars),
  }));
  container.innerHTML = `<table class="stars-table">
    <thead><tr><th>Nivel</th><th>Estrellas</th><th>Coordinaciones estatales</th></tr></thead>
    <tbody>
      ${groups.map(group => `<tr>
        <td><strong>${labels[group.stars]}</strong></td>
        <td class="star-rating">${group.stars ? "★".repeat(group.stars) : "Sin estrella"}</td>
        <td>${group.states.length ? group.states.map(item => `<span class="state-chip ${selectedStateName && item.label !== selectedStateName ? "muted" : ""} ${item.label === selectedStateName ? "selected" : ""}" title="${escapeHtml(item.label)} · ${formatter.format(item.value)} de ${formatter.format(item.expected)} días · ${pctFormatter.format(item.coveragePct)}%">${escapeHtml(item.label)}</span>`).join("") : '<span class="empty-stars">Sin entidades</span>'}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function getSelectedPeriodPerformance() {
  const selectedDays = (dashboard.week?.days || []).map(day => day.iso);
  const expected = Math.max(selectedDays.length, 1);
  const coverageRows = dashboard.coverage || [];
  return coverageRows.map(row => {
    const records = row.days.filter(day => selectedDays.includes(day.date) && day.hasRecord).length;
    const totalCases = row.days.filter(day => selectedDays.includes(day.date)).reduce((sum, day) => sum + (day.cases || 0), 0);
    const caseDays = row.days.filter(day => selectedDays.includes(day.date) && (day.cases || 0) > 0).length;
    const rnDays = row.days.filter(day => selectedDays.includes(day.date) && day.hasRecord && (day.cases || 0) <= 0).length;
    const srDays = expected - records;
    const rnSrDays = rnDays + srDays;
    const quartile = caseDays >= 6 ? 4
      : caseDays >= 4 && caseDays <= 5 ? 3
      : caseDays >= 2 && caseDays <= 3 ? 2
      : 1;
    const indicator = ({ 4: "Sobresaliente", 3: "Adecuado", 2: "Inadecuado", 1: "Precario" })[quartile];
    return {
      label: row.state,
      state: row.state,
      value: records,
      records,
      expected,
      caseDays,
      rnDays,
      srDays,
      totalCases,
      coveragePct: ({ 4: 85, 3: 57, 2: 42, 1: 0 })[quartile],
      quartile,
      indicator,
      color: INDICATOR_COLORS[quartile],
      stars: records ? "★".repeat(quartile) : "",
      selected: row.selected,
    };
  }).sort((a, b) => b.coveragePct - a.coveragePct || a.label.localeCompare(b.label, "es"));
}

function renderDailyEventBars() {
  const container = $("#dailyDiseaseChart");
  const payload = dashboard.dailyDisease || { rows: [], dates: [] };
  if (!payload.rows?.length || !payload.dates?.length) {
    container.innerHTML = '<div class="chart-empty">Sin registros diarios de eventos para mostrar</div>';
    return;
  }
  const colors = dashboard.eventColors || {};
  const useAll = !selectedDailyEvents.length || selectedDailyEvents.includes("__total__");
  const sourceRows = useAll ? payload.rows : payload.rows.filter(row => selectedDailyEvents.includes(row.label));
  const legendRows = sourceRows.filter(row => row.values?.some(cell => (cell.value || 0) > 0));
  const stackColumns = useAll || sourceRows.length >= 2;
  const dayTotals = payload.dates.map((_, dateIndex) => sourceRows.reduce((sum, row) => sum + (row.values[dateIndex]?.value || 0), 0));
  const max = Math.max(...dayTotals, 1);
  const width = Math.max(900, payload.dates.length * 70);
  const height = 410;
  const left = 108, right = 26, top = 24, bottom = 86;
  const plotW = width - left - right, plotH = height - top - bottom;
  const dayStep = plotW / Math.max(payload.dates.length, 1);
  const groupW = Math.min(48, dayStep * .72);
  const singleBarW = stackColumns ? Math.min(34, groupW) : Math.max(12, Math.min(22, groupW / Math.max(sourceRows.length, 1) - 2));
  const xCenter = index => left + index * dayStep + dayStep / 2;
  const labelFor = text => String(text || "").length > 18 ? `${String(text).slice(0, 17)}...` : text;
  container.innerHTML = `
    <div class="axis-chart-wrap daily-axis-wrap">
      <div class="external-axis-y">Número de casos</div>
      <div class="daily-svg-shell">
        <svg class="daily-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Curva epidémica diaria por evento">
        <line class="daily-axis" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"></line>
        ${axisTicks(max).map(tickValue => {
          const yy = top + plotH - plotH * (tickValue / max);
          return `<g>
            <line class="daily-grid" x1="${left}" y1="${yy.toFixed(1)}" x2="${width - right}" y2="${yy.toFixed(1)}"></line>
            <text class="daily-y-label" x="${left - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${formatter.format(tickValue)}</text>
          </g>`;
        }).join("")}
        ${payload.dates.map((date, dateIndex) => {
          const total = dayTotals[dateIndex];
          const center = xCenter(dateIndex);
          if (stackColumns) {
            let offset = 0;
            const segments = sourceRows.map(row => {
              const cell = row.values[dateIndex] || { value: 0 };
              if (!cell.value) return "";
              const segmentH = total ? cell.value / max * plotH : 0;
              offset += segmentH;
              const color = colors[row.label] || row.color || "#006b59";
              return `<rect class="daily-segment-svg" x="${(center - singleBarW / 2).toFixed(1)}" y="${(top + plotH - offset).toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${Math.max(1, segmentH).toFixed(1)}" fill="${color}">
                <title>${escapeHtml(date.label)} · ${escapeHtml(row.label)} · Casos: ${formatter.format(cell.value)}</title>
              </rect>`;
            }).join("");
            return `<g>
              ${segments}
              <text class="daily-date-label" x="${center.toFixed(1)}" y="${height - 46}" text-anchor="middle">${date.label}</text>
            </g>`;
          }
          const startX = center - ((sourceRows.length * singleBarW) + ((sourceRows.length - 1) * 3)) / 2;
          return `<g>
            ${sourceRows.map((row, rowIndex) => {
              const cell = row.values[dateIndex] || { value: 0 };
              const value = cell.value || 0;
              if (!value) return "";
              const barH = value / max * plotH;
              const x = startX + rowIndex * (singleBarW + 3);
              const color = colors[row.label] || row.color || "#006b59";
              return `<g>
                <rect class="daily-bar-svg" x="${x.toFixed(1)}" y="${(top + plotH - Math.max(1, barH)).toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${Math.max(1, barH).toFixed(1)}" fill="${color}">
                  <title>${escapeHtml(date.label)} · ${escapeHtml(row.label)} · Casos: ${formatter.format(value)}</title>
                </rect>
              </g>`;
            }).join("")}
            <text class="daily-date-label" x="${center.toFixed(1)}" y="${height - 46}" text-anchor="middle">${date.label}</text>
          </g>`;
        }).join("")}
        </svg>
      </div>
      <div class="external-axis-x">Día de notificación</div>
    </div>
    <div class="event-color-legend">
      ${legendRows.map(row => `<span title="${escapeHtml(row.label)}"><i style="background:${colors[row.label] || row.color || "#006b59"}"></i>${escapeHtml(labelFor(row.label))}</span>`).join("")}
    </div>
    <p class="chart-note">La lista desplegable muestra el catálogo completo de enfermedades y eventos; si no hay registros, no se grafica información para esa selección.</p>`;
}
function renderDailyEventFilter() {
  const button = $("#dailyEventToggle");
  const menu = $("#dailyEventMenu");
  const selectedLabel = $("#selectedDailyEvents");
  if (!button || !menu) return;
  const rows = dashboard.dailyDisease?.rows || [];
  selectedDailyEvents = selectedDailyEvents.filter(value => value === "__total__" || rows.some(row => row.label === value));
  if (!selectedDailyEvents.length) {
    selectedDailyEvents = ["__total__"];
  }
  const options = [{ label: "Todas las enfermedades y eventos", value: "__total__" }]
    .concat(rows.map(row => ({ label: row.label, value: row.label, color: row.color || dashboard.eventColors?.[row.label] })));
  menu.innerHTML = options.map(option => {
    const checked = selectedDailyEvents.includes(option.value);
    const swatch = option.value === "__total__"
      ? '<i class="empty-swatch"></i>'
      : `<i style="background:${option.color || "#006b59"}"></i>`;
    return `<label class="multi-select-option">
      <input type="checkbox" value="${escapeHtml(option.value)}" ${checked ? "checked" : ""}>
      ${swatch}
      <span>${escapeHtml(option.label)}</span>
    </label>`;
  }).join("");
  menu.hidden = !dailyEventMenuOpen;
  button.setAttribute("aria-expanded", String(dailyEventMenuOpen));
  button.textContent = dailyEventSummary(rows);
  if (selectedLabel) {
    const selectedRows = rows.filter(row => selectedDailyEvents.includes(row.label));
    selectedLabel.innerHTML = selectedDailyEvents.includes("__total__")
      ? '<span>Todas las enfermedades y eventos</span>'
      : selectedRows.slice(0, 2).map(row => `<span><i style="background:${dashboard.eventColors?.[row.label] || row.color || "#006b59"}"></i>${escapeHtml(row.label)}</span>`).join("") +
        (selectedRows.length > 2 ? `<span>+${selectedRows.length - 2} más</span>` : "");
  }
}

function dailyEventSummary(rows) {
  if (!selectedDailyEvents.length || selectedDailyEvents.includes("__total__")) return "Todas las enfermedades y eventos";
  const selectedRows = rows.filter(row => selectedDailyEvents.includes(row.label));
  if (selectedRows.length === 1) return selectedRows[0].label;
  return `${selectedRows.length} enfermedades o eventos seleccionados`;
}

function updateDailyEventSelection(value, checked) {
  const rows = dashboard.dailyDisease?.rows || [];
  if (value === "__total__") {
    selectedDailyEvents = ["__total__"];
  } else {
    const current = selectedDailyEvents.filter(item => item !== "__total__");
    selectedDailyEvents = checked
      ? Array.from(new Set([...current, value]))
      : current.filter(item => item !== value);
    selectedDailyEvents = selectedDailyEvents.filter(item => rows.some(row => row.label === item));
    if (!selectedDailyEvents.length) selectedDailyEvents = ["__total__"];
  }
  dailyEventMenuOpen = false;
  renderDailyEventFilter();
  renderDailyEventBars();
}

function renderTrendEventFilter() {
  const select = $("#trendEventFilter");
  if (!select) return;
  const rows = dashboard.dailyEventTrend?.rows || [];
  const options = [`<option value="__total__">Todas las enfermedades y eventos</option>`]
    .concat(rows.map(row => `<option value="${escapeHtml(row.label)}">${escapeHtml(row.label)}</option>`));
  select.innerHTML = options.join("");
  if (selectedTrendEvent !== "__total__" && !rows.some(row => row.label === selectedTrendEvent)) {
    selectedTrendEvent = "__total__";
  }
  select.value = selectedTrendEvent;
}

function renderEventTrend() {
  const container = $("#trendChart");
  const payload = dashboard.dailyEventTrend || { rows: [], dates: [] };
  if (!payload.rows?.length || !payload.dates?.length) {
    container.innerHTML = '<div class="chart-empty">Sin datos para mostrar</div>';
    return;
  }
  const row = selectedTrendEvent === "__total__" ? null : payload.rows.find(item => item.label === selectedTrendEvent);
  const values = payload.dates.map((date, index) => ({
    label: date.label,
    brotes: row ? (row.values[index]?.outbreaks || 0) : payload.rows.reduce((sum, item) => sum + (item.values[index]?.outbreaks || 0), 0),
    defunciones: row ? (row.values[index]?.deaths || 0) : payload.rows.reduce((sum, item) => sum + (item.values[index]?.deaths || 0), 0),
  }));
  const maxDeaths = Math.max(...values.map(item => item.defunciones), 1);
  const maxOutbreaks = Math.max(...values.map(item => item.brotes), 1);
  const trendMax = niceAxisMax(Math.max(maxDeaths, maxOutbreaks));
  const color = row ? (dashboard.eventColors?.[row.label] || row.color || "#006b59") : "#006b59";
  const width = 840, height = 285, left = 96, right = 96, top = 18, bottom = 66;
  const plotW = width - left - right, plotH = height - top - bottom;
  const step = plotW / Math.max(values.length, 1);
  const barW = Math.max(8, Math.min(18, step * .42));
  const x = index => left + index * step + step / 2;
  const yDeaths = value => top + plotH - (value / trendMax * plotH);
  const yOutbreaks = value => top + plotH - (value / trendMax * plotH);
  const points = values.map((item, index) => `${x(index).toFixed(1)},${yOutbreaks(item.brotes).toFixed(1)}`).join(" ");
  container.innerHTML = `<div class="combo-chart">
    <div class="chart-legend trend-legend">
      <span><i style="background:${color}"></i>Defunciones</span>
      <span><i style="background:#f2c94c"></i>Brotes</span>
    </div>
    <div class="axis-chart-wrap trend-axis-wrap">
      <div class="external-axis-y trend-left-axis">Número de defunciones</div>
      <div class="combo-svg-shell">
        <svg class="combo-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia diaria de brotes y defunciones">
      ${integerTicks(trendMax).map(tick => {
        const yy = top + plotH - plotH * (tick / trendMax);
        return `<g>
          <line class="daily-grid" x1="${left}" y1="${yy.toFixed(1)}" x2="${width - right}" y2="${yy.toFixed(1)}"></line>
          <text class="combo-axis-label" x="${left - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${formatter.format(tick)}</text>
          <text class="combo-axis-label" x="${width - right + 8}" y="${(yy + 4).toFixed(1)}">${formatter.format(tick)}</text>
        </g>`;
      }).join("")}
      ${values.map((item, index) => {
        const barH = item.defunciones / trendMax * plotH;
        return `<rect class="death-bar" x="${(x(index) - barW / 2).toFixed(1)}" y="${(top + plotH - barH).toFixed(1)}" width="${barW}" height="${Math.max(1, barH).toFixed(1)}" fill="${color}">
          <title>${item.label} · Defunciones: ${formatter.format(item.defunciones)}</title>
        </rect>`;
      }).join("")}
      <polyline class="outbreak-line" points="${points}"/>
      ${values.map((item, index) => `<circle class="outbreak-dot" cx="${x(index).toFixed(1)}" cy="${yOutbreaks(item.brotes).toFixed(1)}" r="3.2">
        <title>${item.label} · Brotes: ${formatter.format(item.brotes)}</title>
      </circle>`).join("")}
      ${values.map((item, index) => `<text class="combo-date" x="${x(index).toFixed(1)}" y="${height - 34}" text-anchor="middle">${item.label}</text>`).join("")}
        </svg>
      </div>
      <div class="external-axis-y trend-right-axis">Número de brotes</div>
      <div class="external-axis-x">Día de notificación</div>
    </div>
  </div>`;
}

async function loadMexicoGeoJson() {
  if (mexicoGeoJson || mexicoGeoJsonLoading) return;
  if (window.INLINE_MEXICO_GEOJSON) {
    mexicoGeoJson = window.INLINE_MEXICO_GEOJSON;
    renderMexicoMap();
    return;
  }
  mexicoGeoJsonLoading = true;
  try {
    const response = await fetch("assets/mexico-states.geojson");
    mexicoGeoJson = await response.json();
    renderMexicoMap();
  } catch (error) {
    $("#mexicoMap").innerHTML = '<div class="chart-empty">No fue posible cargar el mapa de México</div>';
  } finally {
    mexicoGeoJsonLoading = false;
  }
}

function renderMexicoMap() {
  const container = $("#mexicoMap");
  if (!mexicoGeoJson) {
    container.innerHTML = '<div class="chart-empty">Cargando mapa de México...</div>';
    loadMexicoGeoJson();
    return;
  }
  const performance = new Map(getSelectedPeriodPerformance().map(item => [normalizeState(item.state || item.label), item]));
  const selected = dashboard.selectedState ? normalizeState(dashboard.selectedState) : "";
  const features = mexicoGeoJson.features || [];
  const bounds = getGeoBounds(features);
  const width = 760;
  const height = 520;
  const padding = 22;
  const scale = Math.min((width - padding * 2) / (bounds.maxX - bounds.minX), (height - padding * 2) / (bounds.maxY - bounds.minY));
  const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2;
  const project = ([lon, lat]) => [
    offsetX + (lon - bounds.minX) * scale,
    height - (offsetY + (lat - bounds.minY) * scale),
  ];
  container.innerHTML = `
    <svg class="mexico-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa de la República Mexicana por entidad federativa">
      ${features.map(feature => {
        const name = feature.properties?.name || "";
        const item = performance.get(normalizeState(name));
        const color = item?.color || "#bfc6c3";
        const isSelected = selected && selected === normalizeState(name);
        const muted = selected && !isSelected;
        const tooltip = item && item.quartile !== 0 ? `${name} · ${formatter.format(item.caseDays || 0)} de ${formatter.format(item.expected || 0)}` : "";
        return `<path class="state-path ${isSelected ? "selected" : ""} ${muted ? "muted" : ""}"
          d="${geometryToPath(feature.geometry, project)}" fill="${color}"${tooltip ? ` data-tooltip="${escapeHtml(tooltip)}"` : ""}></path>`;
      }).join("")}
    </svg>
    <div class="map-tooltip" id="mapTooltip" hidden></div>`;
  attachMapTooltip();
}

function attachMapTooltip() {
  const map = $("#mexicoMap");
  const tooltip = $("#mapTooltip");
  if (!map || !tooltip) return;
  map.querySelectorAll(".state-path").forEach(path => {
    path.addEventListener("mouseenter", () => {
      if (!path.dataset.tooltip) return;
      tooltip.textContent = path.dataset.tooltip;
      tooltip.hidden = false;
    });
    path.addEventListener("mousemove", event => {
      const rect = map.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 8}px`;
      tooltip.style.top = `${event.clientY - rect.top + 8}px`;
    });
    path.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });
  });
}

function geometryToPath(geometry, project) {
  if (!geometry) return "";
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(polygon => polygon.map(ring => ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ")).join(" ");
}

function getGeoBounds(features) {
  const points = [];
  const collect = (coords) => {
    if (typeof coords[0] === "number") points.push(coords);
    else coords.forEach(collect);
  };
  features.forEach(feature => collect(feature.geometry.coordinates));
  return {
    minX: Math.min(...points.map(point => point[0])),
    maxX: Math.max(...points.map(point => point[0])),
    minY: Math.min(...points.map(point => point[1])),
    maxY: Math.max(...points.map(point => point[1])),
  };
}

function renderQuartileScale() {
  const container = $("#quartileScale");
  const items = (dashboard.quartileScale || []).filter(item => item.quartile !== 0);
  if (!items.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `<strong>Cumplimiento del indicador</strong>
    ${items.map(item => {
      const range = item.min == null || item.max == null ? "No incluido" : `${formatter.format(item.min)} - ${formatter.format(item.max)} días con casos`;
      const cups = ({ 4: 3, 3: 2, 2: 1 })[item.quartile] || 0;
      return `<div class="scale-row">
      <i style="background:${item.color}"></i>
      <span>${escapeHtml(item.label)}:</span>
      <b>${escapeHtml(range)}</b>
      ${cups ? `<div class="cup-row">${Array.from({ length: cups }, () => `<img src="${assetUrl("copa.jpeg")}" alt="Copa Mundial 2026">`).join("")}</div>` : ""}
    </div>`;
    }).join("")}`;
}

function renderMapPeriod() {
  const period = $("#mapPeriod");
  if (period) {
    period.textContent = `Semana del ${displayDate(dashboard.week.start)} al ${displayDate(dashboard.week.end)}`;
  }
}

function renderMapDayFilter() {
  return;
}

function renderDailyMosaic() {
  const container = $("#dailyMosaic");
  if (!container) return;
  const rows = dashboard.coverage || [];
  container.innerHTML = `<div class="mosaic-shell"><table class="mosaic-table">
    <thead><tr><th>Coordinación estatal</th>${dashboard.week.days.map(day => `<th>${day.weekday}<br>${day.short}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(row => `<tr>
      <td>${escapeHtml(row.state)}</td>
      ${row.days.map(day => {
        const cases = day.cases || 0;
        const cls = cases > 0 ? "case" : day.hasRecord ? "rn" : "sr";
        const text = cases > 0 ? formatter.format(cases) : day.hasRecord ? "RN" : "SR";
        const title = cases > 0
          ? `${row.state} · ${day.date} · ${formatter.format(cases)} casos`
          : day.hasRecord ? `${row.state} · ${day.date} · RN` : `${row.state} · ${day.date} · SR`;
        return `<td class="mosaic-cell ${cls}" title="${escapeHtml(title)}">${text}</td>`;
      }).join("")}
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderCoverage() {
  const head = $("#coverageTable thead");
  const body = $("#coverageTable tbody");
  const period = $("#coveragePeriod");
  if (period) period.textContent = `Del ${displayDate(dashboard.week.start)} al ${displayDate(dashboard.week.end)}`;
  head.innerHTML = `<tr><th>Entidad</th>${dashboard.week.days.map(day =>
    `<th><strong>${day.weekday}</strong><br>${day.short}</th>`).join("")}</tr>`;
  const hasSelection = Boolean(dashboard.selectedState);
  body.innerHTML = dashboard.coverage.map(row => `
    <tr class="${hasSelection && !row.selected ? "muted-row" : ""} ${row.selected ? "selected-row" : ""}">
      <td>${escapeHtml(row.state)}</td>
      ${row.days.map(day => `<td class="coverage-cell ${day.hasRecord ? "covered" : "missing"}"
        title="${escapeHtml(row.state)} · ${day.date} · ${day.hasRecord ? "Con registro" : "Sin registro"}"></td>`).join("")}
    </tr>`).join("");
}

async function upload(file) {
  if (!file) return;
  if (typeof window.buildDashboardFromFile !== "function") {
    showMessage("No fue posible cargar el lector local de Excel. Vuelva a publicar el ZIP actualizado.", "error");
    return;
  }
  loading.hidden = false;
  try {
    dashboard = await window.buildDashboardFromFile(file);
    baseDashboard = dashboard;
    let sharedSaved = false;
    if (dashboard._clientSource) {
      try {
        await savedDbSet(SAVED_SOURCE_KEY, { ...dashboard._clientSource, savedAt: new Date().toISOString() });
      } catch (error) {
        console.warn(error);
        showMessage("La base se cargó, pero el navegador no permitió guardarla para futuras sesiones.", "error");
      }
      try {
        sharedSaved = await saveSharedSource(dashboard._clientSource);
        if (sharedSaved) {
          showMessage(`Base "${file.name}" cargada y guardada como versión compartida en Netlify.`);
        }
      } catch (error) {
        console.warn(error);
        showMessage(`La base se cargó en este navegador, pero no se guardó en el enlace compartido: ${error.message}`, "error");
      }
    }
    selectedState = "";
    selectedTrendEvent = "__total__";
    selectedDailyEvents = ["__total__"];
    selectedMapDays = [];
    render();
    if (!dashboard._clientSource || !sharedSaved) {
      showMessage(`Base "${file.name}" cargada y tablero actualizado en este navegador.`);
    }
  } catch (error) {
    showMessage(error.message || "No fue posible procesar la base.", "error");
  } finally {
    loading.hidden = true;
    const fileInput = $("#fileInput");
    if (fileInput) fileInput.value = "";
  }
}

function moveWeek(days) {
  const date = new Date(`${weekStart.value}T12:00:00`);
  date.setDate(date.getDate() + days);
  recalculateCoverageForWeek(date.toISOString().slice(0, 10));
  selectedMapDays = dashboard.week.days.map(day => day.iso);
  render();
}

function normalizeState(value) {
  const key = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return key === "mexico" ? "estado de mexico" : key;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function inlineComputedStyles(source, target) {
  const computed = window.getComputedStyle(source);
  target.setAttribute("style", Array.from(computed).map(name => `${name}:${computed.getPropertyValue(name)}`).join(";"));
  Array.from(source.children).forEach((child, index) => {
    if (target.children[index]) inlineComputedStyles(child, target.children[index]);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("No fue posible leer una imagen."));
    reader.readAsDataURL(blob);
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(`${label} tardó demasiado en generarse.`)), ms)),
  ]);
}

async function embedCloneImages(clone) {
  const images = Array.from(clone.querySelectorAll("img"));
  await Promise.all(images.map(async image => {
    try {
      const response = await fetch(image.src, { cache: "force-cache" });
      if (!response.ok) return;
      image.src = await blobToDataUrl(await response.blob());
    } catch (error) {
      // Si una imagen no puede incrustarse, se conserva su ruta original.
    }
  }));
}

function fileSafeName(value, fallback = "recuadro") {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function panelTitle(element) {
  return element.querySelector("h3")?.textContent?.trim()
    || element.querySelector("h2")?.textContent?.trim()
    || element.querySelector(".panel-title span")?.textContent?.trim()
    || element.id
    || "recuadro";
}

async function elementToPng(element) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const clone = element.cloneNode(true);
  inlineComputedStyles(element, clone);
  await embedCloneImages(clone);
  clone.style.background = "#ffffff";
  clone.style.boxSizing = "border-box";
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.overflow = "visible";
  clone.querySelectorAll(".multi-select-menu").forEach(menu => { menu.hidden = true; });

  const frame = document.createElement("div");
  frame.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  frame.style.background = "#ffffff";
  frame.style.boxSizing = "border-box";
  frame.style.color = "#20312d";
  frame.style.fontFamily = '"Noto Sans Local", "Noto Sans", Arial, sans-serif';
  frame.style.padding = "18px";
  frame.style.width = `${width + 36}px`;
  frame.appendChild(clone);

  const source = document.createElement("div");
  source.textContent = "Fuente: Tablero de Red diaria en la Copa mundial de fútbol 2026 en IMSS-BIENESTAR.";
  source.style.borderTop = "1px solid #dce4e0";
  source.style.color = "#66736f";
  source.style.fontSize = "12px";
  source.style.fontWeight = "700";
  source.style.marginTop = "14px";
  source.style.paddingTop = "10px";
  frame.appendChild(source);

  const exportWidth = width + 36;
  const exportHeight = height + 78;
  const serialized = new XMLSerializer().serializeToString(frame);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}">
    <foreignObject width="100%" height="100%">${serialized}</foreignObject>
  </svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("No fue posible renderizar una sección como PNG."));
    }, 8000);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth * 2;
      canvas.height = exportHeight * 2;
      const context = canvas.getContext("2d");
      context.scale(2, 2);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, exportWidth, exportHeight);
      context.drawImage(image, 0, 0, exportWidth, exportHeight);
      URL.revokeObjectURL(url);
      canvas.toBlob(png => {
        window.clearTimeout(timer);
        png ? resolve(png) : reject(new Error("No fue posible crear el PNG."));
      }, "image/png");
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("No fue posible renderizar una sección como PNG."));
    };
    image.src = url;
  });
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = dosTimestamp();
  const u16 = value => new Uint8Array([value & 255, (value >>> 8) & 255]);
  const u32 = value => new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(now.time), ...u16(now.day),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
      ...nameBytes,
    ]);
    chunks.push(local, data);
    central.push({
      nameBytes,
      crc,
      size: data.length,
      offset,
    });
    offset += local.length + data.length;
  }

  let centralSize = 0;
  for (const file of central) {
    const entry = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(now.time), ...u16(now.day),
      ...u32(file.crc), ...u32(file.size), ...u32(file.size), ...u16(file.nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(file.offset), ...file.nameBytes,
    ]);
    chunks.push(entry);
    centralSize += entry.length;
  }
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  chunks.push(end);
  return new Blob(chunks, { type: "application/zip" });
}

async function saveDashboardAssets() {
  const stamp = new Date().toISOString().slice(0, 10);
  const targetSelectors = [
    ["Resumen de Coordinaciones estatales", ".kpi-grid"],
    [null, "#eventos-diarios"],
    [null, "#casos-eventos"],
    [null, "#brotes-eventos"],
    [null, "#defunciones-eventos"],
    [null, "#tendencia-diaria"],
    [null, "#mapa"],
    [null, "#mosaico-diario"],
  ];
  try {
    showMessage("Preparando imágenes PNG y archivo ZIP...");
    const files = [];
    let index = 1;
    for (const [customTitle, selector] of targetSelectors) {
      const element = $(selector);
      if (!element) continue;
      const title = customTitle || panelTitle(element);
      const name = `${String(index).padStart(2, "0")}_${fileSafeName(title)}_${stamp}.png`;
      try {
        files.push({ name, blob: await withTimeout(elementToPng(element), 10000, title) });
      } catch (error) {
        console.warn(error);
      }
      index += 1;
    }
    if (!files.length) throw new Error("No fue posible generar imágenes PNG del tablero.");
    const zip = await createZip(files);
    const url = URL.createObjectURL(zip);
    const link = document.createElement("a");
    link.href = url;
    link.download = `imagenes_tablero_red_negativa_${stamp}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    showMessage("Archivo ZIP generado con las imágenes PNG independientes.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

window.__dashboardExportForTest = {
  elementToPng,
  panelTitle,
  fileSafeName,
};

$("#previousWeek")?.addEventListener("click", () => moveWeek(-7));
$("#nextWeek")?.addEventListener("click", () => moveWeek(7));
weekStart?.addEventListener("change", () => {
  recalculateCoverageForWeek(weekStart.value);
  selectedMapDays = dashboard.week.days.map(day => day.iso);
  render();
});
$("#stateFilter")?.addEventListener("change", event => {
  selectedState = event.target.value;
  const currentWeek = weekStart.value;
  if (dashboard?._clientSource && typeof window.buildDashboardFromSource === "function") {
    dashboard = window.buildDashboardFromSource(dashboard._clientSource, selectedState);
    baseDashboard = selectedState ? baseDashboard : dashboard;
  } else if (baseDashboard?.stateDashboards) {
    dashboard = selectedState ? baseDashboard.stateDashboards[selectedState] : baseDashboard;
  }
  dashboard.selectedState = selectedState;
  if (currentWeek) recalculateCoverageForWeek(currentWeek);
  selectedMapDays = dashboard.week.days.map(day => day.iso);
  render();
});
$("#trendEventFilter")?.addEventListener("change", event => {
  selectedTrendEvent = event.target.value;
  renderEventTrend();
});
$("#dailyEventToggle")?.addEventListener("click", () => {
  dailyEventMenuOpen = !dailyEventMenuOpen;
  renderDailyEventFilter();
});
$("#dailyEventMenu")?.addEventListener("change", event => {
  if (event.target.matches('input[type="checkbox"]')) {
    updateDailyEventSelection(event.target.value, event.target.checked);
  }
});
$("#mapDayFilter")?.addEventListener("change", event => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const value = event.target.value;
  selectedMapDays = event.target.checked
    ? Array.from(new Set([...selectedMapDays, value]))
    : selectedMapDays.filter(day => day !== value);
  if (!selectedMapDays.length) {
    selectedMapDays = dashboard.week.days.map(day => day.iso);
    renderMapDayFilter();
  }
  renderMexicoMap();
  renderMapPeriod();
});
document.addEventListener("click", event => {
  const wrapper = event.target.closest(".daily-select");
  if (!wrapper && dailyEventMenuOpen) {
    dailyEventMenuOpen = false;
    renderDailyEventFilter();
  }
});
$("#uploadButton")?.addEventListener("click", () => $("#fileInput")?.click());
$("#fileInput")?.addEventListener("change", event => upload(event.target.files?.[0]));

hydrateInlineAssets();
(async function initDashboard() {
  try {
    await fetchDashboard();
    const sharedLoaded = await loadSharedDashboard();
    if (!sharedLoaded) await loadSavedDashboard(dashboard?.updatedAt);
  } catch (error) {
    showMessage(error.message, "error");
  }
})();

