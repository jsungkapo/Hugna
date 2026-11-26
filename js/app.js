/* HugNa — ตัวแอปหลัก */
(function () {
  'use strict';
  const C = window.Cert, CFG = window.HUGNA_CONFIG, LS = API.LS;
  const { esc, num, r2, money, dShort } = C;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const thisBook = () => String(new Date().getFullYear() + 543);

  const S = { user: null, companies: [], certs: [], payees: [], tags: [], files: [], fileCache: {}, pFilter: null, lTag: '', coId: '', imgs: {}, users: [], started: false, copies: 'both', mode: 'form' };
  let D = null, CD = null;
  const isAdmin = () => S.user && S.user.role === 'admin';
  const co = id => S.companies.find(c => c.id === id);

  /* ================= UI helpers ================= */
  let tT = 0;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), 2800); }
  function dialog(html) { $('#dlg').onclick = null; $('#dlg').innerHTML = html; $('#ov').hidden = false; }
  function closeDlg() { $('#ov').hidden = true; }
  $('#ov').addEventListener('click', e => { if (e.target.id === 'ov' || e.target.closest('[data-close]')) closeDlg(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDlg(); });
  function ask(msg, ok) {
    return new Promise(res => {
      dialog(`<p style="margin:0;font-size:17px">${esc(msg)}</p><div class="row"><button type="button" class="ghost" id="aN">ยกเลิก</button><button type="button" class="pri" id="aY">${esc(ok)}</button></div>`);
      $('#aN').onclick = () => { closeDlg(); res(false); }; $('#aY').onclick = () => { closeDlg(); res(true); };
    });
  }
  async function busy(btn, label, fn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { return await fn(); } catch (e) { toast(e.message || 'เกิดข้อผิดพลาด'); } finally { btn.disabled = false; btn.textContent = old; }
  }
  function showErr(el, msg) { el.textContent = msg; el.hidden = !msg; }
  function screen(id) { ['boot', 'scr-url', 'scr-login', 'scr-setup', 'app'].forEach(x => { $('#' + x).hidden = x !== id; }); }

  /* ================= boot / auth ================= */
  async function boot() {
    registerSW(); checkVersion();
    if (!API.url()) return screen('scr-url');
    if (!API.token()) return toLogin();
    const cached = LS.get('cache', null);
    if (cached && cached.user) { apply(cached); startApp(); }
    try { await loadAll(); startApp(); }
    catch (e) {
      if (e.code === 'auth') return;
      if (!S.started) { screen('boot'); showErr($('#bootErr'), e.message); $('#bootRetry').hidden = false; }
      else toast('ออฟไลน์ — แสดงข้อมูลล่าสุดที่เคยโหลด');
    }
  }
  $('#bootRetry').onclick = () => { $('#bootRetry').hidden = true; showErr($('#bootErr'), ''); boot(); };
  async function loadAll() { const d = await API.call('bootstrap'); apply(d); saveCache(); }
  function saveCache() { LS.set('cache', { user: S.user, companies: S.companies, certs: S.certs, payees: S.payees, tags: S.tags, files: S.files }); }
  function apply(d) {
    S.user = d.user; S.user.favs = S.user.favs || []; S.companies = d.companies || []; S.certs = d.certs || [];
    S.payees = d.payees || []; S.tags = d.tags || []; S.files = d.files || [];
    const last = LS.get('lastCo', '');
    S.coId = co(last) ? last : (co(S.coId) ? S.coId : (S.companies[0] && S.companies[0].id) || '');
  }
  async function toLogin(msg) {
    S.started = false; screen('scr-login'); showErr($('#lgErr'), msg || '');
    try { const st = await API.call('status'); if (st.needsSetup) screen('scr-setup'); }
    catch (e) { showErr($('#lgErr'), e.message); }
  }
  API.onAuthLost = msg => toLogin(msg);

  $('#urlForm').addEventListener('submit', async e => {
    e.preventDefault(); const u = $('#urlIn').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/.test(u)) return showErr($('#urlErr'), 'URL ต้องเป็นของ script.google.com และลงท้ายด้วย /exec');
    API.setUrl(u); showErr($('#urlErr'), '');
    try { await API.call('ping'); toLogin(); } catch (err) { showErr($('#urlErr'), 'เชื่อมต่อไม่ได้: ' + err.message); }
  });
  $('#lgUrl').onclick = () => { $('#urlIn').value = API.url(); screen('scr-url'); };
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); const btn = e.submitter || $('#loginForm .pri'); showErr($('#lgErr'), '');
    await busy(btn, 'กำลังเข้าสู่ระบบ…', async () => {
      try {
        const r = await API.call('login', { username: $('#lgUser').value, password: $('#lgPass').value });
        API.setToken(r.token); $('#lgPass').value = ''; await loadAll(); startApp();
      } catch (err) { showErr($('#lgErr'), err.message); }
    });
  });
  $('#setupForm').addEventListener('submit', async e => {
    e.preventDefault(); showErr($('#suErr'), '');
    if ($('#suPass').value !== $('#suPass2').value) return showErr($('#suErr'), 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    await busy(e.submitter || $('#setupForm .pri'), 'กำลังสร้าง…', async () => {
      try {
        const r = await API.call('setup', { name: $('#suName').value, username: $('#suUser').value, password: $('#suPass').value });
        API.setToken(r.token); await loadAll(); startApp(); location.hash = '#companies';
      } catch (err) { showErr($('#suErr'), err.message); }
    });
  });

  function startApp() {
    screen('app'); document.body.classList.toggle('is-admin', isAdmin());
    if (!S.started) { S.started = true; D = blank(); CD = coBlank(); }
    renderCoSel(); renderList(); fillForm(); renderCompanies(); coForm(); renderSettings(); payeeList(); renderPayees();
    route();
  }

  /* ================= routing ================= */
  const VIEWS = ['list', 'edit', 'payees', 'companies', 'settings'];
  function route() {
    let v = location.hash.slice(1) || 'list';
    if (!VIEWS.includes(v) || (v === 'companies' && !isAdmin())) v = 'list';
    VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
    if (v === 'edit') fit();
    if (v === 'settings') loadSystem();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', () => { if (S.started) route(); });
  $('#nav a[data-v=edit]').addEventListener('click', () => { if (D && D.id) { D = blank(); fillForm(); } });
  function go(v) { if (location.hash === '#' + v) route(); else location.hash = '#' + v; }

  /* ================= company selector ================= */
  function renderCoSel() {
    $('#coSel').innerHTML = S.companies.length
      ? S.companies.map(c => `<option value="${esc(c.id)}"${c.id === S.coId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')
      : '<option value="">— ยังไม่มีบริษัท —</option>';
  }
  $('#coSel').onchange = e => {
    S.coId = e.target.value; LS.set('lastCo', S.coId);
    if (!D.id) { D.companyId = S.coId; D.no = ''; }
    renderList(); fillForm(); renderCompanies();
  };

  /* ================= images ================= */
  const pending = {};
  function img(fileId) {
    if (!fileId) return null;
    if (S.imgs[fileId]) return S.imgs[fileId];
    const cached = LS.get('img_' + fileId, null);
    if (cached) { S.imgs[fileId] = cached; return cached; }
    if (!pending[fileId]) {
      pending[fileId] = API.call('image', { fileId }).then(r => {
        S.imgs[fileId] = r.dataUrl; LS.set('img_' + fileId, r.dataUrl); preview(); renderCompanies();
      }).catch(() => {}).finally(() => { delete pending[fileId]; });
    }
    return null;
  }
  const imgsFor = c => c ? { sig: img(c.sigFileId), stamp: img(c.stampFileId) } : {};

  /* ================= list ================= */
  function renderList() {
    const q = $('#q').value.trim().toLowerCase(), m = $('#mon').value;
    renderTagBar('#lTags', S.lTag, false);
    const tagOk = c => { if (!S.lTag) return true; const p = payeeOfCert(c); return !!p && (p.tags || []).includes(S.lTag); };
    const rows = S.certs.filter(c => c.companyId === S.coId && tagOk(c) && (!m || String(c.issueDate).startsWith(m)) &&
      (!q || [c.payeeName, c.payeeTaxId, c.no, c.book + '/' + c.no].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || String(b.no).localeCompare(String(a.no)));
    const ta = rows.reduce((s, c) => s + num(c.totalAmount), 0), tt = rows.reduce((s, c) => s + num(c.totalTax), 0);
    $('#kpis').innerHTML = `<div>จำนวนใบ<b>${rows.length}</b></div><div>ยอดจ่ายรวม<b>${money(ta)}</b></div><div class="tx">ภาษีที่หักรวม<b>${money(tt)}</b></div>`;
    if (!S.companies.length) {
      $('#certCards').innerHTML = `<div class="empty">ยังไม่มีบริษัทในระบบ${isAdmin() ? ' — เริ่มที่แท็บ “บริษัท”' : ' — ติดต่อผู้ดูแลระบบ'}</div>`; return;
    }
    $('#certCards').innerHTML = rows.length ? rows.map(c => `<button type="button" class="cc" data-open="${esc(c.id)}">
      <span class="h"><b>${esc(c.book)}/${esc(c.no)}</b><span>${esc(dShort(c.issueDate))} · ${esc(C.FORMS[c.form] || '')}</span></span>
      <span class="nm">${esc(c.payeeName)}</span>
      <span class="am"><span>ยอดจ่าย <b>${money(c.totalAmount)}</b></span><span class="t">ภาษี <b>${money(c.totalTax)}</b></span></span>
      <span class="hint">โดย ${esc(c.createdByName || '-')}${filesOf('cert', c.id).length ? ' · 📎 ' + filesOf('cert', c.id).length + ' ไฟล์' : ''}</span></button>`).join('')
      : `<div class="empty">${S.certs.some(c => c.companyId === S.coId) ? 'ไม่พบเอกสารที่ตรงกับตัวกรอง' : 'ยังไม่มีเอกสารของบริษัทนี้ — กด “ออกใบใหม่”'}</div>`;
  }
  $('#q').addEventListener('input', renderList);
  $('#lTags').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; S.lTag = b.dataset.t === S.lTag ? '' : b.dataset.t; renderList(); }); $('#mon').addEventListener('input', renderList);
  $('#certCards').addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    const c = S.certs.find(x => x.id === b.dataset.open); if (!c) return;
    D = clone(c); fillForm(); go('edit');
  });

  /* ================= editor ================= */
  function blank() {
    return { id: null, companyId: S.coId, payeeId: null, book: thisBook(), no: '', issueDate: todayISO(), form: 6, seq: '',
      payeeType: 'j', payeeName: '', payeeTaxId: '', payeeBranch: '', payeeAddress: '', payer: 0, payerOther: '',
      items: [{ id: uid(), cat: 'c5', desc: 'ค่าบริการ', date: todayISO(), amount: '', rate: 3 }], _pending: [],
      funds: { gpf: '', sso: '', pvd: '' }, useSig: true, useStamp: true };
  }
  function nextNo(coId, book) {
    let m = 0; S.certs.forEach(c => { if (c.companyId === coId && String(c.book) === String(book)) m = Math.max(m, parseInt(c.no, 10) || 0); });
    return String(m + 1).padStart(4, '0');
  }
  const canEdit = c => !c.id || isAdmin() || c.createdBy === S.user.id;
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setP = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] || {}), o)[l] = v; };

  $('#formSel').innerHTML = C.FORMS.map((x, i) => `<option value="${i}">(${i + 1}) ${x}</option>`).join('');
  $('#payerSel').innerHTML = C.PAYER.map((x, i) => `<option value="${i}">(${i + 1}) ${x}</option>`).join('');
  $('#presets').innerHTML = C.PRESETS.map((p, i) => `<button type="button" data-p="${i}">${p[0]} <b>${p[1]}%</b></button>`).join('');

  function fillForm() {
    if (!D) return;
    for (const el of $$('#f [data-k]')) { const v = getP(D, el.dataset.k); if (el.type === 'checkbox') el.checked = v !== false; else el.value = v ?? ''; }
    $('#noIn').placeholder = 'อัตโนมัติ (' + nextNo(D.companyId, D.book) + ')';
    $$('#ptype button').forEach(b => b.classList.toggle('on', b.dataset.v === D.payeeType));
    renderFavStrip();
    $('#poL').hidden = +D.payer !== 3;
    $('#copiesSel').value = S.copies;
    const tag = $('#editTag');
    tag.hidden = !D.id;
    tag.textContent = D.id ? `กำลังแก้ไขใบเลขที่ ${D.book}/${D.no}` + (canEdit(D) ? '' : ' (ดูอย่างเดียว — ใบนี้ออกโดยผู้อื่น)') : '';
    $('#save').disabled = !canEdit(D);
    $('#noco').hidden = !!S.companies.length;
    const c = co(D.companyId);
    const miss = c ? [!c.sigFileId && 'ลายเซ็น', !c.stampFileId && 'ตรายาง'].filter(Boolean) : [];
    $('#sigHint').textContent = miss.length ? `บริษัทนี้ยังไม่มี${miss.join('และ')}` + (isAdmin() ? ' — เพิ่มได้ที่แท็บ “บริษัท”' : '') : '';
    renderItems(); preview(); renderAttach();
  }
  function renderItems() {
    $('#items').innerHTML = D.items.map((it, i) => {
      const custom = it.custom || !C.RATES.includes(num(it.rate));
      return `<div class="it" data-i="${i}">
      <div class="it-h"><select data-ik="cat" aria-label="ประเภทเงินได้">${C.CATS.map(c => `<option value="${c.k}"${c.k === it.cat ? ' selected' : ''}>${esc(c.s)}</option>`).join('')}</select>${D.items.length > 1 ? `<button type="button" class="x" data-del="${i}" aria-label="ลบรายการ">×</button>` : ''}</div>
      <input data-ik="desc" placeholder="รายละเอียด เช่น ค่าบริการออกแบบ" value="${esc(it.desc)}" aria-label="รายละเอียด">
      <div class="g3"><label>จำนวนเงิน (ก่อน VAT)<input data-ik="amount" inputmode="decimal" placeholder="0.00" value="${esc(it.amount)}"></label>
       <label>วันที่จ่าย<input type="date" data-ik="date" value="${esc(it.date)}"></label>
       <label>อัตราหัก<select data-ik="rateSel">${C.RATES.map(r => `<option value="${r}"${!custom && num(it.rate) === r ? ' selected' : ''}>${r}%</option>`).join('')}<option value="x"${custom ? ' selected' : ''}>กำหนดเอง</option></select></label></div>
      <div class="it-f"><button type="button" class="link" data-vat="${i}">ยอดรวม VAT 7% → ถอด VAT</button>${custom ? `<label class="inl">อัตรา %<input data-ik="rate" inputmode="decimal" value="${esc(it.rate)}"></label>` : ''}<span class="tax">หัก <b data-tax>${money(C.tax(it))}</b> บาท</span></div></div>`;
    }).join('');
  }
  function totals() {
    const ta = D.items.reduce((s, it) => s + C.amt(it), 0), tt = D.items.reduce((s, it) => s + C.tax(it), 0);
    $('#tot').innerHTML = `<span>ยอดจ่ายรวม <b>${money(ta)}</b></span><span>ภาษีที่หักรวม <b style="color:var(--redd)">${money(tt)}</b></span>`;
  }
  const pv = $('#pv'), sh = $('#sheet');
  function fit() { const w = pv.clientWidth; if (!w) return; const s = w / 794; sh.style.transform = `scale(${s})`; pv.style.height = Math.ceil(sh.offsetHeight * s) + 'px'; }
  const fitRO = new ResizeObserver(fit); fitRO.observe(pv);
  let pvT = 0;
  function sheetFor(copy) { const c = D.coSnap || co(D.companyId); return C.sheetHTML(D, c, imgsFor(co(D.companyId)), copy); }
  function preview() { clearTimeout(pvT); pvT = setTimeout(() => { if (!D) return; sh.innerHTML = sheetFor(1); fit(); totals(); }, 80); }

  $('#f').addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'copiesSel') { S.copies = el.value; return; }
    if (el.dataset.k) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.k === 'form' || el.dataset.k === 'payer') v = +v;
      setP(D, el.dataset.k, v);
      if (el.dataset.k === 'payer') $('#poL').hidden = v !== 3;
      if (el.dataset.k === 'book') $('#noIn').placeholder = 'อัตโนมัติ (' + nextNo(D.companyId, D.book) + ')';
      if (el.dataset.k === 'payeeName' || el.dataset.k === 'payeeTaxId') D.payeeId = null;
      if (el.dataset.k === 'payeeName') autofillPayee();
      preview(); return;
    }
    const box = el.closest('.it'); if (!box || !el.dataset.ik) return;
    const it = D.items[+box.dataset.i], k = el.dataset.ik;
    if (k === 'rateSel') { if (el.value === 'x') it.custom = true; else { it.custom = false; it.rate = +el.value; } renderItems(); preview(); return; }
    it[k] = el.value; box.querySelector('[data-tax]').textContent = money(C.tax(it)); preview();
  });
  $('#copiesSel').addEventListener('change', e => { S.copies = e.target.value; });
  $('#f').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.del) { D.items.splice(+b.dataset.del, 1); renderItems(); preview(); }
    else if (b.dataset.vat) {
      const it = D.items[+b.dataset.vat];
      if (C.amt(it) > 0) { it.amount = r2(C.amt(it) / 1.07).toFixed(2); renderItems(); preview(); toast('ถอด VAT แล้ว ยอดก่อน VAT = ' + money(C.amt(it))); }
    } else if (b.dataset.p) {
      const [desc, rate, cat] = C.PRESETS[+b.dataset.p]; const last = D.items[D.items.length - 1];
      const n = { id: uid(), cat, desc, date: (last && last.date) || todayISO(), amount: '', rate };
      if (last && !C.amt(last)) D.items[D.items.length - 1] = Object.assign(n, { amount: last.amount }); else D.items.push(n);
      renderItems(); preview();
    } else if (b.dataset.v) { D.payeeType = b.dataset.v; D.form = b.dataset.v === 'j' ? 6 : 3; fillForm(); }
  });
  $('#addItem').onclick = () => { D.items.push({ id: uid(), cat: 'c5', desc: '', date: todayISO(), amount: '', rate: 3 }); renderItems(); };
  $('#editSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; S.mode = b.dataset.m;
    $$('#editSeg button').forEach(x => x.classList.toggle('on', x === b));
    $('.ed').className = 'ed m-' + S.mode; if (S.mode === 'preview') { sh.innerHTML = sheetFor(1); requestAnimationFrame(fit); }
  });
  $('.ed').classList.add('m-form');

  function autofillPayee() {
    const p = S.payees.find(x => x.name === D.payeeName);
    if (p && !D.payeeTaxId) { applyPayee(p); }
  }
  function payeeList() { $('#payees').innerHTML = S.payees.map(p => `<option value="${esc(p.name)}">`).join(''); }
  function renderFavStrip() {
    const favs = favPayees().slice(0, 12);
    $('#favStrip').innerHTML = favs.map(p => `<button type="button" class="fv" data-pick="${esc(p.id)}">${esc(p.name)}</button>`).join('') +
      `<button type="button" class="ghost" id="pickAll">${favs.length ? 'รายชื่อทั้งหมด…' : '★ เลือกจากรายชื่อ…'}</button>`;
  }
  $('#favStrip').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pick) { const p = S.payees.find(x => x.id === b.dataset.pick); if (p) { applyPayee(p); toast('ใส่ข้อมูล ' + p.name + ' แล้ว'); } }
    else openPicker();
  });

  $('#save').onclick = () => busy($('#save'), 'กำลังบันทึก…', async () => {
    if (!D.companyId || !co(D.companyId)) throw new Error('เลือกหรือเพิ่มบริษัทผู้หักภาษีก่อน');
    const pend = D._pending || [];
    const payload = Object.assign({}, D); delete payload._pending;
    const rec = await API.call('saveCert', { cert: payload });
    S.certs = S.certs.filter(x => x.id !== rec.id).concat(rec);
    if (rec.payeeId && !S.payees.some(p => p.id === rec.payeeId)) {
      S.payees.push({ id: rec.payeeId, type: rec.payeeType, name: rec.payeeName, taxId: rec.payeeTaxId, branch: rec.payeeBranch, address: rec.payeeAddress, tags: [], defItem: {}, form: rec.form, createdBy: S.user.id });
      renderPayees();
    }
    saveCache();
    D = clone(rec); D._pending = [];
    let failed = 0;
    for (const f of pend) { try { await uploadNow('cert', rec.id, f); } catch (e) { failed++; D._pending.push(f); } }
    fillForm(); renderList(); payeeList();
    toast('บันทึกแล้ว เลขที่ ' + rec.book + '/' + rec.no + (pend.length ? (failed ? ` · แนบไฟล์ไม่สำเร็จ ${failed} ไฟล์ กดบันทึกอีกครั้ง` : ` · แนบ ${pend.length} ไฟล์แล้ว`) : ''));
  });
  function fname(ext) { return `WHT-50tawi-${String(D.book).replace(/[^\w-]/g, '')}-${String(D.no || 'draft').replace(/[^\w-]/g, '')}.${ext}`; }
  const copiesList = () => S.copies === '1' ? [1] : S.copies === '2' ? [2] : [1, 2];
  async function ensureImgs() {
    const c = co(D.companyId); if (!c) return;
    for (const id of [D.useSig !== false && c.sigFileId, D.useStamp !== false && c.stampFileId]) {
      if (id && !img(id) && pending[id]) await pending[id];
    }
  }
  $('#pdf').onclick = () => busy($('#pdf'), 'กำลังสร้าง…', async () => {
    await ensureImgs(); const blob = await C.toPDF(copiesList().map(sheetFor));
    const r = await C.deliver(blob, fname('pdf')); if (r === 'downloaded') toast('ดาวน์โหลด PDF แล้ว');
  });
  $('#png').onclick = () => busy($('#png'), 'กำลังสร้าง…', async () => {
    await ensureImgs(); const blob = await C.toPNG(sheetFor(copiesList()[0]));
    const r = await C.deliver(blob, fname('png')); if (r === 'downloaded') toast('ดาวน์โหลดรูปแล้ว');
  });
  // เมนู "อื่น ๆ": ใบใหม่ / ทำซ้ำ / ลบ
  $('#more').onclick = () => {
    dialog(`<h3 style="margin:0">${D.id ? 'ใบเลขที่ ' + esc(D.book) + '/' + esc(D.no) : 'ใบที่ยังไม่บันทึก'}</h3><div class="stackgap">
      <button type="button" id="dNew">เริ่มใบใหม่ (ล้างฟอร์ม)</button>
      ${D.payeeName ? '<button type="button" id="dDup">ทำซ้ำเป็นใบใหม่ (ผู้ถูกหักเดิม)</button>' : ''}
      ${D.id && canEdit(D) ? '<button type="button" class="danger" id="dDel">ลบใบนี้</button>' : ''}
      <button type="button" class="ghost" data-close>ปิด</button></div>`);
    $('#dNew').onclick = () => { closeDlg(); D = blank(); fillForm(); window.scrollTo({ top: 0 }); };
    const dup = $('#dDup'); if (dup) dup.onclick = () => { closeDlg(); duplicate(); };
    const del = $('#dDel'); if (del) del.onclick = async () => {
      closeDlg(); if (!await ask(`ลบใบเลขที่ ${D.book}/${D.no} ?`, 'ลบ')) return;
      try { await API.call('deleteCert', { id: D.id }); S.certs = S.certs.filter(x => x.id !== D.id); saveCache(); D = blank(); fillForm(); renderList(); toast('ลบแล้ว'); go('list'); }
      catch (e) { toast(e.message); }
    };
  };
  function duplicate() {
    const src = D; D = blank();
    Object.assign(D, { payeeId: src.payeeId || null, payeeType: src.payeeType, payeeName: src.payeeName, payeeTaxId: src.payeeTaxId, payeeBranch: src.payeeBranch, payeeAddress: src.payeeAddress, form: src.form, payer: src.payer, payerOther: src.payerOther });
    D.items = src.items.map(it => Object.assign({}, it, { id: uid(), amount: '', date: todayISO() }));
    fillForm(); toast('คัดลอกข้อมูลแล้ว ใส่ยอดเงินใหม่ได้เลย');
  }

  /* ================= companies (admin) ================= */
  function coBlank() { return { id: null, name: '', taxId: '', branch: '', address: '', signer: '', signerTitle: '', sig: undefined, stamp: undefined }; }
  function renderCompanies() {
    $('#coCards').innerHTML = S.companies.length ? S.companies.map(c => {
      const n = S.certs.filter(x => x.companyId === c.id).length;
      return `<div class="co${c.id === S.coId ? ' on' : ''}"><h3>${esc(c.name)}</h3>
      <p>เลขผู้เสียภาษี ${esc(c.taxId || '–')} · ${esc(c.branch || 'สำนักงานใหญ่')} · ${n} ใบ</p>
      <div class="badges"><span class="badge${c.sigFileId ? ' y' : ''}">${c.sigFileId ? '✓ ' : ''}ลายเซ็น</span><span class="badge${c.stampFileId ? ' y' : ''}">${c.stampFileId ? '✓ ' : ''}ตรายาง</span></div>
      <div class="row">${c.id === S.coId ? '<span class="hint">ใช้งานอยู่</span>' : `<button type="button" data-use="${esc(c.id)}">ใช้บริษัทนี้</button>`}<button type="button" class="ghost" data-edit="${esc(c.id)}">แก้ไข</button><button type="button" class="ghost danger" data-del="${esc(c.id)}">ลบ</button></div></div>`;
    }).join('') : '<div class="empty">ยังไม่มีบริษัท — กรอกฟอร์มเพื่อเพิ่มบริษัทแรก<br>เพิ่มได้หลายบริษัท แล้วสลับได้จากเมนูด้านบน</div>';
  }
  function coForm() {
    for (const el of $$('#coF [data-c]')) el.value = CD[el.dataset.c] || '';
    $('#coTitle').textContent = CD.id ? 'แก้ไขบริษัท' : 'เพิ่มบริษัท'; imgPrev();
  }
  function curImg(k) { if (CD[k] !== undefined) return CD[k]; const c = CD.id && co(CD.id); return c ? img(c[k + 'FileId']) : null; }
  function imgPrev() {
    const s = curImg('sig'), t = curImg('stamp');
    $('#sigPrev').innerHTML = s ? `<img src="${esc(s)}" alt="ลายเซ็น">` : 'ยังไม่มีลายเซ็น';
    $('#stPrev').innerHTML = t ? `<img src="${esc(t)}" alt="ตรายาง">` : 'ยังไม่มีตรายาง';
  }
  $('#coF').addEventListener('input', e => { const k = e.target.dataset.c; if (k) CD[k] = e.target.value; });
  $('#coCards').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.use) { $('#coSel').value = b.dataset.use; $('#coSel').dispatchEvent(new Event('change')); }
    else if (b.dataset.edit) { const c = co(b.dataset.edit); CD = Object.assign(coBlank(), c); coForm(); $('#coF').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (b.dataset.del) {
      const c = co(b.dataset.del); if (!await ask(`ลบบริษัท “${c.name}” ? เอกสารที่ออกไปแล้วยังเก็บไว้`, 'ลบบริษัท')) return;
      try {
        await API.call('deleteCompany', { id: c.id }); S.companies = S.companies.filter(x => x.id !== c.id);
        if (S.coId === c.id) S.coId = (S.companies[0] && S.companies[0].id) || '';
        saveCache(); renderCoSel(); renderCompanies(); renderList(); D = blank(); fillForm(); toast('ลบแล้ว');
      } catch (err) { toast(err.message); }
    }
  });
  $('#coNew').onclick = $('#coCancel').onclick = () => { CD = coBlank(); coForm(); $('#coF [data-c=name]').focus(); };
  $('#coF').addEventListener('submit', e => {
    e.preventDefault();
    busy($('#coSave'), 'กำลังบันทึก…', async () => {
      const payload = Object.assign({}, CD); if (payload.sig === undefined) delete payload.sig; if (payload.stamp === undefined) delete payload.stamp;
      const rec = await API.call('saveCompany', { company: payload }, { timeout: 90000 });
      if (CD.sig && rec.sigFileId) { S.imgs[rec.sigFileId] = CD.sig; LS.set('img_' + rec.sigFileId, CD.sig); }
      if (CD.stamp && rec.stampFileId) { S.imgs[rec.stampFileId] = CD.stamp; LS.set('img_' + rec.stampFileId, CD.stamp); }
      const isNew = !CD.id;
      S.companies = S.companies.filter(x => x.id !== rec.id).concat(rec).sort((a, b) => a.name.localeCompare(b.name, 'th'));
      if (isNew || !S.coId) { S.coId = rec.id; LS.set('lastCo', rec.id); }
      CD = Object.assign(coBlank(), rec); saveCache();
      renderCoSel(); renderCompanies(); coForm(); renderList(); if (!D.id) { D.companyId = S.coId; } fillForm();
      toast('บันทึกบริษัทแล้ว');
    });
  });

  /* รูป: ย่อขนาด ลบพื้นขาว และตัดขอบ */
  const loadImg = src => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  function trim(cv) {
    const ctx = cv.getContext('2d'), { width: w, height: h } = cv, d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const p = 6, o = document.createElement('canvas'); o.width = x1 - x0 + 1 + p * 2; o.height = y1 - y0 + 1 + p * 2;
    o.getContext('2d').drawImage(cv, x0 - p, y0 - p, o.width, o.height, 0, 0, o.width, o.height); return o;
  }
  async function processImg(src, maxW) {
    const im = await loadImg(src); let w = maxW, out = '';
    for (let k = 0; k < 4; k++) {
      const s = Math.min(1, w / im.width, w / im.height), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.width * s)); cv.height = Math.max(1, Math.round(im.height * s));
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, cv.width, cv.height);
      const id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const m = Math.min(d[i], d[i + 1], d[i + 2]); if (m > 232) d[i + 3] = 0; else if (m > 200) d[i + 3] = Math.round(d[i + 3] * (232 - m) / 32); }
      ctx.putImageData(id, 0, 0); out = (trim(cv) || cv).toDataURL('image/png');
      if (out.length < 150000) break; w = Math.round(w * 0.72);
    }
    return out;
  }
  const readFile = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(f); });
  $('#sigFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { CD.sig = await processImg(await readFile(f), 520); imgPrev(); toast('ใส่ลายเซ็นแล้ว กด “บันทึกบริษัท”'); } catch (x) { toast('อ่านรูปไม่ได้'); } };
  $('#stFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { CD.stamp = await processImg(await readFile(f), 420); imgPrev(); toast('ใส่ตรายางแล้ว กด “บันทึกบริษัท”'); } catch (x) { toast('อ่านรูปไม่ได้'); } };
  $('#sigRm').onclick = () => { CD.sig = null; imgPrev(); };
  $('#stRm').onclick = () => { CD.stamp = null; imgPrev(); };
  const pad = $('#pad'), pctx = pad.getContext('2d'); let drawing = false, lastPt = null, inked = false;
  const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  const clearPad = () => { pctx.clearRect(0, 0, pad.width, pad.height); inked = false; };
  pad.addEventListener('pointerdown', e => { drawing = true; lastPt = pos(e); pad.setPointerCapture(e.pointerId); pctx.beginPath(); pctx.arc(lastPt[0], lastPt[1], 2.5, 0, 7); pctx.fillStyle = '#0b2a8a'; pctx.fill(); inked = true; });
  pad.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); pctx.strokeStyle = '#0b2a8a'; pctx.lineWidth = 5; pctx.lineCap = pctx.lineJoin = 'round'; pctx.beginPath(); pctx.moveTo(lastPt[0], lastPt[1]); pctx.lineTo(p[0], p[1]); pctx.stroke(); lastPt = p; });
  ['pointerup', 'pointercancel'].forEach(t => pad.addEventListener(t, () => { drawing = false; }));
  $('#sigDraw').onclick = () => { $('#padWrap').hidden = false; clearPad(); };
  $('#padClr').onclick = clearPad; $('#padX').onclick = () => { $('#padWrap').hidden = true; };
  $('#padOk').onclick = async () => { if (!inked) return toast('วาดลายเซ็นก่อน'); const t = trim(pad); if (!t) return; CD.sig = await processImg(t.toDataURL('image/png'), 520); $('#padWrap').hidden = true; imgPrev(); toast('ใส่ลายเซ็นแล้ว กด “บันทึกบริษัท”'); };

  /* ================= รายชื่อผู้ถูกหักภาษี / ดาว / กลุ่ม ================= */
  const isFav = id => (S.user.favs || []).includes(id);
  const favPayees = () => (S.user.favs || []).map(id => S.payees.find(p => p.id === id)).filter(Boolean);
  const tagById = id => S.tags.find(t => t.id === id);
  const tagChip = id => { const t = tagById(id); return t ? `<span class="tg"><i class="dot" style="background:${esc(t.color)}"></i>${esc(t.name)}</span>` : ''; };
  function payeeOfCert(c) {
    return (c.payeeId && S.payees.find(p => p.id === c.payeeId)) || S.payees.find(p => p.name === c.payeeName) || null;
  }
  function renderTagBar(sel, cur, withFav) {
    const used = new Set(); S.payees.forEach(p => (p.tags || []).forEach(t => used.add(t)));
    const tags = withFav ? S.tags : S.tags.filter(t => used.has(t.id));
    const el = $(sel);
    if (!withFav && !tags.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (withFav ? `<button type="button" data-t="fav" class="${cur === 'fav' ? 'on' : ''}">★ โปรด</button><button type="button" data-t="all" class="${cur === 'all' ? 'on' : ''}">ทั้งหมด</button>`
      : `<button type="button" data-t="" class="${!cur ? 'on' : ''}">ทุกกลุ่ม</button>`) +
      tags.map(t => `<button type="button" data-t="${esc(t.id)}" class="${cur === t.id ? 'on' : ''}"><i class="dot" style="background:${esc(t.color)}"></i> ${esc(t.name)}</button>`).join('') +
      (withFav ? '<button type="button" class="ghost" data-t="manage">⚙ จัดการกลุ่ม</button>' : '');
  }
  function payeeMatches(p, q, f) {
    if (f === 'fav' && !isFav(p.id)) return false;
    if (f && f !== 'fav' && f !== 'all' && !(p.tags || []).includes(f)) return false;
    return !q || [p.name, p.taxId].join(' ').toLowerCase().includes(q);
  }
  function sortPayees(a, b) { return (isFav(b.id) - isFav(a.id)) || String(b.lastUsed || '').localeCompare(String(a.lastUsed || '')) || a.name.localeCompare(b.name, 'th'); }
  function renderPayees() {
    if (S.pFilter == null || (S.pFilter === 'fav' && !favPayees().length)) S.pFilter = favPayees().length ? 'fav' : 'all';
    renderTagBar('#pTags', S.pFilter, true);
    const q = $('#pq').value.trim().toLowerCase();
    const rows = S.payees.filter(p => payeeMatches(p, q, S.pFilter)).sort(sortPayees);
    $('#pCards').innerHTML = rows.length ? rows.map(p => {
      const d = p.defItem || {};
      return `<div class="pc"><button type="button" class="star${isFav(p.id) ? ' on' : ''}" data-star="${esc(p.id)}" aria-label="${isFav(p.id) ? 'เอาออกจากรายการโปรด' : 'ตั้งเป็นรายการโปรด'}">${isFav(p.id) ? '★' : '☆'}</button>
        <div class="pb"><b>${esc(p.name)}</b><small>${p.type === 'p' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}${p.taxId ? ' · ' + esc(p.taxId) : ''}</small>
        ${(p.tags || []).length || filesOf('payee', p.id).length ? `<span class="tagrow">${p.tags.map(tagChip).join('')}${filesOf('payee', p.id).some(f => f.kind === 'idcard') ? '<span class="tg">🪪 มีรูปบัตร</span>' : ''}</span>` : ''}
        ${d.desc || d.rate ? `<small>รายการประจำ: ${esc(d.desc || '')} ${d.rate ? esc(d.rate) + '%' : ''}</small>` : ''}</div>
        <div class="pa"><button type="button" class="pri" data-use="${esc(p.id)}">ออกใบ</button><button type="button" class="ghost" data-pedit="${esc(p.id)}">แก้ไข</button></div></div>`;
    }).join('') : `<div class="empty">${S.pFilter === 'fav' ? 'ยังไม่มีรายการโปรด — กด ☆ ที่รายชื่อเพื่อเพิ่ม' : S.payees.length ? 'ไม่พบรายชื่อที่ตรงกับตัวกรอง' : 'ยังไม่มีรายชื่อ — กด “+ เพิ่มรายชื่อ” หรือออกใบแล้วระบบจะเก็บรายชื่อให้เอง'}</div>`;
    payeeList();
  }
  $('#pq').addEventListener('input', renderPayees);
  $('#pTags').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'manage') return tagManager();
    S.pFilter = b.dataset.t; renderPayees();
  });
  $('#pNew').onclick = () => payeeForm(null);
  $('#pCards').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.star) toggleFav(b.dataset.star);
    else if (b.dataset.use) { const p = S.payees.find(x => x.id === b.dataset.use); D = blank(); applyPayee(p); go('edit'); }
    else if (b.dataset.pedit) payeeForm(S.payees.find(x => x.id === b.dataset.pedit));
  });
  async function toggleFav(id) {
    const on = !isFav(id), before = S.user.favs.slice();
    S.user.favs = on ? [id].concat(before.filter(x => x !== id)) : before.filter(x => x !== id);
    renderPayees(); renderFavStrip();
    try { S.user.favs = await API.call('setFavorite', { payeeId: id, on }); saveCache(); toast(on ? '★ เพิ่มในรายการโปรดแล้ว' : 'เอาออกจากรายการโปรดแล้ว'); }
    catch (e) { S.user.favs = before; renderPayees(); renderFavStrip(); toast(e.message); }
  }
  /** ใส่ข้อมูลผู้ถูกหักลงใบ + รายการประจำ (ถ้ามี) */
  function applyPayee(p) {
    if (!p) return;
    Object.assign(D, { payeeId: p.id, payeeType: p.type, payeeName: p.name, payeeTaxId: p.taxId, payeeBranch: p.branch, payeeAddress: p.address,
      form: p.form !== '' && p.form != null ? +p.form : (p.type === 'p' ? 3 : 6) });
    const d = p.defItem || {};
    const blankItems = D.items.every(it => !C.amt(it));
    if ((d.desc || d.rate) && blankItems) D.items = [{ id: uid(), cat: d.cat || 'c5', desc: d.desc || '', date: todayISO(), amount: '', rate: d.rate || 3 }];
    fillForm();
  }
  function openPicker() {
    let f = favPayees().length ? 'fav' : 'all';
    dialog(`<h3 style="margin:0">เลือกผู้ถูกหักภาษี</h3><input type="search" id="pkQ" placeholder="ค้นหาชื่อหรือเลขผู้เสียภาษี"><div class="chips tagbar" id="pkTags" style="margin:0"></div><div class="pick" id="pkList"></div><div class="row"><button type="button" class="ghost" data-close>ปิด</button></div>`);
    const draw = () => {
      renderTagBar('#pkTags', f, true); const m = $('#pkTags [data-t=manage]'); if (m) m.remove();
      const q = $('#pkQ').value.trim().toLowerCase();
      const rows = S.payees.filter(p => payeeMatches(p, q, f)).sort(sortPayees).slice(0, 100);
      $('#pkList').innerHTML = rows.map(p => `<button type="button" data-pk="${esc(p.id)}"><span>${isFav(p.id) ? '<span style="color:#f2a900">★</span> ' : ''}<b>${esc(p.name)}</b></span><small>${esc(p.taxId || '')} ${(p.tags || []).map(id => (tagById(id) || {}).name).filter(Boolean).map(esc).join(' · ')}</small></button>`).join('') || '<p class="hint">ไม่พบรายชื่อ</p>';
    };
    draw();
    $('#pkQ').oninput = draw;
    $('#pkTags').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { f = b.dataset.t; draw(); } };
    $('#pkList').onclick = e => { const b = e.target.closest('[data-pk]'); if (!b) return; closeDlg(); applyPayee(S.payees.find(x => x.id === b.dataset.pk)); };
  }
  function payeeForm(p) {
    const P = p ? Object.assign({ tags: [], defItem: {} }, clone(p)) : { id: null, type: 'j', name: '', taxId: '', branch: '', address: '', tags: S.pFilter && !['fav', 'all'].includes(S.pFilter) ? [S.pFilter] : [], defItem: {}, form: '' };
    const d = P.defItem || {};
    const canDel = p && p.id && (isAdmin() || p.createdBy === S.user.id);
    dialog(`<h3 style="margin:0">${p && p.id ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อผู้ถูกหักภาษี'}</h3>
      <form id="pf" class="stackgap" autocomplete="off">
        <div class="seg" id="pfType"><button type="button" data-v="j">นิติบุคคล</button><button type="button" data-v="p">บุคคลธรรมดา</button></div>
        <label>ชื่อ<input id="pfName" required value="${esc(P.name)}"></label>
        <div class="g2"><label>เลขผู้เสียภาษี (13 หลัก)<input id="pfTax" inputmode="numeric" maxlength="13" value="${esc(P.taxId)}"></label><label>สาขา<input id="pfBranch" value="${esc(P.branch)}" placeholder="สำนักงานใหญ่"></label></div>
        <label>ที่อยู่<textarea id="pfAddr" rows="2">${esc(P.address)}</textarea></label>
        <div class="idbox" id="pfFiles"></div>
        <div><span class="hint">กลุ่ม / tag</span><div class="chips" id="pfTags" style="margin-top:6px"></div>
          <div class="row" style="margin-top:8px"><input id="pfNewTag" placeholder="สร้างกลุ่มใหม่ เช่น ช่างภาพ" style="flex:1"><button type="button" id="pfAddTag">+ สร้าง</button></div></div>
        <details${d.desc || d.rate ? ' open' : ''}><summary>รายการประจำ (เติมให้อัตโนมัติตอนออกใบ)</summary>
          <div class="stackgap"><select id="pfCat">${C.CATS.map(c => `<option value="${c.k}"${(d.cat || 'c5') === c.k ? ' selected' : ''}>${esc(c.s)}</option>`).join('')}</select>
          <div class="g2"><label>รายละเอียด<input id="pfDesc" value="${esc(d.desc || '')}" placeholder="เช่น ค่าบริการถ่ายภาพ"></label>
          <label>อัตราหัก<select id="pfRate"><option value="">—</option>${C.RATES.map(r => `<option value="${r}"${+d.rate === r ? ' selected' : ''}>${r}%</option>`).join('')}</select></label></div></div>
        </details>
        <p class="err" id="pfErr" hidden></p>
        <div class="row">${canDel ? '<button type="button" class="ghost danger" id="pfDel" style="margin-right:auto">ลบ</button>' : ''}<button type="button" class="ghost" data-close>ยกเลิก</button><button type="submit" class="pri" id="pfSave">บันทึก</button></div>
      </form>`);
    P._pending = P._pending || [];
    const drawFiles = () => {
      const kind = P.type === 'p' ? 'idcard' : 'other';
      const saved = P.id ? filesOf('payee', P.id) : [];
      $('#pfFiles').innerHTML = `<span class="hint">${P.type === 'p' ? 'รูปบัตรประชาชน' : 'เอกสารประกอบ (เช่น หนังสือรับรองบริษัท, ภ.พ.20)'}</span>` +
        saved.map(f => attRow(f)).join('') + P._pending.map((f, i) => attRow(f, i)).join('') +
        `<label class="btn">${P.type === 'p' ? '🪪 ถ่าย/เลือกรูปบัตรประชาชน' : '📎 แนบเอกสาร'}<input type="file" accept="${kind === 'idcard' ? 'image/*' : 'image/*,application/pdf'}" id="pfFileIn" hidden></label>`;
      $('#pfFileIn').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return;
        busy($('#pfSave'), 'กำลังเตรียมไฟล์…', async () => {
          const item = await prepFile(file, kind);
          if (P.id) { await uploadNow('payee', P.id, item); toast('แนบไฟล์แล้ว'); renderPayees(); } else { P._pending.push(item); toast('จะอัปโหลดเมื่อกดบันทึก'); }
          drawFiles();
        }); };
      $('#pfFiles').onclick = e => attClick(e, () => drawFiles(), P._pending, true);
    };
    const drawType = () => { $$('#pfType button').forEach(b => b.classList.toggle('on', b.dataset.v === P.type)); drawFiles(); };
    const drawTags = () => { $('#pfTags').innerHTML = S.tags.map(t => `<button type="button" data-tg="${esc(t.id)}" class="${P.tags.includes(t.id) ? 'on' : ''}"><i class="dot" style="background:${esc(t.color)}"></i> ${esc(t.name)}</button>`).join('') || '<span class="hint">ยังไม่มีกลุ่ม — สร้างได้ด้านล่าง</span>'; };
    drawType(); drawTags();
    $('#pfType').onclick = e => { const b = e.target.closest('button'); if (b) { P.type = b.dataset.v; drawType(); } };
    $('#pfTags').onclick = e => { const b = e.target.closest('[data-tg]'); if (!b) return; const id = b.dataset.tg; P.tags = P.tags.includes(id) ? P.tags.filter(x => x !== id) : P.tags.concat(id); drawTags(); };
    $('#pfAddTag').onclick = () => busy($('#pfAddTag'), '…', async () => {
      const name = $('#pfNewTag').value.trim(); if (!name) return;
      const t = await API.call('saveTag', { tag: { name } }); S.tags.push(t); P.tags.push(t.id); $('#pfNewTag').value = ''; drawTags(); saveCache();
    });
    $('#pfNewTag').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#pfAddTag').click(); } };
    if (canDel) $('#pfDel').onclick = async () => {
      if (!await ask(`ลบรายชื่อ “${p.name}” ? (ใบที่ออกไปแล้วยังอยู่)`, 'ลบ')) return payeeForm(p);
      try { await API.call('deletePayee', { id: p.id }); S.payees = S.payees.filter(x => x.id !== p.id); saveCache(); renderPayees(); renderFavStrip(); toast('ลบแล้ว'); } catch (err) { toast(err.message); }
    };
    $('#pf').onsubmit = e => {
      e.preventDefault();
      busy($('#pfSave'), 'กำลังบันทึก…', async () => {
        Object.assign(P, { name: $('#pfName').value, taxId: $('#pfTax').value, branch: $('#pfBranch').value, address: $('#pfAddr').value,
          defItem: { cat: $('#pfCat').value, desc: $('#pfDesc').value, rate: $('#pfRate').value } });
        try {
          const payload = Object.assign({}, P); delete payload._pending;
          const rec = await API.call('savePayee', { payee: payload });
          S.payees = S.payees.filter(x => x.id !== rec.id).concat(rec); P.id = rec.id;
          const pend = P._pending.splice(0); let failed = 0;
          for (const f of pend) { try { await uploadNow('payee', rec.id, f); } catch (x) { failed++; P._pending.push(f); } }
          saveCache(); renderPayees(); renderFavStrip(); renderList(); fillForm();
          if (failed) { drawFiles(); return showErr($('#pfErr'), `บันทึกรายชื่อแล้ว แต่อัปโหลดไฟล์ไม่สำเร็จ ${failed} ไฟล์ — กดบันทึกอีกครั้ง`); }
          closeDlg(); toast('บันทึกรายชื่อแล้ว' + (pend.length ? ` · แนบ ${pend.length} ไฟล์` : ''));
        } catch (err) { showErr($('#pfErr'), err.message); }
      });
    };
  }
  function tagManager() {
    const COLORS = ['#c4161c', '#d9480f', '#e67700', '#2b8a3e', '#0b7285', '#1c64d1', '#6741d9', '#a61e4d', '#495057'];
    let color = COLORS[S.tags.length % COLORS.length];
    dialog(`<h3 style="margin:0">จัดการกลุ่ม / tag</h3><div id="tmList"></div>
      <div class="stackgap"><input id="tmName" placeholder="ชื่อกลุ่มใหม่ เช่น ช่างภาพ, ซื้อสินค้า"><div class="swatches" id="tmSw"></div>
      <button type="button" class="pri" id="tmAdd">+ สร้างกลุ่ม</button></div>
      <p class="hint">${isAdmin() ? 'ลบกลุ่มแล้ว รายชื่อในกลุ่มยังอยู่ แค่ไม่มี tag นั้น' : 'สร้างกลุ่มได้ทุกคน · เปลี่ยนชื่อ/ลบได้เฉพาะผู้ดูแลระบบ'}</p>
      <div class="row"><button type="button" class="ghost" data-close>ปิด</button></div>`);
    const draw = () => {
      $('#tmList').innerHTML = S.tags.map(t => `<div class="tagedit"><i class="dot" style="background:${esc(t.color)};width:12px;height:12px"></i><b>${esc(t.name)}</b><small class="hint">${S.payees.filter(p => (p.tags || []).includes(t.id)).length} รายชื่อ</small>${isAdmin() ? `<button type="button" class="ghost" data-ren="${esc(t.id)}">เปลี่ยนชื่อ</button><button type="button" class="ghost danger" data-rm="${esc(t.id)}">ลบ</button>` : ''}</div>`).join('') || '<p class="hint">ยังไม่มีกลุ่ม</p>';
      $('#tmSw').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" class="${c === color ? 'on' : ''}" style="background:${c}" aria-label="สี ${c}"></button>`).join('');
    };
    draw();
    $('#tmSw').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { color = b.dataset.c; draw(); } };
    $('#tmAdd').onclick = () => busy($('#tmAdd'), 'กำลังสร้าง…', async () => {
      const name = $('#tmName').value.trim(); if (!name) throw new Error('ใส่ชื่อกลุ่ม');
      const t = await API.call('saveTag', { tag: { name, color } }); S.tags.push(t); $('#tmName').value = ''; color = COLORS[S.tags.length % COLORS.length]; saveCache(); draw(); renderPayees();
    });
    $('#tmList').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ren) {
        const t = tagById(b.dataset.ren); const row = b.closest('.tagedit');
        row.innerHTML = `<input value="${esc(t.name)}" style="flex:1"><button type="button" class="pri">บันทึก</button>`;
        const inp = row.querySelector('input'); inp.focus();
        row.querySelector('button').onclick = () => busy(row.querySelector('button'), '…', async () => {
          const r = await API.call('saveTag', { tag: { id: t.id, name: inp.value, color: t.color } }); Object.assign(t, r); saveCache(); draw(); renderPayees(); renderList();
        });
      } else if (b.dataset.rm) {
        const t = tagById(b.dataset.rm);
        b.textContent = 'ยืนยันลบ?'; if (!b.dataset.armed) { b.dataset.armed = '1'; return; }
        await busy(b, '…', async () => {
          await API.call('deleteTag', { id: t.id }); S.tags = S.tags.filter(x => x.id !== t.id);
          S.payees.forEach(p => { p.tags = (p.tags || []).filter(x => x !== t.id); });
          if (S.pFilter === t.id) S.pFilter = 'all'; if (S.lTag === t.id) S.lTag = '';
          saveCache(); draw(); renderPayees(); renderList();
        });
      }
    };
  }

  /* ================= ไฟล์แนบ ================= */
  const KIND_LABEL = { idcard: 'บัตรประชาชน', invoice: 'Invoice', other: 'เอกสาร' };
  const filesOf = (type, id) => id ? S.files.filter(f => f.ownerType === type && f.ownerId === id) : [];
  const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  /** รูปย่อเหลือด้านยาว 1800px (JPEG) / PDF ใช้ไฟล์เดิม */
  async function prepFile(file, kind) {
    if (file.type === 'application/pdf') {
      if (file.size > 8e6) throw new Error('PDF ใหญ่เกิน 8 MB');
      const dataUrl = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(file); });
      return { kind, name: file.name, mime: 'application/pdf', dataUrl, size: file.size };
    }
    const img = await Scan.prepImage(file, 1800);
    return { kind, name: (file.name || KIND_LABEL[kind]).replace(/\.(heic|heif|png|webp)$/i, '.jpg'), mime: 'image/jpeg', dataUrl: img.dataUrl, size: Math.round(img.dataUrl.length * 0.75) };
  }
  async function uploadNow(ownerType, ownerId, item) {
    const meta = await API.call('uploadFile', { ownerType, ownerId, kind: item.kind, name: item.name, dataUrl: item.dataUrl }, { timeout: 120000 });
    S.files.push(meta); S.fileCache[meta.id] = item.dataUrl; saveCache(); return meta;
  }
  /** pi = index ของไฟล์ที่ยังไม่อัปโหลด (pending) */
  function attRow(f, pi) {
    const pend = pi !== undefined, src = pend ? f.dataUrl : S.fileCache[f.id];
    const icon = f.mime === 'application/pdf' ? 'PDF' : src ? `<img src="${esc(src)}" alt="">` : 'IMG';
    const canDel = pend || isAdmin() || f.createdBy === S.user.id;
    return `<div class="att${pend ? ' pend' : ''}"><span class="fi">${icon}</span><span class="fn"><b>${esc(KIND_LABEL[f.kind] || 'ไฟล์')} · ${esc(f.name)}</b><small>${pend ? 'รออัปโหลดเมื่อกดบันทึก' : esc(new Date(f.createdAt).toLocaleDateString('th-TH')) + ' · ' + esc(f.createdByName || '')} · ${fsize(f.size)}</small></span>
      <button type="button" class="ghost" ${pend ? `data-pview="${pi}"` : `data-fview="${esc(f.id)}"`}>ดู</button>${canDel ? `<button type="button" class="ghost danger" ${pend ? `data-pdel="${pi}"` : `data-fdel="${esc(f.id)}"`}>ลบ</button>` : ''}</div>`;
  }
  async function attClick(e, redraw, pendList, inForm) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pview) return viewFile(pendList[+b.dataset.pview], true, null, inForm);
    if (b.dataset.pdel) { pendList.splice(+b.dataset.pdel, 1); return redraw(); }
    if (b.dataset.fview) return viewFile(S.files.find(f => f.id === b.dataset.fview), false, redraw, inForm);
    if (b.dataset.fdel) {
      const f = S.files.find(x => x.id === b.dataset.fdel);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'ยืนยันลบ?'; return; }
      await busy(b, '…', async () => { await API.call('deleteFile', { fileId: f.id }); S.files = S.files.filter(x => x.id !== f.id); saveCache(); redraw(); renderPayees(); renderList(); toast('ลบไฟล์แล้ว'); });
    }
  }
  async function viewFile(f, pending, back, inForm) {
    if (!f) return;
    let url = pending ? f.dataUrl : S.fileCache[f.id];
    if (!url) {
      toast('กำลังโหลดไฟล์…');
      try { const r = await API.call('file', { fileId: f.id }, { timeout: 90000 }); url = S.fileCache[f.id] = r.dataUrl; }
      catch (e) { return toast(e.message); }
      if (back) back();
    }
    const blob = await (await fetch(url)).blob();
    if (f.mime === 'application/pdf') {
      const bu = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = bu; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(bu), 60000); return;
    }
    if (inForm) { // อยู่ในฟอร์มรายชื่อ — เปิดรูปในแท็บใหม่ จะได้ไม่ปิดฟอร์ม
      const bu = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = bu; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(bu), 60000); return;
    }
    dialog(`<h3 style="margin:0">${esc(KIND_LABEL[f.kind] || 'ไฟล์')}</h3><div class="viewer"><img src="${esc(url)}" alt="${esc(f.name)}"></div>
      <div class="row"><button type="button" id="fvShare">บันทึก/แชร์</button><button type="button" class="pri" data-close>ปิด</button></div>`);
    $('#fvShare').onclick = () => C.deliver(blob, f.name.replace(/[^\w.\-ก-๙ ]/g, '') || 'file.jpg');
  }
  function addCertFile(item) {
    if (D.id && canEdit(D)) {
      uploadNow('cert', D.id, item).then(() => { renderAttach(); renderList(); toast('แนบไฟล์แล้ว'); }).catch(e => { toast(e.message); });
    } else { D._pending = D._pending || []; D._pending.push(item); toast('แนบแล้ว — จะอัปโหลดเมื่อกดบันทึก'); }
    renderAttach();
  }
  function renderAttach() {
    if (!D) return;
    D._pending = D._pending || [];
    const saved = filesOf('cert', D.id);
    $('#attList').innerHTML = saved.map(f => attRow(f)).join('') + D._pending.map((f, i) => attRow(f, i)).join('') || '<p class="hint">ยังไม่มีไฟล์แนบ</p>';
    const p = D.payeeId && S.payees.find(x => x.id === D.payeeId);
    const ids = p ? filesOf('payee', p.id).filter(f => f.kind === 'idcard') : [];
    $('#idNote').innerHTML = D.payeeType === 'p' ? (ids.length ? `🪪 มีรูปบัตรประชาชนของ ${esc(p.name)} ในรายชื่อแล้ว <button type="button" class="link" data-fview="${esc(ids[0].id)}">ดูรูปบัตร</button>`
      : p ? `ยังไม่มีรูปบัตรประชาชนของ ${esc(p.name)} — <button type="button" class="link" id="addIdCard">เพิ่มในรายชื่อ</button>` : 'บุคคลธรรมดา: บันทึกใบแล้วเพิ่มรูปบัตรประชาชนได้ที่แท็บรายชื่อ') : '';
    const add = $('#addIdCard'); if (add) add.onclick = () => payeeForm(p);
  }
  $('#attList').addEventListener('click', e => attClick(e, renderAttach, D._pending));
  $('#idNote').addEventListener('click', e => { const b = e.target.closest('[data-fview]'); if (b) viewFile(S.files.find(f => f.id === b.dataset.fview)); });
  $('#attIn').onchange = e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (D.id && !canEdit(D)) return toast('แนบไฟล์ได้เฉพาะใบที่คุณออกเอง');
    prepFile(file, 'invoice').then(addCertFile).catch(err => toast(err.message));
  };

  /* ================= สแกนรูป (OCR) ================= */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} ta.remove(); }
    toast('คัดลอกแล้ว');
  }
  const KIND = { base: 'ยอดก่อน VAT', total: 'ยอดรวม', vat: 'ภาษีมูลค่าเพิ่ม', wht: 'หัก ณ ที่จ่าย', other: '' };
  async function startScan(file, mode) {
    if (!file) return;
    dialog(`<h3 style="margin:0">กำลังอ่านข้อความจากรูป…</h3><div class="prog"><i id="scBar"></i></div><p class="hint" id="scMsg">กำลังเตรียมรูป</p>`);
    try {
      const img = await Scan.prepImage(file);
      const r = await Scan.readText(img, (msg, p) => { const m = $('#scMsg'), b = $('#scBar'); if (m) m.textContent = msg + (p ? ' ' + Math.round(p * 100) + '%' : ''); if (b) b.style.width = Math.round((p || 0) * 100) + '%'; });
      const res = Scan.parse(r.text, S.companies.map(c => ({ name: c.name, taxId: c.taxId })));
      showScan(res, img, r.engine, mode);
    } catch (e) {
      if (e.code === 'auth') return;
      dialog(`<h3 style="margin:0">อ่านรูปไม่สำเร็จ</h3><p class="err">${esc(e.message)}</p><div class="row"><button type="button" class="pri" data-close>ปิด</button></div>`);
    }
  }
  function showScan(r, img, engine, mode) {
    const firstNonOwn = arr => { const i = arr.findIndex(x => !x.own); return i < 0 ? (arr.length ? 0 : -1) : i; };
    const F = {
      name: { label: 'ชื่อผู้ถูกหักภาษี', items: r.names.map(x => ({ v: x.value, note: x.own ? 'บริษัทของเรา' : '' })), sel: firstNonOwn(r.names) },
      taxId: { label: 'เลขผู้เสียภาษี', items: r.taxIds.map(x => ({ v: x.value, note: x.own ? 'บริษัทของเรา' : x.valid ? 'ตรวจเลขแล้วถูกต้อง' : 'เลขอาจอ่านผิด ตรวจอีกครั้ง' })), sel: -1 },
      branch: { label: 'สาขา', items: r.branches.map(v => ({ v, note: '' })), sel: r.branches.length ? 0 : -1 },
      address: { label: 'ที่อยู่', items: r.addresses.map(x => ({ v: x.value, note: x.own ? 'อาจเป็นที่อยู่ของเรา' : '' })), sel: firstNonOwn(r.addresses) },
      amount: { label: 'ยอดเงิน', items: r.amounts.map(x => ({ v: x.value.toFixed(2), show: money(x.value), note: KIND[x.kind], kind: x.kind })), sel: r.amounts.length ? 0 : -1 },
      date: { label: 'วันที่จ่าย', items: r.dates.map(v => ({ v, show: dShort(v), note: '' })), sel: r.dates.length ? 0 : -1 }
    };
    const ti = r.taxIds.findIndex(x => !x.own && x.valid); F.taxId.sel = ti >= 0 ? ti : r.taxIds.findIndex(x => !x.own);
    const order = mode === 'payee' ? ['name', 'taxId', 'branch', 'address'] : ['name', 'taxId', 'branch', 'address', 'amount', 'date'];
    const found = order.filter(k => F[k].items.length);
    let vatOff = false;
    const draw = () => {
      const a = F.amount.items[F.amount.sel];
      $('#scFields').innerHTML = found.map(k => `<div class="sf"><div class="sfh">${F[k].label}${k === 'amount' && a && a.kind === 'total' && r.hasVat ? `<label class="chk" style="min-height:0;font-size:13px;color:var(--ink)"><input type="checkbox" id="scVat"${vatOff ? ' checked' : ''}> ถอด VAT 7%</label>` : ''}</div>
        ${F[k].items.map((it, i) => `<div class="sr${F[k].sel === i ? ' on' : ''}" data-f="${k}" data-i="${i}"><i class="ck"></i><span class="v">${esc(it.show || it.v)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span><button type="button" class="ghost" data-copy="${esc(it.v)}">คัดลอก</button></div>`).join('')}</div>`).join('')
        || '<p class="hint">ไม่พบข้อมูลที่แยกได้ — ดูข้อความทั้งหมดด้านล่างแล้วแตะคัดลอกได้</p>';
      const vc = $('#scVat'); if (vc) vc.onchange = e => { vatOff = e.target.checked; };
    };
    dialog(`<h3 style="margin:0">ผลการสแกน</h3>
      <div class="scanimg"><img src="${img.dataUrl}" alt="รูปที่สแกน"></div>
      <p class="hint">${engine === 'google' ? 'อ่านด้วย Google' : 'อ่านในเครื่อง (ความแม่นยำปานกลาง)'} · แตะเพื่อเลือก/ไม่เลือก · ตรวจข้อมูลก่อนใช้</p>
      <div class="stackgap" id="scFields"></div>
      <details${found.length ? '' : ' open'}><summary>ข้อความทั้งหมด (${r.lines.length} บรรทัด) — แตะบรรทัดเพื่อคัดลอก</summary>
        <div class="row" style="margin:6px 0"><button type="button" id="scCopyAll">คัดลอกทั้งหมด</button></div>
        <div class="lines" id="scLines">${r.lines.map(l => `<button type="button" data-copy="${esc(l)}">${esc(l)}</button>`).join('')}</div></details>
      <label class="chk"><input type="checkbox" id="scAttach" checked> ${mode === 'payee' ? 'แนบรูปนี้ไว้กับรายชื่อ (เช่น รูปบัตรประชาชน)' : 'แนบรูปนี้เป็น invoice ของใบนี้'}</label>
      <div class="row"><button type="button" class="ghost" data-close>ปิด</button><button type="button" class="pri" id="scUse">${mode === 'payee' ? 'สร้างรายชื่อจากข้อมูลนี้' : found.length ? 'ใส่ลงใบ' : 'แนบรูปลงใบ'}</button></div>`);
    if (F.amount.items[F.amount.sel] && F.amount.items[F.amount.sel].kind === 'total' && r.hasVat && !r.amounts.some(x => x.kind === 'base')) vatOff = true;
    draw();
    $('#dlg').onclick = e => {
      const c = e.target.closest('[data-copy]'); if (c) { e.stopPropagation(); copyText(c.dataset.copy); return; }
      const row = e.target.closest('.sr'); if (!row) return;
      const f = F[row.dataset.f], i = +row.dataset.i; f.sel = f.sel === i ? -1 : i;
      if (row.dataset.f === 'amount') { const it = f.items[f.sel]; vatOff = !!(it && it.kind === 'total' && r.hasVat && !r.amounts.some(x => x.kind === 'base')); }
      draw();
    };
    $('#scCopyAll').onclick = () => copyText(r.text);
    const pick = k => F[k].sel >= 0 ? F[k].items[F[k].sel].v : '';
    const use = $('#scUse'); if (!use) return;
    use.onclick = () => {
      const name = pick('name'), taxId = pick('taxId'), branch = pick('branch'), address = pick('address');
      const type = /^(นาย|นาง|นางสาว|น\.ส\.)/.test(name) ? 'p' : 'j';
      const existing = taxId && S.payees.find(p => p.taxId === taxId);
      const attach = $('#scAttach').checked;
      $('#dlg').onclick = null; closeDlg();
      const scanned = kind => ({ kind, name: (kind === 'idcard' ? 'บัตรประชาชน' : kind === 'invoice' ? 'invoice' : 'เอกสาร') + ' (สแกน).jpg', mime: 'image/jpeg', dataUrl: img.dataUrl, size: Math.round(img.dataUrl.length * 0.75) });
      if (mode === 'payee') {
        const ptype = existing ? existing.type : type, item = attach ? [scanned(ptype === 'p' ? 'idcard' : 'other')] : [];
        if (existing) { toast('มีรายชื่อนี้อยู่แล้ว'); return payeeForm(Object.assign(clone(existing), { _pending: item })); }
        return payeeForm({ type, name, taxId, branch: branch === 'สำนักงานใหญ่' ? '' : branch, address, tags: [], defItem: {}, _pending: item });
      }
      if (attach) addCertFile(scanned('invoice'));
      if (existing) applyPayee(existing);
      else Object.assign(D, { payeeId: null, payeeType: type, form: type === 'p' ? 3 : 6, payeeName: name || D.payeeName, payeeTaxId: taxId || D.payeeTaxId,
        payeeBranch: branch === 'สำนักงานใหญ่' ? '' : (branch || D.payeeBranch), payeeAddress: address || D.payeeAddress });
      const amt = pick('amount'), date = pick('date');
      if (amt || date) {
        let it = D.items.find(x => !C.amt(x)) || D.items[0];
        if (amt) it.amount = (vatOff ? r2(+amt / 1.07) : +amt).toFixed(2);
        if (date) it.date = date;
      }
      fillForm(); toast(existing ? 'พบในรายชื่อเดิม ใส่ข้อมูลให้แล้ว' : 'ใส่ข้อมูลจากรูปแล้ว ตรวจอีกครั้งก่อนบันทึก');
    };
  }
  $('#scanIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; startScan(f, 'cert'); };
  $('#scanP').onchange = e => { const f = e.target.files[0]; e.target.value = ''; startScan(f, 'payee'); };

  /* ================= settings ================= */
  function renderSettings() {
    const u = S.user; if (!u) return;
    $('#meLine').innerHTML = `<b>${esc(u.name)}</b> (${esc(u.username)}) · <span class="badge${u.role === 'admin' ? ' r' : ''}">${u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'}</span>`;
    $('#urlNow').textContent = API.url();
    sysInfo();
  }
  function sysInfo() { $('#verNow').textContent = CFG.VERSION; }
  async function loadSystem() {
    renderSettings();
    if (isAdmin()) { loadUsers(); loadTags(); }
  }
  $('#pwForm').addEventListener('submit', e => {
    e.preventDefault();
    busy(e.submitter || $('#pwForm .pri'), 'กำลังเปลี่ยน…', async () => {
      await API.call('changePassword', { oldPassword: $('#pwOld').value, newPassword: $('#pwNew').value });
      $('#pwOld').value = $('#pwNew').value = ''; toast('เปลี่ยนรหัสผ่านแล้ว');
    });
  });
  $('#logout').onclick = async () => {
    if (!await ask('ออกจากระบบ?', 'ออกจากระบบ')) return;
    try { await API.call('logout'); } catch (e) {}
    API.setToken(''); LS.del('cache'); S.user = null; toLogin();
  };
  $('#chgUrl').onclick = () => { $('#urlIn').value = API.url(); screen('scr-url'); };

  /* users */
  let UE = null;
  async function loadUsers() {
    try { S.users = await API.call('users'); } catch (e) { return; }
    $('#userList').innerHTML = S.users.map(u => `<button type="button" class="urow" data-u="${esc(u.id)}"><span><b>${esc(u.name)}</b><small>${esc(u.username)}${u.lastLogin ? ' · เข้าล่าสุด ' + esc(new Date(u.lastLogin).toLocaleDateString('th-TH')) : ''}</small></span>
      <span class="badges"><span class="badge${u.role === 'admin' ? ' r' : ''}">${u.role === 'admin' ? 'admin' : 'ผู้ใช้'}</span>${u.active ? '' : '<span class="badge">ปิดใช้งาน</span>'}</span></button>`).join('');
  }
  function uForm(u) {
    UE = u || null;
    $('#uTitle').textContent = u ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้';
    $('#uName').value = u ? u.name : ''; $('#uUser').value = u ? u.username : ''; $('#uUser').disabled = !!u;
    $('#uRole').value = u ? u.role : 'user'; $('#uPass').value = ''; $('#uActive').checked = u ? u.active : true;
    $('#uPass').required = !u; $('#uPassL').firstChild.textContent = u ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน';
    $('#uActL').hidden = !u;
  }
  $('#userList').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (!b) return; uForm(S.users.find(x => x.id === b.dataset.u)); $('#uForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#uClear').onclick = () => uForm(null);
  uForm(null);
  $('#uForm').addEventListener('submit', e => {
    e.preventDefault();
    busy(e.submitter || $('#uForm .pri'), 'กำลังบันทึก…', async () => {
      const user = { id: UE ? UE.id : null, name: $('#uName').value, username: $('#uUser').value, role: $('#uRole').value, password: $('#uPass').value, active: $('#uActive').checked };
      await API.call('saveUser', { user }); uForm(null); await loadUsers(); toast('บันทึกผู้ใช้แล้ว');
    });
  });

  /* backend version / rollback */
  let tagsLoaded = false;
  async function loadTags() {
    if (tagsLoaded) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${CFG.REPO}/tags?per_page=30`); if (!r.ok) return;
      const tags = await r.json(); tagsLoaded = true;
      $('#refSel').innerHTML = '<option value="main">main (ล่าสุด)</option>' + tags.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
    } catch (e) {}
    try { const s = await API.call('system'); if (s.loader) $('#refSel').value = s.loader.ref; $('#sysLinks').innerHTML = `<a href="${esc(s.sheetUrl)}" target="_blank" rel="noopener">เปิด Google Sheet</a> · <a href="${esc(s.folderUrl)}" target="_blank" rel="noopener">เปิดโฟลเดอร์ไฟล์</a>`; } catch (e) {}
  }
  $('#refSet').onclick = async () => {
    const ref = $('#refSel').value;
    if (!await ask(`เปลี่ยน backend ไปใช้เวอร์ชัน “${ref}” ?`, 'เปลี่ยน')) return;
    busy($('#refSet'), 'กำลังเปลี่ยน…', async () => { const info = await API.call('setCodeRef', { ref }); toast('ใช้ backend เวอร์ชัน ' + info.ref + ' แล้ว'); });
  };
  $('#logBox').addEventListener('toggle', async e => {
    if (!e.target.open) return;
    $('#logList').textContent = 'กำลังโหลด…';
    try {
      const rows = await API.call('log');
      $('#logList').innerHTML = rows.map(r => `<div><span>${esc(new Date(r.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }))}</span><span><b>${esc(r.username)}</b> ${esc(r.action)} ${esc(r.detail)}</span></div>`).join('') || 'ยังไม่มีบันทึก';
    } catch (err) { $('#logList').textContent = err.message; }
  });

  /* ================= version / update / PWA ================= */
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  async function latestVersion() {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? r.json() : null;
  }
  async function checkVersion() {
    try { const v = await latestVersion(); if (v && v.version !== CFG.VERSION) { $('#updV').textContent = v.version; $('#updBar').hidden = false; } } catch (e) {}
  }
  async function updateSystem(btn) {
    const msg = $('#updMsg');
    await busy(btn, 'กำลังอัปเดต…', async () => {
      msg.textContent = 'กำลังอัปเดต…';
      try { await API.refreshBackend(); } catch (e) {}
      if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update().catch(() => {}))); }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      toast('อัปเดตแล้ว กำลังโหลดใหม่…');
      setTimeout(() => location.reload(), 600);
    });
  }
  $('#updSys').onclick = () => updateSystem($('#updSys'));
  $('#updNow').onclick = () => updateSystem($('#updNow'));
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) $('#iosHelp').open = true;

  boot();
})();
