const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbznkmpiwOHZ5SRiEfGXl54INbluE1HgUY08nSscvLFMP9aCiPmS0Tm6bXH2h8qPMBiW6g/exec";

let headers = [];
let locks = [];
let data = [];
let currentUserEmail = localStorage.getItem('census_email') || "";
let currentEditIndex = -1;
let isAdmin = false;

// Elements
const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const emailStep = document.getElementById('email-step');
const otpStep = document.getElementById('otp-step');
const tableBody = document.getElementById('table-body');
const headerRow = document.getElementById('header-row');
const recordCount = document.getElementById('record-count');
const modal = document.getElementById('edit-modal');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');

function showLoader(msg = "Connecting...") {
    loader.querySelector('p').textContent = msg;
    loader.style.display = "flex";
}

function hideLoader() {
    loader.style.display = "none";
}

window.addEventListener('DOMContentLoaded', () => {
    if (currentUserEmail) {
        loginScreen.style.display = "none";
        mainContent.style.display = "block";
        fetchData();
    }
});

// Login Handlers
document.getElementById('send-otp-btn').onclick = sendOTP;
document.getElementById('verify-otp-btn').onclick = verifyOTP;
document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('census_email');
    location.reload();
};
document.getElementById('back-btn').onclick = () => {
    emailStep.style.display = "block";
    otpStep.style.display = "none";
};

async function sendOTP() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return alert("Email required");
    showLoader("Sending OTP...");
    try {
        const res = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "sendOTP", email: email })
        });
        const r = await res.json();
        if (r.status === "sent") {
            currentUserEmail = email;
            document.getElementById('display-email').textContent = email;
            emailStep.style.display = "none";
            otpStep.style.display = "block";
        } else {
            alert(r.msg || "Failed to send OTP");
        }
    } catch (e) { 
        console.error(e);
        alert("Error: Unable to connect to server."); 
    }
    finally { hideLoader(); }
}

async function verifyOTP() {
    const otp = document.getElementById('login-otp').value;
    showLoader("Verifying...");
    try {
        const res = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "verifyOTP", email: currentUserEmail, otp: otp })
        });
        const r = await res.json();
        if (r.status === "verified") {
            localStorage.setItem('census_email', currentUserEmail);
            loginScreen.style.display = "none";
            mainContent.style.display = "block";
            fetchData();
        } else alert("गलत OTP! कृपया ईमेल पर आया हुआ सही कोड डालें।");
    } catch (e) { alert("Error verifying OTP. Please try again."); }
    finally { hideLoader(); }
}

async function fetchData() {
    if (!currentUserEmail) return;
    const container = document.getElementById('data-container');
    container.innerHTML = ""; // Clear old data
    recordCount.parentElement.style.display = "none"; // Hide "0 Records Found"
    
    showLoader("Fetching Census Records...");
    try {
        const url = `${WEB_APP_URL}?email=${encodeURIComponent(currentUserEmail)}&t=${Date.now()}`;
        const res = await fetch(url);
        const r = await res.json();
        
        headers = r.headers || [];
        locks = r.locks || [];
        data = r.data || [];
        isAdmin = r.isAdmin || false; // Set global admin flag
        window._lastDebugInfo = r.debugInfo; // Store debug info
        
        if (isAdmin) {
            renderAdminTable();
        } else {
            renderTable();
        }
        
        if (data.length > 0) {
            recordCount.textContent = `${data.length} Records Found`;
            recordCount.parentElement.style.display = "block"; // Show only if found
        }
    } catch (e) { 
        console.error(e);
        container.innerHTML = `<div style="text-align:center; padding:2rem; color:red;">
            Error loading data. Check deployment settings.
        </div>`;
    } finally { hideLoader(); }
}

function formatDate(val) {
    if (!val) return "-";
    // Check if it's an ISO date string
    if (typeof val === "string" && val.includes("T") && val.includes("Z")) {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-GB'); // Formats to DD/MM/YYYY
        }
    }
    return val;
}

function renderAdminTable() {
    const container = document.getElementById('data-container');
    
    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:#1e293b; background:white; border-radius:1.5rem; border: 1px solid #e2e8f0;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
            <h3 style="margin-bottom: 1rem; color: #ef4444;">NO RECORDS FOUND</h3>
        </div>`;
        return;
    }

    // Determine which columns to show in the table: ID + locked columns
    const columnsToShow = [0]; // Always show ID (index 0)
    locks.forEach((lock, index) => {
        if (index > 0 && lock && lock.toString().toLowerCase().trim() === "locked") {
            columnsToShow.push(index);
        }
    });

    let tableHTML = `
        <div style="overflow-x: auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 100%;">
            <table class="admin-table" style="width: 100%; min-width: 800px; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        ${columnsToShow.map(idx => `<th style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; position: sticky; top: 0; background: #f8fafc;">${headers[idx]}</th>`).join('')}
                        <th style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; position: sticky; top: 0; background: #f8fafc;">Map PDF</th>
                        <th style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; position: sticky; top: 0; background: #f8fafc;">Action</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.forEach((row, i) => {
        let rowHTML = `<tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">`;
        
        columnsToShow.forEach(idx => {
            rowHTML += `<td style="padding: 12px 16px; color: #0f172a;">${formatDate(row[headers[idx]])}</td>`;
        });

        // Map PDF Column
        let mapStatus = "";
        if (row._mapLink) {
            mapStatus = `<div style="font-size: 0.85rem; font-weight: 600; color: #0f172a; margin-bottom: 4px;">${row._mapName || 'Map'}</div>
                         <a href="${row._mapLink}" target="_blank" class="btn-map" style="padding: 4px 10px; font-size: 0.8rem; border-radius: 6px;">🗺️ Open</a>`;
        } else {
            mapStatus = `<div style="font-size: 0.85rem; color: #ef4444; font-weight: 600;">❌ ${row._mapName || 'Missing'}</div>`;
        }
        
        rowHTML += `<td style="padding: 12px 16px;">${mapStatus}</td>`;
        
        // Action Column
        rowHTML += `<td style="padding: 12px 16px;">
            <button class="btn-primary" onclick="openEditModal(${i})" style="padding: 6px 12px; font-size: 1.1rem; border-radius: 6px;" title="View & Edit Details">👁️</button>
        </td>`;
        
        rowHTML += `</tr>`;
        tableHTML += rowHTML;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHTML;
}

