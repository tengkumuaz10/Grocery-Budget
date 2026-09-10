(() => {
  "use strict";

  const STORAGE_KEY = "groceryBudgetByTmsz_v1";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    store: $("#storeInput"),
    tripDate: $("#tripDateInput"),
    totalBudget: $("#totalBudget"),
    totalSpent: $("#totalSpent"),
    remaining: $("#remaining"),
    budgetStatus: $("#budgetStatus"),
    paymentSources: $("#paymentSources"),
    shoppingItems: $("#shoppingItems"),
    emptyItems: $("#emptyItems"),
    itemProgress: $("#itemProgress"),
    historyList: $("#historyList"),
    emptyHistory: $("#emptyHistory"),
    currentPanel: $("#currentPanel"),
    historyPanel: $("#historyPanel"),
    toast: $("#toast")
  };

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (n) => `RM${(Number(n) || 0).toFixed(2)}`;

  const blankTrip = (keepSources = true) => ({
    id: uuid(),
    store: "",
    date: today(),
    sources: keepSources && state?.current?.sources?.length
      ? state.current.sources.map(s => ({ ...s }))
      : [{ id: uuid(), name: "Bank A", budget: 200 }, { id: uuid(), name: "Bank B", budget: 100 }],
    items: [],
    createdAt: Date.now()
  });

  let state;
  let selectedHistoryId = null;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.current && Array.isArray(parsed.history)) return parsed;
    } catch (_) {}
    return { current: null, history: [] };
  }

  state = load();
  if (!state.current) state.current = blankTrip(false);

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function totalsFor(trip) {
    const budget = trip.sources.reduce((sum, s) => sum + Math.max(0, Number(s.budget) || 0), 0);
    const spent = trip.items.reduce((sum, i) => {
      const qty = Math.max(0, Number(i.qty) || 0);
      const price = i.price === "" || i.price == null ? 0 : Math.max(0, Number(i.price) || 0);
      return sum + qty * price;
    }, 0);
    return { budget, spent, remaining: budget - spent };
  }

  function syncMeta() {
    state.current.store = els.store.value.trim();
    state.current.date = els.tripDate.value || today();
    save();
    renderSummary();
  }

  function renderSummary() {
    const { budget, spent, remaining } = totalsFor(state.current);
    els.totalBudget.textContent = money(budget);
    els.totalSpent.textContent = money(spent);
    els.remaining.textContent = remaining < 0 ? `-RM${Math.abs(remaining).toFixed(2)}` : money(remaining);
    const card = els.remaining.closest(".summary-card");
    card.classList.toggle("over", remaining < 0);
    if (remaining < 0) {
      els.budgetStatus.textContent = `Over budget by RM${Math.abs(remaining).toFixed(2)}`;
    } else if (budget > 0 && remaining <= budget * 0.15) {
      els.budgetStatus.textContent = "Budget running low";
    } else {
      els.budgetStatus.textContent = budget ? "Within budget" : "Add a payment source";
    }
  }

  function renderSources() {
    els.paymentSources.innerHTML = "";
    state.current.sources.forEach(source => {
      const row = document.createElement("div");
      row.className = "source-row";
      row.innerHTML = `
        <div>
          <strong></strong>
          <span></span>
        </div>
        <div class="source-actions">
          <button class="mini-btn edit-source" type="button">Edit</button>
          <button class="mini-btn danger delete-source" type="button">Delete</button>
        </div>`;
      $("strong", row).textContent = source.name || "Payment Source";
      $("span", row).textContent = `Budget ${money(source.budget)}`;
      $(".edit-source", row).addEventListener("click", () => openSourceDialog(source));
      $(".delete-source", row).addEventListener("click", () => {
        if (!confirm(`Delete ${source.name}?`)) return;
        state.current.sources = state.current.sources.filter(s => s.id !== source.id);
        save(); renderSources(); renderSummary();
      });
      els.paymentSources.appendChild(row);
    });
  }

  function renderItems() {
    els.shoppingItems.innerHTML = "";
    const items = state.current.items;
    els.emptyItems.classList.toggle("hidden", items.length > 0);

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "item-row";

      const name = document.createElement("input");
      name.type = "text";
      name.value = item.name;
      name.placeholder = "Item name";
      name.addEventListener("input", () => {
        item.name = name.value;
        save();
      });

      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = "0.01";
      qty.step = "1";
      qty.inputMode = "decimal";
      qty.value = item.qty;
      qty.addEventListener("input", () => {
        item.qty = Math.max(0.01, Number(qty.value) || 1);
        save(); renderSummary(); updateRowSubtotal();
      });

      const price = document.createElement("input");
      price.type = "number";
      price.min = "0";
      price.step = "0.01";
      price.inputMode = "decimal";
      price.placeholder = "RM";
      price.value = item.price === "" ? "" : Number(item.price).toFixed(2);
      price.addEventListener("input", () => {
        item.price = price.value === "" ? "" : Math.max(0, Number(price.value) || 0);
        save(); renderSummary(); renderProgress(); updateRowSubtotal();
      });

      const subtotal = document.createElement("div");
      subtotal.className = "subtotal";

      function updateRowSubtotal() {
        subtotal.textContent = item.price === "" ? "—" : money((Number(item.qty) || 1) * (Number(item.price) || 0));
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-item";
      remove.setAttribute("aria-label", `Delete ${item.name || "item"}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.current.items = state.current.items.filter(i => i.id !== item.id);
        save(); renderItems(); renderSummary();
      });

      row.append(name, qty, price, subtotal, remove);
      els.shoppingItems.appendChild(row);
      updateRowSubtotal();
    });

    renderProgress();
  }

  function renderProgress() {
    const all = state.current.items.length;
    const priced = state.current.items.filter(i => i.price !== "" && i.price != null).length;
    els.itemProgress.textContent = `${priced} / ${all} items priced`;
  }

  function addItem(data = {}) {
    state.current.items.push({
      id: uuid(),
      name: data.name || "",
      qty: Number(data.qty) || 1,
      price: data.price === "" || data.price == null ? "" : Number(data.price)
    });
    save(); renderItems(); renderSummary();
    requestAnimationFrame(() => {
      const rows = $$(".item-row", els.shoppingItems);
      const last = rows[rows.length - 1];
      if (last) $("input", last).focus();
    });
  }

  function openSourceDialog(source = null) {
    $("#sourceDialogTitle").textContent = source ? "Edit Payment Source" : "Add Payment Source";
    $("#sourceId").value = source?.id || "";
    $("#sourceName").value = source?.name || "";
    $("#sourceBudget").value = source?.budget ?? "";
    $("#sourceDialog").showModal();
    setTimeout(() => $("#sourceName").focus(), 50);
  }

  function parseLine(raw) {
    let line = raw.trim().replace(/\s+/g, " ");
    if (!line) return null;

    let price = "";
    // Only a decimal at the end is confidently treated as price.
    const priceMatch = line.match(/(?:RM\s*)?(\d{1,5}\.\d{2})\s*$/i);
    if (priceMatch) {
      price = Number(priceMatch[1]);
      line = line.slice(0, priceMatch.index).trim().replace(/[-–,:]\s*$/, "").trim();
    }

    let qty = 1;
    // Detect count units, not weights/sizes such as kg, g, ml or litre.
    const qtyRegex = /(?:^|\s|[-–])(\d+(?:\.\d+)?)\s*(pack|packs|pkt|packet|packets|botol|bottle|bottles|pcs|pc|pieces|piece|unit|units|tin|tins|can|cans|bungkus)\b/i;
    const qtyMatch = line.match(qtyRegex);
    if (qtyMatch) {
      qty = Math.max(0.01, Number(qtyMatch[1]) || 1);
      line = (line.slice(0, qtyMatch.index) + " " + line.slice(qtyMatch.index + qtyMatch[0].length))
        .replace(/\s*[-–]\s*$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!line) line = raw.trim();
    }

    return { id: uuid(), name: line, qty, price };
  }

  function parsePaste(text) {
    return text
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean)
      .slice(0, 200);
  }

  function renderPastePreview() {
    const parsed = parsePaste($("#pasteText").value);
    const box = $("#pastePreview");
    if (!parsed.length) {
      box.classList.add("hidden");
      showToast("Paste at least one item.");
      return;
    }
    box.innerHTML = `
      <div class="preview-row head"><span>Item</span><span>Qty</span><span>Price</span></div>
      ${parsed.map(i => `<div class="preview-row">
        <span>${escapeHtml(i.name)}</span><span>${i.qty}</span><span>${i.price === "" ? "—" : money(i.price)}</span>
      </div>`).join("")}`;
    box.classList.remove("hidden");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  }

  function finishTripPrompt() {
    syncMeta();
    if (!state.current.items.length) {
      showToast("Add at least one shopping item first.");
      return;
    }
    const { budget, spent, remaining } = totalsFor(state.current);
    $("#finishSummary").innerHTML = `
      <div class="row"><span>Store</span><strong>${escapeHtml(state.current.store || "Not set")}</strong></div>
      <div class="row"><span>Date</span><strong>${formatDate(state.current.date)}</strong></div>
      <div class="row"><span>Items</span><strong>${state.current.items.length}</strong></div>
      <div class="row"><span>Total</span><strong>${money(spent)}</strong></div>
      <div class="row"><span>Remaining</span><strong>${remaining < 0 ? "-RM"+Math.abs(remaining).toFixed(2) : money(remaining)}</strong></div>`;
    $("#finishDialog").showModal();
  }

  function finishTrip() {
    const saved = JSON.parse(JSON.stringify(state.current));
    saved.completedAt = Date.now();
    state.history.unshift(saved);
    const keepSources = state.current.sources.map(s => ({...s}));
    state.current = blankTrip(false);
    state.current.sources = keepSources.map(s => ({...s, id: uuid()}));
    save();
    $("#finishDialog").close();
    renderAll();
    showTab("history");
    showToast("Trip saved to history.");
  }

  function renderHistory() {
    els.historyList.innerHTML = "";
    els.emptyHistory.classList.toggle("hidden", state.history.length > 0);

    state.history.forEach(trip => {
      const totals = totalsFor(trip);
      const card = document.createElement("article");
      card.className = "history-card";
      card.innerHTML = `
        <div class="history-top">
          <button class="history-main" type="button">
            <div class="history-meta">
              <span class="badge">Completed</span>
              <span class="history-date">${formatDate(trip.date)}</span>
            </div>
            <div class="history-store">${escapeHtml(trip.store || "Grocery Trip")}</div>
            <div class="history-sub">${trip.items.length} items • Budget ${money(totals.budget)}</div>
            <div class="history-amounts">
              <span>Total <strong>${money(totals.spent)}</strong></span>
              <span>Balance <strong>${totals.remaining < 0 ? "-RM"+Math.abs(totals.remaining).toFixed(2) : money(totals.remaining)}</strong></span>
            </div>
          </button>
          <div class="menu-wrap">
            <button type="button" class="menu-btn" aria-label="Trip options">⋯</button>
            <div class="trip-menu hidden">
              <button type="button" data-action="edit">Edit</button>
              <button type="button" data-action="print">Print</button>
              <button type="button" data-action="delete" class="danger">Delete</button>
            </div>
          </div>
        </div>`;

      $(".history-main", card).addEventListener("click", () => openHistoryDetail(trip.id));
      const menuBtn = $(".menu-btn", card);
      const menu = $(".trip-menu", card);
      menuBtn.addEventListener("click", e => {
        e.stopPropagation();
        $$(".trip-menu").forEach(m => { if (m !== menu) m.classList.add("hidden"); });
        menu.classList.toggle("hidden");
      });
      $$("[data-action]", menu).forEach(btn => btn.addEventListener("click", e => {
        e.stopPropagation();
        menu.classList.add("hidden");
        const action = btn.dataset.action;
        if (action === "edit") editHistoryTrip(trip.id);
        if (action === "print") printTrip(trip.id);
        if (action === "delete") deleteHistoryTrip(trip.id);
      }));
      els.historyList.appendChild(card);
    });
  }

  function openHistoryDetail(id) {
    const trip = state.history.find(t => t.id === id);
    if (!trip) return;
    selectedHistoryId = id;
    const totals = totalsFor(trip);
    $("#historyDialogTitle").textContent = trip.store || "Grocery Trip";
    $("#historyDialogSubtitle").textContent = formatDate(trip.date);
    $("#historyDetailBody").innerHTML = `
      <div class="history-detail-grid">
        <div class="history-detail-box"><span>Budget</span><strong>${money(totals.budget)}</strong></div>
        <div class="history-detail-box"><span>Total Spent</span><strong>${money(totals.spent)}</strong></div>
        <div class="history-detail-box"><span>Remaining</span><strong>${totals.remaining < 0 ? "-RM"+Math.abs(totals.remaining).toFixed(2) : money(totals.remaining)}</strong></div>
        <div class="history-detail-box"><span>Items</span><strong>${trip.items.length}</strong></div>
      </div>
      <div class="history-detail-box" style="margin-bottom:12px">
        <span>Payment Sources</span>
        <strong>${trip.sources.map(s => `${escapeHtml(s.name)} — ${money(s.budget)}`).join("<br>") || "None"}</strong>
      </div>
      <div style="overflow-x:auto">
        <table class="history-detail-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
          <tbody>${trip.items.map(i => `<tr>
            <td>${escapeHtml(i.name)}</td>
            <td>${i.qty}</td>
            <td>${i.price === "" ? "—" : money(i.price)}</td>
            <td>${i.price === "" ? "—" : money((Number(i.qty)||1)*(Number(i.price)||0))}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    $("#historyDialog").showModal();
  }

  function editHistoryTrip(id) {
    const trip = state.history.find(t => t.id === id);
    if (!trip) return;
    if (state.current.items.length && !confirm("Replace your current trip with this history trip for editing? Your unsaved current list will be replaced.")) return;

    state.history = state.history.filter(t => t.id !== id);
    state.current = JSON.parse(JSON.stringify(trip));
    delete state.current.completedAt;
    save(); renderAll(); showTab("current");
    if ($("#historyDialog").open) $("#historyDialog").close();
    showToast("Trip opened for editing. Finish it again to save.");
  }

  function deleteHistoryTrip(id) {
    const trip = state.history.find(t => t.id === id);
    if (!trip) return;
    if (!confirm(`Delete ${trip.store || "this trip"} from history?`)) return;
    state.history = state.history.filter(t => t.id !== id);
    save(); renderHistory();
    if ($("#historyDialog").open) $("#historyDialog").close();
    showToast("Trip deleted.");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "No date";
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m-1, d);
    return dt.toLocaleDateString("en-MY", { day:"numeric", month:"short", year:"numeric" });
  }

  function printTrip(id) {
    const trip = state.history.find(t => t.id === id);
    if (!trip) return;
    const t = totalsFor(trip);
    const rows = trip.items.map(i => `
      <tr>
        <td>${escapeHtml(i.name)}</td>
        <td class="num">${i.qty}</td>
        <td class="num">${i.price === "" ? "—" : money(i.price)}</td>
        <td class="num">${i.price === "" ? "—" : money((Number(i.qty)||1)*(Number(i.price)||0))}</td>
      </tr>`).join("");

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      showToast("Allow pop-ups to print this trip.");
      return;
    }

    printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Grocery Budget Receipt</title>
<style>
  @page{size:A4;margin:18mm}
  *{box-sizing:border-box}
  body{font-family:"Courier New",Courier,monospace;color:#000;background:#fff;margin:0}
  .receipt{max-width:100%;margin:0 auto}
  h1{text-align:center;font-size:20px;letter-spacing:.04em;margin:0}
  .by{text-align:center;font-size:10px;margin:3px 0 6px}
  .sub{text-align:center;font-size:12px;margin-bottom:10px}
  .line{border-top:1px dashed #000;margin:9px 0}
  .meta,.sum-row{display:flex;justify-content:space-between;gap:18px;font-size:12px;margin:4px 0}
  .section{font-weight:bold;font-size:12px;margin-top:10px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
  th,td{padding:7px 4px;border-bottom:1px dashed #999;text-align:left;vertical-align:top}
  th{font-weight:bold;border-bottom:1px solid #000}
  .num{text-align:right;white-space:nowrap}
  .totals{margin-left:auto;width:min(100%,320px);margin-top:12px}
  .grand{font-size:14px;font-weight:bold}
  .thanks{text-align:center;font-size:11px;margin-top:18px}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
<div class="receipt">
  <h1>GROCERY BUDGET</h1>
  <div class="by">by tmsz</div>
  <div class="sub">SHOPPING RECEIPT</div>
  <div class="line"></div>
  <div class="meta"><span>Date</span><strong>${escapeHtml(formatDate(trip.date))}</strong></div>
  <div class="meta"><span>Store</span><strong>${escapeHtml(trip.store || "—")}</strong></div>
  <div class="line"></div>
  <div class="section">PAYMENT SOURCES</div>
  ${trip.sources.map(s => `<div class="meta"><span>${escapeHtml(s.name)}</span><span>${money(s.budget)}</span></div>`).join("")}
  <div class="line"></div>
  <table>
    <thead><tr><th>ITEM</th><th class="num">QTY</th><th class="num">PRICE</th><th class="num">SUBTOTAL</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="sum-row"><span>Subtotal</span><strong>${money(t.spent)}</strong></div>
    <div class="sum-row"><span>Budget</span><span>${money(t.budget)}</span></div>
    <div class="sum-row grand"><span>Remaining</span><strong>${t.remaining < 0 ? "-RM"+Math.abs(t.remaining).toFixed(2) : money(t.remaining)}</strong></div>
  </div>
  <div class="line"></div>
  <div class="thanks">THANK YOU<br><small>Personal Use Record</small></div>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    printWindow.document.close();
  }

  function showTab(name) {
    $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
    els.currentPanel.classList.toggle("hidden", name !== "current");
    els.historyPanel.classList.toggle("hidden", name !== "history");
    if (name === "history") renderHistory();
  }

  function newTrip(copyPrevious = false) {
    const keepSources = state.current.sources.map(s => ({...s}));
    const next = blankTrip(false);
    next.sources = keepSources.length ? keepSources.map(s => ({...s, id: uuid()})) : [];

    if (copyPrevious && state.history.length) {
      next.items = state.history[0].items.map(i => ({
        id: uuid(), name: i.name, qty: i.qty || 1, price: ""
      }));
      next.store = state.history[0].store || "";
    }

    state.current = next;
    save(); renderAll(); showTab("current");
    $("#newTripDialog").close();
    showToast(copyPrevious ? "Previous list copied with prices cleared." : "New trip started.");
  }

  function renderAll() {
    els.store.value = state.current.store || "";
    els.tripDate.value = state.current.date || today();
    renderSources();
    renderItems();
    renderSummary();
    renderHistory();
  }

  // Events
  els.store.addEventListener("input", syncMeta);
  els.tripDate.addEventListener("change", syncMeta);

  $("#addSourceBtn").addEventListener("click", () => openSourceDialog());
  $("#sourceForm").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("#sourceId").value;
    const name = $("#sourceName").value.trim();
    const budget = Math.max(0, Number($("#sourceBudget").value) || 0);
    if (!name) return;
    if (id) {
      const s = state.current.sources.find(x => x.id === id);
      if (s) { s.name = name; s.budget = budget; }
    } else {
      state.current.sources.push({ id: uuid(), name, budget });
    }
    save(); renderSources(); renderSummary();
    $("#sourceDialog").close();
  });

  $("#addItemBtn").addEventListener("click", () => addItem());
  $("#pasteListBtn").addEventListener("click", () => {
    $("#pasteText").value = "";
    $("#pastePreview").classList.add("hidden");
    $("#pasteDialog").showModal();
  });
  $("#previewPasteBtn").addEventListener("click", renderPastePreview);
  $("#pasteForm").addEventListener("submit", e => {
    e.preventDefault();
    const parsed = parsePaste($("#pasteText").value);
    if (!parsed.length) { showToast("No items found."); return; }
    state.current.items.push(...parsed);
    save(); renderItems(); renderSummary();
    $("#pasteDialog").close();
    showToast(`${parsed.length} items imported.`);
  });

  $("#sortUnpricedBtn").addEventListener("click", () => {
    state.current.items.sort((a,b) => {
      const ap = a.price === "" || a.price == null;
      const bp = b.price === "" || b.price == null;
      return Number(bp) - Number(ap);
    });
    save(); renderItems();
  });

  $("#finishTripBtn").addEventListener("click", finishTripPrompt);
  $("#confirmFinishBtn").addEventListener("click", finishTrip);

  const openNewTrip = () => {
    $("#copyPreviousBtn").disabled = state.history.length === 0;
    $("#copyPreviousBtn").title = state.history.length ? "" : "No previous trip yet";
    $("#newTripDialog").showModal();
  };
  $("#newTripBtnTop").addEventListener("click", openNewTrip);
  $("#newTripBtnHistory").addEventListener("click", openNewTrip);
  $("#startEmptyBtn").addEventListener("click", () => {
    if (state.current.items.length && !confirm("Start a new trip? Your current unfinished list will be replaced.")) return;
    newTrip(false);
  });
  $("#copyPreviousBtn").addEventListener("click", () => {
    if (!state.history.length) return;
    if (state.current.items.length && !confirm("Copy your previous trip? Your current unfinished list will be replaced.")) return;
    newTrip(true);
  });

  $("#historyPrintBtn").addEventListener("click", () => selectedHistoryId && printTrip(selectedHistoryId));
  $("#historyEditBtn").addEventListener("click", () => selectedHistoryId && editHistoryTrip(selectedHistoryId));

  $$(".tab").forEach(tab => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
  $$("[data-close-dialog]").forEach(btn => btn.addEventListener("click", () => {
    const d = document.getElementById(btn.dataset.closeDialog);
    if (d?.open) d.close();
  }));

  document.addEventListener("click", e => {
    if (!e.target.closest(".menu-wrap")) $$(".trip-menu").forEach(m => m.classList.add("hidden"));
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  renderAll();
})();
