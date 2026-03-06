import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal,
  StyleSheet, SafeAreaView, Platform, KeyboardAvoidingView,
  ActivityIndicator, Image, Alert, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

// ─────────────────────────────────────────────────────────
//  ⚙️  ถ้าต้องการสแกนสินค้า ใส่ Anthropic API key ที่นี่
//  ถ้าไม่ใส่ ฟีเจอร์อื่นใช้ได้ปกติ แค่สแกนไม่ได้
const ANTHROPIC_KEY = '';
// ─────────────────────────────────────────────────────────

// ── Storage ───────────────────────────────────────────────
const KEYS = { tasks: 'app_tasks', evts: 'app_evts' };

async function load(key) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

async function save(key, val) {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Date helpers ──────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const plusDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate()+n); return toISO(d); };
const fShort = d => d ? new Date(d).toLocaleDateString('th-TH', {day:'numeric', month:'short'}) : '';
const fLong  = d => d ? new Date(d).toLocaleDateString('th-TH', {day:'numeric', month:'short', year:'numeric'}) : '';
const fPrice = p => { const n = parseFloat(p); return (!p || isNaN(n)) ? '' : n.toLocaleString('th-TH') + ' ฿'; };

// ── Colors ────────────────────────────────────────────────
const PRI_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const PRI_LABEL = { high: '🔴 ด่วน', medium: '🟡 ปกติ', low: '🟢 ไม่เร่ง' };

// ─────────────────────────────────────────────────────────
//  COMPONENTS
// ─────────────────────────────────────────────────────────

