# Ledger · ระบบรายรับ-รายจ่ายส่วนตัว

Web app เล็ก ๆ ไฟล์เดียว เขียนด้วย HTML + CSS + JavaScript (vanilla) ไม่ต้องลง Node, ไม่ต้อง build, ไม่มี backend
ข้อมูลทั้งหมดเก็บใน Browser ของคุณเอง (localStorage) ไม่มีการส่งไปที่ไหน

**ฟีเจอร์**
- 📊 Dashboard สรุปเดือนนี้: รายรับ-รายจ่าย-คงเหลือ-คาดสะสมสิ้นเดือน
- 📅 ปฏิทินรายเดือนที่เห็น flow รายรับ/รายจ่ายเป็น dot ในแต่ละวัน
- 📈 Forecast 12 เดือนข้างหน้า (bar chart + ตาราง running balance)
- 🔁 บิลประจำ (Recurring) ที่คำนวณ projection อัตโนมัติ
- ➕ เพิ่ม/แก้/ลบรายการ พร้อมเลือกวัน หมวด ไอคอน
- ☁️ Google Calendar 2-way sync (ถ้า setup) — ทุกบิลขึ้นปฏิทินไอโฟน/Android ทันที พร้อมแจ้งเตือนล่วงหน้า 1 วัน
- 📄 ส่งออกเป็นไฟล์ `.ics` (ทางเลือกสำหรับคนไม่อยากตั้ง OAuth — นำเข้าครั้งเดียวก็ใช้ได้)
- 💾 Export/Import ไฟล์ JSON เพื่อสำรองข้อมูล

---

## วิธีรัน (3 ทาง · เลือกอันที่ชอบ)

### ทางที่ 1 — เปิดไฟล์ตรง ๆ (เร็วที่สุด)

ดาวน์โหลดโฟลเดอร์ `webapp/` แล้วเปิด `index.html` ในเว็บบราวเซอร์
ใช้งานได้ทันที **ยกเว้น** การเชื่อม Google Calendar (Google ต้องการ origin ที่เป็น `http://...` หรือ `https://...` ไม่รับ `file://`)

### ทางที่ 2 — รัน Local Web Server (ใช้ Google Calendar ได้)

ในโฟลเดอร์ `webapp/` เปิด Terminal แล้วพิมพ์อันใดอันหนึ่ง:

```bash
# ถ้ามี Python (Mac มีมาให้)
python3 -m http.server 8080

# หรือถ้ามี Node.js
npx serve .
```

เปิด browser ไปที่ `http://localhost:8080`

### ทางที่ 3 — Deploy ขึ้น GitHub Pages ฟรี (แนะนำ)

1. สมัคร GitHub ที่ [github.com](https://github.com) (ฟรี)
2. สร้าง repository ใหม่ ชื่ออะไรก็ได้ เช่น `my-ledger`
3. อัพโหลดไฟล์ในโฟลเดอร์ `webapp/` ทั้งหมดเข้า repo (drag & drop ในหน้า GitHub ได้)
4. ไปที่ **Settings → Pages**
5. เลือก **Source: Deploy from a branch** → `main` → `/ (root)`
6. กด Save · รอสักครู่ จะได้ URL เช่น `https://yourname.github.io/my-ledger/`
7. เปิด URL นั้นในมือถือ → กด Share → **Add to Home Screen** จะใช้งานเหมือนแอป

---

## วิธีเชื่อม Google Calendar (ตั้งครั้งเดียว)

### ขั้นที่ 1 — สร้างโปรเจกต์ใน Google Cloud Console

1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com)
2. กด **Select a project → New Project**
3. ตั้งชื่อโปรเจกต์ (เช่น `My Ledger`) → กด Create

### ขั้นที่ 2 — เปิดใช้ Google Calendar API

1. ไปที่เมนู **APIs & Services → Library**
2. ค้นหา **Google Calendar API** → กด Enable

### ขั้นที่ 3 — ตั้ง OAuth Consent Screen

1. ไป **APIs & Services → OAuth consent screen**
2. เลือก **External** → Create
3. กรอกข้อมูล:
   - App name: `My Ledger`
   - User support email: อีเมลคุณ
   - Developer contact: อีเมลคุณ
4. หน้า Scopes กด Save and Continue
5. หน้า Test users → **Add Users** → ใส่อีเมล Gmail ตัวเอง (ที่จะใช้)
6. Save and Continue → Back to Dashboard

> โหมด Testing ใช้ได้ตลอด สำหรับ user ที่เพิ่มไว้สูงสุด 100 คน · ไม่ต้องส่ง verification เพราะใช้คนเดียว

### ขั้นที่ 4 — สร้าง OAuth Client ID

1. ไป **APIs & Services → Credentials**
2. กด **+ Create Credentials → OAuth client ID**
3. เลือก **Application type: Web application**
4. ใส่ **Authorized JavaScript origins**:
   - ถ้ารัน local: `http://localhost:8080` (ใส่ port ที่ใช้จริง)
   - ถ้า deploy GitHub Pages: `https://yourname.github.io`
   - ใส่ได้หลาย origins
5. กด Create
6. **คัดลอก Client ID** (ลงท้ายด้วย `.apps.googleusercontent.com`)

### ขั้นที่ 5 — วาง Client ID ลงในแอป

