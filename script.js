const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzhVhvxW8z6NuTIawJHGnoh2xBw0LW9ZAlCyzMzXnkqmQfn0SJGZCR4iJoS_GZWFWtxgw/exec";

let headers = [];
let locks = [];
let data = [];
let currentUserEmail = localStorage.getItem('census_email') || "";

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
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: "sendOTP", email: email })
        });
        currentUserEmail = email;
        document.getElementById('display-email').textContent = email;
        emailStep.style.display = "none";
        otpStep.style.display = "block";
    } catch (e) { alert("Failed to send OTP"); }
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
    showLoader("Loading records...");
    try {
        const url = `${WEB_APP_URL}?email=${encodeURIComponent(currentUserEmail)}&t=${Date.now()}`;
        const res = await fetch(url);
        const r = await res.json();
        
        headers = r.headers || [];
        locks = r.locks || [];
        data = r.data || [];
        
        renderTable();
        recordCount.textContent = `${data.length} Records Found`;
    } catch (e) { 
        console.error(e);
        document.getElementById('data-container').innerHTML = `<div style="text-align:center; padding:2rem; color:red;">
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

        card.innerHTML = `
            <div class="card-header">
                <h3>${mainId}</h3>
                ${editButton}
            </div>
            <div class="card-body">
                ${infoItems}
            </div>
        `;
        container.appendChild(card);
    });
}

function openEditModal(i) {
    const row = data[i];
    document.getElementById('form-fields').innerHTML = headers.map((h, index) => {
        const isLocked = locks[index] && locks[index].toString().toLowerCase().trim() === "locked";
        const readOnlyAttr = isLocked ? "readonly" : "";
        const lockedStyle = isLocked ? "background: #f1f5f9; color: #64748b; cursor: not-allowed;" : "";
        const lockIcon = isLocked ? " 🔒" : "";
        
        // Format the value if it's a date
        const displayValue = formatDate(row[h]);

        return `
            <div class="form-group">
                <label>${h}${lockIcon}</label>
                <input type="text" name="${h}" value="${displayValue}" ${readOnlyAttr} style="${lockedStyle}">
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
    btn.textContent = "Saving...";
    const formData = new FormData(e.target);
    const updated = {};
    formData.forEach((v, k) => updated[k] = v);
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: "save", data: updated })
        });
        toast.className = "toast show";
        setTimeout(() => toast.className = "toast", 3000);
        modal.style.display = "none";
        fetchData();
    } catch (e) { alert("Save failed"); }
    finally { btn.textContent = "Save to Sheet2"; }
};
