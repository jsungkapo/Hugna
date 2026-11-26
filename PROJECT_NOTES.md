# HugNa — สรุปโปรเจกต์ (สำหรับแชตถัดไปทำต่อ)

> อ่านไฟล์นี้ก่อนแก้อะไรทุกครั้ง และ **อัปเดตไฟล์นี้ทุกครั้งที่แก้โค้ด**

## ระบบนี้คืออะไร
เว็บแอปออก **หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)** สำหรับพนักงานในบริษัท
- ออกในนามได้หลายบริษัท (สลับจากเมนูบนสุด)
- เลือกอัตราหักต่อรายการ (1, 1.5, 2, 3, 5, 10, 15% หรือกำหนดเอง) + ปุ่มลัด + ถอด VAT 7%
- ใส่ลายเซ็น (วาด/อัปโหลด) และตรายาง ลงบนเอกสาร
- บันทึกเอกสาร ค้นหา กรองตามเดือนและตามกลุ่ม สรุปยอดภาษี
- รายชื่อผู้ถูกหักภาษี (แท็บ ★ รายชื่อ): ดาว = รายการโปรด (แยกของแต่ละคน), ติด tag/กลุ่ม เช่น ช่างภาพ ซื้อสินค้า,
  รายการประจำ (ประเภทเงินได้ + รายละเอียด + อัตรา) เติมให้อัตโนมัติตอนออกใบ; ในหน้าออกใบมีแถบรายชื่อโปรดให้แตะเลือก
- ส่งออก PDF (ฉบับที่ 1, 2 หรือทั้งคู่) / PNG — มือถือใช้เมนูแชร์
- ไฟล์แนบ: รูปบัตรประชาชน (รายชื่อบุคคลธรรมดา) / เอกสารประกอบ (นิติบุคคล) และ invoice (รูปหรือ PDF) ต่อใบ
  เก็บใน Drive โฟลเดอร์ย่อย "บัตรประชาชน", "Invoice", "เอกสารอื่น" ใต้ "HugNa Files" (ไม่แชร์สาธารณะ ดูผ่านแอปที่ล็อกอินเท่านั้น)
  ไฟล์ที่แนบก่อนบันทึกจะรอ (pending) แล้วอัปโหลดหลังบันทึกใบ/รายชื่อ; ตอนสแกนติ๊ก "แนบรูปนี้" ได้; เนื้อไฟล์ไม่เก็บใน localStorage (ข้อมูลส่วนบุคคล)
- สแกนรูป (ถ่าย/เลือกรูป) → อ่านข้อความ → แยก ชื่อ, เลขผู้เสียภาษี (ตรวจ checksum), สาขา, ที่อยู่, ยอดเงิน (ก่อน VAT/ยอดรวม/VAT/หัก ณ ที่จ่าย), วันที่
  เลือกแล้วกด "ใส่ลงใบ" หรือ "สร้างรายชื่อ"; แตะคัดลอกทีละช่อง/ทีละบรรทัด/ทั้งหมด; ตัดข้อมูลของบริษัทเราเองออก (ติดป้าย "บริษัทของเรา")
- ล็อกอินพนักงาน สิทธิ์ `admin` / `user`
- PWA ติดตั้งบน iPhone ได้

## แบรนด์ / ธีม
- โลโก้: ตัวมาสคอตกระดาษใส่แว่น ชุดเขียว เนกไทส้ม + ตัวอักษร "Hugna" (Hug เขียว / na ส้ม) — ไฟล์ต้นฉบับจากผู้ใช้ ตัดเป็น `img/logo.png` (เต็ม), `img/mascot.png`, `img/wordmark.png` พื้นโปร่งใส
- ไอคอน: `icons/` — favicon 32/64 = มาสคอตอย่างเดียว (พื้นโปร่ง); apple-touch 180, 192, 512, maskable 512 = มาสคอต + คำว่า Hugna บนพื้นขาว (ผู้ใช้ขอให้ไอคอน iPhone มีคำว่า hugna)
- สีหลัก (css/app.css): `--brand` เขียว #187a3e, `--accent` ส้ม (ตัวเลขภาษี/ไฮไลต์), `--danger` แดง (ลบ/ผิดพลาด), พื้นอมเขียว; หัวแอปพื้นขาวเส้นล่างเขียว
- โหมดมืด: โลโก้วางบนป้ายขาวเพื่อให้เส้นเขียวเข้มยังเห็น
- ตัวใบ 50 ทวิ ใช้สีเอกสารทางการ (ขาว/ดำ/หมึกน้ำเงิน) ไม่เปลี่ยนตามธีม

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
| `js/scan.js` | OCR: ย่อรูป → backend `ocr` (Google Drive OCR) → ถ้าไม่ได้ใช้ Tesseract.js 5.1.1 (tha+eng จาก jsdelivr/tessdata) ในเครื่อง; `parse()` แยกข้อมูล |
| `js/app.js` | UI ทั้งหมด: routing ด้วย hash `#list #edit #payees #companies #settings` |
| `sw.js` | service worker: หน้าเว็บ network-first, ไฟล์ที่มี ?v= cache-first, ไม่แคช API |
| `manifest.json`, `icons/` | PWA |
| `version.json` | เวอร์ชันล่าสุด — แอปเช็กไฟล์นี้เพื่อขึ้นแถบ "มีเวอร์ชันใหม่" |
| `apps-script/Loader.gs` | วางใน Apps Script ครั้งเดียว |
| `apps-script/Code.gs` | backend ตัวจริง (ต้องมีคำว่า `HUGNA_BACKEND` และ `doGet`/`doPost`) |
| `scripts/bump-version.sh` | เปลี่ยนเลขเวอร์ชันทุกจุด + เพิ่ม CHANGELOG |
| `SETUP.md` | วิธีติดตั้งครั้งแรกทีละขั้น |
| `CHANGELOG.md` | บันทึกการแก้ไขทุกเวอร์ชัน |

