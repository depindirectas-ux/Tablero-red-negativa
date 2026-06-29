const CLIENT_STATES = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
  "Durango", "Estado de México", "Guanajuato", "Guerrero", "Hidalgo",
  "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca",
  "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa",
  "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
  "Zacatecas",
];

const CLIENT_EXCLUDED = new Set([
  "aguascalientes", "chihuahua", "coahuila", "durango",
  "jalisco", "nuevo leon", "queretaro", "guanajuato",
]);

const CLIENT_EVENT_CATALOG = [
  "Sarampión o Rubéola",
  "Enfermedad Respiratoria Viral",
  "Mpox",
  "EDA",
  "Cólera",
  "Dengue",
  "Fiebre Chikungunya",
  "Enfermedad por virus Zika",
  "Fiebre Amarilla",
  "Paludismo",
  "Rickettsiosis",
  "Miasis por C. hominivorax",
  "Poliomielitis",
  "Rabia humana",
  "Difteria",
  "Tos ferina",
  "Meningitis meningocócica",
  "Fiebre Oropuche",
  "Enfermedad de Lyme",
  "Encefalitis japonesa",
  "Ébola",
  "Marburgo",
  "Hantavirus",
  "Bacillus anthracis",
  "Francisella tularensis",
  "Brucella spp.",
  "Yersinia pestis",
  "Burkholderia pseudomallei",
  "Coxiella burnetii",
  "Influenza Zoonótica",
  "Fiebre de Mayaro",
  "Fiebre del Nilo Occidental",
  "Hepatitis virales",
  "Infección por VIH",
  "Golpe de calor",
  "Deshidratación",
  "Quemaduras",
  "Intoxicación por ponzoña de Alacrán",
  "Intoxicación por ponzoña de Araña viuda negra",
  "Intoxicación por ponzoña de Serpiente Cascabel",
  "Intoxicación por ponzoña de Araña violinista",
  "Intoxicación por ponzoña de Serpiente coral",
  "Consumo de sustancias (opiáceos-fentanilo)",
  "Sífilis",
  "Uretritis y cervicitis gonocócica",
  "Hantavirus vinculado a viajes en cruceros",
  "Clostridium botulinum",
];

const CLIENT_COLORS = [
  "#006B59", "#611232", "#A57F2C", "#2563EB", "#DC2626", "#7C3AED",
  "#EA580C", "#0891B2", "#BE185D", "#65A30D", "#9333EA", "#0F766E",
  "#B45309", "#1D4ED8", "#B91C1C", "#047857", "#C026D3", "#0E7490",
  "#4338CA", "#CA8A04", "#15803D", "#E11D48", "#0369A1", "#A21CAF",
  "#4D7C0F", "#9F1239", "#1E40AF", "#854D0E", "#7E22CE", "#155E75",
  "#BE123C", "#3F6212", "#7C2D12", "#0D9488", "#6D28D9", "#D97706",
  "#059669", "#DB2777", "#0284C7", "#84CC16", "#F97316", "#14B8A6",
  "#8B5CF6", "#EF4444", "#22C55E", "#F59E0B", "#06B6D4", "#A855F7",
  "#F43F5E", "#10B981", "#3B82F6", "#EAB308", "#EC4899", "#6366F1",
  "#78350F", "#164E63", "#701A75", "#14532D", "#991B1B", "#312E81",
];

function clientNormalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const CLIENT_EVENT_CATALOG_BY_KEY = Object.fromEntries(CLIENT_EVENT_CATALOG.map(event => [clientNormalize(event), event]));
const CLIENT_EVENT_ALIASES = {
  sarampion: "Sarampión o Rubéola",
  "sarampion o rubeola": "Sarampión o Rubéola",
  "sarampion rubeola": "Sarampión o Rubéola",
  rubeola: "Sarampión o Rubéola",
  "enfermedad respiratoria viral": "Enfermedad Respiratoria Viral",
  covid: "Enfermedad Respiratoria Viral",
  "covid-19": "Enfermedad Respiratoria Viral",
  "covid 19": "Enfermedad Respiratoria Viral",
  influenza: "Enfermedad Respiratoria Viral",
  vsr: "Enfermedad Respiratoria Viral",
  salmonela: "EDA",
  shigela: "EDA",
  norovirus: "EDA",
  rotavirus: "EDA",
  poliomelitis: "Poliomielitis",
  "brucella spp": "Brucella spp.",
  "paludismo p vivax": "Paludismo",
  "paludismo p falciparum": "Paludismo",
  "hepatitis viral a": "Hepatitis virales",
  "hepatitis viral c": "Hepatitis virales",
};

function clientCanonicalState(value) {
  const key = clientNormalize(value);
  if (!key) return "";
  const aliases = {
    cdmx: "Ciudad de México",
    "ciudad de mexico": "Ciudad de México",
    "distrito federal": "Ciudad de México",
    mexico: "Estado de México",
    "estado de mexico": "Estado de México",
    "edo de mexico": "Estado de México",
    "edo mexico": "Estado de México",
    "coahuila de zaragoza": "Coahuila",
    "michoacan de ocampo": "Michoacán",
    "veracruz de ignacio de la llave": "Veracruz",
  };
  if (aliases[key]) return aliases[key];
  return CLIENT_STATES.find(state => clientNormalize(state) === key) || String(value || "").trim();
}

function clientNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clientExcelDate(serial) {
  const days = Number(serial);
  if (!Number.isFinite(days)) return "";
  const utc = Date.UTC(1899, 11, 30) + Math.round(days * 86400000);
  return new Date(utc).toISOString().slice(0, 10);
}

