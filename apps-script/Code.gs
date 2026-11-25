/**
 * HugNa — Code.gs (backend ตัวจริง)
 * --------------------------------------------------------------
 * ไฟล์นี้ "ไม่ต้อง" วางใน Apps Script — Loader.gs ดึงจาก GitHub มารันเอง
 * แก้ไฟล์นี้แล้ว push ขึ้น main ก็มีผลภายในไม่กี่นาที (หรือเรียก ?refresh=1)
 *
 * ถ้าเพิ่มบริการ Google ตัวใหม่ (เช่น GmailApp) ต้องเพิ่มใน authorize()
 * ของ Loader.gs แล้ววาง Loader ใหม่ + Deploy ใหม่ ไม่งั้นจะไม่มีสิทธิ์
 * --------------------------------------------------------------
 */
var HUGNA_BACKEND = true;
var VERSION = '1.0.0';

var SESSION_DAYS = 30;
var HASH_ROUNDS = 300;

var SCHEMA = {
  Users:     ['id', 'username', 'name', 'role', 'passHash', 'salt', 'active', 'createdAt', 'lastLogin'],
  Sessions:  ['token', 'userId', 'expires', 'createdAt'],
  Companies: ['id', 'name', 'taxId', 'branch', 'address', 'signer', 'signerTitle', 'sigFileId', 'stampFileId', 'active', 'createdAt', 'updatedAt'],
  Certs:     ['id', 'companyId', 'book', 'no', 'issueDate', 'form', 'seq', 'payeeType', 'payeeName', 'payeeTaxId', 'payeeBranch',
              'payeeAddress', 'payer', 'payerOther', 'items', 'funds', 'totalAmount', 'totalTax', 'useSig', 'useStamp', 'coSnap',
              'status', 'createdBy', 'createdByName', 'createdAt', 'updatedAt'],
  Settings:  ['key', 'value'],
  Log:       ['time', 'userId', 'username', 'action', 'detail']
};
var JSON_FIELDS = { items: 1, funds: 1, coSnap: 1 };

/* ================= entry points ================= */
function doGet(e) { return respond_((e && e.parameter) || {}); }
function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { req = {}; }
  return respond_(req);
}
function respond_(req) {
  var out;
  try {
    out = { ok: true, data: dispatch_(req || {}) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err), code: (err && err.code) || 'error' };
  }
  out.version = VERSION;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

var PUBLIC = { ping: 1, status: 1, setup: 1, login: 1 };
var ADMIN = { saveCompany: 1, deleteCompany: 1, users: 1, saveUser: 1, log: 1, setCodeRef: 1, system: 1 };

function dispatch_(req) {
  var action = String(req.action || 'ping');
  var fn = API[action];
  if (!fn) throw err_('ไม่รู้จักคำสั่ง: ' + action, 'bad_action');
  var user = null;
  if (!PUBLIC[action]) {
    user = auth_(req.token);
    if (ADMIN[action] && user.role !== 'admin') throw err_('ต้องเป็นผู้ดูแลระบบ (admin)', 'forbidden');
  }
  return fn(req, user);
}

