// frontend/assets/js/app.js
// Updated: charts, receipts, categories, profile, PWA, dark mode, notifications

const API = 'https://expense-tracker-3i6x.onrender.com/api';
 // update if backend hosted elsewhere
let chartInstances = {};

// ---------- Utilities ----------
function saveSession(token, user){ localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); }
function getToken(){ return localStorage.getItem('token'); }
function getUser(){ return JSON.parse(localStorage.getItem('user') || 'null'); }
function clearSession(){ localStorage.removeItem('token'); localStorage.removeItem('user'); }
function setMsg(el, text, isError){ if(!el) return; el.innerText = text || ''; el.style.color = isError ? '#b91c1c' : ''; }

// Dark mode auto-sync with prefered scheme
(function initTheme(){
  const stored = localStorage.getItem('darkMode');
  if(stored === null){
    const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if(prefers) document.body.classList.add('dark');
  } else {
    if(stored === 'true') document.body.classList.add('dark');
  }
})();

// toggle icon state handler
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'darkToggle'){
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
    // toggle icon text
    e.target.innerText = document.body.classList.contains('dark') ? '☀️' : '🌙';
  }
});

// Safe fetch wrapper
async function apiFetch(path, opts = {}){
  const headers = opts.headers || {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  // if body is FormData, do not set Content-Type
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  opts.headers = headers;
  const res = await fetch(API + path, opts);
  const data = await res.text().then(t => {
    try { return JSON.parse(t); } catch(e){ return t || {}; }
  });
  if(!res.ok) throw data;
  return data;
}

// Simple escape
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function initials(name='U'){ return (name.split(' ').map(x=>x[0]||'').slice(0,2).join('')||'U').toUpperCase() }
function formatCurrency(n){ if(typeof n !== 'number') n = Number(n)||0; return '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

// ---------- PWA: register service worker if available ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(()=>{/* ignore */});
}

// ---------- Notification helper (polling-based) ----------
let lastSeenStatuses = {}; // expenseId -> status
async function checkStatusChangesAndNotify() {
  try {
    const token = getToken();
    if (!token) return;
    // call GET /expenses
    const list = await apiFetch('/expenses');
    list.forEach(exp => {
      const prev = lastSeenStatuses[exp._id];
      if (prev && prev !== exp.status) {
        // show notification
        showNotification(`Expense ${exp.title} ${exp.status}`, `${exp.title} is now ${exp.status}`);
      }
      lastSeenStatuses[exp._id] = exp.status;
    });
  } catch(e){}
}
function showNotification(title, body){
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") new Notification(title, { body });
  else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(p => { if(p === 'granted') new Notification(title, { body }); });
  }
}
// Poll every 12s
setInterval(checkStatusChangesAndNotify, 12000);

// ---------- Login / Signup / Forgot logic (unchanged) ----------
if (document.getElementById('loginForm')){
  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const role = document.querySelector('input[name="role"]:checked').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg');
    try {
      const data = await apiFetch('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
      saveSession(data.token, data.user);
      // redirect by server role
      if (data.user.role === 'manager') window.location = '/dashboard-manager.html';
      else window.location = '/dashboard-employee.html';
    } catch(err) { setMsg(msg, (err && err.msg) ? err.msg : 'Login failed', true); }
  });
}
if (document.getElementById('signupForm')){
  document.getElementById('signupForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const msg = document.getElementById('msg');
    try {
      const data = await apiFetch('/auth/signup', { method:'POST', body: JSON.stringify({ name, email, password, role }) });
      saveSession(data.token, data.user);
      if (data.user.role === 'manager') window.location = '/dashboard-manager.html';
      else window.location = '/dashboard-employee.html';
    } catch(err){ setMsg(msg, (err && err.msg) ? err.msg : 'Signup failed', true); }
  });
}
if (document.getElementById('forgotForm')){
  document.getElementById('forgotForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const email = document.getElementById('email').value;
    const msg = document.getElementById('msg');
    try {
      const data = await apiFetch('/auth/forgot', { method:'POST', body: JSON.stringify({ email }) });
      setMsg(msg, data.msg || 'Reset link generated (check server log)');
    } catch(err){ setMsg(msg, (err && err.msg) ? err.msg : 'Error sending reset link', true); }
  });
}