## ข้อมูลใน Google Sheet
- **Users**: id, username, name, role(admin/user), passHash, salt, active, createdAt, lastLogin, favs(JSON: payeeId ที่ติดดาว) — รหัสผ่าน SHA-256 + salt วน 300 รอบ
- **Sessions**: token, userId, expires (30 วัน), createdAt — แคชใน CacheService 30 นาที
- **Companies**: id, name, taxId, branch, address, signer, signerTitle, sigFileId, stampFileId, active, createdAt, updatedAt (ลบ = active false)
- **Payees**: id, type(j/p), name, taxId, branch, address, tags(JSON tagIds), defItem(JSON {cat,desc,rate}), form, active, createdBy, createdAt, updatedAt, lastUsed
  - ตอนบันทึกใบ backend ผูกใบกับรายชื่อ (payeeId → เลขภาษี+สาขา → ชื่อ) ถ้าไม่เจอจะสร้างรายชื่อใหม่ให้
- **Tags**: id, name, color (สีจากชุด TAG_COLORS), createdAt
- **Certs**: id, companyId, payeeId, book, no, issueDate, form(0–6), seq, payeeType(j/p), payeeName, payeeTaxId, payeeBranch, payeeAddress, payer(0–3), payerOther, items(JSON), funds(JSON), totalAmount, totalTax, useSig, useStamp, coSnap(JSON สำเนาข้อมูลบริษัทตอนออกครั้งแรก), status(active/deleted), createdBy, createdByName, createdAt, updatedAt
  - items: `[{id, cat:'c1'|'c2'|'c3'|'c4a'|'c4b'|'c5'|'c6', desc, date, amount, rate, custom?}]`
- **Files**: id(=Drive fileId), ownerType(cert/payee), ownerId, kind(idcard/invoice/other), name, mime(jpeg/png/webp/pdf), size, createdBy, createdByName, createdAt, active
- **Settings**: key/value (สำรองไว้ใช้)
- **Log**: time, userId, username, action, detail
- ค่าที่เป็นตัวเลขยาว/วันที่ ถูกเติม `'` นำหน้าก่อนเขียน กันชีตแปลงรูปแบบ; ค่าขึ้นต้น = + - @ ก็เติม `'` กันสูตร
- Script Properties: `FOLDER_ID`, `CODE_REF`, `BACKUP_*` (โค้ดสำรองแบ่งท่อน)

## API (action)
- สาธารณะ: `ping`, `status` (needsSetup), `setup` (สร้าง admin แรก), `login`
- ล็อกอินแล้ว: `me`, `logout`, `bootstrap` (user+companies+certs+payees+tags), `savePayee`, `deletePayee` (ของตัวเอง/admin), `setFavorite`, `saveTag` (สร้างได้ทุกคน, แก้ได้เฉพาะ admin), `image` (fileId → dataURL), `saveCert`, `deleteCert`, `changePassword`
- `uploadFile` {ownerType, ownerId, kind, name, dataUrl ≤ 8MB} (user แนบกับใบได้เฉพาะใบตัวเอง), `file` {fileId} → dataURL, `deleteFile` (ของตัวเอง/admin)
- `ocr` (image dataURL → text): อัปโหลดรูปเป็น Google Doc ด้วย Drive REST (`ocrLanguage=th`) ผ่าน `ScriptApp.getOAuthToken()` แล้ว export text และลบไฟล์ทิ้ง
  ต้องเปิด Advanced Service "Drive API" ในโปรเจกต์ Apps Script (SETUP.md ขั้นเสริม) ไม่งั้นได้ code `ocr_unavailable` → หน้าเว็บจำไว้ 6 ชม. แล้วอ่านในเครื่องแทน