/* ================= API ================= */
var API = {
  ping: function () {
    return { version: VERSION, time: new Date().toISOString(), loader: typeof LOADER !== 'undefined' ? LOADER.info() : null };
  },

  status: function () {
    return { version: VERSION, needsSetup: rows_('Users').length === 0 };
  },

  /** สร้างแอดมินคนแรก (ใช้ได้เฉพาะตอนยังไม่มีผู้ใช้) */
  setup: function (req) {
    return withLock_(function () {
      if (rows_('Users').length) throw err_('ตั้งค่าไปแล้ว', 'forbidden');
      var u = makeUser_(req.username, req.name, 'admin', req.password);
      append_('Users', u);
      log_(u, 'setup', 'สร้างแอดมินคนแรก');
      return session_(u);
    });
  },

  login: function (req) {
    var uname = normUser_(req.username);
    var cache = CacheService.getScriptCache();
    var failKey = 'fail_' + uname;
    var fails = parseInt(cache.get(failKey) || '0', 10);
    if (fails >= 8) throw err_('ล็อกอินผิดหลายครั้ง กรุณารอ 10 นาที', 'locked');
    var u = rows_('Users').filter(function (r) { return r.username === uname; })[0];
    if (!u || String(u.active) === 'false' || hash_(String(req.password || ''), u.salt) !== u.passHash) {
      cache.put(failKey, String(fails + 1), 600);
      throw err_('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'bad_login');
    }
    cache.remove(failKey);
    update_('Users', 'id', u.id, { lastLogin: now_() });
    return session_(u);
  },

  logout: function (req, user) {
    var s = rows_('Sessions').filter(function (r) { return r.token === req.token; })[0];
    if (s) deleteRow_('Sessions', s._row);
    CacheService.getScriptCache().remove('sess_' + req.token);
    return true;
  },

  me: function (req, user) { return user; },

  /** ข้อมูลตั้งต้นทั้งหมดที่หน้าแอปต้องใช้ */
  bootstrap: function (req, user) {
    var companies = rows_('Companies').filter(function (c) { return String(c.active) !== 'false'; }).map(cleanCompany_);
    var certs = rows_('Certs').filter(function (c) { return c.status !== 'deleted'; }).map(cleanCert_);
    return { user: user, companies: companies, certs: certs, version: VERSION };
  },

  /** รูปลายเซ็น/ตรายาง (ส่งเป็น data URL) */
  image: function (req) {
    var id = String(req.fileId || '');
    var ok = rows_('Companies').some(function (c) { return c.sigFileId === id || c.stampFileId === id; });
    if (!ok) throw err_('ไม่พบไฟล์', 'not_found');
    var blob = DriveApp.getFileById(id).getBlob();
    return { fileId: id, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  },

  saveCert: function (req, user) {
    var c = req.cert || {};
    if (!c.companyId) throw err_('ยังไม่ได้เลือกบริษัท');
    if (!String(c.payeeName || '').trim()) throw err_('ใส่ชื่อผู้ถูกหักภาษี');
    var items = (c.items || []).filter(function (it) { return num_(it.amount) > 0; });
    if (!items.length) throw err_('ใส่จำนวนเงินอย่างน้อย 1 รายการ');
    return withLock_(function () {
      var company = rows_('Companies').filter(function (x) { return x.id === c.companyId; })[0];
      if (!company) throw err_('ไม่พบบริษัท');
      var existing = c.id ? rows_('Certs').filter(function (x) { return x.id === c.id; })[0] : null;
      if (existing && user.role !== 'admin' && existing.createdBy !== user.id) throw err_('แก้ได้เฉพาะใบที่คุณออกเอง', 'forbidden');
      var book = String(c.book || (new Date().getFullYear() + 543));
      var no = String(c.no || '').trim();
      var all = rows_('Certs');
      if (!no) no = nextNo_(all, c.companyId, book);
      var dup = all.filter(function (x) { return x.companyId === c.companyId && String(x.book) === book && String(x.no) === no && x.id !== c.id && x.status !== 'deleted'; })[0];
      if (dup) throw err_('เลขที่ ' + book + '/' + no + ' ถูกใช้แล้ว', 'duplicate');
      var totalAmount = 0, totalTax = 0;
      items.forEach(function (it) {
        var a = round2_(num_(it.amount)), t = round2_(a * num_(it.rate) / 100);
        totalAmount += a; totalTax += t;
      });
      var rec = {
        id: existing ? existing.id : Utilities.getUuid(),
        companyId: c.companyId, book: book, no: no, issueDate: str_(c.issueDate, 10), form: num_(c.form), seq: str_(c.seq, 20),
        payeeType: c.payeeType === 'p' ? 'p' : 'j', payeeName: str_(c.payeeName, 200), payeeTaxId: digits_(c.payeeTaxId),
        payeeBranch: str_(c.payeeBranch, 60), payeeAddress: str_(c.payeeAddress, 400), payer: num_(c.payer),
        payerOther: str_(c.payerOther, 100), items: items, funds: c.funds || {},
        totalAmount: round2_(totalAmount), totalTax: round2_(totalTax),
        useSig: c.useSig !== false, useStamp: c.useStamp !== false,
        coSnap: existing && existing.coSnap ? existing.coSnap : snapCompany_(company),
        status: 'active',
        createdBy: existing ? existing.createdBy : user.id,
        createdByName: existing ? existing.createdByName : user.name,
        createdAt: existing ? existing.createdAt : now_(),
        updatedAt: now_()
      };
      if (existing) update_('Certs', 'id', rec.id, rec); else append_('Certs', rec);
      log_(user, existing ? 'editCert' : 'newCert', book + '/' + no + ' ' + rec.payeeName);
      return cleanCert_(rec);
    });
  },

  deleteCert: function (req, user) {
    return withLock_(function () {
      var c = rows_('Certs').filter(function (x) { return x.id === req.id; })[0];
      if (!c) throw err_('ไม่พบเอกสาร');
      if (user.role !== 'admin' && c.createdBy !== user.id) throw err_('ลบได้เฉพาะใบที่คุณออกเอง', 'forbidden');
      update_('Certs', 'id', c.id, { status: 'deleted', updatedAt: now_() });
      log_(user, 'deleteCert', c.book + '/' + c.no + ' ' + c.payeeName);
      return true;
    });
  },

  saveCompany: function (req, user) {
    var c = req.company || {};
    if (!String(c.name || '').trim()) throw err_('ใส่ชื่อบริษัท');
    return withLock_(function () {
      var existing = c.id ? rows_('Companies').filter(function (x) { return x.id === c.id; })[0] : null;
      var rec = {
        id: existing ? existing.id : Utilities.getUuid(),
        name: str_(c.name, 200), taxId: digits_(c.taxId), branch: str_(c.branch, 60), address: str_(c.address, 400),
        signer: str_(c.signer, 120), signerTitle: str_(c.signerTitle, 120),
        sigFileId: existing ? existing.sigFileId : '', stampFileId: existing ? existing.stampFileId : '',
        active: true, createdAt: existing ? existing.createdAt : now_(), updatedAt: now_()
      };
      // sig / stamp: undefined = ไม่เปลี่ยน, null/'' = ลบ, 'data:image/...' = รูปใหม่
      ['sig', 'stamp'].forEach(function (k) {
        var field = k + 'FileId', val = c[k];
        if (val === undefined) return;
        if (rec[field]) { try { DriveApp.getFileById(rec[field]).setTrashed(true); } catch (x) {} }
        rec[field] = val ? saveImage_(val, rec.name + '-' + k) : '';
      });
      if (existing) update_('Companies', 'id', rec.id, rec); else append_('Companies', rec);
      log_(user, existing ? 'editCompany' : 'newCompany', rec.name);
      return cleanCompany_(rec);
    });
  },

  deleteCompany: function (req, user) {
    return withLock_(function () {
      var c = rows_('Companies').filter(function (x) { return x.id === req.id; })[0];
      if (!c) throw err_('ไม่พบบริษัท');
      update_('Companies', 'id', c.id, { active: false, updatedAt: now_() });
      log_(user, 'deleteCompany', c.name);
      return true;
    });
  },

  users: function () {
    return rows_('Users').map(cleanUser_);
  },

  saveUser: function (req, user) {
    var u = req.user || {};
    return withLock_(function () {
      var all = rows_('Users');
      var existing = u.id ? all.filter(function (x) { return x.id === u.id; })[0] : null;
      if (existing) {
        var patch = { name: str_(u.name || existing.name, 120), role: u.role === 'admin' ? 'admin' : 'user',
                      active: u.active === false ? false : true };
        if (existing.id === user.id && (patch.role !== 'admin' || !patch.active)) throw err_('ลดสิทธิ์หรือปิดบัญชีตัวเองไม่ได้');
        if (u.password) {
          if (String(u.password).length < 6) throw err_('รหัสผ่านอย่างน้อย 6 ตัว');
          patch.salt = Utilities.getUuid(); patch.passHash = hash_(String(u.password), patch.salt);
        }
        update_('Users', 'id', existing.id, patch);
        if (u.password || patch.active === false) killSessions_(existing.id);
        log_(user, 'editUser', existing.username);
        return cleanUser_(Object.assign ? Object.assign({}, existing, patch) : existing);
      }
      var nu = makeUser_(u.username, u.name, u.role === 'admin' ? 'admin' : 'user', u.password);
      if (all.some(function (x) { return x.username === nu.username; })) throw err_('ชื่อผู้ใช้นี้มีแล้ว', 'duplicate');
      append_('Users', nu);
      log_(user, 'newUser', nu.username);
      return cleanUser_(nu);
    });
  },

  changePassword: function (req, user) {
    var u = rows_('Users').filter(function (x) { return x.id === user.id; })[0];
    if (hash_(String(req.oldPassword || ''), u.salt) !== u.passHash) throw err_('รหัสผ่านเดิมไม่ถูกต้อง');
    if (String(req.newPassword || '').length < 6) throw err_('รหัสผ่านใหม่อย่างน้อย 6 ตัว');
    var salt = Utilities.getUuid();
    update_('Users', 'id', u.id, { salt: salt, passHash: hash_(String(req.newPassword), salt) });
    killSessions_(u.id, req.token);
    log_(user, 'changePassword', '');
    return true;
  },

  log: function () {
    var r = rows_('Log');
    return r.slice(Math.max(0, r.length - 200)).reverse().map(function (x) { delete x._row; return x; });
  },

  system: function () {
    var sh = ss_();
    return { version: VERSION, loader: typeof LOADER !== 'undefined' ? LOADER.info() : null,
             sheetUrl: sh.getUrl(), folderUrl: folder_().getUrl() };
  },

  /** ย้อน/เลือกเวอร์ชัน backend: ref = 'main' หรือ tag เช่น 'v1.0.0' */
  setCodeRef: function (req, user) {
    if (typeof LOADER === 'undefined') throw err_('ไม่ได้รันผ่าน Loader');
    var info = LOADER.setRef(String(req.ref || 'main'));
    log_(user, 'setCodeRef', String(req.ref));
    return info;
  }
};

/* ================= auth ================= */
function auth_(token) {
  if (!token) throw err_('กรุณาเข้าสู่ระบบ', 'auth');
  var cache = CacheService.getScriptCache();
  var hit = cache.get('sess_' + token);
  if (hit) return JSON.parse(hit);
  var s = rows_('Sessions').filter(function (r) { return r.token === token; })[0];
  if (!s || new Date(s.expires) < new Date()) throw err_('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'auth');
  var u = rows_('Users').filter(function (r) { return r.id === s.userId; })[0];
  if (!u || String(u.active) === 'false') throw err_('บัญชีถูกปิดใช้งาน', 'auth');
  var clean = cleanUser_(u);
  cache.put('sess_' + token, JSON.stringify(clean), 1800);
  return clean;
}
function session_(u) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  append_('Sessions', { token: token, userId: u.id, expires: exp, createdAt: now_() });
  // ล้างเซสชันที่หมดอายุทิ้งเป็นครั้งคราว
  if (Math.random() < 0.1) cleanupSessions_();
  return { token: token, expires: exp, user: cleanUser_(u) };
}
function killSessions_(userId, keepToken) {
  var cache = CacheService.getScriptCache();
  var rs = rows_('Sessions').filter(function (r) { return r.userId === userId && r.token !== keepToken; });
  for (var i = rs.length - 1; i >= 0; i--) { deleteRow_('Sessions', rs[i]._row); cache.remove('sess_' + rs[i].token); }
}
function cleanupSessions_() {
  var now = new Date();
  var rs = rows_('Sessions').filter(function (r) { return new Date(r.expires) < now; });
  for (var i = rs.length - 1; i >= 0; i--) deleteRow_('Sessions', rs[i]._row);
}
function makeUser_(username, name, role, password) {
  var uname = normUser_(username);
  if (!/^[a-z0-9._-]{3,30}$/.test(uname)) throw err_('ชื่อผู้ใช้ใช้ a-z 0-9 . _ - ยาว 3–30 ตัว');
  if (String(password || '').length < 6) throw err_('รหัสผ่านอย่างน้อย 6 ตัว');
  var salt = Utilities.getUuid();
  return { id: Utilities.getUuid(), username: uname, name: str_(name || uname, 120), role: role,
           passHash: hash_(String(password), salt), salt: salt, active: true, createdAt: now_(), lastLogin: '' };
}
function hash_(pw, salt) {
  var v = salt + '|' + pw;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    v = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v + '|' + salt, Utilities.Charset.UTF_8));
  }
  return v;
}
function normUser_(u) { return String(u || '').trim().toLowerCase(); }
function cleanUser_(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: String(u.active) !== 'false',
           createdAt: u.createdAt, lastLogin: u.lastLogin };
}