1. เปิดแอปในบราวเซอร์
2. ไป **ตั้งค่า → Google Calendar**
3. วาง Client ID ลงในช่อง
4. กดปุ่ม **เชื่อมต่อ Google** → จะ popup ขึ้นมาให้ login + อนุญาต
5. เสร็จ! แอปจะสร้างปฏิทินชื่อ **"รายรับ-รายจ่าย"** ในบัญชี Google คุณอัตโนมัติ

ตั้งแต่นี้ทุกรายการที่บันทึกจะถูกผลักขึ้นปฏิทินใบนั้น และเปิดดูใน Google Calendar / Apple Calendar (เชื่อม Google ในการตั้งค่าไอโฟน) / Outlook ได้หมด

### หมายเหตุเรื่องการแจ้งเตือนล่วงหน้า

- เปิดใน iPhone: **Settings → Calendar → Default Alerts → All-day Events → 1 day before** (หรือเปิดต่อในแต่ละ event)
- แอปนี้ใส่ alarm `TRIGGER:-P1D` (1 วันก่อน) ในไฟล์ .ics ให้แล้ว
- ใน Google Calendar event ที่สร้างก็ใส่ reminder 1 วันก่อนตามค่าที่ตั้งในแอป

---

## วิธีใช้แบบไม่ต้องเชื่อม Google (ทางเลือก)

ถ้าไม่อยากตั้ง OAuth ใช้ปุ่ม **"ดาวน์โหลด .ics"** ในหน้าตั้งค่า
- ไฟล์จะมีบิลประจำทั้งหมดเป็นกิจกรรมแบบ recurring monthly + แจ้งเตือน 1 วันก่อน
- เปิดไฟล์ในมือถือ → กด "เพิ่มลงปฏิทิน" → เลือกปฏิทินปลายทาง
- ข้อเสีย: เพิ่มแก้บิลใหม่ต้อง export + import ใหม่ทุกครั้ง (ไม่อัพเดทอัตโนมัติ)

---

## โครงสร้างไฟล์

```
webapp/
├── index.html       — โครงหน้าเว็บ + nav + modal host
├── style.css        — สไตล์ V1 Ledger · responsive
├── storage.js       — localStorage wrapper + default state
├── calendar.js      — Google Calendar API + .ics generator
├── app.js           — Logic หลัก: state, render, modals, calculations
└── README.md        — ไฟล์นี้
```

## วิธีแก้ไข/ปรับแต่งเอง

### เปลี่ยนสี · เปลี่ยน font
แก้ใน `style.css` ส่วน `:root { ... }` ด้านบนสุด — เปลี่ยน `--accent`, `--ink`, `--bg` ฯลฯ ตามใจ

### เพิ่ม/ลดหมวด
- หมวดรายการ → แก้ตัวแปร `CATS` ใน `app.js` ฟังก์ชัน `openTxModal`
- หมวดบิลประจำ → แก้ตัวแปร `CATS` ใน `openRecurringModal`
- ไอคอนบิล → แก้ตัวแปร `ICONS` ใน `openRecurringModal`

### เปลี่ยนสกุลเงิน
- ไป **ตั้งค่า** ในแอป (อยู่ในแผนพัฒนาต่อ) หรือแก้ `defaultState()` ใน `storage.js`
- หรือเปลี่ยนตัวแปร `currency` ใน localStorage โดยตรง (Open DevTools → Application → Local Storage)

### เพิ่มฟีเจอร์
- โครงสร้าง state ดูที่ `storage.js` ฟังก์ชัน `defaultState()`
- View แต่ละหน้าอยู่ใน `app.js` ฟังก์ชัน `viewHome`, `viewCalendar` ฯลฯ
- Modal สำหรับ add/edit อยู่ใน `openIncomeModal`, `openRecurringModal`, `openTxModal`
- การคำนวณ Forecast ดูฟังก์ชัน `forecast12()` และ `expandRecurring()`

---

## ปัญหาที่อาจเจอ

**Q: เปิด `file://` แล้วเชื่อม Google ไม่ได้**
A: ต้องรัน local server (Python `python3 -m http.server`) หรือ deploy GitHub Pages แล้วใช้ URL `http://` หรือ `https://`

**Q: Popup ของ Google ถูกบล็อก**
A: เปิด pop-up ของ browser สำหรับเว็บนี้ก่อน · ลองอีกครั้ง

**Q: error "redirect_uri_mismatch"**
A: ใน Google Cloud Console → Credentials → OAuth Client ID → เพิ่ม Authorized JavaScript origin ให้ตรงกับ URL ที่รันอยู่ (เช่น `http://localhost:8080` ไม่ใช่ `http://127.0.0.1:8080`)

**Q: ล้าง browser แล้วข้อมูลหาย!**
A: ก่อนล้างให้กด **ตั้งค่า → สำรองข้อมูล (Export JSON)** เก็บไฟล์ไว้ก่อน

**Q: อยากใช้บนหลายเครื่อง**
A: ปัจจุบันไม่ได้ — เพราะเก็บใน localStorage ของแต่ละ browser แยกกัน · ทางออก: export JSON จากเครื่องหนึ่ง → import เข้าอีกเครื่องเป็นระยะ ๆ หรือใช้ Google Calendar เป็น source of truth (ตั้งให้ pull event กลับเข้าแอป — feature นี้ในแผนพัฒนาต่อ)

---

## License

MIT — เอาไปใช้/แก้/แจกได้ตามสบาย

ขอให้สนุกกับการคุมเงินครับ ✨