- admin: `deleteTag`, `saveCompany` (sig/stamp: undefined=ไม่เปลี่ยน, null=ลบ, dataURL=ใหม่), `deleteCompany`, `users`, `saveUser`, `log`, `system`, `setCodeRef`
- สิทธิ์ user: แก้/ลบเฉพาะใบที่ตัวเองออก; admin ทำได้ทุกอย่าง
- เลขที่เอกสาร: ถ้าเว้นว่าง backend รันให้ (ต่อบริษัท+เล่ม) ภายใต้ LockService และกันเลขซ้ำ

## เวอร์ชันและการอัปเดต (ขั้นตอนที่ต้องทำทุกครั้งที่แก้)
1. แก้โค้ด
2. `scripts/bump-version.sh X.Y.Z "สรุปสิ่งที่แก้"` (patch = แก้บั๊ก, minor = ฟีเจอร์ใหม่)
3. อัปเดต PROJECT_NOTES.md (ส่วน "สถานะล่าสุด" และส่วนที่เกี่ยวข้อง)
4. `git add -A && git commit -m "vX.Y.Z: ..." && git tag vX.Y.Z && git push origin main --tags`
- หน้าเว็บ: GitHub Pages อัปเดตใน 1–2 นาที, ผู้ใช้เห็นแถบ "มีเวอร์ชันใหม่" หรือกด "อัปเดตระบบเป็นเวอร์ชันล่าสุด" ในแท็บตั้งค่า (ล้างแคช SW + เรียก `?refresh=1`)
- backend: Loader ดึง Code.gs ใหม่ภายใน 5 นาที หรือทันทีเมื่อเรียก `<exec>?refresh=1`
- สิทธิ์ (OAuth scope) ของระบบมาจากโค้ดใน Loader.gs เท่านั้น — ถ้า Code.gs ใช้คำสั่งเขียน/บริการที่ Loader ไม่ได้อ้างถึง ต้องเพิ่มใน `scopesNeeded_()` หรือ `authorize()`
- ถ้า Code.gs ใช้บริการ Google ใหม่ (เช่น GmailApp, CalendarApp) → ต้องเพิ่มใน `authorize()` ของ Loader.gs, เพิ่ม LOADER_VERSION, แล้ว**บอกผู้ใช้ให้วาง Loader ใหม่ + Deploy (Manage deployments → New version)** ตาม SETUP.md

## การย้อนเวอร์ชัน
- **backend**: แท็บตั้งค่า (admin) → "เวอร์ชัน backend" เลือก tag → ใช้เวอร์ชันนี้ (ตั้ง Script Property `CODE_REF`). กลับมาใช้ล่าสุด = เลือก `main`
- ถ้า GitHub ล่ม Loader ใช้โค้ดสำรองล่าสุดใน Script Properties อัตโนมัติ (`BACKUP`, และ `BACKUP_PREV` เวอร์ชันก่อนหน้า)
- **หน้าเว็บ**: `git checkout vX.Y.Z -- index.html css js sw.js manifest.json` แล้ว bump เป็นเวอร์ชันใหม่และ push (ไม่ใช้ force push)

## ข้อควรระวัง
- ความเร็ว: Apps Script "ตื่น" ช้า 2–5 วิ ถ้าไม่มีคนใช้สักพัก (แก้ไม่ได้ฝั่งโค้ด); หน้า login เรียก `status` ตอนเปิดหน้าเพื่อปลุก backend ระหว่างพิมพ์รหัส
- ใน Code.gs อ่านชีตผ่าน `rows_()` เท่านั้น (มีแคชต่อคำขอ) และเขียนผ่าน `append_/update_/deleteRow_` (ล้างแคชให้เอง) — อย่าเรียก SpreadsheetApp ตรง ๆ
- รูปบัตรประชาชนเป็นข้อมูลส่วนบุคคล (PDPA): ไม่แชร์ไฟล์ใน Drive สาธารณะ, ไม่แคชเนื้อไฟล์ในเครื่อง, ลบไฟล์ = ย้ายลงถังขยะ Drive
- Apps Script web app รับ POST แบบ `text/plain` เท่านั้น (กัน CORS preflight) — อย่าเปลี่ยน Content-Type
- ห้ามใส่ความลับใน repo (repo เป็น public) — ข้อมูลจริงอยู่ในชีต/ไดรฟ์
- รูปลายเซ็น/ตรายางย่อเหลือ ≤ ~150KB ฝั่งหน้าเว็บก่อนส่ง และแคชใน localStorage ตาม fileId
- `bootstrap` ส่งเอกสารทั้งหมด — ถ้าเกินหลายพันใบ ควรทำแบ่งหน้า/กรองตามปีฝั่ง backend