/* ================= data helpers ================= */
var SS_ = null;
function ss_() {
  if (SS_) return SS_;
  SS_ = SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw err_('ไม่พบ Google Sheet — ต้องสร้าง Apps Script จากในชีต (ส่วนขยาย > Apps Script)');
    SS_ = SpreadsheetApp.openById(id);
  }
  return SS_;
}
var SHEET_CACHE_ = {};
function sheet_(name) {
  if (SHEET_CACHE_[name]) return SHEET_CACHE_[name];
  var ss = ss_(), sh = ss.getSheetByName(name), cols = SCHEMA[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
    if (missing.length) sh.getRange(1, head.filter(String).length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  SHEET_CACHE_[name] = sh;
  return sh;
}
function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}
function rows_(name) {
  var sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return [];
  var head = headers_(sh);
  var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i].join('') === '') continue;
    var o = { _row: i + 2 };
    for (var j = 0; j < head.length; j++) {
      if (!head[j]) continue;
      var v = vals[i][j];
      if (v instanceof Date) v = v.toISOString();
      if (JSON_FIELDS[head[j]]) { try { v = v ? JSON.parse(v) : (head[j] === 'items' ? [] : {}); } catch (x) { v = {}; } }
      o[head[j]] = v;
    }
    out.push(o);
  }
  return out;
}
function toRow_(head, obj, base) {
  return head.map(function (h, j) {
    var v = obj.hasOwnProperty(h) ? obj[h] : (base ? base[j] : '');
    if (JSON_FIELDS[h] && typeof v !== 'string') v = JSON.stringify(v || (h === 'items' ? [] : {}));
    if (v === undefined || v === null) v = '';
    // กันสูตรชีต (formula injection) และให้เลขที่/เลขภาษีเป็นข้อความ
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) v = "'" + v;
    if (typeof v === 'string' && (/^\d{4,}$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v))) v = "'" + v;
    return v;
  });
}
function append_(name, obj) {
  var sh = sheet_(name), head = headers_(sh);
  sh.appendRow(toRow_(head, obj));
}
function update_(name, key, id, patch) {
  var r = rows_(name).filter(function (x) { return x[key] === id; })[0];
  if (!r) throw err_('ไม่พบข้อมูล');
  var sh = sheet_(name), head = headers_(sh);
  var base = sh.getRange(r._row, 1, 1, head.length).getValues()[0];
  sh.getRange(r._row, 1, 1, head.length).setValues([toRow_(head, patch, base)]);
}
function deleteRow_(name, row) { sheet_(name).deleteRow(row); }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw err_('ระบบไม่ว่าง ลองใหม่อีกครั้ง', 'busy');
  try { return fn(); } finally { lock.releaseLock(); }
}
function log_(user, action, detail) {
  try { append_('Log', { time: now_(), userId: user ? user.id : '', username: user ? user.username : '', action: action, detail: detail }); } catch (x) {}
}