function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={c.overlay} onPress={onClose}>
        <Pressable style={c.sheet} onPress={() => {}}>
          <View style={c.handle} />
          {title ? <Text style={c.sheetTitle}>{title}</Text> : null}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
            <View style={{ height: 20 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Dlg({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={c.dlgOverlay} onPress={onClose}>
        <Pressable style={c.dlg} onPress={() => {}}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

function Inp({ value, onChange, placeholder, numeric, multiline, style }) {
  return (
    <TextInput
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor="#bbb" keyboardType={numeric ? 'numeric' : 'default'}
      multiline={multiline}
      style={[c.inp, multiline && { height: 76, textAlignVertical: 'top' }, style]}
    />
  );
}

function Btn({ label, onPress, disabled, color, outline, style }) {
  if (outline) return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} disabled={disabled}
      style={[c.btnOutline, style]}>
      <Text style={c.btnOutlineTxt}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} disabled={disabled}
      style={[c.btn, { backgroundColor: disabled ? '#ccc' : (color || '#111') }, style]}>
      <Text style={c.btnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function PriPicker({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
      {['high', 'medium', 'low'].map(k => (
        <TouchableOpacity key={k} onPress={() => onChange(k)} activeOpacity={0.8}
          style={[c.priBtn, { backgroundColor: value === k ? '#111' : '#f0f0eb' }]}>
          <Text style={[c.priBtnTxt, { color: value === k ? '#fff' : '#555' }]}>{PRI_LABEL[k]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Empty({ icon, title, sub }) {
  return (
    <View style={c.empty}>
      <Text style={{ fontSize: 52, marginBottom: 12 }}>{icon}</Text>
      <Text style={c.emptyTitle}>{title}</Text>
      <Text style={c.emptySub}>{sub}</Text>
    </View>
  );
}

// ── ScanPanel ─────────────────────────────────────────────
function ScanPanel({ onDetected }) {
  const [uri,    setUri]    = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);

  const process = async (asset) => {
    if (!asset?.base64) return;
    setUri(asset.uri);
    setBusy(true);
    setResult(null);

    if (!ANTHROPIC_KEY) {
      setBusy(false);
      setResult({ ok: false, msg: 'ไม่ได้ตั้ง API key' });
      return;
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: 'ตอบเฉพาะ JSON: {"name":"ชื่อสินค้าภาษาไทย","price":"ตัวเลขหรือ empty","note":"รายละเอียดสั้น"}',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: asset.mimeType || 'image/jpeg', data: asset.base64 } },
              { type: 'text', text: 'สินค้าคืออะไร? ถ้าไม่ใช่สินค้าตอบ {"name":"ไม่พบสินค้า","price":"","note":""}' },
            ],
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'API Error');
      const txt = data.content?.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(txt);
      setResult({ ok: parsed.name !== 'ไม่พบสินค้า', ...parsed });
      if (parsed.name && parsed.name !== 'ไม่พบสินค้า') {
        onDetected({ name: `รีวิว ${parsed.name}`, price: parsed.price || '' });
      }
    } catch (e) {
      setResult({ ok: false, msg: e.message || 'เกิดข้อผิดพลาด' });
    }
    setBusy(false);
  };

  const pick = async (cam) => {
    const fn = cam ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const perm = cam
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('ขออนุญาต', 'กรุณาอนุญาตใน Settings'); return; }
    const r = await fn({ quality: 0.6, base64: true });
    if (!r.canceled) process(r.assets[0]);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        {[['📷', 'ถ่ายรูป', true], ['🖼️', 'เลือกรูป', false]].map(([ico, lbl, cam]) => (
          <TouchableOpacity key={lbl} onPress={() => pick(cam)} activeOpacity={0.8}
            style={c.camBtn}>
            <Text style={{ fontSize: 26 }}>{ico}</Text>
            <Text style={c.camLbl}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {uri && (
        <View style={c.scanWrap}>
          <Image source={{ uri }} style={c.scanImg} resizeMode="cover" />
          {busy && (
            <View style={c.scanOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8 }}>กำลังวิเคราะห์...</Text>
            </View>
          )}
          {result && !busy && (
            <View style={[c.scanBadge, { backgroundColor: result.ok ? '#16a34a' : 'rgba(0,0,0,.65)' }]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                {result.ok ? '✅ พบสินค้า' : '❌ ไม่พบ'}
              </Text>
            </View>
          )}
        </View>
      )}

      {result && !busy && result.ok && (
        <View style={c.scanOk}>
          <Text style={{ fontSize: 24 }}>🛍️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 14, marginBottom: 2 }}>ตรวจพบ: {result.name}</Text>
            {result.note  ? <Text style={{ fontSize: 12, color: '#555' }}>{result.note}</Text>  : null}
            {result.price ? <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 2 }}>ราคา: {result.price} บาท</Text> : null}
          </View>
        </View>
      )}
      {result && !busy && !result.ok && (
        <View style={c.scanFail}>
          <Text style={{ fontSize: 13, color: '#b91c1c' }}>❌ {result.name || result.msg}</Text>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: '#ebebeb', marginVertical: 10 }} />
    </View>
  );
}

// ── TaskCard ──────────────────────────────────────────────
function TaskCard({ task, btnLabel, btnColor, onAdvance, onDel }) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const e   = task.endDate ? new Date(task.endDate) : null;
  const s   = task.startDate ? new Date(task.startDate) : null;
  const dl  = e ? Math.ceil((e - now) / 86400000) : null;
  const over = dl !== null && dl < 0;
  const dlColor = over ? '#ef4444' : dl <= 2 ? '#f59e0b' : '#10b981';
  let prog = 0;
  if (s && e && e > s) prog = Math.round(Math.min(Math.max((now-s)/(e-s), 0), 1) * 100);

  return (
    <View style={c.card}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={c.cardTitle}>{task.text}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            <View style={[c.tag, { backgroundColor: PRI_COLOR[task.priority] + '22' }]}>
              <Text style={[c.tagTxt, { color: PRI_COLOR[task.priority] }]}>{PRI_LABEL[task.priority]}</Text>
            </View>
            {fPrice(task.price) ? (
              <View style={[c.tag, { backgroundColor: '#f0f0eb' }]}>
                <Text style={[c.tagTxt, { color: '#555' }]}>💼 {fPrice(task.price)}</Text>
              </View>
            ) : null}
            {task.fromPhoto ? (
              <View style={[c.tag, { backgroundColor: '#eff6ff' }]}>
                <Text style={[c.tagTxt, { color: '#2563eb' }]}>📸 สแกน</Text>
              </View>
            ) : null}
          </View>
          {(s || e) && (
            <View style={{ marginTop: 9 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: '#aaa' }}>
                  {s ? fShort(task.startDate) : ''}{s && e ? ' → ' : ''}{e ? fShort(task.endDate) : ''}
                </Text>
                {dl !== null && (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: dlColor }}>
                    {over ? `เกิน ${Math.abs(dl)} วัน` : dl === 0 ? 'วันนี้!' : `อีก ${dl} วัน`}
                  </Text>
                )}
              </View>
              {s && e && (
                <View style={c.prog}>
                  <View style={[c.progFill, { width: `${prog}%`, backgroundColor: over ? '#ef4444' : dl <= 2 ? '#f59e0b' : '#111' }]} />
                </View>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onDel} activeOpacity={0.7} style={c.delBtn}>
          <Text style={{ color: '#ccc', fontSize: 17 }}>✕</Text>
        </TouchableOpacity>
      </View>
      <Btn label={btnLabel} onPress={onAdvance} color={btnColor} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────
export default function App() {
  const [ready,  setReady]  = useState(false);
  const [tab,    setTab]    = useState(0);
  const [tasks,  setTasks]  = useState([]);
  const [evts,   setEvts]   = useState([]);

  // ── Load on mount ────────────────────────────────────
  useEffect(() => {
    Promise.all([load(KEYS.tasks), load(KEYS.evts)]).then(([t, e]) => {
      setTasks(t); setEvts(e); setReady(true);
    });
  }, []);

  // ── Save on change ───────────────────────────────────
  useEffect(() => { if (ready) save(KEYS.tasks, tasks); }, [tasks, ready]);
  useEffect(() => { if (ready) save(KEYS.evts,  evts);  }, [evts,  ready]);

  // ── Modals ───────────────────────────────────────────
  const [showTask,  setShowTask]  = useState(false);
  const [showEvt,   setShowEvt]   = useState(false);
  const [evDetail,  setEvDetail]  = useState(null);
  const [schedId,   setSchedId]   = useState(null);
  const [schedD,    setSchedD]    = useState('');
  const [schedT,    setSchedT]    = useState('');

  // ── Forms ────────────────────────────────────────────
  const freshTask = () => ({ text: '', priority: 'medium', startDate: todayISO(), endDate: plusDays(todayISO(), 7), price: '', fromPhoto: false });
  const freshEvt  = () => ({ title: '', date: '', time: '', note: '', price: '' });
  const [nt, setNt] = useState(freshTask);
  const [ne, setNe] = useState(freshEvt);

  // ── Task ops ─────────────────────────────────────────
  const addTask = () => {
    if (!nt.text.trim()) return;
    setTasks(ts => [...ts, { id: Date.now() + '', stage: 'todo', ...nt }]);
    setNt(freshTask()); setShowTask(false);
  };
  const advance = (id, stage) => setTasks(ts => ts.map(t => t.id === id ? { ...t, stage } : t));
  const delTask = id => setTasks(ts => ts.filter(t => t.id !== id));

  const confirmSched = () => {
    if (!schedD) return;
    const tk = tasks.find(t => t.id === schedId);
    if (tk) {
      setEvts(es => [...es, { id: Date.now() + '', title: tk.text, date: schedD, time: schedT, note: '📤 โพสงาน', price: tk.price || '', done: false, paid: false }]);
      delTask(schedId);
    }
    setSchedId(null); setSchedD(''); setSchedT(''); setTab(3);
  };

  // ── Event ops ────────────────────────────────────────
  const addEvt = () => {
    if (!ne.title || !ne.date) return;
    setEvts(es => [...es, { id: Date.now() + '', ...ne, done: false, paid: false }]);
    setNe(freshEvt()); setShowEvt(false);
  };
  const delEvt = id => { setEvts(es => es.filter(e => e.id !== id)); setEvDetail(null); };
  const togDone = id => setEvts(es => es.map(e => e.id === id ? { ...e, done: !e.done } : e));
  const togPaid = id => setEvts(es => es.map(e => e.id === id ? { ...e, paid: !e.paid } : e));
  const updEvt  = (id, k, v) => setEvts(es => es.map(e => e.id === id ? { ...e, [k]: v } : e));

  // ── Derived ──────────────────────────────────────────
  const todos    = tasks.filter(t => t.stage === 'todo');
  const drafts   = tasks.filter(t => t.stage === 'draft');
  const posts    = tasks.filter(t => t.stage === 'post');
  const upcoming = evts.filter(e => !e.done).sort((a, b) => new Date(a.date) - new Date(b.date));
  const done     = evts.filter(e =>  e.done).sort((a, b) => new Date(b.date) - new Date(a.date));
  const totAll  = done.reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
  const totPaid = done.filter(e => e.paid).reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
  const totWait = totAll - totPaid;
  const selEv   = evDetail ? evts.find(e => e.id === evDetail) : null;

  const NAV = [
    { ico: '📋', lbl: 'งาน',       cnt: todos.length,    dot: '#6b7280' },
    { ico: '✏️', lbl: 'ดราฟ',      cnt: drafts.length,   dot: '#f59e0b' },
    { ico: '📤', lbl: 'รอโพส',     cnt: posts.length,    dot: '#3b82f6' },
    { ico: '📅', lbl: 'นัดหมาย',   cnt: upcoming.length, dot: '#8b5cf6' },
    { ico: '✅', lbl: 'เสร็จแล้ว', cnt: done.length,     dot: '#10b981' },
  ];

  if (!ready) return (
    <SafeAreaView style={[c.safe, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 44 }}>📋</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={c.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Schedule dialog ── */}
        <Dlg visible={!!schedId} onClose={() => setSchedId(null)}>
          <Text style={c.dlgTitle}>📅 นัดวันโพส</Text>
          <View style={c.dlgHint}>
            <Text style={{ fontSize: 13, color: '#555' }}>{tasks.find(t => t.id === schedId)?.text}</Text>
          </View>
          <Text style={c.lbl}>วันที่โพส * (YYYY-MM-DD)</Text>
          <Inp value={schedD} onChange={setSchedD} placeholder={todayISO()} style={c.mb12} />
          <Text style={c.lbl}>เวลา (เช่น 10:00)</Text>
          <Inp value={schedT} onChange={setSchedT} placeholder="ไม่บังคับ" style={c.mb20} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="ยกเลิก" onPress={() => setSchedId(null)} outline style={{ flex: 1 }} />
            <Btn label="✅ ยืนยัน" onPress={confirmSched} disabled={!schedD} style={{ flex: 2 }} />
          </View>
        </Dlg>

        {/* ── Event detail ── */}
        <Sheet visible={!!selEv} onClose={() => setEvDetail(null)} title={selEv?.title}>
          {selEv && (
            <View>
              <Text style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
                {fLong(selEv.date)}{selEv.time ? ' · ' + selEv.time + ' น.' : ''}
              </Text>
              <Text style={c.lbl}>หมายเหตุ</Text>
              <Inp value={selEv.note} onChange={v => updEvt(selEv.id, 'note', v)} placeholder="เพิ่มหมายเหตุ..." multiline style={c.mb12} />
              <Text style={c.lbl}>มูลค่างาน (฿)</Text>
              <Inp value={selEv.price} onChange={v => updEvt(selEv.id, 'price', v)} placeholder="0" numeric style={c.mb16} />
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity onPress={() => togDone(selEv.id)} activeOpacity={0.8}
                  style={[c.togBtn, { backgroundColor: selEv.done ? '#10b981' : '#f0f0eb', flex: 1 }]}>
                  <Text style={[c.togTxt, { color: selEv.done ? '#fff' : '#444' }]}>{selEv.done ? '✅ เสร็จ' : '⬜ ทำเสร็จ?'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => togPaid(selEv.id)} activeOpacity={0.8}
                  style={[c.togBtn, { backgroundColor: selEv.paid ? '#3b82f6' : '#f0f0eb', flex: 1 }]}>
                  <Text style={[c.togTxt, { color: selEv.paid ? '#fff' : '#444' }]}>{selEv.paid ? '💰 รับแล้ว' : '💳 ได้เงิน?'}</Text>
                </TouchableOpacity>
              </View>
              {selEv.price && parseFloat(selEv.price) > 0 && (
                <View style={[c.moneyBox, { backgroundColor: selEv.paid ? '#f0fdf4' : '#fffbeb', borderColor: selEv.paid ? '#86efac' : '#fde68a' }]}>
                  <Text style={{ fontWeight: '800', color: selEv.paid ? '#16a34a' : '#b45309' }}>{selEv.paid ? '✅ รับครบแล้ว' : '⏳ รอรับเงิน'}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: selEv.paid ? '#16a34a' : '#b45309' }}>{fPrice(selEv.price)}</Text>
                </View>
              )}
              <Btn label="🗑 ลบนัดหมายนี้" onPress={() => delEvt(selEv.id)}
                style={{ backgroundColor: '#fff5f5', borderWidth: 2, borderColor: '#fecaca' }} />
            </View>
          )}
        </Sheet>

        {/* ── Add task ── */}
        <Sheet visible={showTask} onClose={() => { setShowTask(false); setNt(freshTask()); }} title="➕ เพิ่มงานใหม่">
          <ScanPanel onDetected={d => setNt(n => ({ ...n, text: d.name, price: d.price || n.price, fromPhoto: true }))} />
          <Text style={c.lbl}>ชื่องาน *</Text>
          <Inp value={nt.text} onChange={v => setNt({ ...nt, text: v })} placeholder="เช่น รีวิวครีมบำรุงผิว" style={c.mb12} />
          <Text style={c.lbl}>ความเร่งด่วน</Text>
          <PriPicker value={nt.priority} onChange={v => setNt({ ...nt, priority: v })} />
          <Text style={c.lbl}>ราคางาน (ถ้ามี)</Text>
          <Inp value={nt.price} onChange={v => setNt({ ...nt, price: v })} placeholder="0" numeric style={c.mb12} />
          <Text style={c.lbl}>ช่วงเวลา (วันส่งดราฟอัตโนมัติ +7 วัน)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            <View style={{ flex: 1 }}>
              <Text style={c.subLbl}>วันเริ่ม</Text>
              <Inp value={nt.startDate} onChange={v => setNt({ ...nt, startDate: v, endDate: plusDays(v, 7) })} placeholder={todayISO()} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={c.subLbl}>ส่งดราฟภายใน</Text>
              <Inp value={nt.endDate} onChange={v => setNt({ ...nt, endDate: v })} placeholder={plusDays(todayISO(), 7)} />
            </View>
          </View>
          <Btn label="+ บันทึกงาน" onPress={addTask} disabled={!nt.text.trim()} />
        </Sheet>

        {/* ── Add event ── */}
        <Sheet visible={showEvt} onClose={() => { setShowEvt(false); setNe(freshEvt()); }} title="📅 เพิ่มนัดหมาย">
          <Text style={c.lbl}>ชื่อนัดหมาย *</Text>
          <Inp value={ne.title} onChange={v => setNe({ ...ne, title: v })} placeholder="เช่น ส่งงาน, ประชุม" style={c.mb12} />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={c.lbl}>วันที่ * (YYYY-MM-DD)</Text>
              <Inp value={ne.date} onChange={v => setNe({ ...ne, date: v })} placeholder={todayISO()} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={c.lbl}>เวลา</Text>
              <Inp value={ne.time} onChange={v => setNe({ ...ne, time: v })} placeholder="10:00" />
            </View>
          </View>
          <Text style={c.lbl}>หมายเหตุ</Text>
          <Inp value={ne.note} onChange={v => setNe({ ...ne, note: v })} placeholder="สถานที่, รายละเอียด" style={c.mb12} />
          <Text style={c.lbl}>มูลค่างาน (ถ้ามี)</Text>
          <Inp value={ne.price} onChange={v => setNe({ ...ne, price: v })} placeholder="0" numeric style={c.mb18} />
          <Btn label="+ บันทึกนัดหมาย" onPress={addEvt} disabled={!ne.title || !ne.date} />
        </Sheet>

        {/* ══ HEADER ══ */}
        <View style={c.header}>
          <View style={{ flex: 1 }}>
            <Text style={c.headerTitle}>📋 เลขาส่วนตัว</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
              {todos.length > 0  && <Text style={c.headerStat}>📋 {todos.length}</Text>}
              {drafts.length > 0 && <Text style={c.headerStat}>✏️ {drafts.length}</Text>}
              {posts.length > 0  && <Text style={c.headerStat}>📤 {posts.length}</Text>}
              {totWait > 0 && <Text style={[c.headerStat, { color: '#f59e0b', fontWeight: '700' }]}>💰 รอรับ {totWait.toLocaleString('th-TH')} ฿</Text>}
              {!todos.length && !drafts.length && !posts.length && !totWait &&
                <Text style={[c.headerStat, { color: '#444' }]}>ทุกอย่างเรียบร้อย ✨</Text>}
            </View>
          </View>
          {tab < 4 && (
            <TouchableOpacity style={c.fab} activeOpacity={0.85}
              onPress={() => tab === 3 ? setShowEvt(true) : setShowTask(true)}>
              <Text style={{ fontSize: 28, color: '#111', lineHeight: 34 }}>＋</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ══ PIPELINE ══ */}
        {tab < 4 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={c.pipe} contentContainerStyle={c.pipeInner}>
            {[{ l: 'งาน', cnt: todos.length, col: '#888', t: 0 }, null,
              { l: 'ดราฟ', cnt: drafts.length, col: '#f59e0b', t: 1 }, null,
              { l: 'รอโพส', cnt: posts.length, col: '#60a5fa', t: 2 }, null,
              { l: 'นัดหมาย', cnt: upcoming.length, col: '#a78bfa', t: 3 },
            ].map((item, i) => item === null
              ? <Text key={i} style={{ color: '#333', fontSize: 14, alignSelf: 'center' }}>›</Text>
              : (
                <TouchableOpacity key={i} onPress={() => setTab(item.t)} activeOpacity={0.8}
                  style={[c.pp, { backgroundColor: tab === item.t ? item.col : item.col + '28' }]}>
                  <Text style={[c.ppTxt, { color: tab === item.t ? '#fff' : item.col }]}>
                    {item.l}{item.cnt > 0 ? ' ' + item.cnt : ''}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>
        )}

        {/* ══ CONTENT ══ */}
        <ScrollView style={{ flex: 1, backgroundColor: '#f0f0eb' }}
          contentContainerStyle={c.content} showsVerticalScrollIndicator={false}>

          {/* งาน */}
          {tab === 0 && <>
            {todos.length === 0 && <Empty icon="✨" title="ยังไม่มีงาน" sub={"กดปุ่ม ＋ ด้านบน\nหรือถ่ายรูปสินค้าสร้างงานอัตโนมัติ"} />}
            {todos.map(t => <TaskCard key={t.id} task={t} btnLabel="✅ เสร็จ → ส่งดราฟ"
              onAdvance={() => advance(t.id, 'draft')} onDel={() => delTask(t.id)} />)}
          </>}

          {/* ดราฟ */}
          {tab === 1 && <>
            <View style={c.infoBox}>
              <Text style={{ fontSize: 20 }}>✏️</Text>
              <Text style={{ fontSize: 13, color: '#92400e', lineHeight: 22, flex: 1 }}>งานที่ส่งดราฟแล้ว รอลูกค้าตรวจสอบและอนุมัติ</Text>
            </View>
            {drafts.length === 0 && <Empty icon="📨" title="ยังไม่มีงาน" sub={'กด "เสร็จ" ในหน้างานทั้งหมด'} />}
            {drafts.map(t => <TaskCard key={t.id} task={t} btnLabel="✅ แก้ไขเสร็จ → รอโพส"
              btnColor="#d97706" onAdvance={() => advance(t.id, 'post')} onDel={() => delTask(t.id)} />)}
          </>}

          {/* รอโพส */}
          {tab === 2 && <>
            <View style={[c.infoBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <Text style={{ fontSize: 13, color: '#1e40af', lineHeight: 22, flex: 1 }}>กด "นัดวันโพส" เพื่อเลือกวัน-เวลา งานจะย้ายเข้านัดหมายอัตโนมัติ</Text>
            </View>
            {posts.length === 0 && <Empty icon="📤" title="ยังไม่มีงาน" sub={'กด "แก้ไขเสร็จ" ในหน้าส่งดราฟ'} />}
            {posts.map(t => <TaskCard key={t.id} task={t} btnLabel="📅 นัดวันโพส → นัดหมาย"
              btnColor="#2563eb" onAdvance={() => { setSchedId(t.id); setSchedD(''); setSchedT(''); }} onDel={() => delTask(t.id)} />)}
          </>}

          {/* นัดหมาย */}
          {tab === 3 && <>
            {upcoming.length === 0 && <Empty icon="📅" title="ยังไม่มีนัดหมาย" sub="กดปุ่ม ＋ ด้านบน" />}
            {upcoming.map(ev => {
              const isToday = new Date().toDateString() === new Date(ev.date).toDateString();
              return (
                <TouchableOpacity key={ev.id} onPress={() => setEvDetail(ev.id)} activeOpacity={0.8}
                  style={[c.evCard, { borderColor: isToday ? '#8b5cf6' : 'transparent' }]}>
                  <View style={[c.dayBox, { backgroundColor: isToday ? '#8b5cf6' : '#111' }]}>
                    <Text style={c.dayNum}>{new Date(ev.date).getDate()}</Text>
                    <Text style={[c.dayMon, { color: isToday ? '#e9d5ff' : '#aaa' }]}>
                      {new Date(ev.date).toLocaleDateString('th-TH', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={c.evTitle}>{ev.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {ev.time && <Text style={c.evSub}>🕐 {ev.time} น.</Text>}
                      {ev.note && <Text style={[c.evSub, { color: '#bbb' }]} numberOfLines={1}>{ev.note}</Text>}
                    </View>
                    {fPrice(ev.price) && (
                      <View style={[c.tag, { backgroundColor: '#f0f0eb', marginTop: 6, alignSelf: 'flex-start' }]}>
                        <Text style={[c.tagTxt, { color: '#555' }]}>💼 {fPrice(ev.price)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#ddd', fontSize: 22 }}>›</Text>
                </TouchableOpacity>
              );
            })}
          </>}

          {/* เสร็จแล้ว */}
          {tab === 4 && <>
            {done.length > 0 && (
              <View style={c.statBox}>
                {[['มูลค่ารวม', totAll, '#fff'], ['ได้รับ', totPaid, '#10b981'], ['รอรับ', totWait, totWait > 0 ? '#f59e0b' : '#555']].map(([lbl, val, col], i) => (
                  <View key={i} style={[c.statItem, i > 0 && { borderLeftWidth: 1, borderLeftColor: '#2a2a2a', paddingLeft: 14 }]}>
                    <Text style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>{lbl}</Text>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: col }}>
                      {val.toLocaleString('th-TH')} <Text style={{ fontSize: 11, fontWeight: '400' }}>฿</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {done.length === 0 && <Empty icon="🏆" title="ยังไม่มีงานที่เสร็จ" sub={'กด "ทำเสร็จ?" ในนัดหมาย'} />}
            {done.map(ev => (
              <TouchableOpacity key={ev.id} onPress={() => setEvDetail(ev.id)} activeOpacity={0.8} style={c.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: fPrice(ev.price) ? 12 : 0 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16 }}>✅</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', flex: 1 }}>{ev.title}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#aaa' }}>{fLong(ev.date)}{ev.time ? ' · ' + ev.time + ' น.' : ''}</Text>
                  </View>
                  {fPrice(ev.price) && (
                    <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 4 }}>{fPrice(ev.price)}</Text>
                      <View style={[c.tag, { backgroundColor: ev.paid ? '#dcfce7' : '#fef3c7' }]}>
                        <Text style={[c.tagTxt, { color: ev.paid ? '#16a34a' : '#92400e' }]}>{ev.paid ? '💰 รับแล้ว' : '⏳ รอรับ'}</Text>
                      </View>
                    </View>
                  )}
                </View>
                {fPrice(ev.price) && (
                  <TouchableOpacity onPress={() => togPaid(ev.id)} activeOpacity={0.8}
                    style={[c.togBtn, { backgroundColor: ev.paid ? '#10b981' : '#f0f0eb' }]}>
                    <Text style={[c.togTxt, { color: ev.paid ? '#fff' : '#444' }]}>
                      {ev.paid ? '✅ ได้รับเงินแล้ว' : 'ยังไม่ได้รับ — กดเพื่อยืนยัน'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </>}

        </ScrollView>

        {/* ══ NAV ══ */}
        <View style={c.nav}>
          {NAV.map((n, i) => (
            <TouchableOpacity key={i} style={c.navBtn} onPress={() => setTab(i)} activeOpacity={0.7}>
              <Text style={{ fontSize: 23, lineHeight: 28, opacity: tab === i ? 1 : 0.3 }}>{n.ico}</Text>
              <Text style={{ fontSize: 9, fontWeight: tab === i ? '800' : '400', color: tab === i ? '#111' : '#aaa' }}>{n.lbl}</Text>
              {n.cnt > 0 && (
                <View style={[c.navDot, { backgroundColor: n.dot }]}>
                  <Text style={c.navDotTxt}>{n.cnt}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────
const c = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#0f0f0f' },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 0, maxHeight: '93%' },
  handle:     { width: 40, height: 5, backgroundColor: '#e0e0e0', borderRadius: 99, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', paddingVertical: 10, color: '#111' },
  dlgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dlg:        { backgroundColor: '#fff', borderRadius: 22, padding: 24, width: '100%', maxWidth: 360 },
  dlgTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 8, color: '#111' },
  dlgHint:    { backgroundColor: '#f5f5f0', borderRadius: 12, padding: 12, marginBottom: 18 },
  inp:        { backgroundColor: '#f5f5f0', borderRadius: 12, padding: 13, fontSize: 15, color: '#111', marginBottom: 0 },
  lbl:        { fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 7, marginTop: 2 },
  subLbl:     { fontSize: 11, color: '#bbb', marginBottom: 5 },
  mb12:       { marginBottom: 12 },
  mb16:       { marginBottom: 16 },
  mb18:       { marginBottom: 18 },
  mb20:       { marginBottom: 20 },
  btn:        { padding: 15, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  btnTxt:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnOutline: { padding: 15, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0eb' },
  btnOutlineTxt: { color: '#555', fontSize: 14, fontWeight: '700' },
  priBtn:     { flex: 1, padding: 11, borderRadius: 11, alignItems: 'center' },
  priBtnTxt:  { fontSize: 12, fontWeight: '700' },
  camBtn:     { flex: 1, padding: 14, backgroundColor: '#fafafa', borderWidth: 2, borderColor: '#e8e8e8', borderStyle: 'dashed', borderRadius: 14, alignItems: 'center', gap: 5 },
  camLbl:     { fontSize: 12, fontWeight: '700', color: '#666' },
  scanWrap:   { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  scanImg:    { width: '100%', height: 190 },
  scanOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' },
  scanBadge:  { position: 'absolute', top: 10, right: 10, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  scanOk:     { flexDirection: 'row', gap: 10, padding: 13, backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#86efac', borderRadius: 13, marginBottom: 10, alignItems: 'center' },
  scanFail:   { padding: 11, backgroundColor: '#fff5f5', borderWidth: 2, borderColor: '#fecaca', borderRadius: 13, marginBottom: 10 },
  empty:      { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#555', marginBottom: 6 },
  emptySub:   { fontSize: 13, color: '#bbb', textAlign: 'center', lineHeight: 22 },
  card:       { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  cardTitle:  { fontSize: 16, fontWeight: '800', color: '#111', lineHeight: 24 },
  tag:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  tagTxt:     { fontSize: 11, fontWeight: '700' },
  prog:       { height: 5, backgroundColor: '#eee', borderRadius: 99, overflow: 'hidden' },
  progFill:   { height: '100%', borderRadius: 99 },
  delBtn:     { width: 36, height: 36, backgroundColor: '#f5f5f0', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoBox:    { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fffbeb', borderWidth: 2, borderColor: '#fde68a', borderRadius: 14, marginBottom: 14, alignItems: 'flex-start' },
  togBtn:     { padding: 14, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  togTxt:     { fontSize: 14, fontWeight: '800' },
  moneyBox:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, borderRadius: 14, padding: 14, marginBottom: 14 },
  evCard:     { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: 2, elevation: 1 },
  dayBox:     { width: 50, borderRadius: 13, paddingVertical: 8, alignItems: 'center' },
  dayNum:     { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  dayMon:     { fontSize: 10, marginTop: 1 },
  evTitle:    { fontSize: 15, fontWeight: '800', color: '#111' },
  evSub:      { fontSize: 12, color: '#888' },
  statBox:    { backgroundColor: '#111', borderRadius: 18, padding: 20, marginBottom: 14, flexDirection: 'row' },
  statItem:   { flex: 1 },
  header:     { backgroundColor: '#0f0f0f', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:{ fontSize: 18, fontWeight: '800', color: '#fff' },
  headerStat: { fontSize: 11, color: '#666' },
  fab:        { width: 50, height: 50, backgroundColor: '#fff', borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8 },
  pipe:       { backgroundColor: '#0f0f0f', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  pipeInner:  { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
  pp:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  ppTxt:      { fontSize: 11, fontWeight: '800' },
  content:    { padding: 14, paddingBottom: 110 },
  nav:        { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ebebeb', flexDirection: 'row' },
  navBtn:     { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 8, gap: 3, position: 'relative' },
  navDot:     { position: 'absolute', top: 6, right: '25%', minWidth: 16, height: 16, borderRadius: 99, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  navDotTxt:  { color: '#fff', fontSize: 9, fontWeight: '800' },
});