function clientParseDate(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") return clientExcelDate(value);
  const text = String(value).trim();
  if (!text) return "";
  const leading = text.slice(0, 10).replace(/-/g, "/");
  const parts = leading.split("/");
  if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
    let [a, b, c] = parts.map(Number);
    if (c < 100) c += 2000;
    const candidates = [[a, b], [b, a]]
      .map(([day, month]) => new Date(Date.UTC(c, month - 1, day)))
      .filter(date => date.getUTCFullYear() === c);
    if (candidates.length) return candidates[0].toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function clientColNumber(col) {
  return col.toUpperCase().split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
}

function clientColIndexFromRef(ref) {
  const letters = String(ref || "").match(/[A-Z]+/i)?.[0] || "A";
  return clientColNumber(letters) - 1;
}

function clientEventColumns(headers, startCol, endCol) {
  const start = clientColNumber(startCol) - 1;
  const end = Math.min(clientColNumber(endCol) - 1, headers.length - 1);
  if (start > end) return [];
  return headers.slice(start, end + 1).filter(Boolean);
}

function clientBaseEventName(header) {
  return String(header || "").replace(/\u00a0/g, " ").trim().replace(/\s*[12]\s*$/, "").trim();
}

function clientCanonicalEventName(header) {
  const key = clientNormalize(clientBaseEventName(header));
  return CLIENT_EVENT_ALIASES[key] || CLIENT_EVENT_CATALOG_BY_KEY[key] || "";
}

function clientFilterEventHeaders(headers) {
  return headers.filter(header => clientCanonicalEventName(header));
}

function clientEventColor(index) {
  if (index < CLIENT_COLORS.length) return CLIENT_COLORS[index];
  const hue = (index * 137) % 360;
  return `hsl(${hue}, 72%, 38%)`;
}

function clientSumRecord(record, headers) {
  return headers.reduce((sum, header) => sum + clientNumber(record[header]), 0);
}

function clientTopFromTotals(totals) {
  return Object.entries(totals)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}

function clientSaturdayStart(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const mondayBased = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - ((mondayBased - 5 + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function clientWeek(start) {
  const startDate = new Date(`${clientSaturdayStart(start)}T12:00:00`);
  const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      weekday: names[d.getDay()],
      short: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return { start: days[0].iso, end: days[6].iso, days };
}

function clientIndicator(caseDays, excluded = false) {
  if (excluded) return { quartile: 0, indicator: "No incluido", color: "#BFC6C3", pct: 0 };
  if (caseDays >= 6) return { quartile: 4, indicator: "Sobresaliente", color: "#1F8A70", pct: 85 };
  if (caseDays >= 4) return { quartile: 3, indicator: "Adecuado", color: "#F2994A", pct: 57 };
  if (caseDays >= 2) return { quartile: 2, indicator: "Inadecuado", color: "#F2C94C", pct: 42 };
  return { quartile: 1, indicator: "Precario", color: "#D64545", pct: 0 };
}

function clientFindHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const normalized = new Set(rows[i].map(clientNormalize));
    if ((normalized.has("entidad") || normalized.has("coordinacion estatal")) && normalized.has("fecha")) return i;
  }
  throw new Error("No se encontró una fila de encabezados con Entidad y Fecha.");
}

function clientRowsToRecords(rawRows) {
  const headerIndex = clientFindHeaderRow(rawRows);
  const headers = rawRows[headerIndex].map(value => String(value ?? "").trim());
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const records = [];
  for (const row of rawRows.slice(headerIndex + 1)) {
    if (!row.slice(0, headers.length).some(value => value != null && value !== "")) continue;
    const record = {};
    headers.forEach((header, index) => { record[header] = row[index] ?? ""; });
    records.push(record);
  }
  return { headers, records };
}

function clientParseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

function clientUint32(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function clientUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

async function clientInflateRaw(data) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Este navegador no puede descomprimir XLSX localmente. Use Chrome o Edge actualizado.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function clientReadZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (clientUint32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El XLSX no tiene estructura ZIP válida.");
  const count = clientUint16(bytes, eocd + 10);
  const centralOffset = clientUint32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const entries = {};
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (clientUint32(bytes, cursor) !== 0x02014b50) break;
    const method = clientUint16(bytes, cursor + 10);
    const compressedSize = clientUint32(bytes, cursor + 20);
    const nameLength = clientUint16(bytes, cursor + 28);
    const extraLength = clientUint16(bytes, cursor + 30);
    const commentLength = clientUint16(bytes, cursor + 32);
    const localOffset = clientUint32(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = clientUint16(bytes, localOffset + 26);
    const localExtraLength = clientUint16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    entries[name] = method === 0 ? compressed : await clientInflateRaw(compressed);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function clientXml(bytes) {
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
}

function clientXmlText(node) {
  return Array.from(node.getElementsByTagName("t")).map(t => t.textContent || "").join("");
}

async function clientReadXlsx(file) {
  const entries = await clientReadZip(await file.arrayBuffer());
  const workbook = clientXml(entries["xl/workbook.xml"]);
  const rels = clientXml(entries["xl/_rels/workbook.xml.rels"]);
  const relMap = new Map(Array.from(rels.getElementsByTagName("Relationship")).map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
  const sheets = Array.from(workbook.getElementsByTagName("sheet"));
  const sheet = sheets.find(item => clientNormalize(item.getAttribute("name")) === "base") || sheets[0];
  if (!sheet) throw new Error("El archivo no contiene hojas.");
  const rid = sheet.getAttribute("r:id") || sheet.getAttribute("id");
  let target = relMap.get(rid) || "worksheets/sheet1.xml";
  target = target.replace(/^\/?xl\//, "");
  const sheetPath = `xl/${target}`;
  if (!entries[sheetPath]) throw new Error("No fue posible leer la hoja BASE del XLSX.");
  const shared = entries["xl/sharedStrings.xml"]
    ? Array.from(clientXml(entries["xl/sharedStrings.xml"]).getElementsByTagName("si")).map(clientXmlText)
    : [];
  const sheetXml = clientXml(entries[sheetPath]);
  const rows = [];
  for (const rowNode of Array.from(sheetXml.getElementsByTagName("row"))) {
    const row = [];
    for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
      const index = clientColIndexFromRef(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "s") {
        value = shared[Number(cell.getElementsByTagName("v")[0]?.textContent || 0)] || "";
      } else if (type === "inlineStr") {
        value = clientXmlText(cell);
      } else {
        value = cell.getElementsByTagName("v")[0]?.textContent || "";
        if (value !== "" && !Number.isNaN(Number(value))) value = Number(value);
      }
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}

function clientSummarize(records, headers) {
  const totals = {};
  for (const record of records) {
    for (const header of headers) {
      const name = clientCanonicalEventName(header);
      if (name) totals[name] = (totals[name] || 0) + clientNumber(record[header]);
    }
  }
  return totals;
}

function clientDailyDisease(records, headers, dateCol, colors, eventCatalog = []) {
  const totals = {}, byDateEvent = new Map(), dateSet = new Set();
  for (const record of records) {
    const iso = clientParseDate(record[dateCol]);
    if (!iso) continue;
    dateSet.add(iso);
    if (!byDateEvent.has(iso)) byDateEvent.set(iso, {});
    for (const header of headers) {
      const value = clientNumber(record[header]);
      if (!value) continue;
      const name = clientCanonicalEventName(header);
      if (!name) continue;
      totals[name] = (totals[name] || 0) + value;
      byDateEvent.get(iso)[name] = (byDateEvent.get(iso)[name] || 0) + value;
    }
  }
  const dates = Array.from(dateSet).sort();
  const events = [...eventCatalog].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));
  return {
    events,
    dates: dates.map(iso => ({ iso, label: iso.slice(8, 10) + "/" + iso.slice(5, 7) })),
    rows: events.map(event => ({
      label: event,
      color: colors[event] || "#006B59",
      values: dates.map(iso => ({ date: iso, label: iso.slice(8, 10) + "/" + iso.slice(5, 7), value: Math.round((byDateEvent.get(iso)?.[event] || 0) * 100) / 100 })),
    })),
  };
}

function clientDailyEventTrend(records, outbreakHeaders, deathHeaders, dateCol, colors, eventCatalog = []) {
  const totals = {}, byDateEvent = new Map(), dateSet = new Set();
  for (const record of records) {
    const iso = clientParseDate(record[dateCol]);
    if (!iso) continue;
    dateSet.add(iso);
    if (!byDateEvent.has(iso)) byDateEvent.set(iso, {});
    for (const [headers, kind] of [[outbreakHeaders, "outbreaks"], [deathHeaders, "deaths"]]) {
      for (const header of headers) {
        const value = clientNumber(record[header]);
        if (!value) continue;
        const name = clientCanonicalEventName(header);
        if (!name) continue;
        totals[name] ||= { outbreaks: 0, deaths: 0 };
        byDateEvent.get(iso)[name] ||= { outbreaks: 0, deaths: 0 };
        totals[name][kind] += value;
        byDateEvent.get(iso)[name][kind] += value;
      }
    }
  }
  const dates = Array.from(dateSet).sort();
  const events = [...eventCatalog].sort((a, b) => {
    const totalA = (totals[a]?.outbreaks || 0) + (totals[a]?.deaths || 0);
    const totalB = (totals[b]?.outbreaks || 0) + (totals[b]?.deaths || 0);
    return totalB - totalA;
  });
  return {
    events,
    dates: dates.map(iso => ({ iso, label: iso.slice(8, 10) + "/" + iso.slice(5, 7) })),
    rows: events.map(event => ({
      label: event,
      color: colors[event] || "#006B59",
      values: dates.map(iso => ({
        date: iso,
        label: iso.slice(8, 10) + "/" + iso.slice(5, 7),
        outbreaks: Math.round((byDateEvent.get(iso)?.[event]?.outbreaks || 0) * 100) / 100,
        deaths: Math.round((byDateEvent.get(iso)?.[event]?.deaths || 0) * 100) / 100,
      })),
    })),
  };
}

function clientBuildDashboard(headers, records, fileName, stateFilter = "") {
  const lookup = Object.fromEntries(headers.filter(Boolean).map(header => [clientNormalize(header), header]));
  const entityCol = lookup.entidad || lookup["coordinacion estatal"];
  const dateCol = lookup.fecha;
  const finalDateCol = lookup["hora de finalizacion"] || lookup["fecha de finalizacion"] || dateCol;
  if (!entityCol || !dateCol) throw new Error("La base debe contener las columnas Entidad y Fecha.");

  const caseHeaders = clientFilterEventHeaders(clientEventColumns(headers, "J", "BD"));
  const outbreakHeaders = clientFilterEventHeaders(clientEventColumns(headers, "BG", "CQ"));
  const deathHeaders = clientFilterEventHeaders(clientEventColumns(headers, "CT", "EV"));
  const reportingStates = CLIENT_STATES.filter(state => !CLIENT_EXCLUDED.has(clientNormalize(state)));
  const selectedState = stateFilter ? clientCanonicalState(stateFilter) : "";

  const eventNames = [...CLIENT_EVENT_CATALOG];
  const eventColors = Object.fromEntries(eventNames.map((name, index) => [name, clientEventColor(index)]));

  const filteredRecords = [];
  const datesFound = [], cutoffDates = [];
  const coverage = new Map(), casesByStateDate = new Map(), recordsByState = {};
  const byDate = new Map();
  for (const record of records) {
    const state = clientCanonicalState(record[entityCol]);
    const finalDate = clientParseDate(record[finalDateCol]);
    const recordDate = finalDate || clientParseDate(record[dateCol]);
    if (finalDate) cutoffDates.push(finalDate);
    if (!state || !recordDate) continue;
    recordsByState[state] = (recordsByState[state] || 0) + 1;
    if (CLIENT_EXCLUDED.has(clientNormalize(state))) continue;
    datesFound.push(recordDate);
    const key = `${state}|${recordDate}`;
    coverage.set(key, (coverage.get(key) || 0) + 1);
    casesByStateDate.set(key, (casesByStateDate.get(key) || 0) + clientSumRecord(record, caseHeaders));
    if (selectedState && state !== selectedState) continue;
    filteredRecords.push(record);
    const by = byDate.get(recordDate) || { cases: 0, outbreaks: 0, deaths: 0 };
    by.cases += clientSumRecord(record, caseHeaders);
    by.outbreaks += clientSumRecord(record, outbreakHeaders);
    by.deaths += clientSumRecord(record, deathHeaders);
    byDate.set(recordDate, by);
  }

  const latest = datesFound.length ? datesFound.sort().at(-1) : new Date().toISOString().slice(0, 10);
  const week = clientWeek(clientSaturdayStart(latest));
  const allDates = Array.from(new Set([...datesFound, ...cutoffDates])).sort();
  const coverageHistory = [];
  for (const state of reportingStates) {
    for (const iso of allDates) {
      const key = `${state}|${iso}`;
      coverageHistory.push({ state, date: iso, hasRecord: coverage.has(key), count: coverage.get(key) || 0, cases: Math.round((casesByStateDate.get(key) || 0) * 100) / 100 });
    }
  }
  const coverageStates = selectedState ? [selectedState] : reportingStates;
  const coverageRows = coverageStates.map(state => ({
    state,
    selected: Boolean(selectedState && state === selectedState),
    days: week.days.map(day => {
      const key = `${state}|${day.iso}`;
      return { date: day.iso, hasRecord: coverage.has(key), count: coverage.get(key) || 0, cases: Math.round((casesByStateDate.get(key) || 0) * 100) / 100 };
    }),
  }));
  const performance = coverageRows.map(row => {
    const caseDays = row.days.filter(day => day.cases > 0).length;
    const records = row.days.filter(day => day.hasRecord).length;
    const totalCases = row.days.reduce((sum, day) => sum + day.cases, 0);
    const level = clientIndicator(caseDays);
    return { label: row.state, state: row.state, value: records, records, rawRecords: recordsByState[row.state] || 0, expected: 7, caseDays, totalCases, coveragePct: level.pct, quartile: level.quartile, indicator: level.indicator, color: level.color, stars: "★".repeat(level.quartile), selected: false, excluded: false };
  });

  const caseTotals = clientSummarize(filteredRecords, caseHeaders);
  const outbreakTotals = clientSummarize(filteredRecords, outbreakHeaders);
  const deathTotals = clientSummarize(filteredRecords, deathHeaders);
  const trend = Array.from(byDate.entries()).sort().map(([iso, values]) => ({ date: iso, label: iso.slice(8, 10) + "/" + iso.slice(5, 7), cases: values.cases, outbreaks: values.outbreaks, deaths: values.deaths }));
  return {
    selectedState,
    states: reportingStates,
    updatedAt: new Date().toISOString(),
    fileName,
    recordCount: filteredRecords.length,
    stateCount: new Set(filteredRecords.map(record => clientCanonicalState(record[entityCol]))).size,
    kpis: { reports: filteredRecords.length, cases: clientSumRecord(Object.fromEntries(Object.entries(caseTotals)), Object.keys(caseTotals)), outbreaks: clientSumRecord(Object.fromEntries(Object.entries(outbreakTotals)), Object.keys(outbreakTotals)), deaths: clientSumRecord(Object.fromEntries(Object.entries(deathTotals)), Object.keys(deathTotals)) },
    dateRange: { min: "2026-06-10", max: [...datesFound, ...cutoffDates].sort().at(-1) || latest },
    week,
    coverage: coverageRows,
    coverageHistory,
    trend,
    topStates: performance.sort((a, b) => b.coveragePct - a.coveragePct || a.label.localeCompare(b.label, "es")),
    topCases: clientTopFromTotals(caseTotals),
    topOutbreaks: clientTopFromTotals(outbreakTotals),
    topDeaths: clientTopFromTotals(deathTotals),
    topEvents: clientTopFromTotals(caseTotals),
    eventColors,
    entityPerformance: performance,
    quartileScale: [
      { quartile: 4, label: "Sobresaliente", color: "#1F8A70", min: 6, max: 7 },
      { quartile: 3, label: "Adecuado", color: "#F2994A", min: 4, max: 5 },
      { quartile: 2, label: "Inadecuado", color: "#F2C94C", min: 2, max: 3 },
      { quartile: 1, label: "Precario", color: "#D64545", min: 0, max: 1 },
      { quartile: 0, label: "No incluido", color: "#BFC6C3", min: null, max: null },
    ],
    dailyDisease: clientDailyDisease(filteredRecords, caseHeaders, finalDateCol, eventColors, eventNames),
    dailyEventTrend: clientDailyEventTrend(filteredRecords, outbreakHeaders, deathHeaders, finalDateCol, eventColors, eventNames),
  };
}

window.buildDashboardFromFile = async function buildDashboardFromFile(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  const rawRows = ext === "csv"
    ? clientParseCsv(await file.text())
    : await clientReadXlsx(file);
  const { headers, records } = clientRowsToRecords(rawRows);
  const dashboard = clientBuildDashboard(headers, records, file.name);
  dashboard._clientSource = { headers, records, fileName: file.name };
  return dashboard;
};

window.buildDashboardFromSource = function buildDashboardFromSource(source, stateFilter = "") {
  const dashboard = clientBuildDashboard(source.headers, source.records, source.fileName, stateFilter);
  dashboard._clientSource = source;
  return dashboard;
};

document.documentElement.dataset.xlsxUploadReady = "true";
