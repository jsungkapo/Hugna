/* HugNa — สแกนรูปเป็นข้อความ (OCR) แล้วแยกข้อมูล
 * 1) ส่งรูปให้ backend ใช้ Google Drive OCR (แม่นกับภาษาไทย)
 * 2) ถ้า backend ยังไม่พร้อม → อ่านในเครื่องด้วย Tesseract.js (ไทย+อังกฤษ) */
(function () {
  'use strict';
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  /** ย่อรูปให้ด้านยาวสุดไม่เกิน max และคืน data URL แบบ JPEG */
  function prepImage(file, max) {
    max = max || 2000;
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res({ dataUrl: cv.toDataURL('image/jpeg', 0.85), canvas: cv });
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('เปิดรูปไม่ได้ (รองรับ JPG / PNG / HEIC จากกล้อง iPhone)')); };
      im.src = url;
    });
  }

  let tessP = null;
  function loadTess() {
    if (window.Tesseract) return Promise.resolve();
    if (tessP) return tessP;
    tessP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = TESS; s.onload = res;
      s.onerror = () => { tessP = null; rej(new Error('โหลดตัวอ่านข้อความไม่สำเร็จ ตรวจอินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
    return tessP;
  }
  async function ocrLocal(canvas, onProgress) {
    await loadTess();
    const worker = await window.Tesseract.createWorker(['tha', 'eng'], 1, {
      logger: m => { if (onProgress && m.status) onProgress(m.status === 'recognizing text' ? 'กำลังอ่านข้อความ' : 'กำลังเตรียมตัวอ่าน (ครั้งแรกจะนานหน่อย)', m.progress || 0); }
    });
    try { const r = await worker.recognize(canvas); return { text: r.data.text || '', engine: 'device' }; }
    finally { worker.terminate(); }
  }
  /** อ่านข้อความ: ลอง Google ก่อน ถ้าไม่ได้ใช้ในเครื่อง */
  async function readText(img, onProgress) {
    const skip = API.LS.get('ocr_off_until', 0) > Date.now();
    if (!skip) {
      try {
        onProgress && onProgress('กำลังส่งรูปให้ Google อ่าน', 0.3);
        return await API.call('ocr', { image: img.dataUrl }, { timeout: 90000 });
      } catch (e) {
        if (e.code === 'ocr_unavailable' || e.code === 'bad_action') API.LS.set('ocr_off_until', Date.now() + 6 * 3600e3);
        else if (e.code === 'auth') throw e;
      }
    }
    return ocrLocal(img.canvas, onProgress);
  }

  /* ================= แยกข้อมูล ================= */
  const TH_MONTHS = [['มกราคม', 'ม.ค'], ['กุมภาพันธ์', 'ก.พ'], ['มีนาคม', 'มี.ค'], ['เมษายน', 'เม.ย'], ['พฤษภาคม', 'พ.ค'], ['มิถุนายน', 'มิ.ย'],
    ['กรกฎาคม', 'ก.ค'], ['สิงหาคม', 'ส.ค'], ['กันยายน', 'ก.ย'], ['ตุลาคม', 'ต.ค'], ['พฤศจิกายน', 'พ.ย'], ['ธันวาคม', 'ธ.ค']];
  const thaiDigits = s => s.replace(/[๐-๙]/g, d => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
  function idValid(d) {
    if (!/^\d{13}$/.test(d)) return false;
    let sum = 0; for (let i = 0; i < 12; i++) sum += +d[i] * (13 - i);
    return (11 - sum % 11) % 10 === +d[12];
  }
  const pad = n => String(n).padStart(2, '0');
  function toISO(d, m, y) {
    d = +d; m = +m; y = +y;
    if (y < 100) y = y >= 50 ? 2500 + y : 2000 + y;     // 69 → 2569 (พ.ศ.), 26 → 2026
    if (y > 2400) y -= 543;
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2100)) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  const uniq = (arr, key) => { const seen = new Set(); return arr.filter(x => { const k = key ? key(x) : x; if (seen.has(k)) return false; seen.add(k); return true; }); };

  const NAME_RE = /(บริษัท|บจก\.?|ห้างหุ้นส่วน|หจก\.?|มูลนิธิ|สมาคม|ร้าน|นางสาว|น\.ส\.|นาย|นาง|co\.?,?\s*ltd|company|limited|corporation)/i;
  const ADDR_RE = /(เลขที่|ถนน|ถ\.|ซอย|ซ\.|หมู่|ม\.\s?\d|ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|กรุงเทพ|กทม|road|soi|district|province|bangkok|\b\d{5}\b)/i;
  const LABEL_RE = /^(ชื่อ(ผู้ขาย|ผู้ให้บริการ|ลูกค้า|ผู้ซื้อ)?|ผู้ขาย|ผู้ให้บริการ|ลูกค้า|ผู้ซื้อ|ที่อยู่|address|seller|vendor|customer|bill\s*to|sold\s*to|name)\s*[:：]?\s*/i;
  const TOTAL_RE = /(รวมทั้งสิ้น|ยอดรวม|รวมเงิน|จำนวนเงินรวม|ยอดสุทธิ|สุทธิ|grand\s*total|total|net)/i;
  const BASE_RE = /(ก่อนภาษี|ก่อน\s*vat|มูลค่าสินค้า|มูลค่าบริการ|ราคาสินค้า|sub\s*total|subtotal|amount\s*before)/i;
  const VAT_RE = /(ภาษีมูลค่าเพิ่ม|vat\s*7|vat)/i;
  const WHT_RE = /(หัก\s*ณ\s*ที่จ่าย|withholding)/i;

  /** own = [{name, taxId}] ของบริษัทเราเอง เพื่อตัดออก */
  function parse(raw, own) {
    own = own || [];
    const text = thaiDigits(String(raw || '')).replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
    const ownIds = new Set(own.map(o => String(o.taxId || '')).filter(Boolean));
    const ownNames = own.map(o => String(o.name || '').replace(/\s/g, '')).filter(n => n.length > 4);
    const isOwnName = s => { const c = s.replace(/\s/g, ''); return ownNames.some(n => c.includes(n) || n.includes(c)); };

    // เลขผู้เสียภาษี 13 หลัก (เว้นวรรค/ขีดได้)
    const taxIds = [];
    for (const m of text.matchAll(/(?<!\d)\d(?:[\s\-]?\d){12}(?!\d)/g)) {
      const d = m[0].replace(/\D/g, ''); if (d.length !== 13) continue;
      taxIds.push({ value: d, valid: idValid(d), own: ownIds.has(d) });
    }
    const taxSorted = uniq(taxIds, x => x.value).sort((a, b) => (a.own - b.own) || (b.valid - a.valid));

    // ชื่อ
    const names = [];
    lines.forEach((l, i) => {
      if (!NAME_RE.test(l) || /^\d/.test(l) || l.length > 120) return;
      let n = l.replace(LABEL_RE, '').replace(/(เลขประจำตัว.*|tax\s*id.*|โทร.*|tel.*)$/i, '').trim();
      const end = n.search(/(จำกัด\s*\(มหาชน\)|จำกัด|ltd\.?|limited)/i);
      if (end >= 0) n = n.slice(0, end).trim() + ' ' + n.slice(end).match(/^(จำกัด\s*\(มหาชน\)|จำกัด|ltd\.?|limited)/i)[0];
      n = n.replace(/\s+/g, ' ').trim();
      if (n.length < 4 || ADDR_RE.test(n) && !/(บริษัท|ห้างหุ้นส่วน|ร้าน)/.test(n)) return;
      names.push({ value: n, own: isOwnName(n), line: i, strong: /(บริษัท|ห้างหุ้นส่วน|หจก|บจก|จำกัด|ltd|limited)/i.test(n) });
    });
    const nameSorted = uniq(names, x => x.value).sort((a, b) => (a.own - b.own) || (b.strong - a.strong) || (a.line - b.line));

    // สาขา
    const branches = [];
    for (const m of text.matchAll(/(สำนักงานใหญ่|head\s*office)|สาขา(?:ที่)?\s*[:：]?\s*(\d{1,5})/gi)) branches.push(m[1] ? 'สำนักงานใหญ่' : String(m[2]).padStart(5, '0'));

    // ที่อยู่: บรรทัดที่มีคำบอกที่อยู่ติดกันรวมเป็นก้อนเดียว
    const addrs = []; let cur = null;
    lines.forEach((l, i) => {
      const isAddr = ADDR_RE.test(l) && !TOTAL_RE.test(l) && !/(เลขประจำตัว|เลขที่ผู้เสียภาษี|tax\s*id|โทร|tel|fax|e-?mail|@|www\.)/i.test(l);
      if (isAddr) {
        const clean = l.replace(LABEL_RE, '').replace(/(โทร|tel|fax|e-?mail)\s*[:：]?.*$/i, '').trim();
        if (cur && cur.end === i - 1) { cur.value += ' ' + clean; cur.end = i; } else { cur = { value: clean, start: i, end: i }; addrs.push(cur); }
      }
    });
    const addresses = uniq(addrs.map(a => ({ value: a.value.replace(/\s+/g, ' ').trim(), own: ownNames.length ? isOwnName(lines.slice(Math.max(0, a.start - 2), a.start).join('')) : false }))
      .filter(a => a.value.length >= 10), x => x.value).sort((a, b) => a.own - b.own).slice(0, 4);

    // ยอดเงิน
    const amounts = [];
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d])/g)) {
        const v = parseFloat(m[1].replace(/,/g, '') + '.' + m[2]); if (!(v > 0)) continue;
        const ctx = l + ' ' + (lines[i - 1] || '');
        const kind = WHT_RE.test(l) ? 'wht' : VAT_RE.test(l) && !TOTAL_RE.test(l) ? 'vat' : BASE_RE.test(l) ? 'base' : TOTAL_RE.test(ctx) ? 'total' : 'other';
        amounts.push({ value: v, kind, line: l });
      }
    });
    // ยอดที่ ×1.07 แล้วเท่ากับยอดรวมอีกตัว = ยอดก่อน VAT
    amounts.forEach(x => { if (x.kind !== 'base' && amounts.some(y => y !== x && Math.abs(x.value * 1.07 - y.value) < 1)) x.kind = 'base'; });
    const rank = { base: 0, total: 1, other: 2, vat: 3, wht: 4 };
    const amountSorted = uniq(amounts.sort((a, b) => (rank[a.kind] - rank[b.kind]) || (b.value - a.value)), x => x.value).slice(0, 8);
    // ถ้ามีแต่ยอดรวม (รวม VAT) และมีบรรทัด VAT → คำนวณยอดก่อน VAT ให้
    const hasVat = /ภาษีมูลค่าเพิ่ม|vat/i.test(text);

    // วันที่
    const dates = [];
    for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/g)) { const d = toISO(m[1], m[2], m[3]); if (d) dates.push(d); }
    TH_MONTHS.forEach(([full, abbr], mi) => {
      const re = new RegExp(`(\\d{1,2})\\s*(?:${full}|${abbr.replace('.', '\\.')}\\.?)\\s*(\\d{4}|\\d{2})`, 'g');
      for (const m of text.matchAll(re)) { const d = toISO(m[1], mi + 1, m[2]); if (d) dates.push(d); }
    });

    return {
      names: nameSorted, taxIds: taxSorted, branches: uniq(branches), addresses, amounts: amountSorted,
      hasVat, dates: uniq(dates), lines, text: text.trim()
    };
  }

  window.Scan = { prepImage, readText, parse, idValid };
})();
