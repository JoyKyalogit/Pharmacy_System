import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

async function apiRequest(path, method, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Request failed");
  }
  return res.json();
}

export function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState("stock");
  const [email, setEmail] = useState("admin@pharmacy.local");
  const [password, setPassword] = useState("SecurePass123!");
  const [stock, setStock] = useState([]);
  const [appMessage, setAppMessage] = useState("");
  const [isSubmittingDrug, setIsSubmittingDrug] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [medicineForm, setMedicineForm] = useState({
    name: "",
    quantity_per_box: "",
    quantity_per_packet: "",
    quantity: "",
    price: 0,
    expiry_date: ""
  });
  const [saleForm, setSaleForm] = useState({
    sale_type: "OTC",
    payment_method: "CASH",
    prescription_ref: "",
    kra_pin: "",
    etr_serial: "",
    quantity: 1,
    quantity_unit: "base"
  });
  const [drugSearch, setDrugSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [dailySales, setDailySales] = useState(null);
  const [reportPreset, setReportPreset] = useState("today");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [editingDrugId, setEditingDrugId] = useState(null);
  const [editingDrugName, setEditingDrugName] = useState("");
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [cart, setCart] = useState([]);
  const [stockSearch, setStockSearch] = useState("");

  const canUseApp = useMemo(() => Boolean(token), [token]);

  useEffect(() => {
    if (!appMessage) return undefined;
    const timer = setTimeout(() => setAppMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [appMessage]);

  const login = async () => {
    try {
      const data = await apiRequest("/auth/login", "POST", null, { email, password });
      setToken(data.access_token);
      setUser(data.user);
      setAppMessage("Login successful");
      await loadStock(data.access_token);
    } catch (err) {
      setAppMessage(`Login failed: ${err.message}`);
    }
  };

  const loadStock = async (tokenOverride) => {
    try {
      const data = await apiRequest("/stock/levels", "GET", tokenOverride || token);
      setStock(data);
    } catch (err) {
      setAppMessage(`Stock refresh failed: ${err.message}`);
    }
  };

  const computeUnitsPerPurchase = () => {
    const packetsPerBox = Number(medicineForm.quantity_per_box || 0);
    const unitsPerPacket = Number(medicineForm.quantity_per_packet || 0);
    if (packetsPerBox > 0 && unitsPerPacket > 0) {
      return packetsPerBox * unitsPerPacket;
    }
    return Number(packetsPerBox || 1);
  };

  const createMedicine = async () => {
    if (!medicineForm.name.trim()) {
      setAppMessage("Medicine name is required.");
      return;
    }
    if (!medicineForm.expiry_date) {
      setAppMessage("Expiry date is required.");
      return;
    }
    if (!medicineForm.quantity || Number(medicineForm.quantity) <= 0) {
      setAppMessage("Quantity must be greater than zero.");
      return;
    }
    if (!medicineForm.quantity_per_box || Number(medicineForm.quantity_per_box) <= 0) {
      setAppMessage("Quantity per box must be greater than zero.");
      return;
    }
    setIsSubmittingDrug(true);
    try {
      const sku = `${medicineForm.name.replace(/\s+/g, "-").toUpperCase()}-${Date.now().toString().slice(-5)}`;
      const effectiveUnitsPerPurchase = computeUnitsPerPurchase();
      const dispenseUnit = Number(medicineForm.quantity_per_packet || 0) > 0 ? "tablet" : "bottle";
      const createdDrug = await apiRequest("/drugs", "POST", token, {
        name: medicineForm.name.trim(),
        sku,
        unit: dispenseUnit,
        purchase_unit: "box",
        units_per_purchase: Number(effectiveUnitsPerPurchase || 1),
        category: "General",
        reorder_level: 10,
        is_prescription_required: false
      });

      // Create an initial batch with quantity_received=1 so expiry/price are captured.
      // You can later receive real stock batches via stock intake workflows.
      await apiRequest("/stock/batches", "POST", token, {
        drug_id: createdDrug.id,
        supplier_id: null,
        batch_no: `INIT-${createdDrug.id}-${Date.now().toString().slice(-6)}`,
        expiry_date: medicineForm.expiry_date,
        quantity_received_purchase: Number(medicineForm.quantity),
        unit_cost: 0,
        selling_price: Number(medicineForm.price || 0)
      });

      setAppMessage("Medicine added successfully.");
      setMedicineForm({
        name: "",
        quantity_per_box: "",
        quantity_per_packet: "",
        quantity: "",
        price: 0,
        expiry_date: ""
      });
      await loadStock();
      setActivePage("stock");
    } catch (err) {
      setAppMessage(`Add medicine failed: ${err.message}`);
    } finally {
      setIsSubmittingDrug(false);
    }
  };

  const submitSale = async () => {
    setIsSubmittingSale(true);
    try {
      if (cart.length === 0) {
        setAppMessage("Add at least one item to cart.");
        return;
      }
      const payload = {
        sale_type: saleForm.sale_type,
        payment_method: saleForm.payment_method,
        customer_name: null,
        prescription_ref: saleForm.prescription_ref || null,
        kra_pin: saleForm.kra_pin || null,
        etr_serial: saleForm.etr_serial || null,
        items: cart.map((item) => ({
          drug_id: Number(item.drug_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          discount: 0
        }))
      };
      const result = await apiRequest("/sales", "POST", token, payload);
      setAppMessage(
        `Sale created: ${result.receipt_no} (Total: ${result.grand_total}) | KRA PIN: ${result.kra_pin || "N/A"} | ETR: ${
          result.etr_serial || "N/A"
        } | ETR Status: ${result.etr_status || "PENDING"}`
      );
      setCart([]);
      setSelectedDrug(null);
      setDrugSearch("");
      setSearchResults([]);
      await loadStock();
    } catch (err) {
      setAppMessage(`Sale failed: ${err.message}`);
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const searchDrugs = async (termOverride) => {
    const term = (termOverride ?? drugSearch).trim();
    if (!term) {
      setSearchResults([]);
      setSelectedDrug(null);
      return [];
    }
    try {
      const data = await apiRequest(`/drugs/search?q=${encodeURIComponent(term)}`, "GET", token);
      setSearchResults(data);
      return data;
    } catch (err) {
      setAppMessage(`Search failed: ${err.message}`);
      return [];
    }
  };

  const handleDrugSearchChange = async (value) => {
    setDrugSearch(value);
    const data = await searchDrugs(value);
    const results = data || [];
    const exactMatch = results.find((item) => item.drug_name.toLowerCase() === value.trim().toLowerCase());
    if (exactMatch) {
      setSelectedDrug(exactMatch);
      setDrugSearch(exactMatch.drug_name);
      setSearchResults([]);
    }
  };

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
    setEditingDrugId(drug.drug_id);
    setEditingDrugName(drug.drug_name);
  };

  const saveEditDrug = async () => {
    try {
      await apiRequest(`/drugs/${editingDrugId}`, "PUT", token, { name: editingDrugName });
      setAppMessage("Medicine updated.");
      setEditingDrugId(null);
      setEditingDrugName("");
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
    setSaleForm((prev) => ({ ...prev, quantity: 1, quantity_unit: "base" }));
    setDrugSearch(drug.drug_name);
    setSearchResults([]);
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
    const isPurchaseUnit = saleForm.quantity_unit === "purchase";
    const conversionFactor = Number(selectedDrug.units_per_purchase || 1);
    const qtyInBaseUnit = isPurchaseUnit ? qty * conversionFactor : qty;
    const existingIndex = cart.findIndex((i) => i.drug_id === selectedDrug.drug_id);
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + qtyInBaseUnit,
        quantity_label: `${updated[existingIndex].quantity + qtyInBaseUnit} ${selectedDrug.unit}`,
        line_total: (updated[existingIndex].quantity + qtyInBaseUnit) * updated[existingIndex].unit_price
      };
      setCart(updated);
    } else {
      setCart((prev) => [
        ...prev,
        {
          drug_id: selectedDrug.drug_id,
          drug_name: selectedDrug.drug_name,
          quantity: qtyInBaseUnit,
          quantity_label: `${qtyInBaseUnit} ${selectedDrug.unit}`,
          unit_price: Number(selectedDrug.unit_price || 0),
          line_total: qtyInBaseUnit * Number(selectedDrug.unit_price || 0)
        }
      ]);
    }
    setSaleForm((prev) => ({ ...prev, quantity: 1, quantity_unit: "base" }));
    setSelectedDrug(null);
    setDrugSearch("");
  };

  const removeCartLine = (drugId) => {
    setCart((prev) => prev.filter((item) => item.drug_id !== drugId));
  };

  const saleGrandTotal = cart.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
  const filteredStock = stock
    .filter((s) => s.drug_name.toLowerCase().includes(stockSearch.trim().toLowerCase()))
    .sort((a, b) => a.drug_name.localeCompare(b.drug_name));

  const lowStockItems = stock.filter((s) => Number(s.total_quantity) <= Number(s.reorder_level));
  const totalMedicines = stock.length;
  const totalUnitsInStock = stock.reduce((sum, item) => sum + Number(item.total_quantity || 0), 0);
  const cartItemsCount = cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const formatMonthYear = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length < 2) return dateStr;
    return `${Number(parts[1])}/${parts[0]}`;
  };
  const reportPeriodLabel = dailySales?.range
    ? dailySales.range.start_date === dailySales.range.end_date
      ? formatMonthYear(dailySales.range.start_date)
      : `${formatMonthYear(dailySales.range.start_date)}, ${formatMonthYear(dailySales.range.end_date)}`
    : dailySales?.date
      ? formatMonthYear(dailySales.date)
      : "";

  return (
    <div className="container">
      {!canUseApp ? (
        <section className="card">
          <h1>Pharmacy Stock and POS</h1>
          <p>Manage medicines, monitor stock, and run pharmacy checkout professionally.</p>
          <h2>Login</h2>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <button onClick={login}>Sign In</button>
          {appMessage ? <p>{appMessage}</p> : null}
        </section>
      ) : (
        <div className="app-shell">
          <aside className="sidebar top-nav">
            <div className="top-nav-brand">
              <h2 className="brand-logo">LP</h2>
              <div>
                <h3>Lindah Pharmacy</h3>
                <p className="sidebar-subtitle">{user?.role}</p>
              </div>
            </div>
            <div className="tabs nav-tabs">
              <button className={activePage === "stock" ? "active-tab" : ""} onClick={() => setActivePage("stock")}>
                Stock Viewing
              </button>
              <button className={activePage === "sales" ? "active-tab" : ""} onClick={() => setActivePage("sales")}>
                Sales (POS)
              </button>
              {(user?.role === "Admin" || user?.role === "Pharmacist") && (
                <button className={activePage === "reports" ? "active-tab" : ""} onClick={() => setActivePage("reports")}>
                  Reports
                </button>
              )}
              {(user?.role === "Admin" || user?.role === "Pharmacist") && (
                <button className={activePage === "admin" ? "active-tab" : ""} onClick={() => setActivePage("admin")}>
                  Add Medicines
                </button>
              )}
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

                <section className="kpi-grid">
                  <div className="kpi-card">
                    <p className="kpi-label">Medicines</p>
                    <h3>{totalMedicines}</h3>
                  </div>
                  <div className="kpi-card">
                    <p className="kpi-label">Units In Stock</p>
                    <h3>{totalUnitsInStock}</h3>
                  </div>
                  <div className="kpi-card">
                    <p className="kpi-label">Low Stock</p>
                    <h3>{lowStockItems.length}</h3>
                  </div>
                  <div className="kpi-card">
                    <p className="kpi-label">Cart Items</p>
                    <h3>{cartItemsCount}</h3>
                  </div>
                </section>

                {lowStockItems.length > 0 ? (
                  <section className="card alert-card">
                    <h3>Low Stock Alerts</h3>
                    <p>{lowStockItems.map((i) => `${i.drug_name} (${i.total_quantity})`).join(", ")}</p>
                  </section>
                ) : null}
              </>
            ) : null}

            {activePage === "admin" && (user?.role === "Admin" || user?.role === "Pharmacist") ? (
              <section className="card">
              <h2>Add medicine</h2>
              <div className="grid">
                <label>
                  Medicine Name
                  <input
                    placeholder="Enter medicine name"
                    value={medicineForm.name}
                    onChange={(e) => setMedicineForm({ ...medicineForm, name: e.target.value })}
                  />
                </label>
                <label>
                  How many purchase units received
                  <input
                    type="number"
                    placeholder="e.g. 1, 2, 10 boxes"
                    value={medicineForm.quantity}
                    onChange={(e) => setMedicineForm({ ...medicineForm, quantity: e.target.value })}
                  />
                </label>
                <label>
                  Quantity per box (number of packets)
                  <input
                    type="number"
                    placeholder="e.g. 200 packets per box"
                    value={medicineForm.quantity_per_box}
                    onChange={(e) => setMedicineForm({ ...medicineForm, quantity_per_box: e.target.value })}
                  />
                </label>
                <label>
                  Quantity per packet (number of tablets) - optional
                  <input
                    type="number"
                    placeholder="e.g. 50 tablets per packet"
                    value={medicineForm.quantity_per_packet}
                    onChange={(e) => setMedicineForm({ ...medicineForm, quantity_per_packet: e.target.value })}
                  />
                </label>
                <label>
                  Price per tablet
                  <input type="number" placeholder="Selling price" value={medicineForm.price} onChange={(e) => setMedicineForm({ ...medicineForm, price: e.target.value })} />
                </label>
                <label>
                  Expiry Date
                  <input
                    type="date"
                    value={medicineForm.expiry_date}
                    onChange={(e) => setMedicineForm({ ...medicineForm, expiry_date: e.target.value })}
                  />
                </label>
                <div>
                  <strong>Sellable units preview:</strong>{" "}
                  {medicineForm.quantity && Number(medicineForm.quantity) > 0
                    ? Number(medicineForm.quantity) * Number(computeUnitsPerPurchase() || 1)
                    : 0}{" "}
                  {Number(medicineForm.quantity_per_packet || 0) > 0 ? "tablets" : "bottles/each"}
                </div>
              </div>
              <button onClick={createMedicine} disabled={isSubmittingDrug}>
                {isSubmittingDrug ? "Saving..." : "Add Medicine"}
              </button>
              </section>
            ) : null}

            {activePage === "stock" ? (
              <section className="card">
              <h2>Current Stock</h2>
              <button onClick={() => loadStock()}>Refresh Stock</button>
              <input
                placeholder="Search medicine..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
              <table>
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Quantity</th>
                    <th>Remaining Units</th>
                    <th>Price</th>
                    <th>Expiry Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((s) => (
                    <tr key={s.drug_id}>
                      <td>
                        {editingDrugId === s.drug_id ? (
                          <input value={editingDrugName} onChange={(e) => setEditingDrugName(e.target.value)} />
                        ) : (
                          s.drug_name
                        )}
                      </td>
                      <td>
                        {formatDisplayQuantity(s.total_quantity, s.unit, s.purchase_unit, s.units_per_purchase)}
                      </td>
                      <td>{`${Number(s.total_quantity || 0)} ${s.unit || "units"}`}</td>
                      <td>{Number(s.unit_price || 0).toFixed(2)}</td>
                      <td>{s.nearest_expiry || "-"}</td>
                      <td>
                        {editingDrugId === s.drug_id ? (
                          <div className="action-buttons">
                            <button onClick={saveEditDrug}>Save</button>
                            <button onClick={() => setEditingDrugId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="action-buttons">
                            <button onClick={() => startEditDrug(s)}>Edit</button>
                            <button onClick={() => deleteDrug(s.drug_id)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </section>
            ) : null}

            {activePage === "sales" ? (
              <section className="card">
              <h2>Sales (POS)</h2>
              <div className="grid">
                <select value={saleForm.sale_type} onChange={(e) => setSaleForm({ ...saleForm, sale_type: e.target.value })}>
                  <option value="OTC">Over-the-counter (OTC)</option>
                  <option value="PRESCRIPTION">Prescription Sale</option>
                </select>
                <select value={saleForm.payment_method} onChange={(e) => setSaleForm({ ...saleForm, payment_method: e.target.value })}>
                  <option value="CASH">Cash</option>
                  <option value="M_PESA">M-Pesa</option>
                  <option value="CARD">Card</option>
                </select>
                <input
                  placeholder="Prescription reference (if needed)"
                  value={saleForm.prescription_ref}
                  onChange={(e) => setSaleForm({ ...saleForm, prescription_ref: e.target.value })}
                />
                <input placeholder="KRA PIN (for ETR)" value={saleForm.kra_pin} onChange={(e) => setSaleForm({ ...saleForm, kra_pin: e.target.value })} />
                <input placeholder="ETR serial number" value={saleForm.etr_serial} onChange={(e) => setSaleForm({ ...saleForm, etr_serial: e.target.value })} />
                <input
                  placeholder="Search a medicine"
                  value={drugSearch}
                  list="medicine-options"
                  onChange={(e) => {
                    const value = e.target.value;
                    handleDrugSearchChange(value);
                  }}
                />
                <datalist id="medicine-options">
                  {searchResults.map((item) => (
                    <option key={item.drug_id} value={item.drug_name} />
                  ))}
                </datalist>
                <input
                  placeholder="Quantity"
                  type="number"
                  value={saleForm.quantity}
                  onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                />
                <select value={saleForm.quantity_unit} onChange={(e) => setSaleForm({ ...saleForm, quantity_unit: e.target.value })} disabled={!selectedDrug}>
                  <option value="base">{selectedDrug ? `${selectedDrug.unit} (base unit)` : "Base unit"}</option>
                  {selectedDrug && Number(selectedDrug.units_per_purchase || 1) > 1 ? <option value="purchase">{selectedDrug.purchase_unit} (pack/box)</option> : null}
                </select>
                <input placeholder="Unit price (auto)" value={selectedDrug ? selectedDrug.unit_price : ""} disabled />
                {selectedDrug ? (
                  <p>
                    Deducts{" "}
                    <strong>
                      {saleForm.quantity && Number(saleForm.quantity) > 0
                        ? saleForm.quantity_unit === "purchase"
                          ? Number(saleForm.quantity) * Number(selectedDrug.units_per_purchase || 1)
                          : Number(saleForm.quantity)
                        : 0}{" "}
                      {selectedDrug.unit}
                    </strong>{" "}
                    from inventory.
                  </p>
                ) : null}
              </div>
              <button onClick={addCartLine}>Add to Cart</button>
              <h3>Cart</h3>
              <table>
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line) => (
                    <tr key={line.drug_id}>
                      <td>{line.drug_name}</td>
                      <td>{line.quantity_label || line.quantity}</td>
                      <td>{line.unit_price}</td>
                      <td>{line.line_total.toFixed(2)}</td>
                      <td>
                        <button onClick={() => removeCartLine(line.drug_id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <strong>Grand Total:</strong> {saleGrandTotal.toFixed(2)}
              </p>
              <button onClick={submitSale} disabled={isSubmittingSale}>
                {isSubmittingSale ? "Processing..." : "Finalize Sale"}
              </button>
              </section>
            ) : null}

            {activePage === "reports" && (user?.role === "Admin" || user?.role === "Pharmacist") ? (
              <section className="card">
                <h2>Sales Reports</h2>
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
                      <strong>Month:</strong> {reportPeriodLabel}
                    </p>
                    <p><strong>Transactions:</strong> {dailySales.sales_count}</p>
                    <p><strong>Gross Revenue:</strong> KES {Number(dailySales.gross_revenue || 0).toFixed(2)}</p>
                    {dailySales.items?.length ? (
                      <table>
                        <thead>
                          <tr>
                            <th>Medicine</th>
                            <th>Quantity Sold</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailySales.items.map((row) => (
                            <tr key={row.drug_id}>
                              <td>{row.drug_name}</td>
                              <td>{row.quantity}</td>
                              <td>{Number(row.amount || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
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