/* ================= files (Drive) ================= */
function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  var f = DriveApp.createFolder('HugNa Files');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
function saveImage_(dataUrl, name) {
  var m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw err_('รูปไม่ถูกต้อง');
  var bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 1500000) throw err_('รูปใหญ่เกินไป');
  var blob = Utilities.newBlob(bytes, m[1], name + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  return folder_().createFile(blob).getId();
}

/* ================= misc ================= */
function nextNo_(all, companyId, book) {
  var max = 0;
  all.forEach(function (x) { if (x.companyId === companyId && String(x.book) === book) max = Math.max(max, parseInt(x.no, 10) || 0); });
  return ('000' + (max + 1)).slice(-Math.max(4, String(max + 1).length));
}
function snapCompany_(c) {
  return { name: c.name, taxId: String(c.taxId), branch: c.branch, address: c.address, signer: c.signer, signerTitle: c.signerTitle };
}
function cleanCompany_(c) {
  return { id: c.id, name: c.name, taxId: String(c.taxId || ''), branch: c.branch, address: c.address, signer: c.signer,
           signerTitle: c.signerTitle, sigFileId: c.sigFileId || '', stampFileId: c.stampFileId || '', updatedAt: c.updatedAt };
}
function cleanCert_(c) {
  var o = {};
  SCHEMA.Certs.forEach(function (k) { o[k] = c[k]; });
  ['book', 'no', 'seq', 'payeeTaxId'].forEach(function (k) { o[k] = o[k] == null ? '' : String(o[k]); });
  o.issueDate = String(o.issueDate || '').slice(0, 10);
  o.useSig = String(o.useSig) !== 'false'; o.useStamp = String(o.useStamp) !== 'false';
  o.form = num_(o.form); o.payer = num_(o.payer);
  return o;
}
function err_(msg, code) { var e = new Error(msg); e.code = code || 'error'; return e; }
function now_() { return new Date().toISOString(); }
function num_(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function round2_(n) { return Math.round((n + 1e-9) * 100) / 100; }
function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 13); }
