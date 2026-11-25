/* HugNa — ตัวเรียก backend (Apps Script /exec) */
(function () {
  'use strict';
  const CFG = window.HUGNA_CONFIG;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('hugna_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hugna_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('hugna_' + k); } catch (e) {} }
  };

  const API = {
    LS,
    url() { return (CFG.API_URL || LS.get('api_url', '') || '').trim(); },
    setUrl(u) { LS.set('api_url', String(u || '').trim()); },
    token() { return LS.get('token', ''); },
    setToken(t) { if (t) LS.set('token', t); else LS.del('token'); },

    /** เรียกคำสั่ง — ใช้ POST แบบ text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script */
    async call(action, payload, opt) {
      const url = this.url();
      if (!url) throw Object.assign(new Error('ยังไม่ได้ตั้งค่า URL ของระบบ'), { code: 'no_url' });
      const body = JSON.stringify(Object.assign({ action, token: this.token() }, payload || {}));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), (opt && opt.timeout) || 45000);
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: ctrl.signal, redirect: 'follow' });
      } catch (e) {
        throw Object.assign(new Error(e.name === 'AbortError' ? 'ระบบตอบช้าเกินไป ลองใหม่อีกครั้ง' : 'เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ต'), { code: 'network' });
      } finally { clearTimeout(timer); }
      let j;
      try { j = await res.json(); } catch (e) { throw Object.assign(new Error('ระบบตอบกลับผิดรูปแบบ (ตรวจ URL /exec และการ Deploy)'), { code: 'bad_response' }); }
      if (j.version) API.backendVersion = j.version;
      if (!j.ok) {
        if (j.code === 'auth') { this.setToken(''); if (API.onAuthLost) API.onAuthLost(j.error); }
        throw Object.assign(new Error(j.error || 'เกิดข้อผิดพลาด'), { code: j.code });
      }
      return j.data;
    },

    /** บังคับให้ Loader ดึง Code.gs ใหม่จาก GitHub */
    async refreshBackend() {
      const url = this.url(); if (!url) return null;
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'refresh=1&action=ping&t=' + Date.now(), { redirect: 'follow' });
      const j = await res.json();
      if (j.version) API.backendVersion = j.version;
      return j;
    },

    backendVersion: null,
    onAuthLost: null
  };
  window.API = API;
})();
