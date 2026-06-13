"use strict";

const STORAGE_KEY = "dostavapro-v1";
const SESSION_KEY = "dostavapro-session-v1";
const todayISO = new Date().toISOString().slice(0, 10);
const seed = {
  users: [
    { id: "u-admin", username: "admin", password: "admin123", role: "admin", name: "Administrator", driverId: null }
  ],
  vehicles: [
    { id: "v1", plate: "LJ RT-101", name: "Mercedes Sprinter", capacity: "1.200 kg", status: "active" },
    { id: "v2", plate: "LJ RT-202", name: "Renault Master", capacity: "1.400 kg", status: "active" },
    { id: "v3", plate: "LJ RT-303", name: "Iveco Daily", capacity: "1.800 kg", status: "service" }
  ],
  drivers: [
    { id: "d1", name: "Gregor Grm", phone: "040 111 222", status: "active", username: "gregor", pin: "1111" },
    { id: "d2", name: "Marko Novak", phone: "041 333 444", status: "active", username: "marko", pin: "2222" },
    { id: "d3", name: "Luka Kovač", phone: "031 555 666", status: "off", username: "luka", pin: "3333" }
  ],
  deliveries: [
    { id: "del1", number: "2026/10687", date: todayISO, customer: "KOLEKTOR ETRA D.O.O.", email: "prevzem@kolektor.com", address: "Šlandrova ulica 10, Ljubljana", from: "08:00", to: "10:00", driverId: "d1", vehicleId: "v1", status: "on-route", note: "DOGODEK DAN ETRE", recipient: "", signature: "", items: [{ name: "JAGODA SLOVENIJA", quantity: 10, unit: "kg" }, { name: "ČEŠNJA ŠPANIJA", quantity: 20, unit: "kg" }, { name: "GROZDJE BELO PERU", quantity: 7, unit: "kg" }] },
    { id: "del2", number: "2026/10688", date: todayISO, customer: "Hotel Center", email: "nabava@hotel-center.si", address: "Slovenska cesta 34, Ljubljana", from: "10:30", to: "11:30", driverId: "d1", vehicleId: "v1", status: "planned", note: "", recipient: "", signature: "", items: [{ name: "Sadje mešano", quantity: 42, unit: "kg" }] },
    { id: "del3", number: "2026/10689", date: todayISO, customer: "Restavracija Most", email: "info@most.si", address: "Trubarjeva 8, Ljubljana", from: "09:00", to: "10:00", driverId: "d2", vehicleId: "v2", status: "loaded", note: "Pokliči 10 min prej.", recipient: "", signature: "", items: [{ name: "Zelenjava", quantity: 35, unit: "kg" }] },
    { id: "del4", number: "2026/10685", date: todayISO, customer: "Vrtec Sonček", email: "kuhinja@soncek.si", address: "Cesta 12, Vodice", from: "07:00", to: "08:00", driverId: "d2", vehicleId: "v2", status: "delivered", note: "", recipient: "Ana Kralj", signature: "", items: [{ name: "Banane", quantity: 18, unit: "kg" }] }
  ]
};