// ---------- Employee dashboard: receipt upload, categories, card rendering ----------
if (document.body && document.querySelector('body').innerHTML.includes('Employee Dashboard')){
  const token = getToken(); if(!token) { window.location = '/index.html'; }
  const user = getUser();
  document.getElementById('userName').innerText = user.name || user.email;
  document.getElementById('userEmail').innerText = user.email || '';
  document.getElementById('avatar').innerText = initials(user.name || user.email);

  const expensesList = document.getElementById('expensesList');
  const totalEl = document.getElementById('total');
  const addOpen = document.getElementById('addExpenseOpen');
  const form = document.getElementById('expenseForm');
  const cancelAdd = document.getElementById('cancelAdd');

  addOpen.addEventListener('click', ()=> form.classList.remove('collapsed'));
  cancelAdd.addEventListener('click', ()=> form.classList.add('collapsed'));

  document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ clearSession(); window.location='/index.html'; });

  // dynamically add category select and file input
  const categoryOptions = ['Travel','Food','Office','Software','Other'];
  const categorySelect = document.createElement('select');
  categorySelect.id = 'category';
  categoryOptions.forEach(c => {
    const o = document.createElement('option'); o.value = c; o.innerText = c; categorySelect.appendChild(o);
  });
  // insert category select into form (before notes)
  const notesEl = document.getElementById('notes');
  notesEl.parentNode.insertBefore(categorySelect, notesEl);

  // file input and preview
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*,application/pdf'; fileInput.id = 'receipt';
  notesEl.parentNode.insertBefore(fileInput, notesEl.nextSibling);
  const previewImg = document.createElement('img'); previewImg.className = 'receipt-preview hidden'; previewImg.alt = 'receipt preview';
  fileInput.parentNode.insertBefore(previewImg, fileInput.nextSibling);

  fileInput.addEventListener('change', (ev)=>{
    const f = ev.target.files[0];
    if(!f) { previewImg.classList.add('hidden'); previewImg.src=''; return; }
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      previewImg.src = url; previewImg.classList.remove('hidden');
    } else {
      previewImg.classList.remove('hidden'); previewImg.src = ''; previewImg.style.display = 'block';
      previewImg.alt = f.name;
    }
  });

  document.getElementById('expenseForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const title = document.getElementById('title').value;
    const amount = Number(document.getElementById('amount').value);
    const date = document.getElementById('date').value || new Date().toISOString();
    const notes = document.getElementById('notes').value;
    const category = document.getElementById('category').value;
    const receiptFile = document.getElementById('receipt').files[0];
    try {
      // send as FormData so backend can accept file
      const fd = new FormData();
      fd.append('title', title);
      fd.append('amount', amount);
      fd.append('date', date);
      fd.append('notes', notes);
      fd.append('category', category);
      if (receiptFile) fd.append('receipt', receiptFile);
      await apiFetch('/expenses', { method:'POST', body: fd });
      load();
      form.classList.add('collapsed');
      document.getElementById('title').value=''; document.getElementById('amount').value=''; document.getElementById('notes').value='';
      previewImg.classList.add('hidden'); previewImg.src='';
    } catch(err){ console.error(err); alert('Could not save expense. Check server.'); }
  });

  function createExpenseNode(exp){
    const root = document.createElement('div'); root.className='exp-card';
    const left = document.createElement('div'); left.className='exp-left';
    left.innerHTML = `<div class="exp-title">${escapeHtml(exp.title)}</div>
                      <div class="exp-meta">${new Date(exp.date).toLocaleDateString()} • ${escapeHtml(exp.notes||'')}</div>
                      <div class="cat-pill">${escapeHtml(exp.category||'Uncategorized')}</div>`;
    const right = document.createElement('div'); right.style.textAlign='right';
    const amt = document.createElement('div'); amt.className='exp-amount'; amt.innerText = formatCurrency(exp.amount||0);
    const badge = document.createElement('div'); badge.className='badge ' + (exp.status||'pending'); badge.innerText=(exp.status||'pending').toUpperCase();
    right.appendChild(amt); right.appendChild(badge);
    // receipt thumbnail if present (backend should return receipt URL in exp.receiptUrl)
    if (exp.receiptUrl) {
      const img = document.createElement('img'); img.className='receipt-preview'; img.src = exp.receiptUrl; img.alt='receipt';
      left.appendChild(img);
    }
    root.appendChild(left); root.appendChild(right);
    return root;
  }

  async function load(){
    try {
      const list = await apiFetch('/expenses');
      expensesList.innerHTML = '';
      let total = 0;
      list.forEach(e => {
        total += Number(e.amount||0);
        expensesList.appendChild(createExpenseNode(e));
      });
      totalEl.innerText = formatCurrency(total);
      // store statuses for notification diffing
      list.forEach(x => lastSeenStatuses[x._id] = x.status);
    } catch(err){ console.error(err); expensesList.innerHTML='<div class="muted">Could not load expenses</div>' }
  }
  load();
}

