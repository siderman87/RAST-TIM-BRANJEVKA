"use strict";

const STORAGE_KEY = "dostavapro-v1";
const todayISO = new Date().toISOString().slice(0, 10);
const seed = {
  vehicles: [
    { id: "v1", plate: "LJ RT-101", name: "Mercedes Sprinter", capacity: "1.200 kg", status: "active" },
    { id: "v2", plate: "LJ RT-202", name: "Renault Master", capacity: "1.400 kg", status: "active" },
    { id: "v3", plate: "LJ RT-303", name: "Iveco Daily", capacity: "1.800 kg", status: "service" }
  ],
  drivers: [
    { id: "d1", name: "Gregor Grm", phone: "040 111 222", status: "active" },
    { id: "d2", name: "Marko Novak", phone: "041 333 444", status: "active" },
    { id: "d3", name: "Luka Kovač", phone: "031 555 666", status: "off" }
  ],
  deliveries: [
    { id: "del1", number: "2026/10687", date: todayISO, customer: "KOLEKTOR ETRA D.O.O.", email: "prevzem@kolektor.com", address: "Šlandrova ulica 10, Ljubljana", from: "08:00", to: "10:00", driverId: "d1", vehicleId: "v1", status: "on-route", note: "DOGODEK DAN ETRE", recipient: "", signature: "", items: [{ name: "JAGODA SLOVENIJA", quantity: 10, unit: "kg" }, { name: "ČEŠNJA ŠPANIJA", quantity: 20, unit: "kg" }, { name: "GROZDJE BELO PERU", quantity: 7, unit: "kg" }] },
    { id: "del2", number: "2026/10688", date: todayISO, customer: "Hotel Center", email: "nabava@hotel-center.si", address: "Slovenska cesta 34, Ljubljana", from: "10:30", to: "11:30", driverId: "d1", vehicleId: "v1", status: "planned", note: "", recipient: "", signature: "", items: [{ name: "Sadje mešano", quantity: 42, unit: "kg" }] },
    { id: "del3", number: "2026/10689", date: todayISO, customer: "Restavracija Most", email: "info@most.si", address: "Trubarjeva 8, Ljubljana", from: "09:00", to: "10:00", driverId: "d2", vehicleId: "v2", status: "loaded", note: "Pokliči 10 min prej.", recipient: "", signature: "", items: [{ name: "Zelenjava", quantity: 35, unit: "kg" }] },
    { id: "del4", number: "2026/10685", date: todayISO, customer: "Vrtec Sonček", email: "kuhinja@soncek.si", address: "Cesta 12, Vodice", from: "07:00", to: "08:00", driverId: "d2", vehicleId: "v2", status: "delivered", note: "", recipient: "Ana Kralj", signature: "", items: [{ name: "Banane", quantity: 18, unit: "kg" }] }
  ]
};

let state = loadState();
let activeProofId = null;
let signatureDirty = false;
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
    if (value?.deliveries && value?.vehicles && value?.drivers) return value;
  } catch {}
  return clone(seed);
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
let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2300);
}

function showView(name) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `${name}-view`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name));
  $("#page-title").textContent = ({ dashboard: "Pregled dostav", deliveries: "Vse dostave", fleet: "Vozni park", driver: "Pogled voznika" })[name];
  $(".sidebar").classList.remove("open");
  if (name === "driver") renderDriverView();
}