let state = loadState();
let session = loadSession();
let activeProofId = null;
let signatureDirty = false;
let pendingTrisDeliveries = [];
const selectedDeliveryIds = new Set();
let pendingConfirmation = null;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const statusMeta = {
  planned: ["Načrtovano", "planned"],
  loaded: ["Naloženo", "loaded"],
  "on-route": ["Na poti", "on-route"],
  delivered: ["Dostavljeno", "delivered"],
  failed: ["Neuspešno", "failed"]
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value?.deliveries && value?.vehicles && value?.drivers) return migrateState(value);
  } catch {}
  return clone(seed);
}
function migrateState(value) {
  value.users ||= clone(seed.users);
  value.drivers.forEach((item, index) => {
    item.username ||= item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0];
    item.pin ||= String(1111 + index * 1111).slice(0, 4);
  });
  return value;
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function currentUser() {
  if (!session) return null;
  if (session.role === "admin") return state.users.find(user => user.id === session.userId) || null;
  const currentDriver = state.drivers.find(item => item.id === session.driverId);
  return currentDriver ? { id: currentDriver.id, name: currentDriver.name, role: "driver", driverId: currentDriver.id } : null;
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function driver(driverId) { return state.drivers.find(item => item.id === driverId); }
function vehicle(vehicleId) { return state.vehicles.find(item => item.id === vehicleId); }
function statusTag(status) {
  const [label, className] = statusMeta[status] || statusMeta.planned;
  return `<span class="status ${className}">${label}</span>`;
}
function formatDate(value) {
  return value ? new Intl.DateTimeFormat("sl-SI").format(new Date(`${value}T12:00:00`)) : "";
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function normalizeKey(value = "") {
  return String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function firstValue(row, aliases) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const alias of aliases) {
    const value = normalized[normalizeKey(alias)];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}
function parseNumber(value) {
  const normalized = String(value || "0").trim().replace(/\s/g, "").replace(",", ".");
  return Number(normalized) || 0;
}
function parseTrisDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return todayISO;
  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  const localMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (localMatch) return `${localMatch[3]}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`;
  return todayISO;
}
function detectDelimiter(line) {
  const candidates = [";", "\t", ","];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
}
function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV datoteka nima podatkovnih vrstic.");
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter);
  return lines.slice(1).map(line => {
    const cells = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}
function elementToRow(element) {
  const row = {};
  [...element.children].forEach(child => {
    if (child.children.length === 0) row[child.tagName] = child.textContent.trim();
    else [...child.children].forEach(grandchild => {
      if (grandchild.children.length === 0) row[`${child.tagName}_${grandchild.tagName}`] = grandchild.textContent.trim();
    });
  });
  [...element.attributes].forEach(attribute => { row[attribute.name] = attribute.value; });
  return row;
}
function parseXml(text) {
  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("XML datoteka ni veljavna.");
  const preferred = ["dobavnica", "deliverynote", "dokument", "document", "row", "vrstica", "record"];
  const allElements = [...documentXml.getElementsByTagName("*")];
  for (const name of preferred) {
    const nodes = allElements.filter(element => normalizeKey(element.localName) === normalizeKey(name));
    if (nodes.length) return nodes.map(elementToRow);
  }
  const rootChildren = [...documentXml.documentElement.children];
  if (!rootChildren.length) throw new Error("XML ne vsebuje dobavnic.");
  return rootChildren.map(elementToRow);
}
function rowsToDeliveries(rows) {
  const aliases = {
    number: ["stevilkadobavnice", "st_dobavnice", "st dokumenta", "dokument", "documentnumber", "deliverynumber", "stevilka"],
    date: ["datumdobavnice", "datum", "documentdate", "deliverydate", "datumprometa"],
    customer: ["nazivkupca", "kupec", "partner", "nazivpartnerja", "prejemnik", "customer", "customername"],
    email: ["email", "eposta", "emailkupca", "partneremail"],
    address: ["naslovdostave", "naslov", "ulica", "deliveryaddress", "address"],
    post: ["posta", "postnastevilka", "kraj", "postalcode", "city"],
    item: ["nazivartikla", "artikel", "nazivblaga", "opis", "item", "itemname"],
    quantity: ["kolicina", "kol", "quantity", "qty"],
    unit: ["enota", "em", "unit"],
    note: ["opomba", "napomena", "note", "remarks"],
    from: ["casod", "uraod", "timefrom"],
    to: ["casdo", "urado", "timeto"]
  };
  const grouped = new Map();
  rows.forEach((row, rowIndex) => {
    const number = firstValue(row, aliases.number) || `TRIS-${Date.now()}-${rowIndex + 1}`;
    if (!grouped.has(number)) {
      const address = firstValue(row, aliases.address);
      const post = firstValue(row, aliases.post);
      grouped.set(number, {
        id: id("del"), number, date: parseTrisDate(firstValue(row, aliases.date)),
        customer: firstValue(row, aliases.customer) || "Neznani prejemnik",
        email: firstValue(row, aliases.email), address: [address, post].filter(Boolean).join(", "),
        from: firstValue(row, aliases.from), to: firstValue(row, aliases.to), driverId: "", vehicleId: "",
        status: "planned", note: firstValue(row, aliases.note), recipient: "", signature: "", source: "TRIS", items: []
      });
    }
    const delivery = grouped.get(number);
    const itemName = firstValue(row, aliases.item);
    if (itemName) delivery.items.push({ name: itemName, quantity: parseNumber(firstValue(row, aliases.quantity)) || 1, unit: firstValue(row, aliases.unit) || "kos" });
  });
  return [...grouped.values()].map(delivery => {
    if (!delivery.items.length) delivery.items.push({ name: "Blago po dobavnici TRIS", quantity: 1, unit: "dobavnica" });
    return delivery;
  });
}
function parsePdfDelivery(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const numberMatch = text.match(/Dobavnica[^\n]*?(\d{4}\/\d+|[A-Z0-9]+[-/][A-Z0-9/-]+)/i);
  const dateMatch = text.match(/(?:Vodice,\s*dne|Datum odpreme:?)\s*(\d{1,2}[.]\d{1,2}[.]\d{4})/i);
  const number = numberMatch?.[1] || "";
  if (!number) throw new Error("V PDF-ju ni bilo mogoče prepoznati številke dobavnice.");

  const supplierEnd = lines.findIndex(line => /TRR\s*:/i.test(line));
  const documentStart = lines.findIndex(line => /Dobavnica/i.test(line));
  const customerLines = supplierEnd >= 0 && documentStart > supplierEnd
    ? lines.slice(supplierEnd + 1, documentStart)
    : [];
  const customerNameLines = customerLines.length >= 3 ? customerLines.slice(0, -2) : customerLines.slice(0, 1);
  const customer = customerNameLines.join(" ") || "Neznani prejemnik";
  const address = customerLines.slice(customerNameLines.length).join(", ");

  const itemPattern = /^(\d+)\s+(.+?\([^)]+\))\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)$/;
  const items = lines.map(line => line.match(itemPattern)).filter(Boolean).map(match => ({
    code: match[2],
    name: match[3],
    quantity: parseNumber(match[4]),
    unit: "kg",
    price: parseNumber(match[5]),
    vat: parseNumber(match[6]),
    value: parseNumber(match[7])
  }));
  if (!items.length) throw new Error("V PDF-ju ni bilo mogoče prepoznati postavk dobavnice.");

  const eventLine = lines.find(line => /^DOGODEK\b/i.test(line));
  const cratesLine = lines.find(line => /^Gajbice\s*:/i.test(line));
  return [{
    id: id("del"), number, date: parseTrisDate(dateMatch?.[1] || ""),
    customer, email: "", address, from: "", to: "", driverId: "", vehicleId: "",
    status: "planned", note: [eventLine, cratesLine].filter(Boolean).join(" · "),
    recipient: "", signature: "", source: "TRIS PDF", items
  }];
}
function parsePdfDeliveries(text) {
  const sections = text
    .split(/\r?\n\f\r?\n/)
    .map(section => section.trim())
    .filter(section => /Dobavnica/i.test(section));
  if (sections.length > 1) return sections.flatMap(parsePdfDelivery);

  const starts = [...text.matchAll(/(?=RAST TIM d\.o\.o\.[\s\S]*?Dobavnica[^\n]*?\d{4}\/\d+)/gi)].map(match => match.index);
  if (starts.length > 1) {
    return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length)).flatMap(parsePdfDelivery);
  }
  return parsePdfDelivery(text);
}
async function extractPdfText(file) {
  let pdfjs;
  let workerSrc = "./pdf.worker.min.mjs";
  try {
    pdfjs = await import("./pdf.min.mjs");
  } catch (localError) {
    try {
      pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.min.mjs");
      workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs";
    } catch {
      throw new Error("PDF knjižnica ni naložena. Na GitHub naloži tudi datoteki pdf.min.mjs in pdf.worker.min.mjs.");
    }
  }
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: bytes }).promise;
  } catch {
    throw new Error("PDF datoteke ni mogoče odpreti. Preveri, da ni zaščitena z geslom.");
  }
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map();
    content.items.forEach(item => {
      const y = Math.round(item.transform[5] * 2) / 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], text: item.str });
    });
    const pageLines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    pages.push(pageLines.join("\n"));
  }
  const text = pages.join("\n\f\n");
  if (text.replace(/\s/g, "").length < 30) {
    throw new Error("PDF je verjetno sken brez besedila. Za tak dokument je potreben OCR.");
  }
  return text;
}
function openTrisImport() {
  pendingTrisDeliveries = [];
  $("#tris-file").value = "";
  $("#tris-status").classList.add("hidden");
  $("#tris-preview").classList.add("hidden");
  $("#confirm-tris-import").disabled = true;
  $("#tris-dialog").showModal();
}
function showTrisError(message) {
  $("#tris-status").textContent = message;
  $("#tris-status").classList.remove("hidden");
  $("#tris-preview").classList.add("hidden");
  $("#confirm-tris-import").disabled = true;
}
function renderTrisPreview() {
  const existingNumbers = new Set(state.deliveries.map(item => item.number.trim().toLowerCase()));
  const newCount = pendingTrisDeliveries.filter(item => !existingNumbers.has(item.number.trim().toLowerCase())).length;
  const duplicateCount = pendingTrisDeliveries.length - newCount;
  $("#tris-summary").innerHTML = `<strong>${pendingTrisDeliveries.length} zaznanih dobavnic</strong><span>${newCount} novih</span><span>${duplicateCount} že obstaja</span>`;
  $("#tris-preview-body").innerHTML = pendingTrisDeliveries.map(item => {
    const duplicate = existingNumbers.has(item.number.trim().toLowerCase());
    return `<tr><td><strong>${escapeHtml(item.number)}</strong></td><td>${escapeHtml(item.customer)}</td><td>${formatDate(item.date)}</td><td>${escapeHtml(item.address || "-")}</td><td>${item.items.length}</td><td><span class="import-result ${duplicate ? "duplicate" : "new"}">${duplicate ? "Preskočeno" : "Novo"}</span></td></tr>`;
  }).join("");
  $("#tris-status").classList.add("hidden");
  $("#tris-preview").classList.remove("hidden");
  $("#confirm-tris-import").disabled = newCount === 0;
}
async function readTrisFile(file) {
  if (!file) return;
  try {
    $("#tris-status").textContent = `Berem datoteko ${file.name} ...`;
    $("#tris-status").classList.remove("hidden");
    $("#tris-status").classList.add("loading");
    $("#tris-preview").classList.add("hidden");
    $("#confirm-tris-import").disabled = true;
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "pdf" || file.type === "application/pdf") {
      const text = await extractPdfText(file);
      pendingTrisDeliveries = parsePdfDeliveries(text);
    } else {
      const text = await file.text();
      const rows = extension === "xml" || text.trim().startsWith("<") ? parseXml(text) : parseCsv(text);
      pendingTrisDeliveries = rowsToDeliveries(rows);
    }
    if (!pendingTrisDeliveries.length) throw new Error("V datoteki ni bilo mogoče najti dobavnic.");
    $("#tris-status").classList.remove("loading");
    renderTrisPreview();
  } catch (error) {
    pendingTrisDeliveries = [];
    $("#tris-status").classList.remove("loading");
    showTrisError(error instanceof Error ? error.message : "Uvoz datoteke ni uspel.");
  }
}
function confirmTrisImport() {
  const existingNumbers = new Set(state.deliveries.map(item => item.number.trim().toLowerCase()));
  const imported = pendingTrisDeliveries.filter(item => !existingNumbers.has(item.number.trim().toLowerCase()));
  state.deliveries.push(...imported);
  render();
  $("#tris-dialog").close();
  toast(`Uvoženih dobavnic: ${imported.length}.`);
}
let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2300);
}