// ---------- Manager dashboard: analytics, charts, approve/decline ----------
if (document.body && document.querySelector('body').innerHTML.includes('Manager Dashboard')){
  const token = getToken(); if(!token) { window.location='/index.html'; }
  const user = getUser();
  document.getElementById('userName').innerText = user.name || user.email;
  document.getElementById('userEmail').innerText = user.email || '';
  document.getElementById('avatar').innerText = initials(user.name || user.email);

  const expensesList = document.getElementById('expensesList');
  const totalEl = document.getElementById('total');
  const pendingEl = document.getElementById('pendingCount');

  document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ clearSession(); window.location='/index.html'; });

  // load Chart.js from CDN
  async function ensureChart(){
    if (window.Chart) return;
    await new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function load(){
    try {
      const list = await apiFetch('/expenses');
      expensesList.innerHTML = '';
      let total=0, pending=0;
      const byCategory = {};
      list.forEach(e => {
        total += Number(e.amount||0);
        if (e.status === 'pending') pending++;
        // category grouping
        const cat = e.category||'Uncategorized';
        byCategory[cat] = (byCategory[cat]||0) + Number(e.amount||0);
        // create manager card
        expensesList.appendChild(renderManagerCard(e, async (id, status) => {
          try {
            await apiFetch('/expenses/' + id + '/status', { method:'PATCH', body: JSON.stringify({ status }) });
            // after action reload
            load();
            showNotification('Expense updated', `Expense status set to ${status}`);
          } catch(e){ console.error(e); alert('Cannot update status'); }
        }));
      });
      totalEl.innerText = formatCurrency(total);
      pendingEl.innerText = pending;

      // draw charts
      await ensureChart();
      drawCategoryChart(byCategory);
      drawStatusChart(list);
    } catch(err){ console.error(err); expensesList.innerHTML='<div class="muted">Could not load expenses</div>' }
  }

  // draw a bar chart of categories
  function drawCategoryChart(byCategory){
    const ctxId = 'catChart';
    let el = document.getElementById(ctxId);
    if (!el) {
      const container = document.createElement('div'); container.className='chart-card';
      container.innerHTML = `<canvas id="${ctxId}" height="200"></canvas>`;
      document.querySelector('.container').insertBefore(container, document.querySelector('#expensesSection'));
      el = document.getElementById(ctxId);
    }
    const labels = Object.keys(byCategory);
    const data = labels.map(l => byCategory[l]);
    if (chartInstances.cat) chartInstances.cat.destroy();
    chartInstances.cat = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label:'Amount by Category', data, backgroundColor: labels.map((_,i)=>`hsl(${i*55 % 360} 80% 60%)`) }] },
      options: { responsive:true, plugins:{legend:{display:false}} }
    });
  }

  // draw a pie showing status distribution
  function drawStatusChart(list){
    const ctxId = 'statusChart';
    let el = document.getElementById(ctxId);
    if (!el) {
      const container = document.createElement('div'); container.className='chart-card';
      container.innerHTML = `<canvas id="${ctxId}" height="180"></canvas>`;
      document.querySelector('.container').insertBefore(container, document.querySelector('#expensesSection'));
      el = document.getElementById(ctxId);
    }
    const counts = { pending:0, approved:0, declined:0 };
    list.forEach(e => counts[e.status||'pending']++);
    const labels = Object.keys(counts);
    const data = labels.map(k => counts[k]);
    if (chartInstances.status) chartInstances.status.destroy();
    chartInstances.status = new Chart(el.getContext('2d'), {
      type: 'pie',
      data: { labels, datasets:[{ data, backgroundColor: ['#f59e0b','#10b981','#ef4444'] }] },
      options: { responsive:true }
    });
  }

  // manager card renderer (used in load above)
  function renderManagerCard(exp, onAction){
    const root = document.createElement('div'); root.className='exp-card';
    const left = document.createElement('div'); left.className='exp-left';
    const userName = (exp.createdBy && (exp.createdBy.name || exp.createdBy.email)) || 'Unknown';
    left.innerHTML = `<div class="exp-title">${escapeHtml(exp.title)}</div>
                      <div class="exp-meta">${escapeHtml(userName)} • ${new Date(exp.date).toLocaleDateString()}</div>
                      <div class="exp-meta">${escapeHtml(exp.notes||'')}</div>
                      <div class="cat-pill">${escapeHtml(exp.category||'Uncategorized')}</div>`;
    const right = document.createElement('div'); right.className='card-actions';
    const amount = document.createElement('div'); amount.className='exp-amount'; amount.innerText = formatCurrency(exp.amount||0);
    const badge = document.createElement('div'); badge.className = 'badge ' + (exp.status||'pending'); badge.innerText = (exp.status||'pending').toUpperCase();
    right.appendChild(amount); right.appendChild(badge);
    if (exp.status === 'pending'){
      const accept = document.createElement('button'); accept.className='action-accept'; accept.innerText='Approve';
      const decline = document.createElement('button'); decline.className='action-decline'; decline.innerText='Decline';
      accept.addEventListener('click', ()=> onAction(exp._id, 'approved'));
      decline.addEventListener('click', ()=> onAction(exp._id, 'declined'));
      right.appendChild(accept); right.appendChild(decline);
    }
    root.appendChild(left); root.appendChild(right);
    return root;
  }

  load();
}

