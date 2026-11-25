# HugNa — สรุปโปรเจกต์ (สำหรับแชตถัดไปทำต่อ)

> อ่านไฟล์นี้ก่อนแก้อะไรทุกครั้ง และ **อัปเดตไฟล์นี้ทุกครั้งที่แก้โค้ด**

## ระบบนี้คืออะไร
เว็บแอปออก **หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)** สำหรับพนักงานในบริษัท
- ออกในนามได้หลายบริษัท (สลับจากเมนูบนสุด)
- เลือกอัตราหักต่อรายการ (1, 1.5, 2, 3, 5, 10, 15% หรือกำหนดเอง) + ปุ่มลัด + ถอด VAT 7%
- ใส่ลายเซ็น (วาด/อัปโหลด) และตรายาง ลงบนเอกสาร
- บันทึกเอกสาร ค้นหา กรองตามเดือน สรุปยอดภาษี
- ส่งออก PDF (ฉบับที่ 1, 2 หรือทั้งคู่) / PNG — มือถือใช้เมนูแชร์
- ล็อกอินพนักงาน สิทธิ์ `admin` / `user`
- PWA ติดตั้งบน iPhone ได้

## สถาปัตยกรรม
```
iPhone / คอม (เบราว์เซอร์, PWA)
   │  https://jsungkapo.github.io/Hugna/   ← GitHub Pages (deploy จาก main / root)
   │  fetch POST text/plain {action, token, ...}
   ▼
Apps Script Web App  …/exec
   Loader.gs (วางครั้งเดียว) ──ดึง──▶ GitHub raw: apps-script/Code.gs
   │                                 (แคช 5 นาที, สำรองใน Script Properties)
   ├─ Google Sheet (bound): แท็บ Users, Sessions, Companies, Certs, Settings, Log
   └─ Google Drive: โฟลเดอร์ "HugNa Files" (รูปลายเซ็น/ตรายาง, ไม่แชร์สาธารณะ)
```
- ไม่ใช้ Claude API ในแอป
- Apps Script ต้องสร้างจาก "ส่วนขยาย > Apps Script" ในชีต (bound script) เพื่อให้ `getActiveSpreadsheet()` ใช้ได้

## ไฟล์ใน repo
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้า (หน้า login/setup/แอป) — ลิงก์ js/css มี `?v=<เวอร์ชัน>` |
| `css/app.css` | สไตล์ทั้งหมด (มือถือก่อน, ≥900px เป็นแบบคอม) + สไตล์กระดาษ `.sheet` |
| `js/config.js` | `VERSION`, `API_URL` (URL /exec), `REPO` |
| `js/api.js` | เรียก backend, เก็บ token/แคชใน localStorage (`hugna_*`) |
| `js/cert.js` | สร้าง HTML ใบ 50 ทวิ, จำนวนเงินเป็นตัวอักษรไทย, ส่งออก PDF/PNG (html2canvas 1.4.1 + jsPDF 2.5.1 โหลดจาก cdnjs ตอนกดส่งออก) |
| `js/app.js` | UI ทั้งหมด: routing ด้วย hash `#list #edit #companies #settings` |
| `sw.js` | service worker: หน้าเว็บ network-first, ไฟล์ที่มี ?v= cache-first, ไม่แคช API |
| `manifest.json`, `icons/` | PWA |
| `version.json` | เวอร์ชันล่าสุด — แอปเช็กไฟล์นี้เพื่อขึ้นแถบ "มีเวอร์ชันใหม่" |
| `apps-script/Loader.gs` | วางใน Apps Script ครั้งเดียว |
| `apps-script/Code.gs` | backend ตัวจริง (ต้องมีคำว่า `HUGNA_BACKEND` และ `doGet`/`doPost`) |
| `scripts/bump-version.sh` | เปลี่ยนเลขเวอร์ชันทุกจุด + เพิ่ม CHANGELOG |
| `SETUP.md` | วิธีติดตั้งครั้งแรกทีละขั้น |
| `CHANGELOG.md` | บันทึกการแก้ไขทุกเวอร์ชัน |

## ข้อมูลใน Google Sheet
- **Users**: id, username, name, role(admin/user), passHash, salt, active, createdAt, lastLogin — รหัสผ่าน SHA-256 + salt วน 300 รอบ
- **Sessions**: token, userId, expires (30 วัน), createdAt — แคชใน CacheService 30 นาที
- **Companies**: id, name, taxId, branch, address, signer, signerTitle, sigFileId, stampFileId, active, createdAt, updatedAt (ลบ = active false)
- **Certs**: id, companyId, book, no, issueDate, form(0–6), seq, payeeType(j/p), payeeName, payeeTaxId, payeeBranch, payeeAddress, payer(0–3), payerOther, items(JSON), funds(JSON), totalAmount, totalTax, useSig, useStamp, coSnap(JSON สำเนาข้อมูลบริษัทตอนออกครั้งแรก), status(active/deleted), createdBy, createdByName, createdAt, updatedAt
  - items: `[{id, cat:'c1'|'c2'|'c3'|'c4a'|'c4b'|'c5'|'c6', desc, date, amount, rate, custom?}]`
- **Settings**: key/value (สำรองไว้ใช้)
- **Log**: time, userId, username, action, detail
- ค่าที่เป็นตัวเลขยาว/วันที่ ถูกเติม `'` นำหน้าก่อนเขียน กันชีตแปลงรูปแบบ; ค่าขึ้นต้น = + - @ ก็เติม `'` กันสูตร
- Script Properties: `FOLDER_ID`, `CODE_REF`, `BACKUP_*` (โค้ดสำรองแบ่งท่อน)