function renderTable() {
    const container = document.getElementById('data-container');
    container.innerHTML = "";
    
    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:#1e293b; background:white; border-radius:1.5rem; border: 1px solid #e2e8f0;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
            <h3 style="margin-bottom: 1rem; color: #ef4444;">ID NOT FOUND</h3>
            <p style="font-size: 1.1rem; line-height: 1.6;">
                Census Cell से अपनी ईमेल आईडी सही करवाएं।<br>
                <b>9928354317</b> पर अपना <b>नाम, पद, मोबाइल नंबर और ईमेल आईडी</b> भेजें।
            </p>
        </div>`;
        return;
    }

    data.forEach((row, i) => {
        const card = document.createElement('div');
        card.className = 'record-card';
        
        const mainId = row[headers[0]] || "N/A";
        const otherHeaders = headers.slice(1);

        let infoItems = otherHeaders.map(h => `
            <div class="info-item">
                <div class="info-label">${h}</div>
                <div class="info-value">${formatDate(row[h])}</div>
            </div>
        `).join('');

        const editButton = Object.values(row).some(v => v && v.toString().toLowerCase().trim() === "locked") 
            ? `<span style="color: #ef4444; font-weight: 600; font-size: 0.8rem;">🔒 READ ONLY</span>`
            : `<button class="btn-edit" onclick="openEditModal(${i})">Edit Details</button>`;

        const mapLink = row._mapLink;
        const driveErr = row._driveError;
        
        let mapButton = "";
        if (mapLink) {
            mapButton = `<a href="${mapLink}" target="_blank" class="btn-map">🗺️ View & Download Map</a>`;
        } else if (driveErr) {
            mapButton = `<div class="no-map" style="color: #ef4444;">Drive Connection Error</div>`;
        } else {
            mapButton = `<div class="no-map">Map Not Found</div>`;
        }

        card.innerHTML = `
            <div class="card-header">
                <h3>${mainId}</h3>
                ${editButton}
            </div>
            <div class="card-body">
                ${infoItems}
            </div>
            <div class="card-footer">
                ${mapButton}
            </div>
        `;
        container.appendChild(card);
    });
}

function openEditModal(i) {
    currentEditIndex = i;
    const row = data[i];
    document.getElementById('form-fields').innerHTML = headers.map((h, index) => {
        // Skip hidden/internal fields
        if (h.startsWith('_')) return "";
        
        const isLocked = !isAdmin && locks[index] && locks[index].toString().toLowerCase().trim() === "locked";
        const readOnlyAttr = isLocked ? "readonly" : "";
        const lockedStyle = isLocked ? "background: #f1f5f9; color: #64748b; cursor: not-allowed;" : "";
        const originalLock = locks[index] && locks[index].toString().toLowerCase().trim() === "locked";
        const lockIcon = isLocked ? " 🔒" : (isAdmin && originalLock ? " 🔓 (Admin)" : "");
        
        // Format the value if it's a date
        const displayValue = formatDate(row[h]).toString().replace(/"/g, '&quot;');

        return `
            <div class="form-group">
                <label>${h}${lockIcon}</label>
                <input type="text" name="field_${index}" value="${displayValue}" ${readOnlyAttr} style="${lockedStyle}">
            </div>
        `;
    }).join('');
    modal.style.display = "block";
}

document.querySelector('.close').onclick = () => modal.style.display = "none";
document.getElementById('cancel-btn').onclick = () => modal.style.display = "none";

document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;

    const formData = new FormData(e.target);
    const updated = {};
    
    // Map the field_X names back to the exact header strings
    headers.forEach((h, index) => {
        let val = formData.get(`field_${index}`);
        if (val === "-") val = ""; // Prevent saving the placeholder dash
        updated[h] = val;
    });

    const rowData = data[currentEditIndex];
    const rowIndex = rowData ? rowData._rowIndex : -1;

    try {
        const res = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "save", data: updated, locks: locks, rowIndex: rowIndex, email: currentUserEmail })
        });
        const result = await res.json();
        
        if (result.status !== "success") {
            throw new Error(result.msg || "Save failed on server");
        }

        // Show toast immediately
        toast.className = "toast show";
        setTimeout(() => toast.className = "toast", 3000);
        modal.style.display = "none";

        // IMPORTANT: Wait 1.5 seconds for Google Sheets to finish writing
        // before we re-fetch the data, otherwise we might see the old data.
        showLoader("Updating view...");
        setTimeout(async () => {
            await fetchData();
            hideLoader();
        }, 1500);

    } catch (e) { 
        console.error("Save error:", e);
        alert("Error: " + e.message); 
    } finally { 
        btn.textContent = originalText;
        btn.disabled = false;
    }
};