// ---------- Profile edit (simple modal) ----------
function openProfileEditor() {
  const user = getUser() || {};
  const modal = document.createElement('div'); modal.className='modal';
  modal.innerHTML = `<div class="modal-card">
    <h3>Edit profile</h3>
    <div style="height:10px"></div>
    <input id="pname" placeholder="Full name" value="${escapeHtml(user.name||'')}" />
    <input id="pemail" placeholder="Email" value="${escapeHtml(user.email||'')}" />
    <div style="height:8px"></div>
    <div style="display:flex;gap:8px">
      <button id="saveProfile" class="btn-primary">Save</button>
      <button id="closeProfile" class="btn-ghost">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#closeProfile').addEventListener('click', ()=> modal.remove());
  modal.querySelector('#saveProfile').addEventListener('click', ()=>{
    const name = modal.querySelector('#pname').value;
    const email = modal.querySelector('#pemail').value;
    const userObj = getUser() || {};
    userObj.name = name; userObj.email = email;
    saveSession(getToken(), userObj); // persist locally
    modal.remove();
    // refresh UI text if present
    const uname = document.getElementById('userName'); if (uname) uname.innerText = name || email;
    const uemail = document.getElementById('userEmail'); if (uemail) uemail.innerText = email;
    const avatar = document.getElementById('avatar'); if (avatar) avatar.innerText = initials(name || email);
    alert('Profile updated locally. To persist server-side, backend endpoint required.');
  });
}

// attach profile edit to navProfile button if present
document.addEventListener('click', (e)=>{
  if (e.target && e.target.id === 'navProfile') openProfileEditor();
});

// attach profile open when clicking avatar in header
document.addEventListener('click', (e)=>{
  if (e.target && e.target.id === 'avatar') openProfileEditor();
});

// ---------- Helper for PWA install prompt (optional) ----------
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // you can show a custom install button, for now we ignore
});

// ---------- common logout hook ----------
document.addEventListener('DOMContentLoaded', ()=>{
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', ()=>{ clearSession(); window.location='/index.html'; });
});