function showView(name) {
  if (session?.role === "driver" && name !== "driver") name = "driver";
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `${name}-view`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name));
  $("#page-title").textContent = ({ dashboard: "Pregled dostav", deliveries: "Vse dostave", fleet: "Vozni park", driver: "Pogled voznika" })[name];
  $(".sidebar").classList.remove("open");
  if (name === "driver") renderDriverView();
}

function render() {
  applyAccess();
  $("#today").textContent = new Intl.DateTimeFormat("sl-SI", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  renderDashboard();
  renderDeliveries();
  renderFleet();
  populateSelects();
  renderDriverView();
  $("#delivery-count-badge").textContent = state.deliveries.filter(item => item.status !== "delivered").length;
  persist();
}
function applyAccess() {
  const user = currentUser();
  const loggedIn = Boolean(user);
  $("#login-screen").classList.toggle("hidden", loggedIn);
  $("#authenticated-app").classList.toggle("hidden", !loggedIn);
  document.body.classList.toggle("driver-session", user?.role === "driver");
  if (!loggedIn) return;
  $("#sidebar-user").textContent = user.name;
  $("#sidebar-role").textContent = user.role === "admin" ? "Administrator / dispečer" : "Voznik";
}
function login(username, password) {
  const normalized = username.trim().toLowerCase();
  const admin = state.users.find(user => user.username.toLowerCase() === normalized && user.password === password);
  if (admin) {
    session = { userId: admin.id, role: "admin", driverId: null };
  } else {
    const matchedDriver = state.drivers.find(item => item.username.toLowerCase() === normalized && item.pin === password && item.status === "active");
    if (!matchedDriver) return false;
    session = { userId: matchedDriver.id, role: "driver", driverId: matchedDriver.id };
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  render();
  showView(session.role === "driver" ? "driver" : "dashboard");
  return true;
}
function logout() {
  session = null;
  sessionStorage.removeItem(SESSION_KEY);
  applyAccess();
  $("#login-form").reset();
  $("#login-username").focus();
}

function renderDashboard() {
  const today = state.deliveries.filter(item => item.date === todayISO);
  const delivered = today.filter(item => item.status === "delivered").length;
  const route = today.filter(item => item.status === "on-route").length;
  const pending = today.filter(item => ["planned", "loaded"].includes(item.status)).length;
  $("#metrics").innerHTML = [
    ["Današnje dostave", today.length, "vseh postankov"],
    ["Dostavljeno", delivered, `${today.length ? Math.round(delivered / today.length * 100) : 0} % zaključeno`],
    ["Na poti", route, "aktivne dostave"],
    ["Čaka na odhod", pending, "načrtovano ali naloženo"]
  ].map(([label, value, note]) => `<article class="metric"><div class="metric-top"><span>${label}</span></div><strong>${value}</strong><small>${note}</small></article>`).join("");

  $("#today-deliveries").innerHTML = today.length ? today.slice(0, 6).map(item => {
    const assignedDriver = driver(item.driverId);
    return `<div class="delivery-line"><div><strong>${item.from || "--:--"}</strong><small>${item.to ? `do ${item.to}` : ""}</small></div><div><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.address)}</small></div><div><strong>${escapeHtml(assignedDriver?.name || "Ni dodeljen")}</strong><small>${escapeHtml(vehicle(item.vehicleId)?.plate || "")}</small></div><div>${statusTag(item.status)}</div></div>`;
  }).join("") : `<div class="empty-state">Danes ni načrtovanih dostav.</div>`;

  const vehicleStats = [
    ["#35a66f", "Aktivna vozila", state.vehicles.filter(item => item.status === "active").length],
    ["#d88a18", "Na servisu", state.vehicles.filter(item => item.status === "service").length],
    ["#2463a2", "Aktivni vozniki", state.drivers.filter(item => item.status === "active").length],
    ["#8793a1", "Prosti vozniki", state.drivers.filter(item => !today.some(delivery => delivery.driverId === item.id && delivery.status !== "delivered")).length]
  ];
  $("#fleet-summary").innerHTML = vehicleStats.map(([color, label, count]) => `<div class="fleet-stat"><i style="background:${color}"></i><span>${label}</span><strong>${count}</strong></div>`).join("");
}

function renderDeliveries() {
  const search = ($("#delivery-search")?.value || "").toLowerCase();
  const filter = $("#status-filter")?.value || "all";
  const list = state.deliveries
    .filter(item => filter === "all" || item.status === filter)
    .filter(item => [item.number, item.customer, item.address].join(" ").toLowerCase().includes(search))
    .sort((a, b) => `${b.date}${b.from}`.localeCompare(`${a.date}${a.from}`));
  $("#deliveries-table").innerHTML = list.map(item => `<tr>
    <td class="select-column"><input class="delivery-select" type="checkbox" data-id="${item.id}" aria-label="Izberi dobavnico ${escapeHtml(item.number)}" ${selectedDeliveryIds.has(item.id) ? "checked" : ""}></td>
    <td><strong>${escapeHtml(item.number)}</strong><br><small>${formatDate(item.date)}</small></td>
    <td><strong>${escapeHtml(item.customer)}</strong><br><small>${escapeHtml(item.address)}</small></td>
    <td>${escapeHtml(item.from || "-")}–${escapeHtml(item.to || "-")}</td>
    <td>${escapeHtml(driver(item.driverId)?.name || "Ni dodeljen")}<br><small>${escapeHtml(vehicle(item.vehicleId)?.plate || "")}</small></td>
    <td>${statusTag(item.status)}</td>
    <td><div class="row-actions"><button class="icon-action edit-delivery" data-id="${item.id}">Uredi</button><button class="icon-action open-proof" data-id="${item.id}">Dobavnica</button><button class="icon-action delete-delivery" data-id="${item.id}">Izbriši</button></div></td>
  </tr>`).join("");
  $("#deliveries-empty").classList.toggle("hidden", list.length > 0);
  const visibleIds = list.map(item => item.id);
  const selectedVisible = visibleIds.filter(itemId => selectedDeliveryIds.has(itemId)).length;
  $("#select-all-deliveries").checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  $("#select-all-deliveries").indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  updateBulkActions();
}

function renderFleet() {
  $("#vehicle-list").innerHTML = state.vehicles.map(item => `<article class="resource-card"><div class="resource-icon">V</div><div><strong>${escapeHtml(item.plate)}</strong><small>${escapeHtml(item.name)} · ${escapeHtml(item.capacity)}</small></div>${statusTag(item.status === "service" ? "failed" : "delivered")}</article>`).join("");
  $("#driver-list").innerHTML = state.drivers.map(item => `<article class="resource-card"><div class="resource-icon">${escapeHtml(item.name.split(" ").map(part => part[0]).join("").slice(0, 2))}</div><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.phone)} · uporabnik: ${escapeHtml(item.username)}</small></div><span class="status ${item.status === "active" ? "delivered" : "planned"}">${item.status === "active" ? "Aktiven" : "Odsoten"}</span></article>`).join("");
}

function populateSelects() {
  const driverOptions = `<option value="">Ni dodeljen</option>${state.drivers.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
  const vehicleOptions = `<option value="">Ni dodeljeno</option>${state.vehicles.map(item => `<option value="${item.id}">${escapeHtml(item.plate)} · ${escapeHtml(item.name)}</option>`).join("")}`;
  const currentDriver = $("#active-driver").value;
  $("#delivery-driver").innerHTML = driverOptions;
  $("#delivery-vehicle").innerHTML = vehicleOptions;
  $("#quick-driver").innerHTML = driverOptions;
  $("#quick-vehicle").innerHTML = vehicleOptions;
  $("#active-driver").innerHTML = state.drivers.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
  $("#active-driver").value = state.drivers.some(item => item.id === currentDriver) ? currentDriver : state.drivers[0]?.id || "";
}
function updateBulkActions() {
  const count = selectedDeliveryIds.size;
  $("#selected-delivery-count").textContent = `${count} ${count === 1 ? "izbrana" : "izbranih"}`;
  $("#quick-assign").disabled = count === 0;
  $("#delete-selected").disabled = count === 0;
}
function clearDeliverySelection() {
  selectedDeliveryIds.clear();
  renderDeliveries();
}
function quickAssignSelected() {
  if (!selectedDeliveryIds.size) return;
  const driverId = $("#quick-driver").value;
  const vehicleId = $("#quick-vehicle").value;
  if (!driverId && !vehicleId) {
    toast("Izberi voznika ali vozilo.");
    return;
  }
  let changed = 0;
  state.deliveries.forEach(item => {
    if (!selectedDeliveryIds.has(item.id)) return;
    if (driverId) item.driverId = driverId;
    if (vehicleId) item.vehicleId = vehicleId;
    changed += 1;
  });
  clearDeliverySelection();
  render();
  toast(`Dodeljenih dostav: ${changed}.`);
}
function openConfirmation(title, message, action) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  pendingConfirmation = action;
  $("#confirm-dialog").showModal();
}
function deleteDeliveries(ids) {
  const idSet = new Set(ids);
  const removed = state.deliveries.filter(item => idSet.has(item.id)).length;
  state.deliveries = state.deliveries.filter(item => !idSet.has(item.id));
  ids.forEach(itemId => selectedDeliveryIds.delete(itemId));
  render();
  toast(`Izbrisanih dostav: ${removed}.`);
}

function renderDriverView() {
  const driverId = session?.role === "driver" ? session.driverId : ($("#active-driver").value || state.drivers[0]?.id);
  if (!driverId) return;
  const route = state.deliveries.filter(item => item.driverId === driverId && item.date === todayISO).sort((a, b) => a.from.localeCompare(b.from));
  $("#route-summary").innerHTML = `<div><strong>${route.length}</strong><span>postankov</span></div><div><strong>${route.filter(item => item.status === "delivered").length}</strong><span>dostavljenih</span></div><div><strong>${route.filter(item => item.status !== "delivered").length}</strong><span>preostalih</span></div>`;
  $("#driver-route").innerHTML = route.length ? route.map((item, index) => `<article class="route-card"><div class="route-number">${index + 1}</div><div><h3>${escapeHtml(item.customer)}</h3><p>${escapeHtml(item.address)}</p><p><strong>${escapeHtml(item.from || "")}–${escapeHtml(item.to || "")}</strong> · ${escapeHtml(item.number)}</p>${statusTag(item.status)}</div><div class="route-actions">${item.status !== "delivered" ? `<button class="button secondary set-route" data-id="${item.id}">Na poti</button><button class="button success open-proof" data-id="${item.id}">Dostavi</button>` : `<button class="button secondary open-proof" data-id="${item.id}">Poglej</button>`}</div></article>`).join("") : `<div class="empty-state panel">Ta voznik danes nima dostav.</div>`;
}

function addItemRow(item = { name: "", quantity: 1, unit: "kg" }) {
  const fragment = $("#delivery-item-template").content.cloneNode(true);
  $(".item-name", fragment).value = item.name;
  $(".item-quantity", fragment).value = item.quantity;
  $(".item-unit", fragment).value = item.unit;
  $("#delivery-items").append(fragment);
}
function nextDeliveryNumber() {
  const numbers = state.deliveries
    .map(item => Number(String(item.number).split("/").pop()))
    .filter(Number.isFinite);
  return `2026/${Math.max(10680, ...numbers) + 1}`;
}
function openDelivery(deliveryId = null) {
  const item = state.deliveries.find(delivery => delivery.id === deliveryId);
  $("#delivery-dialog-title").textContent = item ? "Uredi dostavo" : "Nova dostava";
  $("#delivery-id").value = item?.id || "";
  $("#delivery-number").value = item?.number || nextDeliveryNumber();
  $("#delivery-date").value = item?.date || todayISO;
  $("#customer-name").value = item?.customer || "";
  $("#customer-email").value = item?.email || "";
  $("#customer-address").value = item?.address || "";
  $("#time-from").value = item?.from || "";
  $("#time-to").value = item?.to || "";
  $("#delivery-driver").value = item?.driverId || "";
  $("#delivery-vehicle").value = item?.vehicleId || "";
  $("#delivery-note").value = item?.note || "";
  $("#delivery-items").replaceChildren();
  (item?.items || [{ name: "", quantity: 1, unit: "kg" }]).forEach(addItemRow);
  $("#delivery-dialog").showModal();
}
function saveDelivery() {
  const items = $$(".item-row", $("#delivery-items")).map(row => ({ name: $(".item-name", row).value.trim(), quantity: Number($(".item-quantity", row).value) || 0, unit: $(".item-unit", row).value.trim() })).filter(item => item.name);
  if (!$("#delivery-form").reportValidity() || !items.length) return false;
  const deliveryId = $("#delivery-id").value;
  const existing = state.deliveries.find(item => item.id === deliveryId);
  const value = {
    id: deliveryId || id("del"), number: $("#delivery-number").value.trim(), date: $("#delivery-date").value,
    customer: $("#customer-name").value.trim(), email: $("#customer-email").value.trim(), address: $("#customer-address").value.trim(),
    from: $("#time-from").value, to: $("#time-to").value, driverId: $("#delivery-driver").value, vehicleId: $("#delivery-vehicle").value,
    status: existing?.status || "planned", note: $("#delivery-note").value.trim(), recipient: existing?.recipient || "", signature: existing?.signature || "", items
  };
  if (existing) Object.assign(existing, value); else state.deliveries.push(value);
  render();
  toast("Dostava je shranjena.");
  return true;
}

function openResource(type) {
  $("#resource-type").value = type;
  $("#resource-title").textContent = type === "vehicle" ? "Novo vozilo" : "Nov voznik";
  $("#resource-fields").innerHTML = type === "vehicle"
    ? `<div class="form-grid"><label>Registracija<input id="resource-main" required></label><label>Model<input id="resource-second" required></label><label>Nosilnost<input id="resource-third" placeholder="1.200 kg"></label><label>Status<select id="resource-status"><option value="active">Aktivno</option><option value="service">Na servisu</option></select></label></div>`
    : `<div class="form-grid"><label>Ime in priimek<input id="resource-main" required></label><label>Telefon<input id="resource-second" required></label><label>Uporabniško ime<input id="resource-username" required autocomplete="off"></label><label>PIN za prijavo<input id="resource-pin" required inputmode="numeric" minlength="4" autocomplete="new-password"></label><label>Status<select id="resource-status"><option value="active">Aktiven</option><option value="off">Odsoten</option></select></label></div>`;
  $("#resource-dialog").showModal();
}
function saveResource() {
  if (!$("#resource-form").reportValidity()) return false;
  if ($("#resource-type").value === "vehicle") state.vehicles.push({ id: id("v"), plate: $("#resource-main").value.trim(), name: $("#resource-second").value.trim(), capacity: $("#resource-third").value.trim(), status: $("#resource-status").value });
  else {
    const username = $("#resource-username").value.trim().toLowerCase();
    if (state.drivers.some(item => item.username.toLowerCase() === username) || state.users.some(item => item.username.toLowerCase() === username)) {
      toast("To uporabniško ime že obstaja.");
      return false;
    }
    state.drivers.push({ id: id("d"), name: $("#resource-main").value.trim(), phone: $("#resource-second").value.trim(), username, pin: $("#resource-pin").value, status: $("#resource-status").value });
  }
  render();
  toast("Podatek je shranjen.");
  return true;
}

function openProof(deliveryId) {
  const item = state.deliveries.find(delivery => delivery.id === deliveryId);
  if (!item) return;
  activeProofId = item.id;
  $("#proof-title").textContent = `Dobavnica ${item.number}`;
  $("#proof-content").innerHTML = `<section class="proof-sheet"><div class="proof-meta"><div><small>DOBAVITELJ</small><h3>RAST TIM d.o.o.</h3><p>Vesca 18, 1217 Vodice<br>ID za DDV: SI61881872</p></div><div><small>PREJEMNIK</small><h3>${escapeHtml(item.customer)}</h3><p>${escapeHtml(item.address)}<br>${formatDate(item.date)}, ${escapeHtml(item.from || "")}</p></div></div><table class="proof-items"><thead><tr><th>#</th><th>Naziv</th><th>Količina</th><th>Enota</th></tr></thead><tbody>${item.items.map((line, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(line.name)}</td><td>${line.quantity}</td><td>${escapeHtml(line.unit)}</td></tr>`).join("")}</tbody></table>${item.note ? `<p><strong>Opomba:</strong> ${escapeHtml(item.note)}</p>` : ""}</section>`;
  $("#recipient-name").value = item.recipient || "";
  $("#proof-dialog").showModal();
  requestAnimationFrame(() => {
    clearCanvas();
    if (item.signature) {
      const image = new Image();
      image.onload = () => signatureContext().drawImage(image, 0, 0, $("#signature-pad").width, $("#signature-pad").height);
      image.src = item.signature;
    }
    signatureDirty = false;
  });
}
function signatureContext() {
  const context = $("#signature-pad").getContext("2d");
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.strokeStyle = "#17202a";
  return context;
}
function clearCanvas() {
  const canvas = $("#signature-pad");
  signatureContext().clearRect(0, 0, canvas.width, canvas.height);
  signatureDirty = false;
}
function confirmProof() {
  const item = state.deliveries.find(delivery => delivery.id === activeProofId);
  if (!item || !$("#recipient-name").value.trim()) {
    toast("Vpiši ime prejemnika.");
    return false;
  }
  if (!signatureDirty && !item.signature) {
    toast("Prejemnik se mora podpisati.");
    return false;
  }
  item.recipient = $("#recipient-name").value.trim();
  if (signatureDirty || !item.signature) item.signature = $("#signature-pad").toDataURL("image/png");
  item.status = "delivered";
  item.deliveredAt = new Date().toISOString();
  render();
  toast("Dostava je potrjena in dobavnica shranjena.");
  return true;
}

function setupSignature() {
  const canvas = $("#signature-pad");
  let drawing = false;
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return { x: (source.clientX - rect.left) * canvas.width / rect.width, y: (source.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = event => { drawing = true; signatureDirty = true; const p = point(event); signatureContext().beginPath(); signatureContext().moveTo(p.x, p.y); event.preventDefault(); };
  const move = event => { if (!drawing) return; const p = point(event); signatureContext().lineTo(p.x, p.y); signatureContext().stroke(); event.preventDefault(); };
  const end = () => { drawing = false; };
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) showView(nav.dataset.view);
  const go = event.target.closest("[data-go]");
  if (go) showView(go.dataset.go);
  const edit = event.target.closest(".edit-delivery");
  if (edit) openDelivery(edit.dataset.id);
  const proof = event.target.closest(".open-proof");
  if (proof) openProof(proof.dataset.id);
  const removeDelivery = event.target.closest(".delete-delivery");
  if (removeDelivery) {
    const item = state.deliveries.find(delivery => delivery.id === removeDelivery.dataset.id);
    if (item) openConfirmation(
      "Izbriši dostavo?",
      `Dobavnica ${item.number} za ${item.customer} bo trajno odstranjena iz te naprave.`,
      () => deleteDeliveries([item.id])
    );
  }
  const route = event.target.closest(".set-route");
  if (route) { const item = state.deliveries.find(delivery => delivery.id === route.dataset.id); if (item) item.status = "on-route"; render(); toast("Status je spremenjen v Na poti."); }
});
$("#menu-button").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#login-form").addEventListener("submit", event => {
  event.preventDefault();
  const accepted = login($("#login-username").value, $("#login-password").value);
  $("#login-error").classList.toggle("hidden", accepted);
});
$("#logout-button").addEventListener("click", logout);
$("#new-delivery-button").addEventListener("click", () => openDelivery());
$("#import-tris-button").addEventListener("click", openTrisImport);
$("#tris-file").addEventListener("change", event => readTrisFile(event.target.files[0]));
$("#confirm-tris-import").addEventListener("click", confirmTrisImport);
const trisDropZone = $("#tris-drop-zone");
["dragenter", "dragover"].forEach(type => trisDropZone.addEventListener(type, event => {
  event.preventDefault();
  trisDropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach(type => trisDropZone.addEventListener(type, event => {
  event.preventDefault();
  trisDropZone.classList.remove("dragging");
}));
trisDropZone.addEventListener("drop", event => readTrisFile(event.dataTransfer.files[0]));
$("#new-vehicle-button").addEventListener("click", () => openResource("vehicle"));
$("#new-driver-button").addEventListener("click", () => openResource("driver"));
$("#add-delivery-item").addEventListener("click", () => addItemRow());
$("#delivery-items").addEventListener("click", event => { if (event.target.closest(".remove-item") && $$(".item-row", $("#delivery-items")).length > 1) event.target.closest(".item-row").remove(); });
$("#save-delivery").addEventListener("click", event => { event.preventDefault(); if (saveDelivery()) $("#delivery-dialog").close(); });
$("#save-resource").addEventListener("click", event => { event.preventDefault(); if (saveResource()) $("#resource-dialog").close(); });
$("#delivery-search").addEventListener("input", renderDeliveries);
$("#status-filter").addEventListener("change", renderDeliveries);
$("#deliveries-table").addEventListener("change", event => {
  const checkbox = event.target.closest(".delivery-select");
  if (!checkbox) return;
  if (checkbox.checked) selectedDeliveryIds.add(checkbox.dataset.id);
  else selectedDeliveryIds.delete(checkbox.dataset.id);
  renderDeliveries();
});
$("#select-all-deliveries").addEventListener("change", event => {
  $$(".delivery-select", $("#deliveries-table")).forEach(checkbox => {
    if (event.target.checked) selectedDeliveryIds.add(checkbox.dataset.id);
    else selectedDeliveryIds.delete(checkbox.dataset.id);
  });
  renderDeliveries();
});
$("#clear-delivery-selection").addEventListener("click", clearDeliverySelection);
$("#quick-assign").addEventListener("click", quickAssignSelected);
$("#delete-selected").addEventListener("click", () => {
  const ids = [...selectedDeliveryIds];
  if (!ids.length) return;
  openConfirmation(
    "Izbriši izbrane dostave?",
    `Trajno bo izbrisanih ${ids.length} dostav. Tega dejanja ni mogoče razveljaviti.`,
    () => deleteDeliveries(ids)
  );
});
$("#confirm-action").addEventListener("click", () => {
  const action = pendingConfirmation;
  pendingConfirmation = null;
  $("#confirm-dialog").close();
  action?.();
});
$("#confirm-dialog").addEventListener("close", () => {
  if ($("#confirm-dialog").returnValue === "cancel") pendingConfirmation = null;
});
$("#active-driver").addEventListener("change", renderDriverView);
$("#clear-signature").addEventListener("click", clearCanvas);
$("#confirm-delivery").addEventListener("click", event => { event.preventDefault(); if (confirmProof()) $("#proof-dialog").close(); });
$("#print-proof").addEventListener("click", () => window.print());
$("#email-proof").addEventListener("click", () => {
  const item = state.deliveries.find(delivery => delivery.id === activeProofId);
  if (!item) return;
  const subject = encodeURIComponent(`Elektronska dobavnica ${item.number}`);
  const body = encodeURIComponent(`Pozdravljeni,\n\npošiljamo vam elektronsko dobavnico ${item.number} za dostavo na naslov ${item.address}.\n\nLep pozdrav,\nRAST TIM d.o.o.`);
  location.href = `mailto:${encodeURIComponent(item.email || "")}?subject=${subject}&body=${body}`;
});
$("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dostavapro-${todayISO}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

setupSignature();
window.DostavaProImport = Object.freeze({
  parseCsv,
  parseXml,
  rowsToDeliveries,
  parsePdfDelivery,
  parsePdfDeliveries
});
render();
if (currentUser()) showView(session.role === "driver" ? "driver" : "dashboard");