## สถานะล่าสุด
- v1.4.2 (2026-11-26): Loader v2 — แก้ error "สิทธิ์ไม่เพียงพอ DriveApp.createFolder (auth/drive)": Apps Script เดาสิทธิ์จากโค้ดใน Loader เท่านั้น
  Loader v1 เรียก DriveApp แบบอ่านอย่างเดียว เลยได้ drive.readonly → เพิ่ม `scopesNeeded_()` ที่อ้างถึงคำสั่งเขียน (ไม่ได้รัน) ให้ได้สิทธิ์ drive/spreadsheets เต็ม
  ผู้ใช้ต้องวาง Loader ใหม่ + รัน authorize + Deploy เวอร์ชันใหม่ (ยังไม่ยืนยันว่าทำแล้ว)
- v1.4.1 (2026-11-26): ไอคอนแอป (iPhone/Android) มีคำว่า Hugna ใต้มาสคอต
- v1.4.0 (2026-11-26): ธีมสีเขียว-ส้มตามโลโก้, โลโก้ในหน้าแอป/หน้าล็อกอิน, ไอคอนแท็บเบราว์เซอร์และไอคอน iPhone ใหม่
- v1.3.1 (2026-11-26): login เร็วขึ้น — `login`/`setup` รับ `withData:true` แล้วส่งข้อมูล bootstrap กลับมาในคำขอเดียว; backend แคชการอ่านชีตภายในคำขอ (ROWS_/HEAD_, ล้างเมื่อเขียนหรือเข้า lock), อ่านแท็บด้วย getDataRange ครั้งเดียว, ตรวจหัวคอลัมน์ครั้งเดียวต่อเวอร์ชัน (CacheService 6 ชม.), แคชเซสชัน 6 ชม.
- v1.3.0 (2026-11-26): แนบรูปบัตรประชาชนกับรายชื่อ และแนบ invoice (รูป/PDF) กับใบ — ทดสอบกับ mock แล้ว
- v1.2.0 (2026-11-25): สแกนรูปเป็นข้อความ + แยกข้อมูล + คัดลอก — ทดสอบ parser และ UI กับ OCR จำลองแล้ว; ยังไม่ได้ทดสอบ Google OCR จริงและ Tesseract บน iPhone จริง
  - ผู้ใช้ยังไม่ได้ยืนยันว่าเปิด Drive API แล้วหรือยัง
- v1.1.0 (2026-11-25): เพิ่มรายชื่อผู้ถูกหักภาษี + ดาว + tag/กลุ่ม, หน้าตั้งค่าส่วนระบบเหลือแค่เลขเวอร์ชัน+ปุ่มอัปเดต (ย้อน backend/Log ย้ายไป "ขั้นสูง")
- v1.0.1 (2026-11-25): ผู้ใช้ทำ SETUP.md ครบแล้ว (เปิด Pages, สร้างชีต, วาง Loader, Deploy)
- `API_URL` = https://script.google.com/macros/s/AKfycbzkiifhCDfL4DgNFxz1zuNsFn9aGKfEUKRd_ZMjG1NSiEo0uVCixl40A1v188eqh-WU/exec
- หน้าเว็บ: https://jsungkapo.github.io/Hugna/ (ชื่อ repo ขึ้นต้น H ใหญ่ — path ของ Pages แยกตัวพิมพ์)
- เซสชันของ Claude push ได้เฉพาะ branch main — push tag ไม่ได้ ให้ผู้ใช้สร้าง tag ผ่านหน้า Releases (https://github.com/jsungkapo/Hugna/releases/new, target = main)
- ทดสอบแล้ว: backend ด้วย mock ของ Apps Script ใน Node, หน้าเว็บด้วย Chrome headless (มือถือ/คอม)
- ยังไม่ได้ยืนยัน: การทำงานกับ Apps Script จริง และการส่งออก PDF บน iPhone จริง

## ไอเดียทำต่อ
- ส่งออกรายงานรายเดือนสำหรับยื่น ภ.ง.ด.3/53 (Excel/CSV)
- ส่งใบให้ผู้ถูกหักทางอีเมล (ต้องเพิ่ม GmailApp → วาง Loader ใหม่)
