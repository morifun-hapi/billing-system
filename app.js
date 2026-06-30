let STATE = null;          // 目前開啟的單一專案完整資料
let PROJECT_LIST = [];     // 專案列表摘要
let CURRENT_PROJECT_ID = null;
let SCRIPT_URL = localStorage.getItem('jy_script_url') || '';

const fmt = n => 'NT$ ' + Math.round(n || 0).toLocaleString('zh-TW');
const STATUS_STAGES = ['規劃中', '施工中', '驗收中', '已完工'];

function buildUrl(action, params = {}) {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function callScript(action, params = {}) {
  if (!SCRIPT_URL) {
    showBanner('尚未連接 Google Apps Script，請點右上角「連接設定」貼上你的 /exec 網址。', true);
    throw new Error('no script url');
  }
  const res = await fetch(buildUrl(action, params));
  if (!res.ok) throw new Error('網路請求失敗：' + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function showBanner(msg, isError) {
  const banner = document.getElementById('connectionBanner');
  banner.style.display = 'flex';
  banner.classList.toggle('is-error', !!isError);
  banner.innerHTML = `<span>${msg}</span><button class="btn btn--sm btn--ghost" id="bannerSettingsBtn">前往設定</button>`;
  document.getElementById('bannerSettingsBtn').addEventListener('click', openSettingsForm);
}
function hideBanner() {
  document.getElementById('connectionBanner').style.display = 'none';
}

// ===== 畫面切換：專案列表 / 專案詳情 =====
function showListView() {
  CURRENT_PROJECT_ID = null;
  STATE = null;
  document.getElementById('listView').style.display = 'block';
  document.getElementById('detailView').style.display = 'none';
  loadProjectList();
}
function showDetailView() {
  document.getElementById('listView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
}

async function loadProjectList() {
  if (!SCRIPT_URL) { showBanner('尚未連接 Google Apps Script，請點右上角「連接設定」貼上你的 /exec 網址。', true); return; }
  try {
    const data = await callScript('getProjectList');
    PROJECT_LIST = data.projects || [];
    hideBanner();
    renderProjectGrid();
  } catch (err) {
    showBanner('連接失敗：' + err.message + '（請確認網址是否正確、部署存取權是否為「任何人」）', true);
  }
}

function renderProjectGrid() {
  const wrap = document.getElementById('projectGrid');
  wrap.innerHTML = '';
  if (!PROJECT_LIST.length) {
    wrap.innerHTML = '<p class="panel-hint">尚無任何專案，點右上角「＋ 新增專案」建立第一個案子。</p>';
    return;
  }
  PROJECT_LIST.forEach(p => {
    const pct = p.totalRevenue ? Math.min(100, p.collected / p.totalRevenue * 100) : 0;
    const tile = document.createElement('div');
    tile.className = 'project-tile';
    tile.innerHTML = `
      <div class="project-tile__top">
        <div>
          <div class="project-tile__name">${p.projectName || '（未命名專案）'}</div>
          <div class="project-tile__client">業主：${p.clientName || '—'}</div>
        </div>
        <span class="status-tag">${p.status || '—'}</span>
      </div>
      <div class="project-tile__nums">
        <span>已收 ${fmt(p.collected)}</span>
        <span>報價 ${fmt(p.totalRevenue)}</span>
      </div>
      <div class="project-tile__bar"><div class="project-tile__bar-fill" style="width:${pct}%"></div></div>
      <div class="project-tile__end">預計完工：${p.endDate || '—'}</div>
    `;
    tile.addEventListener('click', () => openProject(p.projectId));
    wrap.appendChild(tile);
  });
}

async function openProject(projectId) {
  CURRENT_PROJECT_ID = projectId;
  try {
    STATE = await callScript('getData', { projectId });
    showDetailView();
    render();
  } catch (err) {
    alert('開啟專案失敗：' + err.message);
  }
}

document.getElementById('btnBackToList').addEventListener('click', showListView);
document.getElementById('btnNewProject').addEventListener('click', openNewProjectForm);

// ===== 詳情頁渲染 =====
function render() {
  if (!STATE) return;
  renderHeader();
  renderDashboard();
  renderHTimeline();
  renderClientTimeline();
  renderVendorGrid();
  renderAdvanceButton();
}

function renderHeader() {
  document.getElementById('projectIdShort').textContent = STATE.projectId || '—';
  document.getElementById('projectName').textContent = STATE.projectName || '（尚未設定）';
  document.getElementById('clientName').textContent = STATE.clientName || '—';
  document.getElementById('projectStatus').textContent = STATE.status || '—';
  document.getElementById('endDate').textContent = STATE.endDate || '—';
}

function renderDashboard() {
  const revenue = STATE.totalRevenue || 0;
  const cost = (STATE.vendors || []).reduce((s, v) => s + (v.contractAmount || 0), 0);
  const profit = revenue - cost;
  const profitRate = revenue > 0 ? (profit / revenue) * 100 : 0;
  const costPct = revenue > 0 ? Math.min(100, (cost / revenue) * 100) : 0;
  const profitPct = Math.max(0, 100 - costPct);

  document.getElementById('statRevenue').textContent = fmt(revenue);
  document.getElementById('statCost').textContent = fmt(cost);
  document.getElementById('statProfitRate').textContent = profitRate.toFixed(1) + '%';
  document.getElementById('statProfitAmount').textContent = fmt(profit);
  document.getElementById('statAddOns').textContent = STATE.totalAddOns ? fmt(STATE.totalAddOns) : '—';

  document.getElementById('barCost').style.width = costPct + '%';
  document.getElementById('barProfit').style.width = profitPct + '%';
  document.getElementById('legendCostPct').textContent = costPct.toFixed(1) + '%';
  document.getElementById('legendProfitPct').textContent = profitPct.toFixed(1) + '%';

  const collected = (STATE.clientPayments || []).filter(p => p.status === '已收').reduce((s, p) => s + p.amount, 0);
  const paid = (STATE.vendors || []).reduce((s, v) => s + (v.paymentRecords || []).reduce((s2, r) => s2 + r.amount, 0), 0);

  document.getElementById('collectedAmount').textContent = `${fmt(collected)} / ${fmt(revenue)}`;
  document.getElementById('collectedFill').style.width = (revenue ? Math.min(100, collected / revenue * 100) : 0) + '%';
  document.getElementById('paidAmount').textContent = `${fmt(paid)} / ${fmt(cost)}`;
  document.getElementById('paidFill').style.width = (cost ? Math.min(100, paid / cost * 100) : 0) + '%';

  document.getElementById('netCollected').textContent = fmt(collected);
  document.getElementById('netPaid').textContent = fmt(paid);
  document.getElementById('netCashflow').textContent = fmt(collected - paid);
}

function renderHTimeline() {
  const wrap = document.getElementById('hTimeline');
  wrap.innerHTML = '';
  const payments = STATE.clientPayments || [];
  const firstUnpaidIdx = payments.findIndex(p => p.status !== '已收');
  payments.forEach((p, idx) => {
    const isDone = p.status === '已收';
    const isCurrent = !isDone && idx === firstUnpaidIdx;
    const step = document.createElement('div');
    step.className = 'h-step' + (isDone ? ' is-done' : '') + (isCurrent ? ' is-current' : '');
    step.innerHTML = `
      <div class="h-step__line"></div>
      <div class="h-step__dot">${isDone ? '✓' : ''}</div>
      <div class="h-step__label">${p.stageName}</div>
      <div class="h-step__date">${p.expectedDate || '—'}</div>
      <div class="h-step__amount">${fmt(p.amount)}</div>
    `;
    wrap.appendChild(step);
  });
  if (!payments.length) {
    wrap.innerHTML = '<p class="panel-hint">尚無請款階段。</p>';
  }
}

function renderClientTimeline() {
  const wrap = document.getElementById('clientTimeline');
  wrap.innerHTML = '';
  (STATE.clientPayments || []).forEach((p, idx) => {
    const isPaid = p.status === '已收';
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
      <div class="timeline-item__stub">${String(idx+1).padStart(2,'0')}</div>
      <div class="timeline-item__dot ${isPaid?'is-paid':''}"></div>
      <div class="timeline-item__body">
        <div class="timeline-item__top">
          <span class="timeline-item__title">${p.stageName}</span>
          <span class="timeline-item__amount">${fmt(p.amount)}</span>
        </div>
        <div class="timeline-item__meta">預定日期：${p.expectedDate || '—'} ｜ 單號：${p.invoiceNo || '—'}</div>
        <div class="timeline-item__actions">
          <button class="status-stamp ${isPaid?'paid':'unpaid'}" data-action="toggle-status" data-id="${p.id}">${isPaid?'已收款':'待收款'}</button>
          <button class="btn btn--ghost btn--sm" data-action="show-invoice" data-id="${p.id}">請款單</button>
          <button class="btn btn--ghost btn--sm" data-action="delete-client-stage" data-id="${p.id}">刪除</button>
        </div>
      </div>
    `;
    wrap.appendChild(el);
  });
  if (!STATE.clientPayments?.length) {
    wrap.innerHTML = '<p class="panel-hint">尚無請款階段，請點擊右上方「＋ 新增請款階段」建立。</p>';
  }
}

function renderVendorGrid() {
  const wrap = document.getElementById('vendorGrid');
  wrap.innerHTML = '';
  (STATE.vendors || []).forEach(v => {
    const paid = (v.paymentRecords || []).reduce((s, r) => s + r.amount, 0);
    const pct = v.contractAmount ? Math.min(100, paid / v.contractAmount * 100) : 0;
    const recordsHtml = (v.paymentRecords || []).slice().reverse().slice(0, 4).map(r =>
      `<div><span>${r.date}</span><span class="mono">${fmt(r.amount)}</span></div>`
    ).join('') || '<div style="opacity:.6">尚無付款紀錄</div>';

    const el = document.createElement('div');
    el.className = 'vendor-card';
    el.innerHTML = `
      <div class="vendor-card__top">
        <span class="vendor-card__name">${v.vendorName}</span>
        <span class="vendor-card__cat">${v.category}</span>
      </div>
      <div class="vendor-card__amounts">已付 <b>${fmt(paid)}</b> / 合約 <b>${fmt(v.contractAmount)}</b> ｜ ${pct.toFixed(0)}%</div>
      <div class="mini-bar vendor-bar"><div class="mini-bar__fill mini-bar__fill--vendor" style="width:${pct}%"></div></div>
      <div class="vendor-card__records">${recordsHtml}</div>
      <div class="vendor-card__footer">
        <button class="btn btn--primary btn--sm" data-action="add-vendor-payment" data-id="${v.vendorId}">＋ 記錄請款</button>
        <button class="btn btn--ghost btn--sm" data-action="delete-vendor" data-id="${v.vendorId}">刪除廠商</button>
      </div>
    `;
    wrap.appendChild(el);
  });
  if (!STATE.vendors?.length) {
    wrap.innerHTML = '<p class="panel-hint">尚無廠商，請點擊「＋ 新增廠商」建立。</p>';
  }
}

function renderAdvanceButton() {
  const btn = document.getElementById('btnAdvanceStatus');
  const label = document.getElementById('nextStatusLabel');
  const idx = STATUS_STAGES.indexOf(STATE.status);
  const next = idx >= 0 && idx < STATUS_STAGES.length - 1 ? STATUS_STAGES[idx + 1] : null;
  if (!next) {
    btn.disabled = true;
    label.textContent = STATE.status === STATUS_STAGES[STATUS_STAGES.length - 1] ? '已完工' : '—';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'default';
  } else {
    btn.disabled = false;
    label.textContent = next;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }
}

// ===== Event delegation for dynamic buttons（詳情頁內） =====
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  try {
    if (action === 'toggle-status') {
      const item = STATE.clientPayments.find(p => p.id === id);
      const newStatus = item.status === '已收' ? '待收' : '已收';
      STATE = await callScript('toggleClientStatus', { id, status: newStatus, projectId: CURRENT_PROJECT_ID });
      render();
    }

    if (action === 'show-invoice') {
      openInvoice(id);
    }

    if (action === 'delete-client-stage') {
      if (!confirm('確定要刪除此請款階段嗎？')) return;
      STATE = await callScript('deleteClientStage', { id, projectId: CURRENT_PROJECT_ID });
      render();
    }

    if (action === 'delete-vendor') {
      if (!confirm('確定要刪除此廠商嗎？')) return;
      STATE = await callScript('deleteVendor', { vendorId: id, projectId: CURRENT_PROJECT_ID });
      render();
    }

    if (action === 'add-vendor-payment') {
      openVendorPaymentForm(id);
    }
  } catch (err) {
    alert('操作失敗：' + err.message);
  }
});

document.getElementById('btnAddClientStage').addEventListener('click', openClientStageForm);
document.getElementById('btnAddVendor').addEventListener('click', openVendorForm);
document.getElementById('btnSettings').addEventListener('click', openSettingsForm);

document.getElementById('btnAdvanceStatus').addEventListener('click', async () => {
  const idx = STATUS_STAGES.indexOf(STATE.status);
  const next = idx >= 0 && idx < STATUS_STAGES.length - 1 ? STATUS_STAGES[idx + 1] : null;
  if (!next) return;
  if (!confirm(`確定要把專案狀態推進至「${next}」嗎？`)) return;
  try {
    STATE = await callScript('updateProject', { status: next, projectId: CURRENT_PROJECT_ID });
    render();
  } catch (err) {
    alert('操作失敗：' + err.message);
  }
});

document.getElementById('btnDeleteProject').addEventListener('click', async () => {
  const typed = prompt(`此動作會刪除整個專案的所有資料，且無法復原。\n請輸入專案名稱「${STATE.projectName}」以確認刪除：`);
  if (typed !== STATE.projectName) {
    if (typed !== null) alert('輸入的專案名稱不符，已取消刪除。');
    return;
  }
  try {
    await callScript('deleteProject', { projectId: CURRENT_PROJECT_ID });
    alert('專案資料已刪除。');
    showListView();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
});

// ===== Invoice Modal =====
function openInvoice(clientPaymentId) {
  const item = STATE.clientPayments.find(p => p.id === clientPaymentId);
  const totalRevenue = STATE.totalRevenue || 0;
  const collected = STATE.clientPayments.filter(p => p.status === '已收').reduce((s,p)=>s+p.amount,0);
  const company = STATE.company || {};
  const pctOfTotal = totalRevenue ? (item.amount / totalRevenue * 100).toFixed(0) : 0;

  const rowsHtml = STATE.clientPayments.map(p => `
    <tr class="${p.id === item.id ? 'is-current-row' : ''}">
      <td>${p.stageName}${p.id === item.id ? ' <span class="tag-current">本期</span>' : ''}</td>
      <td>${fmt(p.amount)}</td>
      <td>${p.expectedDate || '—'}</td>
      <td>${p.status}</td>
    </tr>
  `).join('');

  document.getElementById('invoicePrintArea').innerHTML = `
    <div class="invoice">
      <div class="invoice-header">
        <div>
          <h2>${company.name || '墨點 MOTAN'}</h2>
          <p>${company.address || ''}</p>
          <p>統編：${company.taxId || '—'} ｜ 電話：${company.phone || '—'}</p>
        </div>
        <div class="invoice-meta">
          <div class="invoice-tag">請款單</div>
          <div>單號：${item.invoiceNo || '—'}</div>
          <div>開立：${new Date().toISOString().slice(0,10)}</div>
        </div>
      </div>

      <div class="invoice-section-title">業主資訊</div>
      <div class="invoice-row"><span>業主姓名</span><span>${STATE.clientName}</span></div>
      <div class="invoice-row"><span>專案名稱</span><span>${STATE.projectName}</span></div>

      <div class="invoice-section-title">本期請款項目</div>
      <div class="invoice-row"><span>${item.stageName} <span class="tag-current">本期</span></span><span class="mono">${fmt(item.amount)}</span></div>
      <div class="invoice-row" style="border-bottom:none;color:var(--ink-soft);font-size:11px;">合約總額 ${fmt(totalRevenue)} 之 ${pctOfTotal}%</div>
      <div class="invoice-row total"><span>本期應付總額</span><span class="mono">${fmt(item.amount)}</span></div>

      <div class="invoice-section-title">各期進度總覽</div>
      <table class="invoice-table">
        <thead><tr><th>階段</th><th>金額</th><th>預定日期</th><th>狀態</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="invoice-row total" style="margin-top:10px;"><span>已收合計</span><span class="mono">${fmt(collected)} / ${fmt(totalRevenue)}</span></div>

      <div class="invoice-footer">
        匯款銀行：${company.bank || '—'} ｜ 帳號：${company.bankAccount || '—'} ｜ 戶名：${company.bankAccountName || '—'}<br>
        請於收到本單後 7 個工作日內完成匯款，並提供匯款後五碼以便對帳，謝謝您的支持。
      </div>
    </div>
  `;
  document.getElementById('invoiceOverlay').classList.add('is-open');
}
document.getElementById('btnCloseInvoice').addEventListener('click', () => document.getElementById('invoiceOverlay').classList.remove('is-open'));
document.getElementById('btnCloseInvoice2').addEventListener('click', () => document.getElementById('invoiceOverlay').classList.remove('is-open'));
document.getElementById('btnPrintInvoice').addEventListener('click', () => window.print());

// ===== Generic form modal =====
function openFormModal(html, onSubmitSelector, onSubmit) {
  const sheet = document.getElementById('formSheet');
  sheet.innerHTML = html;
  document.getElementById('formOverlay').classList.add('is-open');
  sheet.querySelector('[data-form-cancel]').addEventListener('click', closeFormModal);
  sheet.querySelector(onSubmitSelector).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '處理中…';
    try {
      await onSubmit(e.target);
      closeFormModal();
    } catch (err) {
      alert('操作失敗：' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '送出';
    }
  });
}
function closeFormModal() {
  document.getElementById('formOverlay').classList.remove('is-open');
  document.getElementById('formSheet').innerHTML = '';
}

function openClientStageForm() {
  openFormModal(`
    <h3 class="form-title">新增業主請款階段</h3>
    <form id="clientStageForm">
      <div class="form-field"><label>階段名稱</label><input name="stageName" required placeholder="例：木作工程款"></div>
      <div class="form-field"><label>金額</label><input name="amount" type="number" min="0" required></div>
      <div class="form-field"><label>預定收款日期</label><input name="expectedDate" type="date"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-form-cancel>取消</button>
        <button type="submit" class="btn btn--primary">新增</button>
      </div>
    </form>
  `, '#clientStageForm', async (form) => {
    const fd = new FormData(form);
    STATE = await callScript('addClientStage', {
      projectId: CURRENT_PROJECT_ID,
      stageName: fd.get('stageName'), amount: fd.get('amount'), expectedDate: fd.get('expectedDate')
    });
    render();
  });
}

function openVendorForm() {
  openFormModal(`
    <h3 class="form-title">新增廠商</h3>
    <form id="vendorForm">
      <div class="form-field"><label>廠商名稱</label><input name="vendorName" required></div>
      <div class="form-field"><label>類別</label><input name="category" placeholder="例：木作 / 水電 / 油漆 / 地板" required></div>
      <div class="form-field"><label>合約金額</label><input name="contractAmount" type="number" min="0" required></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-form-cancel>取消</button>
        <button type="submit" class="btn btn--primary">新增</button>
      </div>
    </form>
  `, '#vendorForm', async (form) => {
    const fd = new FormData(form);
    STATE = await callScript('addVendor', {
      projectId: CURRENT_PROJECT_ID,
      vendorName: fd.get('vendorName'), category: fd.get('category'), contractAmount: fd.get('contractAmount')
    });
    render();
  });
}

function openVendorPaymentForm(vendorId) {
  const v = STATE.vendors.find(v => v.vendorId === vendorId);
  openFormModal(`
    <h3 class="form-title">記錄付款 — ${v.vendorName}</h3>
    <form id="vendorPaymentForm">
      <div class="form-field"><label>付款金額</label><input name="amount" type="number" min="0" required></div>
      <div class="form-field"><label>付款日期</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-field"><label>備註</label><input name="note" placeholder="例：進場訂金 50%"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-form-cancel>取消</button>
        <button type="submit" class="btn btn--primary">儲存</button>
      </div>
    </form>
  `, '#vendorPaymentForm', async (form) => {
    const fd = new FormData(form);
    STATE = await callScript('addVendorPayment', {
      projectId: CURRENT_PROJECT_ID,
      vendorId, amount: fd.get('amount'), date: fd.get('date'), note: fd.get('note')
    });
    render();
  });
}

// ===== 新增專案（在專案列表頁觸發）=====
function openNewProjectForm() {
  openFormModal(`
    <h3 class="form-title">新增專案</h3>
    <form id="newProjectForm">
      <div class="form-field"><label>業主姓名</label><input name="clientName" required placeholder="例：李先生"></div>
      <div class="form-field"><label>專案名稱</label><input name="projectName" required placeholder="例：高雄-自由路 李宅"></div>
      <div class="form-field"><label>業主報價總額</label><input name="totalRevenue" type="number" min="0" required></div>
      <div class="form-field"><label>預計完工日</label><input name="endDate" type="date"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-form-cancel>取消</button>
        <button type="submit" class="btn btn--primary">建立專案</button>
      </div>
    </form>
  `, '#newProjectForm', async (form) => {
    const fd = new FormData(form);
    const result = await callScript('createProject', {
      clientName: fd.get('clientName'),
      projectName: fd.get('projectName'),
      totalRevenue: fd.get('totalRevenue'),
      endDate: fd.get('endDate')
    });
    PROJECT_LIST = result.projects || [];
    renderProjectGrid();
    if (result.projectId) openProject(result.projectId);
  });
}

// ===== 連接設定（僅設定 Apps Script 網址）=====
function openSettingsForm() {
  openFormModal(`
    <h3 class="form-title">連接設定</h3>
    <form id="settingsForm">
      <div class="form-field">
        <label>Google Apps Script 網址（/exec 結尾）</label>
        <input name="scriptUrl" required placeholder="https://script.google.com/macros/s/xxxx/exec" value="${SCRIPT_URL}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-form-cancel>取消</button>
        <button type="submit" class="btn btn--primary">儲存並連接</button>
      </div>
    </form>
  `, '#settingsForm', async (form) => {
    const fd = new FormData(form);
    SCRIPT_URL = fd.get('scriptUrl').trim();
    localStorage.setItem('jy_script_url', SCRIPT_URL);
    showListView();
  });
}

// ===== Export / Import（僅匯出/匯入「目前開啟中的單一專案」）=====
document.getElementById('btnExport').addEventListener('click', async () => {
  if (!CURRENT_PROJECT_ID) { alert('請先點開一個專案再匯出。'); return; }
  try {
    const data = await callScript('exportData', { projectId: CURRENT_PROJECT_ID });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.projectName || 'project') + '-backup.json';
    a.click();
  } catch (err) {
    alert('匯出失敗：' + err.message);
  }
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!CURRENT_PROJECT_ID) { alert('請先點開一個專案，匯入會覆蓋「目前這個專案」的資料。'); e.target.value = ''; return; }
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    parsed.projectId = CURRENT_PROJECT_ID; // 匯入一律覆蓋「目前開啟的專案」，不會影響其他專案
    STATE = await callScript('importData', { payload: encodeURIComponent(JSON.stringify(parsed)), projectId: CURRENT_PROJECT_ID });
    render();
    alert('資料匯入成功！');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  }
  e.target.value = '';
});

// 點擊 overlay 空白處關閉
document.getElementById('invoiceOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'invoiceOverlay') e.target.classList.remove('is-open');
});
document.getElementById('formOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'formOverlay') closeFormModal();
});

// ===== 啟動 =====
showListView();
