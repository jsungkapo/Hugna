/**
 * HugNa — Loader.gs
 * --------------------------------------------------------------
 * วางไฟล์นี้ใน Apps Script "ครั้งเดียว" แล้ว Deploy เป็น Web App
 * Loader จะดึง apps-script/Code.gs ตัวจริงจาก GitHub มารันให้เอง
 *
 *  - แคชโค้ดไว้สั้น ๆ (CACHE_SECONDS) เพื่อความเร็ว
 *  - เก็บสำรองโค้ดล่าสุดที่ใช้ได้ไว้ใน Script Properties
 *    ถ้า GitHub ล่ม จะใช้ตัวสำรองแทน
 *  - เรียก <URL>/exec?refresh=1 เพื่อบังคับดึงโค้ดใหม่ทันที
 *  - Script Property "CODE_REF" = branch หรือ tag ที่จะใช้ (ค่าเริ่มต้น main)
 *    ใช้ย้อนเวอร์ชัน backend ได้ เช่น CODE_REF = v1.0.0
 *
 * ห้ามแก้ไฟล์นี้บ่อย — ถ้าแก้ต้อง Deploy ใหม่ทุกครั้ง
 * --------------------------------------------------------------
 */
var LOADER_VERSION = '2';
var REPO = 'jsungkapo/Hugna';
var CODE_PATH = 'apps-script/Code.gs';
var CACHE_SECONDS = 300;          // แคชโค้ด 5 นาที
var PROP_CHUNK = 2500;            // Script Properties รับได้ ~9KB ต่อค่า (ภาษาไทย 3 ไบต์/ตัว)
var CACHE_CHUNK = 30000;          // CacheService รับได้ 100KB ต่อค่า

function doGet(e) { return run_('doGet', e); }
function doPost(e) { return run_('doPost', e); }

/**
 * รันฟังก์ชันนี้ 1 ครั้งจากหน้า Apps Script (เลือก authorize แล้วกด Run)
 * เพื่อให้ Google ขอสิทธิ์ที่ระบบต้องใช้ทั้งหมด
 */
function authorize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getName();
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://raw.githubusercontent.com/' + REPO + '/main/version.json', { muteHttpExceptions: true });
  CacheService.getScriptCache().put('auth_test', '1', 10);
  PropertiesService.getScriptProperties().getProperty('CODE_REF');
  LockService.getScriptLock();
  ScriptApp.getOAuthToken();
  Utilities.getUuid();
  Logger.log('อนุญาตสิทธิ์เรียบร้อย — Loader ' + LOADER_VERSION);
}

/**
 * ไม่ต้องรัน — มีไว้ให้ Google เห็นว่าระบบต้องใช้สิทธิ์ "เขียน" ชีตและ Drive
 * (Google ดูสิทธิ์จากโค้ดในไฟล์นี้เท่านั้น ไม่ได้ดูจาก Code.gs บน GitHub)
 */
function scopesNeeded_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.insertSheet('x').getRange(1, 1).setValue('x');
  var folder = DriveApp.createFolder('x');
  folder.createFile(Utilities.newBlob('x')).setTrashed(true);
  DriveApp.getFileById('x').getBlob();
  DriveApp.getFolderById('x').createFolder('x');
}

var MODULE_ = null;
var CURRENT_ = null;