## API (action)
- สาธารณะ: `ping`, `status` (needsSetup), `setup` (สร้าง admin แรก), `login`
- ล็อกอินแล้ว: `me`, `logout`, `bootstrap` (user+companies+certs), `image` (fileId → dataURL), `saveCert`, `deleteCert`, `changePassword`
- admin: `saveCompany` (sig/stamp: undefined=ไม่เปลี่ยน, null=ลบ, dataURL=ใหม่), `deleteCompany`, `users`, `saveUser`, `log`, `system`, `setCodeRef`
- สิทธิ์ user: แก้/ลบเฉพาะใบที่ตัวเองออก; admin ทำได้ทุกอย่าง
- เลขที่เอกสาร: ถ้าเว้นว่าง backend รันให้ (ต่อบริษัท+เล่ม) ภายใต้ LockService และกันเลขซ้ำ

## เวอร์ชันและการอัปเดต (ขั้นตอนที่ต้องทำทุกครั้งที่แก้)
1. แก้โค้ด
2. `scripts/bump-version.sh X.Y.Z "สรุปสิ่งที่แก้"` (patch = แก้บั๊ก, minor = ฟีเจอร์ใหม่)
3. อัปเดต PROJECT_NOTES.md (ส่วน "สถานะล่าสุด" และส่วนที่เกี่ยวข้อง)
4. `git add -A && git commit -m "vX.Y.Z: ..." && git tag vX.Y.Z && git push origin main --tags`
- หน้าเว็บ: GitHub Pages อัปเดตใน 1–2 นาที, ผู้ใช้เห็นแถบ "มีเวอร์ชันใหม่" หรือกด "อัปเดตระบบเป็นเวอร์ชันล่าสุด" ในแท็บตั้งค่า (ล้างแคช SW + เรียก `?refresh=1`)
- backend: Loader ดึง Code.gs ใหม่ภายใน 5 นาที หรือทันทีเมื่อเรียก `<exec>?refresh=1`
- ถ้า Code.gs ใช้บริการ Google ใหม่ (เช่น GmailApp, CalendarApp) → ต้องเพิ่มใน `authorize()` ของ Loader.gs, เพิ่ม LOADER_VERSION, แล้ว**บอกผู้ใช้ให้วาง Loader ใหม่ + Deploy (Manage deployments → New version)** ตาม SETUP.md

## การย้อนเวอร์ชัน
- **backend**: แท็บตั้งค่า (admin) → "เวอร์ชัน backend" เลือก tag → ใช้เวอร์ชันนี้ (ตั้ง Script Property `CODE_REF`). กลับมาใช้ล่าสุด = เลือก `main`
- ถ้า GitHub ล่ม Loader ใช้โค้ดสำรองล่าสุดใน Script Properties อัตโนมัติ (`BACKUP`, และ `BACKUP_PREV` เวอร์ชันก่อนหน้า)
- **หน้าเว็บ**: `git checkout vX.Y.Z -- index.html css js sw.js manifest.json` แล้ว bump เป็นเวอร์ชันใหม่และ push (ไม่ใช้ force push)

## ข้อควรระวัง
- Apps Script web app รับ POST แบบ `text/plain` เท่านั้น (กัน CORS preflight) — อย่าเปลี่ยน Content-Type
- ห้ามใส่ความลับใน repo (repo เป็น public) — ข้อมูลจริงอยู่ในชีต/ไดรฟ์
- รูปลายเซ็น/ตรายางย่อเหลือ ≤ ~150KB ฝั่งหน้าเว็บก่อนส่ง และแคชใน localStorage ตาม fileId
- `bootstrap` ส่งเอกสารทั้งหมด — ถ้าเกินหลายพันใบ ควรทำแบ่งหน้า/กรองตามปีฝั่ง backend

## สถานะล่าสุด
- v1.0.1 (2026-11-25): ผู้ใช้ทำ SETUP.md ครบแล้ว (เปิด Pages, สร้างชีต, วาง Loader, Deploy)
- `API_URL` = https://script.google.com/macros/s/AKfycbzkiifhCDfL4DgNFxz1zuNsFn9aGKfEUKRd_ZMjG1NSiEo0uVCixl40A1v188eqh-WU/exec
- หน้าเว็บ: https://jsungkapo.github.io/Hugna/ (ชื่อ repo ขึ้นต้น H ใหญ่ — path ของ Pages แยกตัวพิมพ์)
- เซสชันของ Claude push ได้เฉพาะ branch main — push tag ไม่ได้ ให้ผู้ใช้สร้าง tag ผ่านหน้า Releases (https://github.com/jsungkapo/Hugna/releases/new, target = main)
- ทดสอบแล้ว: backend ด้วย mock ของ Apps Script ใน Node, หน้าเว็บด้วย Chrome headless (มือถือ/คอม)
- ยังไม่ได้ยืนยัน: การทำงานกับ Apps Script จริง และการส่งออก PDF บน iPhone จริง

## ไอเดียทำต่อ
- ส่งออกรายงานรายเดือนสำหรับยื่น ภ.ง.ด.3/53 (Excel/CSV)
- ส่งใบให้ผู้ถูกหักทางอีเมล (ต้องเพิ่ม GmailApp → วาง Loader ใหม่)
- สมุดรายชื่อผู้ถูกหักภาษีแยกแท็บ
