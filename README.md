# 📋 เลขาส่วนตัว

แอพจัดการงาน Content Creator — ข้อมูลเก็บในเครื่อง ไม่ต้องต่ออินเทอร์เน็ต

---

## วิธี Build APK (3 ขั้นตอน)

### 1. ติดตั้ง Node.js
ไป https://nodejs.org → กด **LTS** → ติดตั้ง

### 2. เปิด Command Prompt ในโฟลเดอร์นี้ แล้วรัน:
```
npm install
npm install -g eas-cli
npx eas login
npx eas init
npx eas build --platform android --profile preview
```
รอ ~10 นาที → ได้ลิงก์ดาวน์โหลด APK

### 3. ติดตั้ง APK บนมือถือแล้วใช้งานได้เลย ✅

---

## ถ้าต้องการฟีเจอร์สแกนสินค้า (ไม่บังคับ)

เปิดไฟล์ `App.js` บรรทัดที่ 10 แก้:
```js
const ANTHROPIC_KEY = 'sk-ant-xxxx'; // ใส่ key จาก console.anthropic.com
```

---

## ข้อมูลเก็บที่ไหน?
AsyncStorage ในเครื่อง — ปิดแอพแล้วเปิดใหม่ข้อมูลอยู่ครบ
ถ้าลบแอพแล้วติดตั้งใหม่ ข้อมูลจะหายตามปกติ
