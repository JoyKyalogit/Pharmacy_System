import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const SESSION_KEY = "pharmacy_desk_session";

let unauthorizedHandler = null;

function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function apiRequest(path, method, token, body, extraHeaders = {}, options = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.detail;
    if (res.status === 401 && unauthorizedHandler && !options.skipSessionClear) {
      unauthorizedHandler();
    }
    let errorMessage = "Request failed";
    if (typeof detail === "string") {
      errorMessage = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      errorMessage = detail
        .map((entry) => {
          if (!entry || typeof entry !== "object") return String(entry);
          const pathText = Array.isArray(entry.loc) ? entry.loc.join(".") : "field";
          return `${pathText}: ${entry.msg || "Invalid value"}`;
        })
        .join("; ");
    } else if (detail && typeof detail === "object") {
      errorMessage = JSON.stringify(detail);
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

const PHARMACY_NAME = "LINDAH PHARMACY";
const PHARMACY_PO_BOX = "P.O BOX 135590100 MKS";
const PHARMACY_TELEPHONE = "Telephone:0757902973";
const EMPTY_MEDICINE_FORM = {
  name: "",
  batch_no: "",
  number_of_packets: "",
  tablets_per_packet: "",
  price_per_packet: "",
  price_per_tablet: "",
  buying_price: "",
  expiry_date: "",
  reorder_level: "10",
  existing_drug_id: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReceiptDateTime(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString();
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function buildReceiptPrintDocument(receipt) {
  const lineRows = (receipt.lines || [])
    .map(
      (line) => `
        <tr>
          <td class="item-name">${escapeHtml(line.drug_name)}</td>
          <td class="item-qty">${escapeHtml(line.quantity)}</td>
          <td class="item-amt">${Number(line.line_total || 0).toFixed(2)}</td>
        </tr>`
    )
    .join("");
  const discountTotal = Number(receipt.discount_total || 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receipt.receipt_no)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; width: 72mm; margin: 0 auto; color: #111; }
    h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
    .meta { text-align: center; margin: 0 0 10px; font-size: 11px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { padding: 3px 0; vertical-align: top; }
    th { border-bottom: 1px dashed #999; font-size: 10px; text-align: left; }
    .item-name { width: 55%; }
    .item-qty { width: 25%; text-align: right; }
    .item-amt { width: 20%; text-align: right; }
    .totals { border-top: 1px dashed #999; padding-top: 6px; margin-top: 6px; }
    .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
    .grand { font-weight: 700; font-size: 14px; margin-top: 4px; }
    .thanks { text-align: center; margin-top: 12px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(PHARMACY_NAME)}</h1>
  <p class="meta">
    ${escapeHtml(PHARMACY_PO_BOX)}<br />
    ${escapeHtml(PHARMACY_TELEPHONE)}<br /><br />
    Receipt: ${escapeHtml(receipt.receipt_no)}<br />
    ${escapeHtml(formatReceiptDateTime(receipt.created_at))}
    ${receipt.cashier_name ? `<br />Served by: ${escapeHtml(receipt.cashier_name)}` : ""}
  </p>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">KES</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div>
      <span>Subtotal</span>
      <span>KES ${Number(receipt.subtotal || receipt.grand_total || 0).toFixed(2)}</span>
    </div>
    ${
      discountTotal > 0
        ? `<div><span>Discount</span><span>KES ${discountTotal.toFixed(2)}</span></div>`
        : ""
    }
    <div class="grand">
      <span>Total</span>
      <span>KES ${Number(receipt.grand_total || 0).toFixed(2)}</span>
    </div>
  </div>
  <p class="thanks">Thank you for your purchase</p>
</body>
</html>`;
}

function printReceiptDocument(receipt) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Print receipt");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(buildReceiptPrintDocument(receipt));
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

export function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [isBooting, setIsBooting] = useState(true);
  const [deskStaff, setDeskStaff] = useState([]);
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [activePage, setActivePage] = useState("stock");
  const [stock, setStock] = useState([]);
  const [users, setUsers] = useState([]);
  const [appMessage, setAppMessage] = useState("");
  const [isSubmittingDrug, setIsSubmittingDrug] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);
  const [userForm, setUserForm] = useState({
    full_name: "",
    password: "",
    role: "Pharmacist",
    phone: ""
  });
  const [pinResets, setPinResets] = useState({});
  const [nameEdits, setNameEdits] = useState({});
  const [savingNameUserId, setSavingNameUserId] = useState(null);
  const [medicineForm, setMedicineForm] = useState({ ...EMPTY_MEDICINE_FORM });
  const [stockCartQty, setStockCartQty] = useState({});
  const [saleForm, setSaleForm] = useState({
    quantity: 1,
    quantity_unit: "base",
    discount: ""
  });
  const [drugSearch, setDrugSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [dailySales, setDailySales] = useState(null);
  const [reportPreset, setReportPreset] = useState("today");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [editingDrugId, setEditingDrugId] = useState(null);
  const [editingStock, setEditingStock] = useState(null);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [cart, setCart] = useState([]);
  const [calcAmountGiven, setCalcAmountGiven] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [isSearchingDrugs, setIsSearchingDrugs] = useState(false);
  const [showSaleSearchDropdown, setShowSaleSearchDropdown] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);
  const saleSearchInputRef = useRef(null);
  const saleQtyInputRef = useRef(null);
  const saleSearchWrapRef = useRef(null);

  const canUseApp = useMemo(() => Boolean(token), [token]);

  useEffect(() => {
    if (!appMessage) return undefined;
    const timer = setTimeout(() => setAppMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [appMessage]);

  const applySession = (accessToken, sessionUser) => {
    setToken(accessToken);
    setUser(sessionUser);
    setIsAdminSession(sessionUser?.role === "Admin");
  };

  const persistSession = (accessToken, sessionUser) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: accessToken, user: sessionUser }));
  };

  const loadDeskStaff = async () => {
    try {
      const data = await apiRequest("/auth/desk-staff", "GET", null, null, {}, { skipSessionClear: true });
      setDeskStaff(data || []);
      if ((data || []).length && !loginUserId) {
        setLoginUserId(String(data[0].id));
      }
    } catch {
      setDeskStaff([]);
    }
  };

  const restoreSession = async () => {
    await loadDeskStaff();
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setIsBooting(false);
      return;
    }
    try {
      const saved = JSON.parse(raw);
      if (!saved?.token) {
        sessionStorage.removeItem(SESSION_KEY);
        setIsBooting(false);
        return;
      }
      const data = await apiRequest("/stock/levels", "GET", saved.token);
      applySession(saved.token, saved.user);
      setStock(data);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    } finally {
      setIsBooting(false);
    }
  };

  const signIn = async () => {
    if (!loginUserId) {
      setAppMessage("Select your name.");
      return;
    }
    if (!loginPin.trim()) {
      setAppMessage("Enter your PIN.");
      return;
    }
    setIsSigningIn(true);
    try {
      const data = await apiRequest(
        "/auth/staff-login",
        "POST",
        null,
        { user_id: Number(loginUserId), pin: loginPin.trim() },
        {},
        { skipSessionClear: true }
      );
      const role = data.user?.role;
      if (!["Admin", "Pharmacist", "Cashier"].includes(role)) {
        setAppMessage("This account cannot use the pharmacy desk.");
        return;
      }
      applySession(data.access_token, data.user);
      persistSession(data.access_token, data.user);
      await loadStock(data.access_token);
      setLoginPin("");
      setActivePage(role === "Admin" ? "reports" : "stock");
      setAppMessage("");
    } catch (err) {
      setAppMessage(err.message || "Incorrect PIN");
    } finally {
      setIsSigningIn(false);
    }
  };

  const clearSession = useCallback((message) => {
    sessionStorage.removeItem(SESSION_KEY);
    setToken("");
    setUser(null);
    setIsAdminSession(false);
    setLastReceipt(null);
    setCart([]);
    setSearchResults([]);
    setShowSaleSearchDropdown(false);
    setSelectedDrug(null);
    setDrugSearch("");
    setStockSearch("");
    setStockCartQty({});
    setDailySales(null);
    setUsers([]);
    setMedicineForm({ ...EMPTY_MEDICINE_FORM });
    if (message) setAppMessage(message);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearSession("Session expired. Enter your PIN again.");
    });
    return () => registerUnauthorizedHandler(null);
  }, [clearSession]);

  const signOut = () => {
    clearSession("Switched user. Next person can enter their PIN.");
    setStock([]);
    setActivePage("stock");
    setLoginPin("");
    loadDeskStaff();
  };

  const goToPage = (page) => {
    setStockSearch("");
    setDrugSearch("");
    setSearchResults([]);
    setShowSaleSearchDropdown(false);
    setSelectedDrug(null);
    setActivePage(page);
  };

  const closeReceiptStep = () => {
    setLastReceipt(null);
    if (saleSearchInputRef.current) {
      saleSearchInputRef.current.focus();
    }
  };

  useEffect(() => {
    restoreSession();
  }, []);

  const loadStock = async (tokenOverride) => {
    const authToken = tokenOverride || token;
    if (!authToken) {
      setAppMessage("Please sign in again to load stock.");
      return false;
    }
    try {
      const data = await apiRequest("/stock/levels", "GET", authToken);
      setStock(data);
      return true;
    } catch (err) {
      setAppMessage(`Stock refresh failed: ${err.message}`);
      return false;
    }
  };

  const handleRefreshStock = async () => {
    if (isRefreshingStock) return;
    setIsRefreshingStock(true);
    const ok = await loadStock();
    if (ok) setAppMessage("Stock refreshed.");
    setIsRefreshingStock(false);
  };

  useEffect(() => {
    if (!token || activePage !== "stock") return;
    loadStock();
  }, [activePage, token]);

  useEffect(() => {
    if ((activePage === "reports" || activePage === "users") && !isAdminSession) {
      setActivePage("stock");
    }
  }, [activePage, isAdminSession]);

  const loadUsers = async (tokenOverride) => {
    const authToken = tokenOverride || token;
    if (!authToken) return false;
    try {
      const data = await apiRequest("/users", "GET", authToken);
      setUsers(data);
      return true;
    } catch (err) {
      setAppMessage(`Could not load users: ${err.message}`);
      return false;
    }
  };

  const createUser = async () => {
    if (!userForm.full_name.trim() || !userForm.password.trim()) {
      setAppMessage("Name and PIN are required.");
      return;
    }
    if (userForm.password.trim().length < 4) {
      setAppMessage("PIN must be at least 4 characters.");
      return;
    }
    setIsSubmittingUser(true);
    try {
      const slug = userForm.full_name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");
      const email = `${slug || "staff"}.${Date.now().toString().slice(-4)}@pharmacy.local`;
      await apiRequest("/users", "POST", token, {
        full_name: userForm.full_name.trim(),
        email,
        password: userForm.password.trim(),
        role: userForm.role,
        phone: userForm.phone.trim() || null
      });
      setAppMessage("Pharmacist added. They sign in by picking their name and entering this PIN.");
      setUserForm({
        full_name: "",
        password: "",
        role: "Pharmacist",
        phone: ""
      });
      await loadUsers();
      await loadDeskStaff();
    } catch (err) {
      setAppMessage(`Add user failed: ${err.message}`);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const resetUserPin = async (userId) => {
    const pin = (pinResets[userId] || "").trim();
    if (pin.length < 4) {
      setAppMessage("New PIN must be at least 4 characters.");
      return;
    }
    try {
      await apiRequest(`/users/${userId}`, "PUT", token, { password: pin });
      setAppMessage("PIN updated.");
      setPinResets((prev) => ({ ...prev, [userId]: "" }));
      await loadDeskStaff();
    } catch (err) {
      setAppMessage(`PIN update failed: ${err.message}`);
    }
  };

  const updateUserName = async (userId, currentName) => {
    const nextName = (nameEdits[userId] ?? currentName ?? "").trim();
    if (nextName.length < 2) {
      setAppMessage("Name must be at least 2 characters.");
      return;
    }
    if (nextName === currentName) {
      setAppMessage("Name is already up to date.");
      return;
    }
    try {
      setSavingNameUserId(userId);
      await apiRequest(`/users/${userId}`, "PUT", token, { full_name: nextName });
      setAppMessage("Name updated.");
      await loadUsers();
      await loadDeskStaff();
    } catch (err) {
      setAppMessage(`Name update failed: ${err.message}`);
    } finally {
      setSavingNameUserId(null);
    }
  };

  const deleteUser = async (userId, fullName) => {
    if (!window.confirm(`Remove ${fullName}? They will no longer appear on the login list.`)) return;
    try {
      await apiRequest(`/users/${userId}`, "DELETE", token);
      setAppMessage("User removed.");
      await loadUsers();
      await loadDeskStaff();
    } catch (err) {
      setAppMessage(`Remove failed: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!token || activePage !== "users" || !isAdminSession) return;
    loadUsers();
  }, [activePage, token, isAdminSession]);

  const computeUnitsPerPurchase = () => {
    const tabletsPerPacket = Number(medicineForm.tablets_per_packet || 0);
    return tabletsPerPacket > 0 ? tabletsPerPacket : 1;
  };

  useEffect(() => {
    if (!token || activePage !== "admin") return undefined;
    const name = medicineForm.name.trim();
    if (name.length < 2) {
      if (medicineForm.existing_drug_id) {
        setMedicineForm((prev) => ({ ...prev, existing_drug_id: null }));
      }
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest(`/drugs/match?name=${encodeURIComponent(name)}`, "GET", token);
        const match = data?.match;
        if (!match) {
          setMedicineForm((prev) => (prev.existing_drug_id ? { ...prev, existing_drug_id: null } : prev));
          return;
        }
        setMedicineForm((prev) => {
          if (prev.name.trim().toLowerCase() !== String(match.drug_name || "").toLowerCase()) return prev;
          if (prev.existing_drug_id === match.drug_id) return prev;
          const hasTablets = match.unit === "tablet" || Number(match.units_per_purchase || 1) > 1;
          return {
            ...prev,
            existing_drug_id: match.drug_id,
            name: match.drug_name,
            tablets_per_packet: hasTablets ? String(match.units_per_purchase || "") : "",
            price_per_tablet:
              hasTablets && match.last_selling_price != null ? String(match.last_selling_price) : prev.price_per_tablet,
            price_per_packet:
              !hasTablets && match.last_selling_price != null ? String(match.last_selling_price) : prev.price_per_packet,
            buying_price: match.last_unit_cost != null ? String(match.last_unit_cost) : prev.buying_price,
            reorder_level: String(match.reorder_level ?? prev.reorder_level)
          };
        });
      } catch {
        /* ignore lookup failures while typing */
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [medicineForm.name, medicineForm.existing_drug_id, token, activePage]);

  const createMedicine = async () => {
    if (!medicineForm.name.trim()) {
      setAppMessage("Medicine name is required.");
      return;
    }
    if (!medicineForm.batch_no.trim()) {
      setAppMessage("Batch number is required.");
      return;
    }
    if (!medicineForm.expiry_date) {
      setAppMessage("Expiry date is required. Medicine was not added.");
      return;
    }
    if (!medicineForm.number_of_packets || Number(medicineForm.number_of_packets) <= 0) {
      setAppMessage("Number of packets must be greater than zero.");
      return;
    }
    if (medicineForm.buying_price === "" || Number(medicineForm.buying_price) < 0) {
      setAppMessage("Buying price is required.");
      return;
    }
    const minStock = Number(medicineForm.reorder_level);
    if (Number.isNaN(minStock) || minStock < 0) {
      setAppMessage("Minimum stock level must be zero or greater.");
      return;
    }
    const tabletsPerPacket = Number(medicineForm.tablets_per_packet || 0);
    const hasTablets = tabletsPerPacket > 0;
    if (hasTablets) {
      if (!medicineForm.price_per_tablet || Number(medicineForm.price_per_tablet) <= 0) {
        setAppMessage("Selling price per tablet must be greater than zero.");
        return;
      }
    } else if (!medicineForm.price_per_packet || Number(medicineForm.price_per_packet) <= 0) {
      setAppMessage("Selling price per bottle must be greater than zero.");
      return;
    }
    setIsSubmittingDrug(true);
    try {
      let drugId = medicineForm.existing_drug_id;
      if (drugId) {
        await apiRequest(`/drugs/${drugId}`, "PUT", token, { reorder_level: minStock });
      } else {
        const sku = `${medicineForm.name.replace(/\s+/g, "-").toUpperCase()}-${Date.now().toString().slice(-5)}`;
        const createdDrug = await apiRequest("/drugs", "POST", token, {
          name: medicineForm.name.trim(),
          sku,
          unit: hasTablets ? "tablet" : "bottle",
          purchase_unit: hasTablets ? "packet" : "bottle",
          units_per_purchase: computeUnitsPerPurchase(),
          category: "General",
          reorder_level: minStock,
          is_prescription_required: false
        });
        drugId = createdDrug.id;
      }

      await apiRequest("/stock/batches", "POST", token, {
        drug_id: drugId,
        supplier_id: null,
        batch_no: medicineForm.batch_no.trim(),
        expiry_date: medicineForm.expiry_date,
        quantity_received_purchase: Number(medicineForm.number_of_packets),
        unit_cost: Number(medicineForm.buying_price),
        selling_price: hasTablets ? Number(medicineForm.price_per_tablet) : Number(medicineForm.price_per_packet)
      });

      setAppMessage(medicineForm.existing_drug_id ? "New batch added to existing medicine." : "Medicine added.");
      setMedicineForm({ ...EMPTY_MEDICINE_FORM });
      await loadStock();
    } catch (err) {
      setAppMessage(`Add medicine failed: ${err.message}`);
    } finally {
      setIsSubmittingDrug(false);
    }
  };

  const submitSale = async () => {
    if (isSubmittingSale) return;
    setIsSubmittingSale(true);
    try {
      if (cart.length === 0) {
        setAppMessage("Add at least one item to cart.");
        return;
      }
      if (cart.some((item) => !item.batch_id)) {
        setAppMessage("Each cart item must be a specific batch.");
        return;
      }
      const items = cart.map((item) => ({
        drug_id: Number(item.drug_id),
        batch_id: Number(item.batch_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount: Number(item.discount || 0)
      }));
      const payload = {
        sale_type: "OTC",
        payment_method: "CASH",
        customer_name: null,
        prescription_ref: null,
        kra_pin: null,
        etr_serial: null,
        items
      };
      const result = await apiRequest("/sales", "POST", token, payload, {
        "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`
      });
      const receiptSnapshot = {
        receipt_no: result.receipt_no,
        grand_total: result.grand_total,
        subtotal: result.subtotal,
        discount_total: result.discount_total,
        payment_method: result.payment_method,
        created_at: result.created_at,
        cashier_name: user?.name || "",
        lines: cart.map((line) => ({ ...line }))
      };
      setLastReceipt(receiptSnapshot);
      setAppMessage(`Sale created: ${result.receipt_no} (Total: KES ${Number(result.grand_total).toFixed(2)})`);
      await loadStock();
      setCart([]);
      setCalcAmountGiven("");
      setSelectedDrug(null);
      setDrugSearch("");
      setSearchResults([]);
      setSearchNonce((v) => v + 1);
      if (saleSearchInputRef.current) {
        saleSearchInputRef.current.focus();
      }
    } catch (err) {
      setAppMessage(`Sale failed: ${err.message}`);
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const formatBatchOptionLabel = (item) =>
    `${item.drug_name} · Batch ${item.batch_no} · Exp ${item.expiry_date} · ${item.available_quantity} ${item.unit}`;

  const searchDrugs = async (termOverride) => {
    const term = (termOverride ?? drugSearch).trim();
    if (!term) {
      setSearchResults([]);
      setSelectedDrug(null);
      setShowSaleSearchDropdown(false);
      return [];
    }
    try {
      setIsSearchingDrugs(true);
      const data = await apiRequest(`/drugs/search-batches?q=${encodeURIComponent(term)}`, "GET", token);
      const results = Array.isArray(data) ? data : [];
      setSearchResults(results);
      setShowSaleSearchDropdown(results.length > 0);
      return results;
    } catch (err) {
      setAppMessage(`Search failed: ${err.message}`);
      return [];
    } finally {
      setIsSearchingDrugs(false);
    }
  };

  const handleDrugSearchChange = (value) => {
    setDrugSearch(value);
    setSelectedDrug(null);
    if (!value.trim()) {
      setSearchResults([]);
      setShowSaleSearchDropdown(false);
    }
  };

  useEffect(() => {
    if (!token || activePage !== "sales") return undefined;
    const term = drugSearch.trim();
    if (!term || selectedDrug) return undefined;

    const timer = setTimeout(() => {
      searchDrugs(term);
    }, 220);
    return () => clearTimeout(timer);
  }, [drugSearch, token, activePage, selectedDrug, searchNonce]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!saleSearchWrapRef.current?.contains(event.target)) {
        setShowSaleSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const loadSalesToday = async () => {
    try {
      const data = await apiRequest("/reports/sales-summary?preset=today", "GET", token);
      setDailySales(data);
    } catch (err) {
      setAppMessage(`Daily sales report failed: ${err.message}`);
    }
  };

  const loadSalesSummary = async () => {
    try {
      let path = `/reports/sales-summary?preset=${reportPreset}`;
      if (reportPreset === "month") {
        if (!reportMonth) {
          setAppMessage("Select month first.");
          return;
        }
        const [yearStr, monthStr] = reportMonth.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr);
        const lastDay = new Date(year, month, 0).getDate();
        const startDate = `${yearStr}-${monthStr}-01`;
        const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
        path = `/reports/sales-summary?preset=custom&start_date=${startDate}&end_date=${endDate}`;
      } else if (reportPreset === "custom") {
        if (!reportStartDate || !reportEndDate) {
          setAppMessage("Select both start and end date.");
          return;
        }
        path += `&start_date=${reportStartDate}&end_date=${reportEndDate}`;
      }
      const data = await apiRequest(path, "GET", token);
      setDailySales(data);
    } catch (err) {
      setAppMessage(`Sales summary failed: ${err.message}`);
    }
  };

  const startEditDrug = (drug) => {
    setEditingDrugId(drug.batch_id ? `batch-${drug.batch_id}` : `drug-${drug.drug_id}`);
    setEditingStock({
      drug_id: drug.drug_id,
      batch_id: drug.batch_id || null,
      drug_name: drug.drug_name || "",
      batch_no: drug.batch_no || "",
      total_quantity: String(drug.total_quantity ?? 0),
      unit_price: String(drug.unit_price ?? 0),
      unit_cost: String(drug.unit_cost ?? 0),
      nearest_expiry: drug.nearest_expiry || ""
    });
  };

  const cancelEditDrug = () => {
    setEditingDrugId(null);
    setEditingStock(null);
  };

  const saveEditDrug = async () => {
    if (!editingStock) return;
    if (!editingStock.drug_name.trim()) {
      setAppMessage("Medicine name is required.");
      return;
    }
    if (editingStock.batch_id) {
      if (!editingStock.batch_no.trim()) {
        setAppMessage("Batch number is required.");
        return;
      }
      if (!editingStock.nearest_expiry) {
        setAppMessage("Expiry date is required.");
        return;
      }
      const qty = Number(editingStock.total_quantity);
      if (Number.isNaN(qty) || qty < 0) {
        setAppMessage("Available stock must be zero or greater.");
        return;
      }
    }
    try {
      await apiRequest(`/drugs/${editingStock.drug_id}`, "PUT", token, { name: editingStock.drug_name.trim() });
      if (editingStock.batch_id) {
        await apiRequest(`/stock/batches/${editingStock.batch_id}`, "PUT", token, {
          batch_no: editingStock.batch_no.trim(),
          expiry_date: editingStock.nearest_expiry,
          quantity_available: Number(editingStock.total_quantity),
          unit_cost: Number(editingStock.unit_cost || 0),
          selling_price: Number(editingStock.unit_price || 0)
        });
      }
      setAppMessage("Stock updated.");
      cancelEditDrug();
      await loadStock();
    } catch (err) {
      setAppMessage(`Update failed: ${err.message}`);
    }
  };

  const deleteDrug = async (drugId) => {
    try {
      await apiRequest(`/drugs/${drugId}`, "DELETE", token);
      setAppMessage("Medicine deleted.");
      await loadStock();
    } catch (err) {
      setAppMessage(`Delete failed: ${err.message}`);
    }
  };

  const pickDrug = (drug) => {
    setSelectedDrug(drug);
    setSaleForm((prev) => ({ ...prev, quantity: 1, quantity_unit: "base", discount: "" }));
    setDrugSearch(drug.drug_name || "");
    setSearchResults([]);
    setShowSaleSearchDropdown(false);
  };

  const formatDisplayQuantity = (totalQty, unit, purchaseUnit, unitsPerPurchase) => {
    const baseQty = Number(totalQty || 0);
    const packSize = Number(unitsPerPurchase || 1);
    if (packSize <= 1 || !purchaseUnit) {
      return `${baseQty} ${unit || ""}`.trim();
    }
    const packs = Math.floor(baseQty / packSize);
    const remainder = baseQty % packSize;
    if (packs > 0 && remainder > 0) return `${packs} ${purchaseUnit} + ${remainder} ${unit}`;
    if (packs > 0) return `${packs} ${purchaseUnit}`;
    return `${remainder} ${unit}`;
  };

  const addCartLine = () => {
    if (!selectedDrug) {
      setAppMessage("Select a drug first.");
      return;
    }
    const qty = Number(saleForm.quantity);
    if (!qty || qty <= 0) {
      setAppMessage("Quantity must be greater than zero.");
      return;
    }
    const discount = Number(saleForm.discount || 0);
    if (discount < 0) {
      setAppMessage("Discount cannot be negative.");
      return;
    }
    const isPurchaseUnit = saleForm.quantity_unit === "purchase";
    const conversionFactor = Number(selectedDrug.units_per_purchase || 1);
    const qtyInBaseUnit = isPurchaseUnit ? qty * conversionFactor : qty;
    if (qtyInBaseUnit > Number(selectedDrug.available_quantity || 0)) {
      setAppMessage(`Only ${selectedDrug.available_quantity} ${selectedDrug.unit} available in this batch.`);
      return;
    }
    const unitPrice = Number(selectedDrug.unit_price || 0);
    const gross = qtyInBaseUnit * unitPrice;
    if (discount > gross) {
      setAppMessage("Discount cannot exceed line total.");
      return;
    }
    const lineKey = `${selectedDrug.drug_id}-${selectedDrug.batch_id}`;
    const existingIndex = cart.findIndex((i) => i.line_key === lineKey);
    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].quantity + qtyInBaseUnit;
      if (newQty > Number(selectedDrug.available_quantity || 0)) {
        setAppMessage(`Only ${selectedDrug.available_quantity} ${selectedDrug.unit} available in this batch.`);
        return;
      }
      const newDiscount = Number(updated[existingIndex].discount || 0) + discount;
      const newGross = newQty * updated[existingIndex].unit_price;
      if (newDiscount > newGross) {
        setAppMessage("Discount cannot exceed line total.");
        return;
      }
      updated[existingIndex] = {
        ...updated[existingIndex],
                      quantity: newQty,
                      quantity_label: String(newQty),
        discount: newDiscount,
        line_total: newGross - newDiscount
      };
      setCart(updated);
    } else {
      setCart((prev) => [
        ...prev,
        {
          line_key: lineKey,
          drug_id: selectedDrug.drug_id,
          batch_id: selectedDrug.batch_id,
          drug_name: selectedDrug.drug_name,
          batch_no: selectedDrug.batch_no,
          expiry_date: selectedDrug.expiry_date,
          quantity: qtyInBaseUnit,
          quantity_label: String(qtyInBaseUnit),
          unit_price: unitPrice,
          discount,
          line_total: gross - discount
        }
      ]);
    }
    setSaleForm((prev) => ({ ...prev, quantity: 1, quantity_unit: "base", discount: "" }));
    setSelectedDrug(null);
    setDrugSearch("");
    setSearchResults([]);
    if (saleSearchInputRef.current) {
      saleSearchInputRef.current.focus();
    }
  };

  const addStockRowToCart = (row) => {
    if (!row?.batch_id) {
      setAppMessage("This stock row has no batch to sell.");
      return;
    }
    if (row.is_expired) {
      setAppMessage("Cannot sell expired stock.");
      return;
    }
    const qty = Number(stockCartQty[row.batch_id]);
    if (!stockCartQty[row.batch_id] || Number.isNaN(qty) || qty <= 0) {
      setAppMessage("Enter a quantity first.");
      return;
    }
    if (qty > Number(row.total_quantity || 0)) {
      setAppMessage(`Only ${row.total_quantity} available in this batch.`);
      return;
    }
    const unitPrice = Number(row.unit_price || 0);
    const lineKey = `${row.drug_id}-${row.batch_id}`;
    const existingIndex = cart.findIndex((i) => i.line_key === lineKey);
    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].quantity + qty;
      if (newQty > Number(row.total_quantity || 0)) {
        setAppMessage(`Only ${row.total_quantity} available in this batch.`);
        return;
      }
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        quantity_label: String(newQty),
        line_total: newQty * updated[existingIndex].unit_price - Number(updated[existingIndex].discount || 0)
      };
      setCart(updated);
    } else {
      setCart((prev) => [
        ...prev,
        {
          line_key: lineKey,
          drug_id: row.drug_id,
          batch_id: row.batch_id,
          drug_name: row.drug_name,
          batch_no: row.batch_no,
          expiry_date: row.nearest_expiry,
          quantity: qty,
          quantity_label: String(qty),
          unit_price: unitPrice,
          discount: 0,
          line_total: qty * unitPrice
        }
      ]);
    }
    setStockCartQty((prev) => ({ ...prev, [row.batch_id]: "" }));
    setAppMessage(`${row.drug_name} (batch ${row.batch_no || "-"}) added to cart. Open Transact to finish.`);
  };

  const removeCartLine = (lineKey) => {
    setCart((prev) => prev.filter((item) => item.line_key !== lineKey));
  };

  const clearCart = () => {
    setCart([]);
    setCalcAmountGiven("");
    setAppMessage("Cart cleared.");
  };

  const saleSubtotal = cart.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
  const saleDiscountTotal = cart.reduce((sum, line) => sum + Number(line.discount || 0), 0);
  const saleGrandTotal = Math.max(0, saleSubtotal - saleDiscountTotal);
  const calcChange =
    calcAmountGiven === "" || Number.isNaN(Number(calcAmountGiven))
      ? null
      : Number(calcAmountGiven) - saleGrandTotal;
  const filteredStock = stock
    .filter((s) => s.drug_name.toLowerCase().includes(stockSearch.trim().toLowerCase()))
    .sort((a, b) => a.drug_name.localeCompare(b.drug_name));

  const uniqueDrugIds = new Set(stock.map((s) => s.drug_id));
  const lowStockItems = stock.filter((s) => s.is_low_stock && s.batch_id);
  const lowStockUnique = lowStockItems;
  const nearExpiryItems = stock.filter((s) => s.is_near_expiry);
  const expiredItems = stock.filter((s) => s.is_expired);
  const totalMedicines = uniqueDrugIds.size;
  const totalUnitsInStock = stock.reduce((sum, item) => sum + Number(item.total_quantity || 0), 0);
  const formatMonthYear = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length < 2) return dateStr;
    return `${Number(parts[1])}/${parts[0]}`;
  };
  const reportPeriodLabel = dailySales?.range
    ? dailySales.range.start_date === dailySales.range.end_date
      ? formatMonthYear(dailySales.range.start_date)
      : `${formatMonthYear(dailySales.range.start_date)} – ${formatMonthYear(dailySales.range.end_date)}`
    : dailySales?.date
      ? formatMonthYear(dailySales.date)
      : "";
  const formatReportDayLabel = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length < 3) return dateStr;
    return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
  };
  const hasReportData = Boolean(
    dailySales &&
      (Number(dailySales.sales_count) > 0 ||
        Number(dailySales.gross_revenue) > 0 ||
        (dailySales.items?.length ?? 0) > 0 ||
        (dailySales.by_pharmacist?.length ?? 0) > 0)
  );
  const reportDaysWithSales = (dailySales?.daily_totals ?? []).filter(
    (row) => Number(row.sales_count) > 0 || Number(row.gross_revenue) > 0
  );
  const showDailyBreakdown = reportDaysWithSales.length > 1;

  return (
    <div className="container">
      {isBooting ? (
        <section className="card desk-login-card">
          <h1>Lindah Pharmacy</h1>
          <p>Starting...</p>
        </section>
      ) : !canUseApp ? (
        <section className="card desk-login-card">
          <h1>Lindah Pharmacy</h1>
          <p>Select your name and enter your PIN.</p>
          <label htmlFor="login-user">Name</label>
          <select
            id="login-user"
            value={loginUserId}
            onChange={(e) => setLoginUserId(e.target.value)}
          >
            {deskStaff.length === 0 ? <option value="">No staff yet — ask admin</option> : null}
            {deskStaff.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <label htmlFor="login-pin">PIN</label>
          <input
            id="login-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Your PIN"
            value={loginPin}
            onChange={(e) => setLoginPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") signIn();
            }}
          />
          <button type="button" onClick={signIn} disabled={isSigningIn || !loginUserId}>
            {isSigningIn ? "Signing in..." : "Enter"}
          </button>
          {appMessage ? <p className="desk-login-error">{appMessage}</p> : null}
        </section>
      ) : (
        <div className="app-shell">
          <aside className="sidebar top-nav">
            <div className="top-nav-brand">
              <h2 className="brand-logo">LP</h2>
              <div>
                <h3>LINDAH PHARMACY</h3>
              </div>
            </div>
            <div className="session-user-badge" title="Sales are recorded under this account">
              <strong className="session-user-name">Logged in as {user?.name || "Unknown"}</strong>
            </div>
            <div className="tabs nav-tabs">
              <button
                type="button"
                className={activePage === "stock" ? "active-tab" : ""}
                onClick={() => goToPage("stock")}
              >
                Stock
              </button>
              <button
                type="button"
                className={activePage === "admin" ? "active-tab" : ""}
                onClick={() => goToPage("admin")}
              >
                Add medicine
              </button>
              <button
                type="button"
                className={activePage === "sales" ? "active-tab" : ""}
                onClick={() => goToPage("sales")}
              >
                Transact{cart.length ? ` (${cart.length})` : ""}
              </button>
              {isAdminSession ? (
                <>
                  <button
                    type="button"
                    className={`nav-reports-admin${activePage === "reports" ? " active-tab" : ""}`}
                    onClick={() => goToPage("reports")}
                  >
                    Reports (Admin)
                  </button>
                  <button
                    type="button"
                    className={`nav-reports-admin${activePage === "users" ? " active-tab" : ""}`}
                    onClick={() => goToPage("users")}
                  >
                    Pharmacists
                  </button>
                </>
              ) : null}
              <button type="button" className="nav-lock-desk" onClick={signOut}>
                Switch user
              </button>
            </div>
          </aside>

          <main className="main-content">
            {activePage === "stock" ? (
              <>
                <section className="topbar">
                  <div>
                    <h1>Lindah Pharmacy</h1>
                  </div>
                </section>

                <section className="kpi-grid kpi-grid-stock">
                  <div className="kpi-card kpi-card-compact">
                    <p className="kpi-label">Medicines</p>
                    <h3>{totalMedicines}</h3>
                  </div>
                  <div className="kpi-card kpi-card-compact">
                    <p className="kpi-label">Units in stock</p>
                    <h3>{totalUnitsInStock}</h3>
                  </div>
                </section>

                <section className="alert-strip">
                  <div className={`alert-chip ${lowStockUnique.length > 0 ? "alert-chip-warn" : ""}`}>
                    <p className="alert-chip-title">Low stock: {lowStockUnique.length}</p>
                    {lowStockUnique.length > 0 ? (
                      <ul className="alert-chip-list">
                        {lowStockUnique.map((i) => (
                          <li key={`low-${i.batch_id || i.drug_id}`}>
                            {i.drug_name}
                            {i.batch_no ? <span className="alert-batch">{i.batch_no}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="alert-chip-empty">None</p>
                    )}
                  </div>
                  <div className={`alert-chip ${nearExpiryItems.length > 0 ? "alert-chip-expiry" : ""}`}>
                    <p className="alert-chip-title">Expiring in 3 months: {nearExpiryItems.length}</p>
                    {nearExpiryItems.length > 0 ? (
                      <ul className="alert-chip-list">
                        {nearExpiryItems.map((i) => (
                          <li key={`exp-${i.batch_id || i.drug_id}`}>
                            {i.drug_name}
                            {i.batch_no ? <span className="alert-batch">{i.batch_no}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="alert-chip-empty">None</p>
                    )}
                  </div>
                  {expiredItems.length > 0 ? (
                    <div className="alert-chip alert-chip-expired">
                      <p className="alert-chip-title">Expired: {expiredItems.length}</p>
                      <ul className="alert-chip-list">
                        {expiredItems.map((i) => (
                          <li key={`gone-${i.batch_id || i.drug_id}`}>
                            {i.drug_name}
                            {i.batch_no ? <span className="alert-batch">{i.batch_no}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>

                <section className="card">
                  <div className="stock-toolbar">
                    <h2>Stock</h2>
                    <button type="button" onClick={handleRefreshStock} disabled={isRefreshingStock}>
                      {isRefreshingStock ? "Refreshing..." : "Refresh stock"}
                    </button>
                  </div>
                  <input
                    className="stock-search"
                    placeholder="Search medicine..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                  />
                  <table>
                    <thead>
                      <tr>
                        <th>Drug</th>
                        <th>Batch number</th>
                        <th>Quantity</th>
                        <th>Available stock</th>
                        <th>Buying Price</th>
                        <th>Selling Price</th>
                        <th>Expiry date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map((s) => {
                        const rowKey = s.batch_id ? `batch-${s.batch_id}` : `drug-${s.drug_id}`;
                        const isEditing = editingDrugId === rowKey && editingStock;
                        return (
                        <tr key={rowKey}>
                          <td>
                            {isEditing ? (
                              <input
                                value={editingStock.drug_name}
                                onChange={(e) => setEditingStock({ ...editingStock, drug_name: e.target.value })}
                              />
                            ) : (
                              s.drug_name
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                value={editingStock.batch_no}
                                onChange={(e) => setEditingStock({ ...editingStock, batch_no: e.target.value })}
                                disabled={!editingStock.batch_id}
                              />
                            ) : (
                              s.batch_no || "-"
                            )}
                          </td>
                          <td>
                            {formatDisplayQuantity(
                              isEditing ? editingStock.total_quantity : s.total_quantity,
                              s.unit,
                              s.purchase_unit,
                              s.units_per_purchase
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={editingStock.total_quantity}
                                onChange={(e) => setEditingStock({ ...editingStock, total_quantity: e.target.value })}
                                disabled={!editingStock.batch_id}
                              />
                            ) : (
                              `${Number(s.total_quantity || 0)} ${s.unit || "units"}`
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingStock.unit_cost}
                                onChange={(e) => setEditingStock({ ...editingStock, unit_cost: e.target.value })}
                                disabled={!editingStock.batch_id}
                              />
                            ) : (
                              Number(s.unit_cost || 0).toFixed(2)
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingStock.unit_price}
                                onChange={(e) => setEditingStock({ ...editingStock, unit_price: e.target.value })}
                                disabled={!editingStock.batch_id}
                              />
                            ) : (
                              Number(s.unit_price || 0).toFixed(2)
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="date"
                                value={editingStock.nearest_expiry}
                                onChange={(e) => setEditingStock({ ...editingStock, nearest_expiry: e.target.value })}
                                disabled={!editingStock.batch_id}
                              />
                            ) : (
                              s.nearest_expiry || "-"
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <div className="action-buttons">
                                <button type="button" onClick={saveEditDrug}>
                                  Save
                                </button>
                                <button type="button" onClick={cancelEditDrug}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="action-buttons stock-row-actions">
                                <button type="button" onClick={() => startEditDrug(s)}>
                                  Edit
                                </button>
                                <button type="button" onClick={() => deleteDrug(s.drug_id)}>
                                  Delete
                                </button>
                                <input
                                  className="stock-cart-qty"
                                  type="number"
                                  min="1"
                                  placeholder="Qty"
                                  value={stockCartQty[s.batch_id] ?? ""}
                                  onChange={(e) =>
                                    setStockCartQty({ ...stockCartQty, [s.batch_id]: e.target.value })
                                  }
                                  disabled={!s.batch_id || s.is_expired}
                                  title="Quantity to cart"
                                />
                                <button
                                  type="button"
                                  className="btn-add-to-cart"
                                  onClick={() => addStockRowToCart(s)}
                                  disabled={!s.batch_id || s.is_expired || Number(s.total_quantity || 0) <= 0}
                                >
                                  Add to cart
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              </>
            ) : null}

            {activePage === "admin" ? (
              <section className="card">
              <h2>Add medicine</h2>
              <div className="grid">
                <label>
                  Medicine Name
                  <input
                    value={medicineForm.name}
                    onChange={(e) =>
                      setMedicineForm({ ...medicineForm, name: e.target.value, existing_drug_id: null })
                    }
                  />
                </label>
                {medicineForm.existing_drug_id ? (
                  <p className="sales-helper-text">
                    Existing medicine found. Batch fields are ready to edit for a new batch.
                  </p>
                ) : null}
                <label>
                  Batch number
                  <input
                    value={medicineForm.batch_no}
                    onChange={(e) => setMedicineForm({ ...medicineForm, batch_no: e.target.value })}
                  />
                </label>
                <label>
                  Number of packets
                  <input
                    type="number"
                    value={medicineForm.number_of_packets}
                    onChange={(e) => setMedicineForm({ ...medicineForm, number_of_packets: e.target.value })}
                  />
                </label>
                <label>
                  Number of tablets per packet
                  <input
                    type="number"
                    value={medicineForm.tablets_per_packet}
                    onChange={(e) => setMedicineForm({ ...medicineForm, tablets_per_packet: e.target.value })}
                  />
                </label>
                <label>
                  Selling price per tablet
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medicineForm.price_per_tablet}
                    onChange={(e) => setMedicineForm({ ...medicineForm, price_per_tablet: e.target.value })}
                  />
                </label>
                <label>
                  {Number(medicineForm.tablets_per_packet || 0) > 0 ? "Selling price per packet" : "Selling price per bottle"}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      Number(medicineForm.tablets_per_packet || 0) > 0 &&
                      Number(medicineForm.price_per_tablet || 0) > 0
                        ? (Number(medicineForm.price_per_tablet) * Number(medicineForm.tablets_per_packet)).toFixed(2)
                        : medicineForm.price_per_packet
                    }
                    onChange={(e) => setMedicineForm({ ...medicineForm, price_per_packet: e.target.value })}
                    disabled={Number(medicineForm.tablets_per_packet || 0) > 0}
                  />
                </label>
                <label>
                  Buying Price
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medicineForm.buying_price}
                    onChange={(e) => setMedicineForm({ ...medicineForm, buying_price: e.target.value })}
                  />
                </label>
                <label>
                  Expiry Date
                  <input
                    type="date"
                    required
                    value={medicineForm.expiry_date}
                    onChange={(e) => setMedicineForm({ ...medicineForm, expiry_date: e.target.value })}
                  />
                </label>
                <label>
                  Minimum stock level
                  <input
                    type="number"
                    min="0"
                    value={medicineForm.reorder_level}
                    onChange={(e) => setMedicineForm({ ...medicineForm, reorder_level: e.target.value })}
                  />
                </label>
              </div>
              <button onClick={createMedicine} disabled={isSubmittingDrug}>
                {isSubmittingDrug ? "Saving..." : "Add Medicine"}
              </button>
              </section>
            ) : null}

            {activePage === "sales" ? (
              <section className="card">
              <h2>Transact</h2>
              <div className="grid">
                <div className="sale-search-wrap" ref={saleSearchWrapRef}>
                  <input
                    placeholder="Search medicine or batch number..."
                    value={drugSearch}
                    ref={saleSearchInputRef}
                    onFocus={() => {
                      if (searchResults.length > 0) setShowSaleSearchDropdown(true);
                    }}
                    onChange={(e) => handleDrugSearchChange(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (selectedDrug) {
                        saleQtyInputRef.current?.focus();
                        return;
                      }
                      const data = await searchDrugs(drugSearch);
                      if ((data || []).length === 1) {
                        pickDrug(data[0]);
                        saleQtyInputRef.current?.focus();
                      } else if ((data || []).length > 1) {
                        setAppMessage("Select a batch from the list (nearest expiry first).");
                      } else {
                        setAppMessage("No medicine batch found.");
                      }
                    }}
                  />
                  {showSaleSearchDropdown && searchResults.length > 0 ? (
                    <ul className="sale-search-dropdown" role="listbox">
                      {searchResults.map((item, index) => (
                        <li key={`${item.batch_id}-${item.drug_id}`}>
                          <button
                            type="button"
                            className={`sale-search-option${index === 0 ? " sale-search-option-first" : ""}`}
                            onClick={() => {
                              pickDrug(item);
                              saleQtyInputRef.current?.focus();
                            }}
                          >
                            <span className="sale-search-option-title">{item.drug_name}</span>
                            <span className="sale-search-option-meta">
                              Batch {item.batch_no} · Expires {item.expiry_date}
                              {index === 0 ? " · Sells first" : ""}
                            </span>
                            <span className="sale-search-option-meta">
                              {item.available_quantity} {item.unit} @ {Number(item.unit_price).toFixed(2)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <label>
                  Quantity (tablets/bottles)
                  <input
                    placeholder="Quantity (tablets/bottles)"
                    type="number"
                    ref={saleQtyInputRef}
                    value={saleForm.quantity}
                    onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCartLine();
                      }
                    }}
                  />
                </label>
                <select value={saleForm.quantity_unit} onChange={(e) => setSaleForm({ ...saleForm, quantity_unit: e.target.value })} disabled={!selectedDrug}>
                  <option value="base">{selectedDrug ? `${selectedDrug.unit} (base unit)` : "Base unit"}</option>
                  {selectedDrug && Number(selectedDrug.units_per_purchase || 1) > 1 ? <option value="purchase">{selectedDrug.purchase_unit} (pack/box)</option> : null}
                </select>
                <input placeholder="Unit price (auto)" value={selectedDrug ? selectedDrug.unit_price : ""} disabled />
                <label>
                  Discount (KES)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={saleForm.discount}
                    onChange={(e) => setSaleForm({ ...saleForm, discount: e.target.value })}
                  />
                </label>
              </div>
              <p className="sales-helper-text">
                {isSearchingDrugs
                  ? "Searching batches..."
                  : "Batches are sorted by nearest expiry. Pick the batch to sell, then quantity."}
              </p>
              <button onClick={addCartLine}>Add to Cart</button>
              <h3>Cart</h3>
              <table>
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Discount</th>
                    <th>Discounted Price</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line) => (
                    <tr key={line.line_key}>
                      <td>{line.drug_name}</td>
                      <td>{line.batch_no || "-"}</td>
                      <td>{line.expiry_date || "-"}</td>
                      <td>{line.quantity_label || line.quantity}</td>
                      <td>{Number(line.unit_price).toFixed(2)}</td>
                      <td>{Number(line.discount || 0).toFixed(2)}</td>
                      <td>{Number(line.line_total).toFixed(2)}</td>
                      <td>
                        <button type="button" onClick={() => removeCartLine(line.line_key)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <strong>Total:</strong> {saleGrandTotal.toFixed(2)}
              </p>
              <div className="cash-calculator">
                <h3>Change calculator</h3>
                <div className="grid">
                  <label>
                    Sale total (KES)
                    <input type="number" value={saleGrandTotal.toFixed(2)} disabled />
                  </label>
                  <label>
                    Amount given (KES)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Customer paid"
                      value={calcAmountGiven}
                      onChange={(e) => setCalcAmountGiven(e.target.value)}
                    />
                  </label>
                </div>
                <p>
                  <strong>Change to give:</strong> {calcChange === null ? "—" : calcChange.toFixed(2)}
                </p>
              </div>
              <div className="sale-actions">
                <button
                  type="button"
                  className="btn-clear-cart"
                  onClick={clearCart}
                  disabled={cart.length === 0 || isSubmittingSale}
                >
                  Clear cart
                </button>
                {!lastReceipt ? (
                  <button
                    type="button"
                    className="btn-finalize-sale"
                    onClick={submitSale}
                    disabled={isSubmittingSale || cart.length === 0}
                  >
                    {isSubmittingSale ? "Processing..." : "Finalize sale"}
                  </button>
                ) : null}
              </div>
              </section>
            ) : null}

            {activePage === "sales" && lastReceipt ? (
              <div className="receipt-step-overlay" role="dialog" aria-modal="true">
                <section className="card receipt-step-modal">
                  <h2>Sale finalized</h2>
                  <p>
                    Receipt <strong>{lastReceipt.receipt_no}</strong> · Total{" "}
                    <strong>KES {Number(lastReceipt.grand_total || 0).toFixed(2)}</strong>
                    {lastReceipt.cashier_name ? (
                      <>
                        {" "}
                        · By <strong>{lastReceipt.cashier_name}</strong>
                      </>
                    ) : null}
                  </p>
                  <div className="action-buttons">
                    <button type="button" onClick={() => printReceiptDocument(lastReceipt)}>
                      Print receipt
                    </button>
                    <button type="button" onClick={closeReceiptStep}>
                      Done
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {activePage === "users" && isAdminSession ? (
              <section className="card">
                <h2>Pharmacists</h2>
                <button type="button" onClick={() => goToPage("stock")}>
                  Back to stock
                </button>
                <p className="sales-helper-text">Add a user.</p>
                <form
                  className="grid pharmacist-add-form"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createUser();
                  }}
                >
                  <label>
                    Full name
                    <input
                      name="pharmacy-staff-full-name"
                      autoComplete="off"
                      value={userForm.full_name}
                      onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    />
                  </label>
                  <label>
                    PIN
                    <input
                      name="pharmacy-staff-new-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="4 characters"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    />
                  </label>
                  <label>
                    Role
                    <select
                      name="pharmacy-staff-role"
                      autoComplete="off"
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    >
                      <option value="Pharmacist">Pharmacist</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </label>
                  <label>
                    Phone (optional)
                    <input
                      name="pharmacy-staff-phone"
                      autoComplete="off"
                      value={userForm.phone}
                      onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    />
                  </label>
                  <button type="submit" disabled={isSubmittingUser}>
                    {isSubmittingUser ? "Saving..." : "Add user"}
                  </button>
                </form>
                <h3>Accounts</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Set / change PIN</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="action-buttons">
                            <input
                              value={nameEdits[u.id] ?? u.full_name}
                              onChange={(e) => setNameEdits({ ...nameEdits, [u.id]: e.target.value })}
                              placeholder="Full name"
                            />
                            <button
                              type="button"
                              onClick={() => updateUserName(u.id, u.full_name)}
                              disabled={savingNameUserId === u.id}
                            >
                              {savingNameUserId === u.id ? "Saving..." : "Save name"}
                            </button>
                          </div>
                        </td>
                        <td>{u.role}</td>
                        <td>
                          <div className="action-buttons">
                            <input
                              type="password"
                              inputMode="numeric"
                              autoComplete="new-password"
                              name={`pharmacy-staff-reset-pin-${u.id}`}
                              placeholder="4 characters"
                              value={pinResets[u.id] || ""}
                              onChange={(e) => setPinResets({ ...pinResets, [u.id]: e.target.value })}
                            />
                            <button type="button" onClick={() => resetUserPin(u.id)}>
                              Save PIN
                            </button>
                          </div>
                        </td>
                        <td>
                          {u.id === user?.id ? (
                            "Current login"
                          ) : (
                            <button type="button" onClick={() => deleteUser(u.id, u.full_name)}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activePage === "reports" && isAdminSession ? (
              <section className="card">
                <h2>Sales Reports</h2>
                <button type="button" onClick={() => goToPage("stock")}>
                  Back to stock
                </button>
                <div className="grid">
                  <select value={reportPreset} onChange={(e) => setReportPreset(e.target.value)}>
                    <option value="today">Today</option>
                    <option value="month">By Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                  {reportPreset === "month" ? (
                    <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
                  ) : null}
                  {reportPreset === "custom" ? (
                    <>
                      <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                      <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                    </>
                  ) : null}
                </div>
                <button onClick={loadSalesSummary}>Load Report</button>
                <button onClick={loadSalesToday}>Todays Report</button>
                {dailySales ? (
                  <div>
                    <p>
                      <strong>Period:</strong> {reportPeriodLabel}
                    </p>
                    {!hasReportData ? (
                      <p className="report-empty">No report available for this period.</p>
                    ) : (
                      <>
                    <p>
                      <strong>Total — Transactions:</strong> {dailySales.sales_count} ·{" "}
                      <strong>Revenue:</strong> KES {Number(dailySales.gross_revenue || 0).toFixed(2)}
                    </p>

                    {reportDaysWithSales.length ? (
                      <>
                        <h3>{showDailyBreakdown ? "Daily sales" : "Day sales"}</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Transactions</th>
                              <th>Revenue (KES)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportDaysWithSales.map((row) => (
                              <tr key={row.date}>
                                <td>{formatReportDayLabel(row.date)}</td>
                                <td>{row.sales_count}</td>
                                <td>{Number(row.gross_revenue || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          {showDailyBreakdown ? (
                            <tfoot>
                              <tr>
                                <td>
                                  <strong>Period total</strong>
                                </td>
                                <td>
                                  <strong>{dailySales.sales_count}</strong>
                                </td>
                                <td>
                                  <strong>{Number(dailySales.gross_revenue || 0).toFixed(2)}</strong>
                                </td>
                              </tr>
                            </tfoot>
                          ) : null}
                        </table>
                      </>
                    ) : null}

                    {dailySales.by_pharmacist?.length ? (
                      <>
                        <h3>Sales by pharmacist</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Pharmacist</th>
                              <th>Transactions</th>
                              <th>Amount (KES)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailySales.by_pharmacist.map((row) => (
                              <tr key={`${row.user_id}-${row.date}`}>
                                <td>{formatReportDayLabel(row.date)}</td>
                                <td>{row.pharmacist_name}</td>
                                <td>{row.sales_count}</td>
                                <td>{Number(row.gross_revenue || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    ) : null}

                    {dailySales.items?.length ? (
                      <>
                        <h3>Medicines sold</h3>
                        <table>
                          <thead>
                            <tr>
                              <th>Medicine</th>
                              <th>Quantity Sold</th>
                              <th>Buying Price (KES)</th>
                              <th>Amount (KES)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailySales.items.map((row) => (
                              <tr key={row.drug_id}>
                                <td>{row.drug_name}</td>
                                <td>{row.quantity}</td>
                                <td>{Number(row.buying_price || 0).toFixed(2)}</td>
                                <td>{Number(row.amount || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <p>Load a report to view totals and medicine quantities.</p>
                )}
              </section>
            ) : null}

            {appMessage ? <section className="card">{appMessage}</section> : null}
          </main>
        </div>
      )}
    </div>
  );
}