function run_(fn, e) {
  var p = (e && e.parameter) || {};
  try {
    var mod = getModule_(p.refresh === '1');
    return mod[fn](e);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, code: 'loader', error: 'Loader: ' + (err && err.message ? err.message : err), loader: LOADER.info()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getModule_(force) {
  if (MODULE_ && !force) return MODULE_;
  var src = getSource_(force);
  CURRENT_ = src;
  MODULE_ = compile_(src.code);
  return MODULE_;
}

function compile_(code) {
  var factory = new Function('LOADER', code +
    '\n;return { doGet: typeof doGet === "function" ? doGet : null, doPost: typeof doPost === "function" ? doPost : null };');
  var mod = factory(LOADER);
  if (!mod.doGet || !mod.doPost) throw new Error('Code.gs ต้องมี doGet และ doPost');
  return mod;
}

function getSource_(force) {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var ref = props.getProperty('CODE_REF') || 'main';
  var key = 'code_' + ref;

  if (!force) {
    var cached = bigGet_(cache, key);
    if (cached) return { code: cached, from: 'cache', ref: ref };
  } else if (cache.get('refresh_lock')) {
    // กันการกด refresh รัว ๆ — ภายใน 15 วินาทีใช้ของในแคช
    var c2 = bigGet_(cache, key);
    if (c2) return { code: c2, from: 'cache', ref: ref };
  }
  if (force) cache.put('refresh_lock', '1', 15);

  var code = null, lastErr = null;
  try {
    code = fetchCode_(ref, force);
    validate_(code);
  } catch (err) { lastErr = err; code = null; }

  if (code) {
    bigPut_(cache, key, code, CACHE_SECONDS);
    var cur = propGet_(props, 'BACKUP');
    if (cur !== code) {
      if (cur) {
        propPut_(props, 'BACKUP_PREV', cur);
        props.setProperty('BACKUP_PREV_AT', props.getProperty('BACKUP_AT') || '');
      }
      propPut_(props, 'BACKUP', code);
      props.setProperty('BACKUP_AT', new Date().toISOString());
      props.setProperty('BACKUP_REF', ref);
    }
    return { code: code, from: 'github', ref: ref };
  }

  var backup = propGet_(props, 'BACKUP');
  if (backup) {
    bigPut_(cache, key, backup, 60);
    return { code: backup, from: 'backup', ref: props.getProperty('BACKUP_REF') || ref, error: String(lastErr) };
  }
  throw lastErr || new Error('ไม่พบโค้ด');
}

function fetchCode_(ref, fresh) {
  var tries = [];
  if (fresh) {
    tries.push({ url: 'https://api.github.com/repos/' + REPO + '/contents/' + CODE_PATH + '?ref=' + encodeURIComponent(ref),
                 headers: { Accept: 'application/vnd.github.raw' } });
  }
  tries.push({ url: 'https://raw.githubusercontent.com/' + REPO + '/' + encodeURIComponent(ref) + '/' + CODE_PATH +
               (fresh ? '?t=' + Date.now() : ''), headers: {} });
  var msg = '';
  for (var i = 0; i < tries.length; i++) {
    var res = UrlFetchApp.fetch(tries[i].url, { muteHttpExceptions: true, headers: tries[i].headers });
    if (res.getResponseCode() === 200) return res.getContentText('UTF-8');
    msg = 'GitHub HTTP ' + res.getResponseCode();
  }
  throw new Error(msg);
}

function validate_(code) {
  if (!code || code.indexOf('HUGNA_BACKEND') < 0) throw new Error('ไฟล์ที่ดึงมาไม่ใช่ Code.gs ของ HugNa');
  new Function('LOADER', code); // ตรวจว่า syntax ถูก (ยังไม่รัน)
}

/* ---------- ที่เก็บค่ายาว ๆ แบบแบ่งท่อน ---------- */
function propPut_(props, key, val) {
  var old = parseInt(props.getProperty(key + '_n') || '0', 10);
  var n = Math.ceil(val.length / PROP_CHUNK);
  var obj = {};
  for (var i = 0; i < n; i++) obj[key + '_' + i] = val.substr(i * PROP_CHUNK, PROP_CHUNK);
  obj[key + '_n'] = String(n);
  props.setProperties(obj);
  for (var j = n; j < old; j++) props.deleteProperty(key + '_' + j);
}
function propGet_(props, key) {
  var n = parseInt(props.getProperty(key + '_n') || '0', 10);
  if (!n) return null;
  var all = props.getProperties(), s = '';
  for (var i = 0; i < n; i++) { if (all[key + '_' + i] == null) return null; s += all[key + '_' + i]; }
  return s;
}
function bigPut_(cache, key, val, sec) {
  var n = Math.ceil(val.length / CACHE_CHUNK), obj = {};
  for (var i = 0; i < n; i++) obj[key + '_' + i] = val.substr(i * CACHE_CHUNK, CACHE_CHUNK);
  obj[key + '_n'] = String(n);
  try { cache.putAll(obj, sec); } catch (e) {}
}
function bigGet_(cache, key) {
  var n = parseInt(cache.get(key + '_n') || '0', 10);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '_' + i);
  var got = cache.getAll(keys), s = '';
  for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; s += got[keys[j]]; }
  return s;
}

/* ---------- สิ่งที่ Code.gs เรียกใช้ได้ผ่านตัวแปร LOADER ---------- */
var LOADER = {
  version: LOADER_VERSION,
  repo: REPO,
  info: function () {
    var p = PropertiesService.getScriptProperties();
    return {
      loaderVersion: LOADER_VERSION,
      ref: p.getProperty('CODE_REF') || 'main',
      from: CURRENT_ ? CURRENT_.from : null,
      fetchError: CURRENT_ && CURRENT_.error ? CURRENT_.error : null,
      backupAt: p.getProperty('BACKUP_AT'),
      backupRef: p.getProperty('BACKUP_REF'),
      previousBackupAt: p.getProperty('BACKUP_PREV_AT')
    };
  },
  /** เปลี่ยน branch/tag ที่ใช้ (ย้อนเวอร์ชัน) — ใช้ "main" เพื่อกลับมาใช้ล่าสุด */
  setRef: function (ref) {
    if (!/^[A-Za-z0-9._\-\/]{1,100}$/.test(ref || '')) throw new Error('ชื่อ branch/tag ไม่ถูกต้อง');
    var code = fetchCode_(ref, true);
    validate_(code);
    PropertiesService.getScriptProperties().setProperty('CODE_REF', ref);
    bigPut_(CacheService.getScriptCache(), 'code_' + ref, code, CACHE_SECONDS);
    return LOADER.info();
  }
};