function render() {
  $("#today").textContent = new Intl.DateTimeFormat("sl-SI", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  renderDashboard();
  renderDeliveries();
  renderFleet();
  populateSelects();
  renderDriverView();
  $("#delivery-count-badge").textContent = state.deliveries.filter(item => item.status !== "delivered").length;
  persist();
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
    <td><strong>${escapeHtml(item.number)}</strong><br><small>${formatDate(item.date)}</small></td>
    <td><strong>${escapeHtml(item.customer)}</strong><br><small>${escapeHtml(item.address)}</small></td>
    <td>${escapeHtml(item.from || "-")}–${escapeHtml(item.to || "-")}</td>
    <td>${escapeHtml(driver(item.driverId)?.name || "Ni dodeljen")}<br><small>${escapeHtml(vehicle(item.vehicleId)?.plate || "")}</small></td>
    <td>${statusTag(item.status)}</td>
    <td><div class="row-actions"><button class="icon-action edit-delivery" data-id="${item.id}">Uredi</button><button class="icon-action open-proof" data-id="${item.id}">Dobavnica</button></div></td>
  </tr>`).join("");
  $("#deliveries-empty").classList.toggle("hidden", list.length > 0);
}

function renderFleet() {
  $("#vehicle-list").innerHTML = state.vehicles.map(item => `<article class="resource-card"><div class="resource-icon">V</div><div><strong>${escapeHtml(item.plate)}</strong><small>${escapeHtml(item.name)} · ${escapeHtml(item.capacity)}</small></div>${statusTag(item.status === "service" ? "failed" : "delivered")}</article>`).join("");
  $("#driver-list").innerHTML = state.drivers.map(item => `<article class="resource-card"><div class="resource-icon">${escapeHtml(item.name.split(" ").map(part => part[0]).join("").slice(0, 2))}</div><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.phone)}</small></div><span class="status ${item.status === "active" ? "delivered" : "planned"}">${item.status === "active" ? "Aktiven" : "Odsoten"}</span></article>`).join("");
}

function populateSelects() {
  const driverOptions = `<option value="">Ni dodeljen</option>${state.drivers.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
  const vehicleOptions = `<option value="">Ni dodeljeno</option>${state.vehicles.map(item => `<option value="${item.id}">${escapeHtml(item.plate)} · ${escapeHtml(item.name)}</option>`).join("")}`;
  const currentDriver = $("#active-driver").value;
  $("#delivery-driver").innerHTML = driverOptions;
  $("#delivery-vehicle").innerHTML = vehicleOptions;
  $("#active-driver").innerHTML = state.drivers.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
  $("#active-driver").value = state.drivers.some(item => item.id === currentDriver) ? currentDriver : state.drivers[0]?.id || "";
}

function renderDriverView() {
  const driverId = $("#active-driver").value || state.drivers[0]?.id;
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
    : `<div class="form-grid"><label>Ime in priimek<input id="resource-main" required></label><label>Telefon<input id="resource-second" required></label><label>Status<select id="resource-status"><option value="active">Aktiven</option><option value="off">Odsoten</option></select></label></div>`;
  $("#resource-dialog").showModal();
}
function saveResource() {
  if (!$("#resource-form").reportValidity()) return false;
  if ($("#resource-type").value === "vehicle") state.vehicles.push({ id: id("v"), plate: $("#resource-main").value.trim(), name: $("#resource-second").value.trim(), capacity: $("#resource-third").value.trim(), status: $("#resource-status").value });
  else state.drivers.push({ id: id("d"), name: $("#resource-main").value.trim(), phone: $("#resource-second").value.trim(), status: $("#resource-status").value });
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
  const route = event.target.closest(".set-route");
  if (route) { const item = state.deliveries.find(delivery => delivery.id === route.dataset.id); if (item) item.status = "on-route"; render(); toast("Status je spremenjen v Na poti."); }
});
$("#menu-button").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#new-delivery-button").addEventListener("click", () => openDelivery());
$("#new-vehicle-button").addEventListener("click", () => openResource("vehicle"));
$("#new-driver-button").addEventListener("click", () => openResource("driver"));
$("#add-delivery-item").addEventListener("click", () => addItemRow());
$("#delivery-items").addEventListener("click", event => { if (event.target.closest(".remove-item") && $$(".item-row", $("#delivery-items")).length > 1) event.target.closest(".item-row").remove(); });
$("#save-delivery").addEventListener("click", event => { event.preventDefault(); if (saveDelivery()) $("#delivery-dialog").close(); });
$("#save-resource").addEventListener("click", event => { event.preventDefault(); if (saveResource()) $("#resource-dialog").close(); });
$("#delivery-search").addEventListener("input", renderDeliveries);
$("#status-filter").addEventListener("change", renderDeliveries);
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
render();
