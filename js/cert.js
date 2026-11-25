/* HugNa — การสร้างหน้าหนังสือรับรอง 50 ทวิ + ส่งออก PDF/PNG */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const money = n => (+n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const dShort = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${+y + 543}`; };
  const dLong = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${TH_M[m - 1]} ${y + 543}`; };

  /* ---- จำนวนเงินเป็นตัวอักษร ---- */
  const DG = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], PS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function chunk(s, lead) {
    s = s.replace(/^0+/, ''); if (!s) return ''; let o = ''; const L = s.length;
    for (let i = 0; i < L; i++) {
      const d = +s[i], p = L - 1 - i; if (!d) continue;
      if (p === 1 && d === 1) o += 'สิบ'; else if (p === 1 && d === 2) o += 'ยี่สิบ';
      else if (p === 0 && d === 1 && (L > 1 || lead)) o += 'เอ็ด'; else o += DG[d] + PS[p];
    }
    return o;
  }
  function readInt(s) { s = s.replace(/^0+/, ''); if (!s) return ''; if (s.length > 6) return readInt(s.slice(0, -6)) + 'ล้าน' + chunk(s.slice(-6), true); return chunk(s, false); }
  function bahtText(n) {
    const [b, s] = r2(Math.abs(n)).toFixed(2).split('.'); const t = readInt(b);
    if (!t && +s === 0) return 'ศูนย์บาทถ้วน';
    return (t ? t + 'บาท' : '') + (+s ? chunk(s, false) + 'สตางค์' : 'ถ้วน');
  }

  const CATS = [
    { k: 'c1', s: '1. เงินเดือน ค่าจ้าง 40(1)', t: '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)' },
    { k: 'c2', s: '2. ค่าธรรมเนียม ค่านายหน้า 40(2)', t: '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)' },
    { k: 'c3', s: '3. ค่าแห่งลิขสิทธิ์ 40(3)', t: '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)' },
    { k: 'c4a', s: '4(ก) ดอกเบี้ย 40(4)(ก)', t: '4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)' },
    { k: 'c4b', s: '4(ข) เงินปันผล 40(4)(ข)', t: '4. (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)' },
    { k: 'c5', s: '5. ตาม ม.3 เตรส (บริการ จ้างทำของ เช่า ขนส่ง โฆษณา ฯลฯ)', sm: 1, t: '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ' },
    { k: 'c6', s: '6. อื่น ๆ (ระบุ)', t: '6. อื่น ๆ (ระบุ)' }
  ];
  const PRESETS = [['ค่าบริการ', 3, 'c5'], ['ค่าจ้างทำของ', 3, 'c5'], ['ค่าวิชาชีพอิสระ', 3, 'c5'], ['ค่านายหน้า', 3, 'c2'], ['ค่าโฆษณา', 2, 'c5'], ['ค่าขนส่ง', 1, 'c5'], ['ค่าเช่า', 5, 'c5'], ['รางวัล/ส่งเสริมการขาย', 5, 'c5'], ['เงินปันผล', 10, 'c4b']];
  const RATES = [1, 1.5, 2, 3, 5, 10, 15];
  const FORMS = ['ภ.ง.ด.1ก', 'ภ.ง.ด.1ก พิเศษ', 'ภ.ง.ด.2', 'ภ.ง.ด.3', 'ภ.ง.ด.2ก', 'ภ.ง.ด.3ก', 'ภ.ง.ด.53'];
  const PAYER = ['หัก ณ ที่จ่าย', 'ออกให้ตลอดไป', 'ออกให้ครั้งเดียว', 'อื่น ๆ (ระบุ)'];
  const amt = it => num(it.amount), tax = it => r2(amt(it) * num(it.rate) / 100);

  function tin(v) {
    const d = String(v || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split(''); let i = 0;
    return '<span class="s-tin">' + [1, 4, 5, 2, 1].map(n => '<span>' + Array.from({ length: n }, () => `<i>${esc(d[i++].trim())}</i>`).join('') + '</span>').join('') + '</span>';
  }
  const cb = on => `<i class="s-cb">${on ? '<b></b>' : ''}</i>`;

  /** d = ใบ, c = ข้อมูลบริษัท, im = {sig, stamp} data URL, copy = 1|2 */
  function sheetHTML(d, c, im, copy) {
    c = c || {}; im = im || {};
    const items = (d.items || []).filter(it => amt(it) > 0);
    const ta = r2(items.reduce((s, it) => s + amt(it), 0)), tt = r2(items.reduce((s, it) => s + tax(it), 0));
    const rows = CATS.map(k => {
      const its = items.filter(it => it.cat === k.k);
      const desc = its.filter(it => it.desc && (k.k === 'c5' || k.k === 'c6' || its.length > 1)).map(it => `<span class="ds">– ${esc(it.desc)}</span>`).join('');
      return `<tr><td class="cat${k.sm ? ' sm' : ''}">${esc(k.t)}${desc}</td><td class="d">${its.map(it => esc(dShort(it.date))).join('<br>')}</td><td class="n">${its.map(it => money(amt(it))).join('<br>')}</td><td class="n">${its.map(it => money(tax(it))).join('<br>')}</td></tr>`;
    }).join('');
    const sig = d.useSig !== false && im.sig ? `<img class="sig" src="${esc(im.sig)}" alt="">` : '';
    const stamp = d.useStamp !== false && im.stamp ? `<img class="stamp" src="${esc(im.stamp)}" alt="">` : '<div class="s-stampslot">ประทับตรา<br>นิติบุคคล<br>(ถ้ามี)</div>';
    const f = d.funds || {};
    const pBranch = d.payeeBranch || (d.payeeType === 'p' ? '-' : 'สำนักงานใหญ่');
    return `<div class="sheet">
  <div class="s-copy">${copy === 2 ? 'ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)' : 'ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)'}</div>
  <div class="s-head"><div></div><div class="s-title"><b>หนังสือรับรองการหักภาษี ณ ที่จ่าย</b><span>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</span></div><div class="s-no">เล่มที่ <u class="blue">${esc(d.book)}</u><br>เลขที่ <u class="blue">${esc(d.no || '')}</u></div></div>
  <div class="s-box"><div class="s-lbl">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</div>
   <div class="s-row"><span>ชื่อ</span><u class="grow blue">${esc(c.name)}</u><span>เลขประจำตัวผู้เสียภาษีอากร</span>${tin(c.taxId)}</div>
   <div class="s-hint">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
   <div class="s-row"><span>ที่อยู่</span><u class="grow blue">${esc(c.address)}</u><span>สาขา</span><u class="blue">${esc(c.branch || 'สำนักงานใหญ่')}</u></div></div>
  <div class="s-box"><div class="s-lbl">ผู้ถูกหักภาษี ณ ที่จ่าย :</div>
   <div class="s-row"><span>ชื่อ</span><u class="grow blue">${esc(d.payeeName)}</u><span>เลขประจำตัวผู้เสียภาษีอากร</span>${tin(d.payeeTaxId)}</div>
   <div class="s-hint">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
   <div class="s-row"><span>ที่อยู่</span><u class="grow blue">${esc(d.payeeAddress)}</u><span>สาขา</span><u class="blue">${esc(pBranch)}</u></div>
   <div class="s-forms"><span>ลำดับที่ <u class="blue" style="min-width:50px;text-align:center">${esc(d.seq)}</u> ในแบบ</span>${FORMS.map((x, i) => `<span>${cb(+d.form === i)}(${i + 1}) ${x}</span>`).join('')}</div></div>
  <table class="s-t"><colgroup><col><col style="width:96px"><col style="width:118px"><col style="width:118px"></colgroup>
   <thead><tr><th>ประเภทเงินได้พึงประเมินที่จ่าย</th><th>วัน เดือน หรือปีภาษี ที่จ่าย</th><th>จำนวนเงินที่จ่าย</th><th>ภาษีที่หัก และนำส่งไว้</th></tr></thead>
   <tbody>${rows}<tr class="sum"><td colspan="2" style="text-align:right">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td><td class="n">${money(ta)}</td><td class="n">${money(tt)}</td></tr></tbody></table>
  <div class="s-words"><span>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</span><b>(${esc(bahtText(tt))})</b></div>
  <div class="s-funds"><span>เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <u class="blue">${f.gpf ? money(num(f.gpf)) : ''}</u> บาท</span><span>กองทุนประกันสังคม <u class="blue">${f.sso ? money(num(f.sso)) : ''}</u> บาท</span><span>กองทุนสำรองเลี้ยงชีพ <u class="blue">${f.pvd ? money(num(f.pvd)) : ''}</u> บาท</span></div>
  <div class="s-payer"><b>ผู้จ่ายเงิน</b>${PAYER.map((x, i) => `<span>${cb(+d.payer === i)}(${i + 1}) ${x}${i === 3 ? ` <u class="blue">${+d.payer === 3 ? esc(d.payerOther) : ''}</u>` : ''}</span>`).join('')}</div>
  <div class="s-foot"><div class="s-warn"><b>คำเตือน</b><br>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
   <div class="s-sign">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
    <div class="s-sigarea">${sig}${stamp}</div>
    <div>ลงชื่อ <u style="min-width:230px"></u> ผู้จ่ายเงิน</div>
    <div class="blue">( ${esc(c.signer || '')} )${c.signerTitle ? ' ' + esc(c.signerTitle) : ''}</div>
    <div><u class="blue" style="min-width:180px">${esc(dLong(d.issueDate))}</u></div>
    <div style="font-size:11.5px">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div></div></div>
  <div class="s-note">หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</div>
  </div>`;
  }

  /* ---- ส่งออก ---- */
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ];
  let libsP = null;
  function loadLibs() {
    if (libsP) return libsP;
    libsP = Promise.all(LIBS.map(src => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { libsP = null; rej(new Error('โหลดไลบรารีไม่สำเร็จ ตรวจอินเทอร์เน็ต')); };
      document.head.appendChild(s);
    })));
    return libsP;
  }
  async function capture(html) {
    await loadLibs();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px';
    host.innerHTML = html; document.body.appendChild(host);
    try {
      if (document.fonts) await document.fonts.ready;
      await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      return await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', logging: false });
    } finally { host.remove(); }
  }
  async function toPDF(pages) {
    const canvases = []; for (const h of pages) canvases.push(await capture(h));
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    canvases.forEach((c, i) => { if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, Math.min(297, 210 * c.height / c.width)); });
    return pdf.output('blob');
  }
  async function toPNG(html) { const c = await capture(html); return new Promise(r => c.toBlob(r, 'image/png')); }

  /** บนมือถือใช้เมนูแชร์ (บันทึกลงไฟล์/ส่ง LINE ได้) บนคอมดาวน์โหลดตรง */
  async function deliver(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'downloaded';
  }

  window.Cert = { esc, num, r2, money, dShort, dLong, bahtText, CATS, PRESETS, RATES, FORMS, PAYER, amt, tax, sheetHTML, toPDF, toPNG, deliver };
})();
