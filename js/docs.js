/* HugNa — เอกสารอื่น: ใบเบิกเงิน / ใบเสนอราคา-ใบแจ้งหนี้-ใบวางบิล-ใบเสร็จรับเงิน / หนังสือมอบอำนาจ
 * app.js เรียก DocsModule(ctx) ตอนเริ่ม แล้วใช้ฟังก์ชันที่คืนกลับไป */
window.DocsModule = function (X) {
  'use strict';
  const { S, $, $$, esc, toast, dialog, closeDlg, ask, busy, co, imgsFor, filesOf, uploadNow, prepFile, attRow, attClick,
    saveCache, isAdmin, go, C, uid, clone, todayISO, onChange } = X;
  const { money, num, r2, dShort, dLong } = C;

  const TYPES = {
    expense: { label: 'ใบเบิกเงิน', desc: 'พนักงานเบิกค่าใช้จ่ายจากบริษัท ถ่ายรูปใบเสร็จเป็นรายการได้', icon: '🧾' },
    bill: { label: 'ใบแจ้งหนี้ / ใบวางบิล / ใบเสร็จ', desc: 'ออกในนามบริษัทหรือบุคคลธรรมดา รวมถึงใบเสนอราคา', icon: '📄' },
    poa: { label: 'หนังสือมอบอำนาจ', desc: 'มอบอำนาจจากบริษัทหรือบุคคลธรรมดา', icon: '✍️' }
  };
  const SUB = {
    qt: { th: 'ใบเสนอราคา', en: 'QUOTATION', issuer: 'ผู้เสนอราคา', cust: 'ผู้อนุมัติสั่งซื้อ' },
    iv: { th: 'ใบแจ้งหนี้', en: 'INVOICE', issuer: 'ผู้ออกใบแจ้งหนี้', cust: 'ผู้รับเอกสาร' },
    bn: { th: 'ใบวางบิล', en: 'BILLING NOTE', issuer: 'ผู้วางบิล', cust: 'ผู้รับวางบิล' },
    re: { th: 'ใบเสร็จรับเงิน', en: 'RECEIPT', issuer: 'ผู้รับเงิน', cust: 'ผู้จ่ายเงิน' }
  };
  const STATUS = { pending: ['รออนุมัติ', 'st-pend'], approved: ['อนุมัติแล้ว', 'st-ok'], paid: ['จ่ายแล้ว', 'st-paid'], rejected: ['ไม่อนุมัติ', 'st-no'] };
  const MATTERS = ['ติดต่อกรมสรรพากร ยื่นแบบ ชำระภาษี และรับเอกสาร', 'ติดต่อธนาคารเพื่อทำธุรกรรม', 'ยื่นและรับเอกสารแทน', 'ติดต่อกรมพัฒนาธุรกิจการค้า', 'ติดต่อสำนักงานประกันสังคม', 'รับเช็คและเอกสารการเงินแทน'];
  const label = d => d.type === 'bill' ? (SUB[d.subtype] || SUB.iv).th : (TYPES[d.type] || {}).label || d.type;
  const statusBadge = d => d.type === 'expense' && STATUS[d.status] ? `<span class="badge ${STATUS[d.status][1]}">${STATUS[d.status][0]}</span>` : '';

  let D2 = null;
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setP = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}), o)[l] = v; };
  const canEdit = d => !d.id || isAdmin() || (d.createdBy === S.user.id && (d.type !== 'expense' || ['pending', 'rejected'].includes(d.status)));

  /* ---------- ตัวเลือกบุคคล/บริษัท ---------- */
  const persons = () => S.payees.filter(p => p.type === 'p').sort((a, b) => a.name.localeCompare(b.name, 'th'));
  function snapOf(ref) {
    if (!ref) return null;
    const [k, id] = ref.split(':');
    if (k === 'c') { const c = co(id); return c && { kind: 'company', id, name: c.name, taxId: c.taxId, branch: c.branch || 'สำนักงานใหญ่', address: c.address, signer: c.signer, signerTitle: c.signerTitle }; }
    const p = S.payees.find(x => x.id === id);
    return p && { kind: p.type === 'p' ? 'person' : 'payee', id, name: p.name, taxId: p.taxId, branch: p.type === 'p' ? '' : (p.branch || 'สำนักงานใหญ่'), address: p.address };
  }
  function refOptions(sel, opt) {
    const cs = S.companies.map(c => `<option value="c:${esc(c.id)}"${sel === 'c:' + c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const list = opt.personsOnly ? persons() : S.payees.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'));
    const ps = list.map(p => `<option value="p:${esc(p.id)}"${sel === 'p:' + p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    return `<option value="">— เลือก —</option>${opt.noCompany ? '' : `<optgroup label="บริษัทผู้หัก (บริษัทของเรา)">${cs}</optgroup>`}<optgroup label="${opt.personsOnly ? 'บุคคลธรรมดา (จากรายชื่อ)' : 'รายชื่อผู้ถูกหักภาษี'}">${ps}</optgroup>${opt.custom ? `<option value="custom"${sel === 'custom' ? ' selected' : ''}>✎ กรอกเอง</option>` : ''}`;
  }

  /* ---------- สร้างเอกสารใหม่ ---------- */
  function blank(type) {
    const d = { id: null, type, subtype: type === 'bill' ? 'iv' : '', companyId: S.coId, no: '', docDate: todayISO(), status: type === 'expense' ? 'pending' : 'active', data: {}, _pending: [] };
    const c = co(S.coId);
    if (type === 'expense') Object.assign(d.data, { requester: S.user.name, dept: '', items: [{ id: uid(), date: todayISO(), desc: '', ref: '', amount: '' }], payMethod: 'transfer', bank: '', accountNo: '', accountName: S.user.name, note: '', useSig: true });
    if (type === 'bill') Object.assign(d.data, { issuerRef: c ? 'c:' + c.id : '', issuerSnap: snapOf(c ? 'c:' + c.id : ''), custRef: '', customer: { name: '', taxId: '', branch: '', address: '' },
      items: [{ id: uid(), desc: '', qty: 1, unit: '', price: '' }], vat: false, whtRate: 0, dueDate: '', validDays: 30, refNo: '', payMethod: 'transfer', note: '', useSig: true, useStamp: true });
    if (type === 'poa') Object.assign(d.data, { grantorRef: c ? 'c:' + c.id : '', grantorSnap: snapOf(c ? 'c:' + c.id : ''), granteeRef: 'custom', grantee: { name: '', idNo: '', address: '' },
      place: c ? c.name : '', matter: '', witness1: '', witness2: '', duty: 10, useSig: true, useStamp: true });
    return d;
  }
  function newDoc(type) { D2 = blank(type); render(); go('doc'); }
  function open(d) { D2 = clone(d); D2._pending = []; render(); go('doc'); }

  /* ---------- ฟอร์ม ---------- */
  const inp = (lbl, path, a) => `<label>${lbl}<input data-p="${path}" value="${esc(getP(D2, path) ?? '')}" ${a || ''}></label>`;
  const area = (lbl, path, a) => `<label>${lbl}<textarea data-p="${path}" rows="2" ${a || ''}>${esc(getP(D2, path) ?? '')}</textarea></label>`;
  const chk = (lbl, path) => `<label class="chk"><input type="checkbox" data-p="${path}"${getP(D2, path) !== false ? ' checked' : ''}> ${lbl}</label>`;
  /** เลขที่: หมวด + YYYYMMDD (ค.ศ.) + ลำดับ 3 หลักของวันนั้น เช่น EXP20261127001 */
  function nextNoHint() {
    const prefix = D2.type === 'expense' ? 'EXP' : D2.type === 'poa' ? 'POA' : D2.subtype.toUpperCase();
    const head = prefix + String(D2.docDate || todayISO()).slice(0, 10).replace(/-/g, '');
    let m = 0; S.docs.forEach(x => { const n = String(x.no); if (x.companyId === D2.companyId && n.startsWith(head) && /^\d+$/.test(n.slice(head.length))) m = Math.max(m, parseInt(n.slice(head.length), 10)); });
    return head + String(m + 1).padStart(3, '0');
  }
  function headFields() {
    return `<div class="g2"><label>เลขที่<input data-p="no" value="${esc(D2.no)}" placeholder="อัตโนมัติ (${esc(nextNoHint())})"></label><label>วันที่<input type="date" data-p="docDate" value="${esc(D2.docDate)}"></label></div>`;
  }
  function render() {
    if (!D2) return;
    const ro = !canEdit(D2), d = D2.data, c = co(D2.companyId);
    let h = `<div class="dochead"><span class="dtype">${TYPES[D2.type].icon} ${esc(label(D2))}</span>${statusBadge(D2)}${D2.id ? `<span class="hint">${esc(D2.no)}</span>` : ''}</div>`;
    if (ro) h += `<div class="note">${D2.type === 'expense' && D2.createdBy === S.user.id ? 'ใบเบิกนี้อนุมัติแล้ว แก้ไขไม่ได้' : 'ดูอย่างเดียว — เอกสารนี้ออกโดยผู้อื่น'}</div>`;
    if (D2.type === 'expense') {
      if (D2.id && isAdmin()) h += `<div class="stbar"><span>สถานะ:</span>${['approved', 'paid', 'rejected', 'pending'].filter(s => s !== D2.status).map(s => `<button type="button" data-st="${s}" class="${s === 'rejected' ? 'ghost danger' : s === 'pending' ? 'ghost' : 'pri'}">${{ approved: '✓ อนุมัติ', paid: '💸 จ่ายแล้ว', rejected: 'ไม่อนุมัติ', pending: 'กลับเป็นรออนุมัติ' }[s]}</button>`).join('')}</div>`;
      if (D2.status === 'rejected' && d.rejectNote) h += `<div class="note">เหตุผลที่ไม่อนุมัติ: ${esc(d.rejectNote)}</div>`;
      h += `<fieldset><legend>ข้อมูลการเบิก</legend>${headFields()}
        <p class="hint">บริษัทผู้จ่ายเงิน: <b>${esc(c ? c.name : '— เลือกบริษัทที่เมนูด้านบน —')}</b></p>
        <div class="g2">${inp('ผู้เบิก', 'data.requester')}${inp('แผนก / ตำแหน่ง', 'data.dept')}</div></fieldset>
        <fieldset><legend>รายการที่เบิก</legend>
        <label class="btn scanbtn">📷 ถ่ายรูปใบเสร็จ → เพิ่มเป็นรายการ<input type="file" accept="image/*" id="exScan" hidden></label>
        <div id="dItems" class="stackgap"></div><button type="button" class="ghost" data-add>+ เพิ่มรายการ</button><div class="tot" id="dTot"></div></fieldset>
        <fieldset><legend>รับเงินโดย</legend>
        <div class="seg"><button type="button" data-pm="cash" class="${d.payMethod === 'cash' ? 'on' : ''}">เงินสด</button><button type="button" data-pm="transfer" class="${d.payMethod !== 'cash' ? 'on' : ''}">โอนเข้าบัญชี</button></div>
        ${d.payMethod !== 'cash' ? `<div class="g3">${inp('ธนาคาร', 'data.bank')}${inp('เลขที่บัญชี', 'data.accountNo', 'inputmode="numeric"')}${inp('ชื่อบัญชี', 'data.accountName')}</div>` : ''}
        ${area('หมายเหตุ', 'data.note')}${chk('ใส่ลายเซ็นผู้อนุมัติ (ของบริษัท) เมื่ออนุมัติแล้ว', 'data.useSig')}</fieldset>`;
    }
    if (D2.type === 'bill') {
      h += `<fieldset><legend>ประเภทเอกสาร</legend><div class="seg seg4">${Object.keys(SUB).map(k => `<button type="button" data-sub="${k}" class="${D2.subtype === k ? 'on' : ''}">${SUB[k].th}</button>`).join('')}</div>${headFields()}
        <div class="g2">${D2.subtype === 'qt' ? inp('ยืนราคา (วัน)', 'data.validDays', 'inputmode="numeric"') : D2.subtype === 're' ? `<label>ชำระโดย<select data-p="data.payMethod">${[['cash', 'เงินสด'], ['transfer', 'โอนเงิน'], ['cheque', 'เช็ค']].map(([v, t]) => `<option value="${v}"${d.payMethod === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : `<label>ครบกำหนดชำระ<input type="date" data-p="data.dueDate" value="${esc(d.dueDate || '')}"></label>`}
        ${inp(D2.subtype === 'bn' ? 'อ้างอิงใบแจ้งหนี้ / ใบกำกับ' : 'อ้างอิง (เช่น เลขที่ PO)', 'data.refNo')}</div></fieldset>
        <fieldset><legend>${SUB[D2.subtype].issuer} (ผู้ออกเอกสาร)</legend>
        <select data-ref="issuer">${refOptions(d.issuerRef, {})}</select>
        ${d.issuerSnap ? `<p class="hint">${esc(d.issuerSnap.name)}${d.issuerSnap.taxId ? ' · เลขผู้เสียภาษี ' + esc(d.issuerSnap.taxId) : ''}${d.issuerSnap.address ? '<br>' + esc(d.issuerSnap.address) : ''}</p>` : '<p class="hint">เลือกบริษัทของเรา หรือบุคคลธรรมดาจากรายชื่อ (เพิ่มคนใหม่ได้ที่แท็บรายชื่อ)</p>'}
        ${d.issuerSnap && d.issuerSnap.kind === 'company' ? `<div class="row">${chk('ใส่ลายเซ็น', 'data.useSig')}${chk('ใส่ตรายาง', 'data.useStamp')}</div>` : ''}</fieldset>
        <fieldset><legend>ลูกค้า</legend><select data-ref="cust">${refOptions(d.custRef, { custom: true })}</select>
        ${inp('ชื่อ', 'data.customer.name')}<div class="g2">${inp('เลขผู้เสียภาษี', 'data.customer.taxId', 'inputmode="numeric" maxlength="13"')}${inp('สาขา', 'data.customer.branch')}</div>${area('ที่อยู่', 'data.customer.address')}</fieldset>
        <fieldset><legend>รายการ</legend><div id="dItems" class="stackgap"></div><button type="button" class="ghost" data-add>+ เพิ่มรายการ</button>
        <div class="row">${chk('คิดภาษีมูลค่าเพิ่ม 7%', 'data.vat')}</div>
        <label>หัก ณ ที่จ่าย (แสดงยอดชำระสุทธิ)<select data-p="data.whtRate">${[0, 1, 1.5, 2, 3, 5, 10, 15].map(r => `<option value="${r}"${num(d.whtRate) === r ? ' selected' : ''}>${r ? r + '%' : 'ไม่หัก'}</option>`).join('')}</select></label>
        <div class="tot" id="dTot"></div>${area('หมายเหตุ / ช่องทางชำระเงิน', 'data.note', 'placeholder="เช่น โอนเข้าบัญชี กสิกรไทย 123-4-56789-0 ชื่อบัญชี ..."')}</fieldset>`;
    }
    if (D2.type === 'poa') {
      const g = d.grantee || {};
      h += `<fieldset><legend>หนังสือมอบอำนาจ</legend>${headFields()}${inp('เขียนที่', 'data.place')}</fieldset>
        <fieldset><legend>ผู้มอบอำนาจ</legend><select data-ref="grantor">${refOptions(d.grantorRef, { personsOnly: true })}</select>
        ${d.grantorSnap ? `<p class="hint">${esc(d.grantorSnap.name)}${d.grantorSnap.taxId ? ' · ' + (d.grantorSnap.kind === 'company' ? 'เลขทะเบียน ' : 'เลขบัตร ') + esc(d.grantorSnap.taxId) : ''}${d.grantorSnap.kind === 'company' ? '<br>ลงนามโดย ' + esc(d.grantorSnap.signer || '— ยังไม่ได้ใส่ชื่อผู้ลงนามในข้อมูลบริษัท —') : ''}</p>` : '<p class="hint">เลือกบริษัทของเรา หรือบุคคลธรรมดาจากรายชื่อ</p>'}
        ${d.grantorSnap && d.grantorSnap.kind === 'company' ? `<div class="row">${chk('ใส่ลายเซ็น', 'data.useSig')}${chk('ใส่ตรายาง', 'data.useStamp')}</div>` : ''}</fieldset>
        <fieldset><legend>ผู้รับมอบอำนาจ</legend><select data-ref="grantee">${refOptions(d.granteeRef, { personsOnly: true, noCompany: true, custom: true })}</select>
        ${inp('ชื่อ-นามสกุล', 'data.grantee.name')}${inp('เลขประจำตัวประชาชน', 'data.grantee.idNo', 'inputmode="numeric" maxlength="13"')}${area('ที่อยู่', 'data.grantee.address')}</fieldset>
        <fieldset><legend>เรื่องที่มอบอำนาจ</legend><div class="chips">${MATTERS.map((m, i) => `<button type="button" data-matter="${i}">${esc(m)}</button>`).join('')}</div>
        ${area('ให้มีอำนาจ…', 'data.matter', 'rows="3" placeholder="เช่น ติดต่อกรมสรรพากร ยื่นแบบ ภ.ง.ด.53 และชำระภาษีประจำเดือน…"')}
        <div class="g2">${inp('พยานคนที่ 1', 'data.witness1')}${inp('พยานคนที่ 2', 'data.witness2')}</div>
        <label>อากรแสตมป์<select data-p="data.duty"><option value="10"${+d.duty !== 30 ? ' selected' : ''}>10 บาท (ทำการครั้งเดียว)</option><option value="30"${+d.duty === 30 ? ' selected' : ''}>30 บาท (ทำการมากกว่าครั้งเดียว)</option></select></label></fieldset>`;
    }
    h += `<fieldset><legend>ไฟล์แนบ</legend><div class="stackgap" id="dAtt"></div><label class="btn">📎 แนบไฟล์ (รูปหรือ PDF)<input type="file" accept="image/*,application/pdf" id="dAttIn" hidden></label></fieldset>`;
    const f = $('#df'); f.innerHTML = h;
    if (ro) f.querySelectorAll('input,select,textarea,label.btn').forEach(el => { if (el.tagName === 'LABEL') el.hidden = true; else el.disabled = true; });
    f.querySelectorAll('button:not([data-st])').forEach(el => { if (ro) el.disabled = true; });
    renderItems(); renderAtt(); actions(); preview();
  }
  function renderItems() {
    const box = $('#dItems'); if (!box) return; const d = D2.data;
    if (D2.type === 'expense') box.innerHTML = d.items.map((it, i) => `<div class="it" data-i="${i}"><div class="it-h"><input data-ik="desc" placeholder="รายการ เช่น ค่าแท็กซี่ไปพบลูกค้า" value="${esc(it.desc)}">${d.items.length > 1 ? `<button type="button" class="x" data-del="${i}" aria-label="ลบรายการ">×</button>` : ''}</div>
      <div class="g3"><label>จำนวนเงิน<input data-ik="amount" inputmode="decimal" placeholder="0.00" value="${esc(it.amount)}"></label><label>วันที่<input type="date" data-ik="date" value="${esc(it.date)}"></label><label>เลขที่ใบเสร็จ<input data-ik="ref" value="${esc(it.ref || '')}"></label></div></div>`).join('');
    else box.innerHTML = d.items.map((it, i) => `<div class="it" data-i="${i}"><div class="it-h"><input data-ik="desc" placeholder="รายการ / รายละเอียด" value="${esc(it.desc)}">${d.items.length > 1 ? `<button type="button" class="x" data-del="${i}" aria-label="ลบรายการ">×</button>` : ''}</div>
      <div class="g4"><label>จำนวน<input data-ik="qty" inputmode="decimal" value="${esc(it.qty)}"></label><label>หน่วย<input data-ik="unit" value="${esc(it.unit || '')}" placeholder="งาน"></label><label>ราคา/หน่วย<input data-ik="price" inputmode="decimal" placeholder="0.00" value="${esc(it.price)}"></label><label>จำนวนเงิน<input disabled data-amt value="${money(lineAmt(it))}"></label></div></div>`).join('');
    totals();
  }
  const lineAmt = it => r2(num(it.qty === '' ? 1 : it.qty) * num(it.price));
  function billSums(d) {
    const sub = r2(d.items.reduce((s, it) => s + lineAmt(it), 0)), vat = d.vat ? r2(sub * 0.07) : 0, total = r2(sub + vat);
    const wht = num(d.whtRate) ? r2(sub * num(d.whtRate) / 100) : 0;
    return { sub, vat, total, wht, net: r2(total - wht) };
  }
  function totals() {
    const t = $('#dTot'); if (!t) return; const d = D2.data;
    if (D2.type === 'expense') { const s = d.items.reduce((a, it) => a + num(it.amount), 0); t.innerHTML = `<span>รวมเบิก</span><b>${money(s)}</b>`; return; }
    const b = billSums(d);
    t.innerHTML = `<span>รวม ${money(b.sub)}${d.vat ? ' + VAT ' + money(b.vat) : ''}</span><b>${money(b.total)}</b>${b.wht ? `<span style="flex-basis:100%;text-align:right" class="hint">หัก ณ ที่จ่าย ${esc(d.whtRate)}% = ${money(b.wht)} · ชำระสุทธิ ${money(b.net)}</span>` : ''}`;
  }
  function renderAtt() {
    const box = $('#dAtt'); if (!box) return;
    box.innerHTML = filesOf('doc', D2.id).map(f => attRow(f)).join('') + (D2._pending || []).map((f, i) => attRow(f, i)).join('') || '<p class="hint">ยังไม่มีไฟล์แนบ</p>';
  }
  function actions() {
    const ro = !canEdit(D2);
    $('#dActs').innerHTML = `<button type="button" class="pri" id="dSave"${ro ? ' disabled' : ''}>บันทึก</button><button type="button" id="dPdf">PDF</button><button type="button" class="ghost" id="dMore">อื่น ๆ</button>`;
    $('#dSave').onclick = save; $('#dPdf').onclick = pdf; $('#dMore').onclick = more;
  }

  /* ---------- events ---------- */
  function wire() {
    const f = $('#df');
    f.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.p) {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.p === 'data.whtRate' || el.dataset.p === 'data.duty') v = num(v);
        setP(D2, el.dataset.p, v);
        if (el.dataset.p === 'data.vat' || el.dataset.p === 'data.whtRate') totals();
        if (el.dataset.p.startsWith('data.customer.') && D2.data.custRef !== 'custom') { /* แก้เองได้ ถือเป็นข้อมูลของใบนี้ */ }
        if (el.dataset.p === 'docDate') { const n = f.querySelector('[data-p=no]'); if (n) n.placeholder = 'อัตโนมัติ (' + nextNoHint() + ')'; }
        preview(); return;
      }
      if (el.dataset.ref) return;
      const box = el.closest('.it'); if (!box || !el.dataset.ik) return;
      const it = D2.data.items[+box.dataset.i]; it[el.dataset.ik] = el.value;
      const a = box.querySelector('[data-amt]'); if (a) a.value = money(lineAmt(it));
      totals(); preview();
    });
    f.addEventListener('change', e => { if (e.target.dataset.ref) pickRef(e.target.dataset.ref, e.target.value); });
    f.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = D2.data;
      if (b.dataset.add !== undefined) { d.items.push(D2.type === 'expense' ? { id: uid(), date: todayISO(), desc: '', ref: '', amount: '' } : { id: uid(), desc: '', qty: 1, unit: '', price: '' }); renderItems(); preview(); }
      else if (b.dataset.del) { d.items.splice(+b.dataset.del, 1); renderItems(); preview(); }
      else if (b.dataset.sub) { if (D2.subtype !== b.dataset.sub) { D2.subtype = b.dataset.sub; if (!D2.id) D2.no = ''; render(); } }
      else if (b.dataset.pm) { d.payMethod = b.dataset.pm; render(); }
      else if (b.dataset.matter) { d.matter = (d.matter ? d.matter.trim() + ' และ' : '') + MATTERS[+b.dataset.matter]; render(); }
      else if (b.dataset.st) setStatus(b.dataset.st);
      else if (b.closest('#dAtt')) attClick(e, renderAtt, D2._pending);
    });
  }
  function pickRef(which, val) {
    const d = D2.data, snap = val && val !== 'custom' ? snapOf(val) : null;
    if (which === 'issuer') { d.issuerRef = val; d.issuerSnap = snap; }
    if (which === 'grantor') { d.grantorRef = val; d.grantorSnap = snap; if (snap && snap.kind === 'company' && !d.place) d.place = ''; }
    if (which === 'cust') { d.custRef = val; if (snap) d.customer = { name: snap.name, taxId: snap.taxId || '', branch: snap.branch || '', address: snap.address || '' }; }
    if (which === 'grantee') { d.granteeRef = val; if (snap) d.grantee = { name: snap.name, idNo: snap.taxId || '', address: snap.address || '' }; }
    render();
  }

  /* ---------- ถ่ายรูปใบเสร็จ → รายการเบิก ---------- */
  async function scanReceipt(file) {
    if (!file) return;
    dialog(`<h3 style="margin:0">กำลังอ่านใบเสร็จ…</h3><div class="prog"><i id="scBar"></i></div><p class="hint" id="scMsg">กำลังเตรียมรูป</p>`);
    let img, p = { names: [], amounts: [], dates: [] };
    try {
      img = await Scan.prepImage(file);
      const r = await Scan.readText(img, (m, x) => { const a = $('#scMsg'), b = $('#scBar'); if (a) a.textContent = m + (x ? ' ' + Math.round(x * 100) + '%' : ''); if (b) b.style.width = Math.round((x || 0) * 100) + '%'; });
      p = Scan.parse(r.text, S.companies.map(c => ({ name: c.name, taxId: c.taxId })));
    } catch (e) { if (!img) { dialog(`<p class="err">${esc(e.message)}</p><div class="row"><button type="button" class="pri" data-close>ปิด</button></div>`); return; } }
    const vendor = (p.names.find(n => !n.own) || {}).value || '';
    const tot = p.amounts.find(a => a.kind === 'total') || p.amounts.find(a => a.kind !== 'wht' && a.kind !== 'vat') || {};
    dialog(`<h3 style="margin:0">เพิ่มรายการจากใบเสร็จ</h3><div class="scanimg"><img src="${img.dataUrl}" alt="ใบเสร็จ"></div>
      <label>รายการ<input id="srDesc" value="${esc(vendor ? 'ค่าใช้จ่าย ' + vendor : '')}" placeholder="เช่น ค่าน้ำมัน"></label>
      <div class="g2"><label>จำนวนเงิน<input id="srAmt" inputmode="decimal" value="${tot.value ? tot.value.toFixed(2) : ''}"></label><label>วันที่<input type="date" id="srDate" value="${esc(p.dates[0] || todayISO())}"></label></div>
      ${p.amounts.length > 1 ? `<div class="chips">${p.amounts.slice(0, 6).map(a => `<button type="button" data-a="${a.value.toFixed(2)}">${money(a.value)}</button>`).join('')}</div>` : ''}
      <label class="chk"><input type="checkbox" id="srAtt" checked> แนบรูปใบเสร็จนี้</label>
      <div class="row"><button type="button" class="ghost" data-close>ยกเลิก</button><button type="button" class="pri" id="srOk">เพิ่มรายการ</button></div>`);
    $('#dlg').onclick = e => { const b = e.target.closest('[data-a]'); if (b) $('#srAmt').value = b.dataset.a; };
    $('#srOk').onclick = () => {
      const items = D2.data.items, empty = items.findIndex(it => !num(it.amount) && !it.desc);
      const it = { id: uid(), date: $('#srDate').value || todayISO(), desc: $('#srDesc').value, ref: '', amount: $('#srAmt').value };
      if (empty >= 0) items[empty] = it; else items.push(it);
      if ($('#srAtt').checked) addFile({ kind: 'receipt', name: 'ใบเสร็จ ' + (it.desc || '') + '.jpg', mime: 'image/jpeg', dataUrl: img.dataUrl, size: Math.round(img.dataUrl.length * 0.75) });
      closeDlg(); renderItems(); preview(); toast('เพิ่มรายการแล้ว ตรวจยอดอีกครั้ง');
    };
  }
  function addFile(item) {
    if (D2.id && canEdit(D2)) uploadNow('doc', D2.id, item).then(() => { renderAtt(); toast('แนบไฟล์แล้ว'); }).catch(e => toast(e.message));
    else { D2._pending.push(item); renderAtt(); }
  }
  document.addEventListener('change', e => {
    if (e.target.id === 'exScan') { const f = e.target.files[0]; e.target.value = ''; scanReceipt(f); }
    if (e.target.id === 'dAttIn') { const f = e.target.files[0]; e.target.value = ''; if (f) prepFile(f, D2.type === 'expense' ? 'receipt' : 'other').then(addFile).catch(x => toast(x.message)); }
  });

  /* ---------- บันทึก / สถานะ / อื่น ๆ ---------- */
  async function save() {
    await busy($('#dSave'), 'กำลังบันทึก…', async () => {
      if (!co(D2.companyId)) throw new Error('เลือกบริษัทที่เมนูด้านบนก่อน');
      const pend = D2._pending || [], payload = clone(D2); delete payload._pending;
      const rec = await API.call('saveDoc', { doc: payload });
      S.docs = S.docs.filter(x => x.id !== rec.id).concat(rec);
      D2 = clone(rec); D2._pending = [];
      let failed = 0;
      for (const f of pend) { try { await uploadNow('doc', rec.id, f); } catch (e) { failed++; D2._pending.push(f); } }
      saveCache(); render(); onChange();
      toast('บันทึกแล้ว ' + rec.no + (failed ? ` · อัปโหลดไฟล์ไม่สำเร็จ ${failed} ไฟล์ กดบันทึกอีกครั้ง` : ''));
    });
  }
  async function setStatus(st) {
    let note = '';
    if (st === 'rejected') {
      note = await new Promise(res => {
        dialog(`<h3 style="margin:0">ไม่อนุมัติใบเบิก ${esc(D2.no)}</h3><label>เหตุผล (แจ้งผู้เบิก)<textarea id="rjNote" rows="3"></textarea></label><div class="row"><button type="button" class="ghost" id="rjN">ยกเลิก</button><button type="button" class="pri" id="rjY">ไม่อนุมัติ</button></div>`);
        $('#rjN').onclick = () => { closeDlg(); res(null); }; $('#rjY').onclick = () => { const v = $('#rjNote').value; closeDlg(); res(v); };
      });
      if (note === null) return;
    }
    try {
      const rec = await API.call('setDocStatus', { id: D2.id, status: st, note });
      S.docs = S.docs.filter(x => x.id !== rec.id).concat(rec); D2 = Object.assign(clone(rec), { _pending: D2._pending });
      saveCache(); render(); onChange(); toast('เปลี่ยนสถานะเป็น ' + STATUS[st][0]);
    } catch (e) { toast(e.message); }
  }
  function more() {
    dialog(`<h3 style="margin:0">${D2.id ? esc(label(D2)) + ' ' + esc(D2.no) : esc(label(D2)) + ' (ยังไม่บันทึก)'}</h3><div class="stackgap">
      <button type="button" id="mNew">เริ่ม${esc(TYPES[D2.type].label)}ใบใหม่</button>
      ${D2.id ? '<button type="button" id="mDup">ทำซ้ำเป็นใบใหม่</button>' : ''}
      ${D2.id && canEdit(D2) ? '<button type="button" class="danger" id="mDel">ลบเอกสารนี้</button>' : ''}
      <button type="button" class="ghost" data-close>ปิด</button></div>`);
    $('#mNew').onclick = () => { closeDlg(); D2 = blank(D2.type); render(); };
    const dup = $('#mDup'); if (dup) dup.onclick = () => {
      closeDlg(); const src = D2; D2 = blank(src.type); D2.subtype = src.subtype; D2.data = clone(src.data);
      ['approvedBy', 'approvedAt', 'paidAt', 'paidBy', 'rejectNote', 'requesterId'].forEach(k => delete D2.data[k]);
      if (D2.type === 'expense') { D2.data.requester = S.user.name; D2.data.items = D2.data.items.map(it => Object.assign({}, it, { id: uid(), amount: '', date: todayISO(), ref: '' })); }
      render(); toast('คัดลอกแล้ว แก้ไขแล้วกดบันทึก');
    };
    const del = $('#mDel'); if (del) del.onclick = async () => {
      closeDlg(); if (!await ask(`ลบ${label(D2)} ${D2.no} ?`, 'ลบ')) return;
      try { await API.call('deleteDoc', { id: D2.id }); S.docs = S.docs.filter(x => x.id !== D2.id); saveCache(); onChange(); toast('ลบแล้ว'); go('list'); }
      catch (e) { toast(e.message); }
    };
  }

  /* ---------- กระดาษ A4 ---------- */
  const words = n => esc(C.bahtText(n));
  function issuerBlock(s) {
    if (!s) return '<div class="iss"><b>— ยังไม่ได้เลือกผู้ออกเอกสาร —</b></div>';
    return `<div class="iss"><b>${esc(s.name)}</b>${s.address ? `<div>${esc(s.address)}</div>` : ''}${s.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(s.taxId)}${s.branch ? ' · ' + esc(s.branch) : ''}</div>` : ''}</div>`;
  }
  function sigBox(title, name, im, opt) {
    opt = opt || {};
    return `<div class="dsig"><div class="area">${opt.sig && im && im.sig ? `<img class="sig" src="${esc(im.sig)}" alt="">` : ''}${opt.stamp && im && im.stamp ? `<img class="stamp" src="${esc(im.stamp)}" alt="">` : ''}</div>
      <div>( ${name ? esc(name) : '<span class="blankname"></span>'} )</div><div>${esc(title)}</div><div class="sd">${opt.date ? esc(opt.date) : 'วันที่ ......../......../........'}</div></div>`;
  }
  function sheetHTML(d) {
    const x = d.data || {}, c = co(d.companyId) || {};
    const no = d.no || nextNoHint() + ' (ร่าง)';
    if (d.type === 'expense') {
      const items = (x.items || []).filter(it => num(it.amount) || it.desc), total = r2(items.reduce((s, it) => s + num(it.amount), 0));
      const pad = Math.max(0, 10 - items.length), ok = ['approved', 'paid'].includes(d.status);
      return `<div class="sheet dsheet">${d.status !== 'pending' && STATUS[d.status] ? `<div class="dstatus ${STATUS[d.status][1]}">${STATUS[d.status][0]}</div>` : ''}
        <div class="dh">${issuerBlock({ name: c.name, address: c.address, taxId: c.taxId, branch: c.branch })}<div class="dt"><h1>ใบเบิกเงิน</h1><div class="en">EXPENSE CLAIM</div>
        <div class="dmeta"><span>เลขที่</span><b>${esc(no)}</b><span>วันที่</span><b>${esc(dLong(d.docDate))}</b></div></div></div>
        <div class="dinfo"><div><span>ผู้เบิก</span><b>${esc(x.requester)}</b></div><div><span>แผนก/ตำแหน่ง</span><b>${esc(x.dept || '-')}</b></div>
        <div><span>รับเงินโดย</span><b>${x.payMethod === 'cash' ? 'เงินสด' : 'โอนเข้าบัญชี ' + esc([x.bank, x.accountNo, x.accountName].filter(Boolean).join(' · '))}</b></div></div>
        <table class="dtbl"><thead><tr><th style="width:44px">ลำดับ</th><th style="width:92px">วันที่</th><th>รายการ</th><th style="width:110px">เลขที่ใบเสร็จ</th><th style="width:120px">จำนวนเงิน</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="c">${esc(dShort(it.date))}</td><td>${esc(it.desc)}</td><td class="c">${esc(it.ref || '')}</td><td class="n">${money(num(it.amount))}</td></tr>`).join('')}${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'.repeat(pad)}</tbody></table>
        <div class="dtot"><div class="words">(${words(total)})</div><table><tr><td>รวมเงินเบิกทั้งสิ้น</td><td class="n">${money(total)}</td></tr></table></div>
        ${x.note ? `<div class="dnote"><b>หมายเหตุ</b> ${esc(x.note)}</div>` : ''}
        <div class="dsigs" style="--n:4">${sigBox('ผู้เบิก', x.requester, null, { date: dShort(d.docDate) })}${sigBox('ผู้อนุมัติ', ok ? (c.signer || x.approvedBy) : '', imgsFor(c), { sig: ok && x.useSig !== false, date: ok && x.approvedAt ? dShort(x.approvedAt.slice(0, 10)) : '' })}${sigBox('ผู้จ่ายเงิน', x.paidBy || '', null, { date: x.paidAt ? dShort(x.paidAt.slice(0, 10)) : '' })}${sigBox('ผู้รับเงิน', x.requester, null)}</div></div>`;
    }
    if (d.type === 'bill') {
      const s = SUB[d.subtype] || SUB.iv, items = (x.items || []).filter(it => it.desc || num(it.price)), b = billSums(x), pad = Math.max(0, 10 - items.length);
      const iss = x.issuerSnap, isCo = iss && iss.kind === 'company', im = isCo ? imgsFor(co(iss.id)) : null, cu = x.customer || {};
      const meta = [['เลขที่', no], ['วันที่', dLong(d.docDate)]];
      if (d.subtype === 'qt') meta.push(['ยืนราคา', (x.validDays || 30) + ' วัน']);
      if ((d.subtype === 'iv' || d.subtype === 'bn') && x.dueDate) meta.push(['ครบกำหนด', dLong(x.dueDate)]);
      if (x.refNo) meta.push(['อ้างอิง', x.refNo]);
      return `<div class="sheet dsheet">
        <div class="dh">${issuerBlock(iss)}<div class="dt"><h1>${s.th}</h1><div class="en">${s.en}</div></div></div>
        <div class="dcust"><div><div class="lbl">ลูกค้า</div><b>${esc(cu.name || '')}</b>${cu.address ? `<div>${esc(cu.address)}</div>` : ''}${cu.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(cu.taxId)}${cu.branch ? ' · ' + esc(cu.branch) : ''}</div>` : ''}</div>
        <div class="dmeta2">${meta.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div></div>
        <table class="dtbl"><thead><tr><th style="width:44px">ลำดับ</th><th>รายการ</th><th style="width:70px">จำนวน</th><th style="width:64px">หน่วย</th><th style="width:100px">ราคา/หน่วย</th><th style="width:112px">จำนวนเงิน</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td class="c">${i + 1}</td><td>${esc(it.desc)}</td><td class="c">${esc(it.qty === '' ? 1 : it.qty)}</td><td class="c">${esc(it.unit || '')}</td><td class="n">${money(num(it.price))}</td><td class="n">${money(lineAmt(it))}</td></tr>`).join('')}${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(pad)}</tbody></table>
        <div class="dtot"><div class="words">(${words(b.total)})</div><table>
          <tr><td>รวมเป็นเงิน</td><td class="n">${money(b.sub)}</td></tr>${x.vat ? `<tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="n">${money(b.vat)}</td></tr>` : ''}
          <tr class="grand"><td>จำนวนเงินรวมทั้งสิ้น</td><td class="n">${money(b.total)}</td></tr>
          ${b.wht ? `<tr><td>หัก ณ ที่จ่าย ${esc(x.whtRate)}%</td><td class="n">${money(b.wht)}</td></tr><tr class="grand"><td>ยอดชำระสุทธิ</td><td class="n">${money(b.net)}</td></tr>` : ''}</table></div>
        ${d.subtype === 're' ? `<div class="dnote">ชำระโดย ${[['cash', 'เงินสด'], ['transfer', 'โอนเงิน'], ['cheque', 'เช็ค']].map(([v, t]) => `<span class="ck">${x.payMethod === v ? '☑' : '☐'} ${t}</span>`).join(' ')} &nbsp; ได้รับเงินถูกต้องเรียบร้อยแล้ว</div>` : ''}
        ${x.note ? `<div class="dnote"><b>หมายเหตุ</b> ${esc(x.note)}</div>` : ''}
        <div class="dsigs" style="--n:2">${sigBox(s.cust, '', null)}${sigBox(s.issuer, isCo ? iss.signer : (iss ? iss.name : ''), im, { sig: isCo && x.useSig !== false, stamp: isCo && x.useStamp !== false, date: dShort(d.docDate) })}</div></div>`;
    }
    // หนังสือมอบอำนาจ
    const g = x.grantorSnap || {}, ge = x.grantee || {}, isCo = g.kind === 'company', im = isCo ? imgsFor(co(g.id)) : null;
    const fill = (v, w) => `<span class="fill" style="min-width:${w || 120}px">${esc(v || '')}</span>`;
    const who = isCo
      ? `${fill(g.name, 220)} เลขทะเบียนนิติบุคคล ${fill(g.taxId, 140)} สำนักงานตั้งอยู่เลขที่ ${fill(g.address, 260)} โดย ${fill(g.signer, 160)} ${esc(g.signerTitle || 'กรรมการผู้มีอำนาจลงนาม')}`
      : `${fill(g.name, 220)} เลขประจำตัวประชาชน ${fill(g.taxId, 140)} อยู่บ้านเลขที่ ${fill(g.address, 260)}`;
    return `<div class="sheet dsheet poa"><div class="duty">ติดอากรแสตมป์<br><b>${+x.duty === 30 ? 30 : 10} บาท</b></div>
      <h1 class="ptitle">หนังสือมอบอำนาจ</h1>
      <div class="pmeta"><div>เขียนที่ ${fill(x.place, 200)}</div><div>วันที่ ${fill(dLong(d.docDate), 200)}</div></div>
      <p>โดยหนังสือฉบับนี้ ข้าพเจ้า ${who} ขอมอบอำนาจให้ ${fill(ge.name, 200)} เลขประจำตัวประชาชน ${fill(ge.idNo, 140)} อยู่บ้านเลขที่ ${fill(ge.address, 260)} เป็นผู้มีอำนาจกระทำการแทนข้าพเจ้า ในเรื่อง ${fill(x.matter, 300)}</p>
      <p>และให้มีอำนาจลงนามในเอกสารต่าง ๆ ที่เกี่ยวข้องจนเสร็จการ การใดที่ผู้รับมอบอำนาจได้กระทำไปตามหนังสือมอบอำนาจนี้ ให้มีผลผูกพันข้าพเจ้าเสมือนหนึ่งว่าข้าพเจ้าได้กระทำด้วยตนเองทุกประการ</p>
      <p>เพื่อเป็นหลักฐาน ข้าพเจ้าจึงได้ลงลายมือชื่อ${isCo ? 'และประทับตรา (ถ้ามี)' : ''}ไว้เป็นสำคัญต่อหน้าพยาน</p>
      <div class="dsigs" style="--n:2">${sigBox('ผู้มอบอำนาจ', isCo ? g.signer : g.name, im, { sig: isCo && x.useSig !== false, stamp: isCo && x.useStamp !== false, date: ' ' })}${sigBox('ผู้รับมอบอำนาจ', ge.name, null, { date: ' ' })}
      ${sigBox('พยาน', x.witness1, null, { date: ' ' })}${sigBox('พยาน', x.witness2, null, { date: ' ' })}</div>
      <p class="pnote">แนบ: สำเนาบัตรประชาชน${isCo ? 'ของผู้มีอำนาจลงนาม หนังสือรับรองนิติบุคคล' : 'ของผู้มอบอำนาจ'} และสำเนาบัตรประชาชนของผู้รับมอบอำนาจ</p></div>`;
  }

  /* ---------- ตัวอย่าง / PDF ---------- */
  const pv = $('#pv2'), sh = $('#sheet2');
  function fit() { const w = pv.clientWidth; if (!w) return; const s = w / 794; sh.style.transform = `scale(${s})`; pv.style.height = Math.ceil(sh.offsetHeight * s) + 'px'; }
  new ResizeObserver(fit).observe(pv);
  let t = 0;
  function preview() { clearTimeout(t); t = setTimeout(() => { if (!D2) return; sh.innerHTML = sheetHTML(D2); fit(); }, 80); }
  async function pdf() {
    await busy($('#dPdf'), 'กำลังสร้าง…', async () => {
      const blob = await C.toPDF([sheetHTML(D2)]);
      const r = await C.deliver(blob, (D2.no || 'draft').replace(/[^\w-]/g, '') + '.pdf');
      if (r === 'downloaded') toast('ดาวน์โหลด PDF แล้ว');
    });
  }
  $('#docSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#docSeg button').forEach(x => x.classList.toggle('on', x === b));
    $('#docEd').className = 'ed m-' + b.dataset.m; if (b.dataset.m === 'preview') { preview(); requestAnimationFrame(fit); }
  });

  /* ---------- เมนูเลือกเอกสาร ---------- */
  function chooser(onWht) {
    dialog(`<h3 style="margin:0">ออกเอกสารใหม่</h3><div class="choose">
      <button type="button" data-new="wht"><span class="ci">🧮</span><span><b>หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</b><small>ออกให้ผู้ถูกหักภาษี</small></span></button>
      ${Object.keys(TYPES).map(k => `<button type="button" data-new="${k}"><span class="ci">${TYPES[k].icon}</span><span><b>${TYPES[k].label}</b><small>${TYPES[k].desc}</small></span></button>`).join('')}
      </div><div class="row"><button type="button" class="ghost" data-close>ปิด</button></div>`);
    $('#dlg').onclick = e => { const b = e.target.closest('[data-new]'); if (!b) return; closeDlg(); if (b.dataset.new === 'wht') onWht(); else newDoc(b.dataset.new); };
  }

  wire();
  return { TYPES, SUB, STATUS, label, statusBadge, newDoc, open, chooser, fit, preview: () => D2 && preview(), render: () => D2 && render(), current: () => D2 };
};
