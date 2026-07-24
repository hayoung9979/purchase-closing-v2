import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Contact,
  FileSpreadsheet,
  Download,
  LayoutDashboard,
  Lock,
  Plus,
  Search,
  Settings,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';

type Page = 'dashboard' | 'monthly' | 'ledger' | 'vendors' | 'contacts' | 'settings';
type Category = '상품 및 외주가공' | '부자재';
type Payment = '미결제' | '결제';
type Status = '미진행' | '진행중' | '완료';

type Vendor = {
  id: string;
  category: Category;
  name: string;
  code: string;
  ceo: string;
  businessType: string;
  businessItem: string;
  registrationNo: string;
  manager?: string;
  phone?: string;
};

type ChecklistItem = { id?: string; name: string; checked: boolean; missingDate: string };
type MonthlyVendor = { id: string; vendorId: string; checklist: ChecklistItem[]; updatedAt: string };
type LedgerRow = {
  id: string;
  category: Category;
  vendorId: string;
  supply: number;
  tax: number;
  payment: Payment;
  note: string;
};
type ScheduleItem = { id: string; date: string; text: string };

type Store = {
  vendors: Vendor[];
  monthly: Record<string, MonthlyVendor[]>;
  ledger: Record<string, LedgerRow[]>;
  schedules: ScheduleItem[];
  lockedMonths: string[];
};

const checklistNames = ['거래명세서', '품의서', '세금계산서', '마감원장', '결재', '지출결의서', '최종결재'];
const now = new Date();
const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const seedVendors: Vendor[] = [
  { id: 'v1', category: '부자재', name: '한빛패키지', code: 'M-001', ceo: '김대표', businessType: '제조업', businessItem: '포장재', registrationNo: '123-45-67890', manager: '이민수', phone: '010-1234-5678' },
  { id: 'v2', category: '상품 및 외주가공', name: '동아가공', code: 'O-002', ceo: '박대표', businessType: '제조업', businessItem: '외주가공', registrationNo: '234-56-78901', manager: '최유진', phone: '010-2222-3333' },
  { id: 'v3', category: '부자재', name: '세림상사', code: 'M-003', ceo: '최대표', businessType: '도소매업', businessItem: '부자재', registrationNo: '345-67-89012', manager: '정하늘', phone: '010-7777-8888' },
];

const blankChecklist = (): ChecklistItem[] => checklistNames.map((name) => ({ name, checked: false, missingDate: '' }));
const seedStore: Store = {
  vendors: seedVendors,
  monthly: {
    [currentKey]: [
      { id: 'm1', vendorId: 'v1', checklist: checklistNames.map((name, i) => ({ name, checked: i < 4, missingDate: i === 4 ? `${currentKey}-18` : '' })), updatedAt: new Date().toISOString() },
      { id: 'm2', vendorId: 'v2', checklist: checklistNames.map((name, i) => ({ name, checked: i < 7, missingDate: '' })), updatedAt: new Date().toISOString() },
    ],
  },
  ledger: {
    [currentKey]: [
      { id: 'l1', category: '부자재', vendorId: 'v1', supply: 1800000, tax: 180000, payment: '미결제', note: '' },
      { id: 'l2', category: '상품 및 외주가공', vendorId: 'v2', supply: 2500000, tax: 250000, payment: '결제', note: '' },
    ],
  },
  schedules: [{ id: 's1', date: new Date().toISOString().slice(0, 10), text: '마감원장 누락 거래처 확인' }],
  lockedMonths: [],
};

const uid = () => Math.random().toString(36).slice(2, 10);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [store, setStore] = useState<Store>(() => {
    try {
      const saved = localStorage.getItem('purchase-closing-v2');
      return saved ? JSON.parse(saved) : seedStore;
    } catch {
      return seedStore;
    }
  });

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  useEffect(() => localStorage.setItem('purchase-closing-v2', JSON.stringify(store)), [store]);

  useEffect(() => {
    let active = true;
    const loadVendors = async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name', { ascending: true });
      if (!active) return;
      if (error) {
        console.error('거래처 불러오기 실패:', error.message);
        return;
      }
      const vendors: Vendor[] = (data ?? []).map((row: any) => ({
        id: row.id,
        category: row.category as Category,
        name: row.name,
        code: row.code ?? '',
        ceo: row.ceo ?? '',
        businessType: row.business_type ?? '',
        businessItem: row.business_item ?? '',
        registrationNo: row.registration_no ?? '',
        manager: row.manager ?? '',
        phone: row.phone ?? '',
      }));
      setStore((current: Store) => ({ ...current, vendors }));
    };
    void loadVendors();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSharedData = async () => {
      const [scheduleResult, lockResult] = await Promise.all([
        supabase.from('schedules').select('*').order('schedule_date', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('locked_months').select('month_key').order('month_key', { ascending: true }),
      ]);
      if (!active) return;
      if (scheduleResult.error) console.error('일정 불러오기 실패:', scheduleResult.error.message);
      if (lockResult.error) console.error('잠금 정보 불러오기 실패:', lockResult.error.message);
      setStore((current: Store) => ({
        ...current,
        schedules: (scheduleResult.data ?? []).map((row: any) => ({ id: row.id, date: row.schedule_date, text: row.content })),
        lockedMonths: (lockResult.data ?? []).map((row: any) => row.month_key),
      }));
    };
    void loadSharedData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadMonthData = async () => {
      const [monthlyResult, ledgerResult] = await Promise.all([
        supabase
          .from('monthly_vendors')
          .select('id, vendor_id, updated_at, checklist_items(id, item_name, checked, missing_date, sort_order)')
          .eq('month_key', monthKey)
          .order('updated_at', { ascending: false }),
        supabase
          .from('ledger_rows')
          .select('*')
          .eq('month_key', monthKey)
          .order('created_at', { ascending: true }),
      ]);
      if (!active) return;
      if (monthlyResult.error) console.error('월별 마감 불러오기 실패:', monthlyResult.error.message);
      if (ledgerResult.error) console.error('집계장 불러오기 실패:', ledgerResult.error.message);

      const monthlyRows: MonthlyVendor[] = (monthlyResult.data ?? []).map((row: any) => ({
        id: row.id,
        vendorId: row.vendor_id,
        updatedAt: row.updated_at,
        checklist: [...(row.checklist_items ?? [])]
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((item: any) => ({
            id: item.id,
            name: item.item_name,
            checked: item.checked,
            missingDate: item.missing_date ?? '',
          })),
      }));
      const ledgerRows: LedgerRow[] = (ledgerResult.data ?? []).map((row: any) => ({
        id: row.id,
        category: row.category as Category,
        vendorId: row.vendor_id ?? '',
        supply: Number(row.supply ?? 0),
        tax: Number(row.tax ?? 0),
        payment: row.payment as Payment,
        note: row.note ?? '',
      }));
      setStore((current: Store) => ({
        ...current,
        monthly: { ...current.monthly, [monthKey]: monthlyRows },
        ledger: { ...current.ledger, [monthKey]: ledgerRows },
      }));
    };
    void loadMonthData();
    return () => { active = false; };
  }, [monthKey]);

  const monthRows = store.monthly[monthKey] ?? [];
  const ledgerRows = store.ledger[monthKey] ?? [];
  const isLocked = store.lockedMonths.includes(monthKey);

  const nav = [
    ['dashboard', '대시보드', LayoutDashboard],
    ['monthly', '월별 마감 현황', ClipboardCheck],
    ['ledger', '매입세금계산서 집계장', FileSpreadsheet],
    ['vendors', '거래처 정보', Building2],
    ['contacts', '거래처 연락처', Contact],
    ['settings', '설정', Settings],
  ] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><BarChart3 size={20} /></div><div><b>부자재 마감</b><small>Closing System</small></div></div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="system-box"><span className="dot" /> 시스템 정상 작동 중<small>전체 주요 탭 Supabase 연결</small></div>
      </aside>

      <main>
        <header className="topbar">
          <div><h1>{nav.find(([key]) => key === page)?.[1]}</h1><p>{year}년 {month}월 업무 데이터를 관리합니다.</p></div>
          <div className="month-picker">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}</select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
            {isLocked && <span className="lock-badge"><Lock size={14} /> 마감 잠금</span>}
          </div>
        </header>

        {page === 'dashboard' && <Dashboard store={store} setStore={setStore} monthKey={monthKey} rows={monthRows} ledger={ledgerRows} />}
        {page === 'monthly' && <MonthlyPage store={store} setStore={setStore} monthKey={monthKey} locked={isLocked} />}
        {page === 'ledger' && <LedgerPage store={store} setStore={setStore} monthKey={monthKey} locked={isLocked} />}
        {page === 'vendors' && <VendorsPage store={store} setStore={setStore} />}
        {page === 'contacts' && <ContactsPage store={store} setStore={setStore} />}
        {page === 'settings' && <SettingsPage store={store} setStore={setStore} monthKey={monthKey} />}
      </main>
    </div>
  );
}

function Dashboard({ store, setStore, monthKey, rows, ledger }: { store: Store; setStore: (s: Store) => void; monthKey: string; rows: MonthlyVendor[]; ledger: LedgerRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const progress = rows.length ? Math.round(rows.reduce((a, r) => a + r.checklist.filter(c => c.checked).length, 0) / (rows.length * 7) * 100) : 0;
  const completed = rows.filter(r => r.checklist.every(c => c.checked)).length;
  const schedules = store.schedules.filter(s => s.date === selectedDate);
  const total = ledger.reduce((a, r) => a + r.supply + r.tax, 0);
  const unpaid = ledger.filter(r => r.payment === '미결제').reduce((a, r) => a + r.supply + r.tax, 0);

  const addSchedule = async () => {
    if (!text.trim()) return;
    const { data, error } = await supabase.from('schedules').insert({ schedule_date: selectedDate, content: text.trim() }).select().single();
    if (error) { alert(`일정 저장 실패: ${error.message}`); return; }
    setStore({ ...store, schedules: [...store.schedules, { id: data.id, date: data.schedule_date, text: data.content }] });
    setText(''); setEditing(false);
  };
  const removeSchedule = async (id: string) => {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) { alert(`일정 삭제 실패: ${error.message}`); return; }
    setStore({ ...store, schedules: store.schedules.filter(x => x.id !== id) });
  };
  return <div className="dashboard-grid">
    <section className="content-column">
      <div className="hero-card">
        <div><span className="eyebrow">MONTHLY CLOSING</span><h2>{monthKey.replace('-', '년 ')}월 마감 현황</h2><p>등록된 거래처의 체크리스트 진행률을 한눈에 확인하세요.</p></div>
        <div className="progress-ring" style={{ '--p': `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>전체 진행률</span></div></div>
      </div>
      <div className="stats-grid">
        <Stat label="등록 거래처" value={`${rows.length}개`} sub="현재 월 기준" />
        <Stat label="마감 완료" value={`${completed}개`} sub={`진행 중 ${rows.length - completed}개`} />
        <Stat label="당월 매입 합계" value={won(total)} sub="공급가액+세액" />
        <Stat label="부자재 미결제분" value={won(unpaid)} sub="결제여부 기준" />
      </div>
      <div className="panel"><div className="panel-head"><div><h3>최근 마감 현황</h3><p>거래처별 진행 상태</p></div></div>
        <div className="simple-list">{rows.slice(0, 6).map(r => { const v = store.vendors.find(v => v.id === r.vendorId); const pct = Math.round(r.checklist.filter(c => c.checked).length / 7 * 100); return <div key={r.id}><div><b>{v?.name}</b><small>{v?.category}</small></div><div className="mini-progress"><span style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div> })}{!rows.length && <Empty text="등록된 거래처가 없습니다." />}</div>
      </div>
    </section>
    <aside className="right-rail">
      <div className="panel calendar-panel"><div className="panel-head"><div><h3>일정 캘린더</h3><p>날짜별 메모를 직접 작성합니다.</p></div><button className="icon-btn" onClick={() => setEditing(true)}><Settings size={17}/></button></div>
        <input className="calendar-input" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
      </div>
      <div className="panel"><div className="panel-head"><div><h3>{selectedDate === today ? '오늘 일정' : '선택 날짜 일정'}</h3><p>{selectedDate}</p></div><button className="icon-btn" onClick={() => setEditing(true)}><Plus size={17}/></button></div>
        <div className="schedule-list">{schedules.map(s => <div key={s.id}><span className="schedule-dot"/><p>{s.text}</p><button onClick={() => void removeSchedule(s.id)}><X size={15}/></button></div>)}{!schedules.length && <Empty text="등록된 일정이 없습니다." />}</div>
      </div>
      <div className="deadline-card"><CalendarDays size={22}/><div><small>월 마감 예정일</small><strong>{monthKey}-말일</strong></div></div>
    </aside>
    {editing && <Modal title={`${selectedDate} 일정 작성`} onClose={() => setEditing(false)}><textarea className="textarea" value={text} onChange={e => setText(e.target.value)} placeholder="예: 세금계산서 누락 거래처 확인" autoFocus/><button className="primary wide" onClick={() => void addSchedule()}>일정 저장</button></Modal>}
  </div>
}

function MonthlyPage({ store, setStore, monthKey, locked }: { store: Store; setStore: (s: Store) => void; monthKey: string; locked: boolean }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'category' | 'status'>('name');
  const [showAdd, setShowAdd] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const rows = store.monthly[monthKey] ?? [];
  const statusOf = (r: MonthlyVendor): Status => { const n = r.checklist.filter(c => c.checked).length; return n === 0 ? '미진행' : n === 7 ? '완료' : '진행중'; };
  const filtered = [...rows].filter(r => (store.vendors.find(v => v.id === r.vendorId)?.name ?? '').includes(query)).sort((a,b) => {
    const va = store.vendors.find(v => v.id === a.vendorId)!; const vb = store.vendors.find(v => v.id === b.vendorId)!;
    return sort === 'name' ? va.name.localeCompare(vb.name, 'ko') : sort === 'category' ? va.category.localeCompare(vb.category, 'ko') : statusOf(a).localeCompare(statusOf(b), 'ko');
  });
  const addVendor = async (vendorId: string) => {
    if (working || rows.some(r => r.vendorId === vendorId)) return;
    setWorking(true);
    const vendor = store.vendors.find(v => v.id === vendorId)!;
    const monthlyResult = await supabase.from('monthly_vendors').insert({ month_key: monthKey, vendor_id: vendorId }).select().single();
    if (monthlyResult.error) { alert(`월별 거래처 추가 실패: ${monthlyResult.error.message}`); setWorking(false); return; }
    const checklistResult = await supabase.from('checklist_items').insert(checklistNames.map((name, index) => ({ monthly_vendor_id: monthlyResult.data.id, item_name: name, checked: false, missing_date: null, sort_order: index }))).select();
    if (checklistResult.error) {
      await supabase.from('monthly_vendors').delete().eq('id', monthlyResult.data.id);
      alert(`체크리스트 생성 실패: ${checklistResult.error.message}`); setWorking(false); return;
    }
    const ledgerResult = await supabase.from('ledger_rows').insert({ month_key: monthKey, category: vendor.category, vendor_id: vendorId, supply: 0, tax: 0, payment: '미결제', note: '' }).select().single();
    if (ledgerResult.error) { alert(`집계장 자동 추가 실패: ${ledgerResult.error.message}`); }
    const newMonthly: MonthlyVendor = {
      id: monthlyResult.data.id, vendorId, updatedAt: monthlyResult.data.updated_at,
      checklist: (checklistResult.data ?? []).sort((a,b) => a.sort_order-b.sort_order).map(item => ({ id:item.id, name:item.item_name, checked:item.checked, missingDate:item.missing_date ?? '' }))
    };
    const nextStore: Store = { ...store, monthly: { ...store.monthly, [monthKey]: [...rows, newMonthly] } };
    if (!ledgerResult.error) {
      nextStore.ledger = { ...store.ledger, [monthKey]: [...(store.ledger[monthKey] ?? []), { id: ledgerResult.data.id, category: ledgerResult.data.category as Category, vendorId: ledgerResult.data.vendor_id, supply: Number(ledgerResult.data.supply), tax: Number(ledgerResult.data.tax), payment: ledgerResult.data.payment as Payment, note: ledgerResult.data.note ?? '' }] };
    }
    setStore(nextStore); setShowAdd(false); setWorking(false);
  };
  const updateChecklist = async (rowId: string, index: number, patch: Partial<ChecklistItem>) => {
    if (locked) return;
    const row = rows.find(r => r.id === rowId);
    const item = row?.checklist[index];
    if (!row || !item?.id) return;
    const nextItem = { ...item, ...patch };
    const nextRows = rows.map(r => r.id === rowId ? { ...r, updatedAt: new Date().toISOString(), checklist: r.checklist.map((c,i) => i === index ? nextItem : c) } : r);
    setStore({ ...store, monthly: { ...store.monthly, [monthKey]: nextRows } });
    const { error } = await supabase.from('checklist_items').update({ checked: nextItem.checked, missing_date: nextItem.missingDate || null }).eq('id', item.id);
    if (error) { alert(`체크리스트 저장 실패: ${error.message}`); return; }
    await supabase.from('monthly_vendors').update({ updated_at: new Date().toISOString() }).eq('id', rowId);
  };
  const detail = rows.find(r => r.id === detailId);
  const detailVendor = detail ? store.vendors.find(v => v.id === detail.vendorId) : undefined;
  return <>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="거래처명 검색" value={query} onChange={e => setQuery(e.target.value)}/></div><select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="name">거래처명순</option><option value="category">분류순</option><option value="status">마감상태순</option></select><button className="primary" onClick={() => setShowAdd(true)} disabled={locked || working}><Plus size={16}/> 거래처 추가</button></div>
    <div className="panel table-panel"><table><thead><tr><th>거래처명</th><th>분류</th><th>진행률</th><th>누락</th><th>마감상태</th><th>최근 수정</th><th></th></tr></thead><tbody>{filtered.map(r => { const v = store.vendors.find(v => v.id === r.vendorId)!; const done = r.checklist.filter(c => c.checked).length; const missing = r.checklist.filter(c => !c.checked); const status = statusOf(r); return <tr key={r.id} onClick={() => setDetailId(r.id)} className="clickable"><td><b>{v?.name}</b><small>{v?.code}</small></td><td><span className="category-chip">{v?.category}</span></td><td><div className="progress-cell"><div><span style={{width:`${done/7*100}%`}}/></div><b>{done}/7</b></div></td><td>{missing.length ? <span className="missing">{missing.length}건</span> : <span className="complete">없음</span>}</td><td><StatusBadge status={status}/></td><td>{new Date(r.updatedAt).toLocaleDateString('ko-KR')}</td><td><ChevronRight size={17}/></td></tr>})}</tbody></table>{!filtered.length && <Empty text="검색 결과가 없습니다." />}</div>
    {showAdd && <Modal title="거래처 정보에서 추가" onClose={() => !working && setShowAdd(false)}><div className="select-list">{store.vendors.filter(v => !rows.some(r => r.vendorId === v.id)).map(v => <button key={v.id} disabled={working} onClick={() => void addVendor(v.id)}><div><b>{v.name}</b><small>{v.code} · {v.category}</small></div><Plus size={17}/></button>)}{store.vendors.every(v => rows.some(r => r.vendorId === v.id)) && <Empty text="추가 가능한 거래처가 없습니다." />}</div></Modal>}
    {detail && detailVendor && <Modal title={detailVendor.name} onClose={() => setDetailId(null)} wide><div className="detail-summary"><div><small>현재 상태</small><StatusBadge status={statusOf(detail)}/></div><div><small>진행률</small><b>{Math.round(detail.checklist.filter(c=>c.checked).length/7*100)}%</b></div><div><small>최근 수정</small><b>{new Date(detail.updatedAt).toLocaleString('ko-KR')}</b></div></div><div className="checklist">{detail.checklist.map((c,i) => <div key={c.id ?? c.name} className={c.checked ? 'done' : ''}><label><input type="checkbox" checked={c.checked} disabled={locked} onChange={e => void updateChecklist(detail.id, i, { checked: e.target.checked, missingDate: e.target.checked ? '' : c.missingDate })}/><span>{c.checked && <Check size={15}/>}</span><b>{c.name}</b></label>{!c.checked && <div className="missing-date"><span>누락일</span><input type="date" value={c.missingDate} disabled={locked} onChange={e => void updateChecklist(detail.id, i, { missingDate: e.target.value })}/></div>}</div>)}</div>{locked && <div className="locked-note"><Lock size={16}/> 월 마감되어 수정할 수 없습니다.</div>}</Modal>}
  </>;
}

function LedgerPage({ store, setStore, monthKey, locked }: { store: Store; setStore: (s: Store) => void; monthKey: string; locked: boolean }) {
  const rows = store.ledger[monthKey] ?? [];
  const update = async (id: string, patch: Partial<LedgerRow>) => {
    if (locked) return;
    const current = rows.find(r => r.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setStore({ ...store, ledger: { ...store.ledger, [monthKey]: rows.map(r => r.id === id ? next : r) } });
    const { error } = await supabase.from('ledger_rows').update({ category: next.category, vendor_id: next.vendorId || null, supply: next.supply, tax: next.tax, payment: next.payment, note: next.note }).eq('id', id);
    if (error) alert(`집계장 저장 실패: ${error.message}`);
  };
  const addRow = async () => {
    if (locked || !store.vendors.length) return;
    const v = store.vendors[0];
    const { data, error } = await supabase.from('ledger_rows').insert({ month_key: monthKey, category: v.category, vendor_id: v.id, supply: 0, tax: 0, payment: '미결제', note: '' }).select().single();
    if (error) { alert(`내역 추가 실패: ${error.message}`); return; }
    setStore({ ...store, ledger: { ...store.ledger, [monthKey]: [...rows, { id:data.id, category:data.category as Category, vendorId:data.vendor_id, supply:Number(data.supply), tax:Number(data.tax), payment:data.payment as Payment, note:data.note ?? '' }] } });
  };
  const remove = async (id: string) => {
    if (locked) return;
    const { error } = await supabase.from('ledger_rows').delete().eq('id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setStore({ ...store, ledger: { ...store.ledger, [monthKey]: rows.filter(r => r.id !== id) } });
  };
  const sum = (filter: (r: LedgerRow) => boolean) => rows.filter(filter).reduce((a,r) => a + r.supply + r.tax, 0);
  const a = sum(r => r.category === '상품 및 외주가공');
  const unpaid = sum(r => r.category === '부자재' && r.payment === '미결제');
  const paid = sum(r => r.category === '부자재' && r.payment === '결제');
  const b = unpaid + paid;
  const exportExcel = () => {
    const headers = ['No','구분','업체명','업체코드','대표자','업태','업종','등록번호','공급가액','세액','합계금액','결제여부','비고'];
    const body = rows.map((r, i) => { const v = store.vendors.find(v => v.id === r.vendorId); return [i + 1, r.category, v?.name ?? '', v?.code ?? '', v?.ceo ?? '', v?.businessType ?? '', v?.businessItem ?? '', v?.registrationNo ?? '', r.supply, r.tax, r.supply + r.tax, r.payment, r.note]; });
    body.push([]); body.push(['', '상품 및 외주가공 합계 (a)', '', '', '', '', '', '', '', '', a]); body.push(['', '부자재 미결제분', '', '', '', '', '', '', '', '', unpaid]); body.push(['', '부자재 결제완료', '', '', '', '', '', '', '', '', paid]); body.push(['', '부자재 소계 (b)', '', '', '', '', '', '', '', '', b]); body.push(['', '총 매입 합계 (a+b)', '', '', '', '', '', '', '', '', a + b]);
    const escape = (value: string | number) => `"${String(value).replace(/,/g, "")
    const csv = '\ufeff' + [headers, ...body].map(row => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${monthKey}-매입세금계산서-집계장.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const toggleLock = async () => {
    if (locked) {
      const { error } = await supabase.from('locked_months').delete().eq('month_key', monthKey);
      if (error) { alert(`잠금 해제 실패: ${error.message}`); return; }
      setStore({ ...store, lockedMonths: store.lockedMonths.filter(k => k !== monthKey) });
    } else {
      const { error } = await supabase.from('locked_months').insert({ month_key: monthKey });
      if (error) { alert(`월 마감 실패: ${error.message}`); return; }
      setStore({ ...store, lockedMonths: [...store.lockedMonths, monthKey] });
    }
  };
  return <>
    <div className="toolbar"><div className="toolbar-note">거래처를 선택하면 대표자·업태·업종·등록번호가 자동 표시됩니다.</div><button className="secondary" onClick={exportExcel}><Download size={16}/> Excel 저장</button><button className="secondary" onClick={() => window.print()}>인쇄</button><button className={locked ? 'secondary' : 'danger-button'} onClick={() => void toggleLock()}>{locked ? <><Unlock size={16}/> 잠금 해제</> : <><Lock size={16}/> 월 마감</>}</button><button className="primary" onClick={() => void addRow()} disabled={locked}><Plus size={16}/> 내역 추가</button></div>
    <div className="summary-strip"><Summary label="상품 및 외주가공 합계 (a)" value={a}/><Summary label="부자재 미결제분" value={unpaid}/><Summary label="부자재 결제완료" value={paid}/><Summary label="부자재 소계 (b)" value={b}/><Summary label="총 매입 합계 (a+b)" value={a+b} strong/></div>
    <div className="panel table-panel ledger-table"><table><thead><tr><th>No</th><th>구분</th><th>업체명/코드 검색</th><th>대표자</th><th>업태</th><th>업종</th><th>등록번호</th><th>공급가액</th><th>세액</th><th>합계금액</th><th>결제여부</th><th>비고</th><th>삭제</th></tr></thead><tbody>{rows.map((r,i) => { const v = store.vendors.find(v => v.id === r.vendorId); const total = r.supply + r.tax; return <tr key={r.id}><td>{i+1}</td><td><select value={r.category} disabled={locked} onChange={e => void update(r.id,{category:e.target.value as Category})}><option>상품 및 외주가공</option><option>부자재</option></select></td><td><select value={r.vendorId} disabled={locked} onChange={e => { const nv=store.vendors.find(v=>v.id===e.target.value); if(nv) void update(r.id,{vendorId:nv.id,category:nv.category}); }}><option value="">선택</option>{store.vendors.map(v => <option key={v.id} value={v.id}>{v.name} / {v.code}</option>)}</select></td><td>{v?.ceo}</td><td>{v?.businessType}</td><td>{v?.businessItem}</td><td>{v?.registrationNo}</td><td><input className="money" type="number" value={r.supply || ''} disabled={locked} onChange={e => { const supply=Number(e.target.value); void update(r.id,{supply,tax:Math.round(supply*0.1)}); }}/></td><td><input className="money" type="number" value={r.tax || ''} disabled={locked} onChange={e => void update(r.id,{tax:Number(e.target.value)})}/></td><td><b>{total.toLocaleString()}</b></td><td><select value={r.payment} disabled={locked} onChange={e => void update(r.id,{payment:e.target.value as Payment})}><option value="미결제">미결제</option><option value="결제">결제</option></select></td><td><input value={r.note} disabled={locked} onChange={e=>void update(r.id,{note:e.target.value})}/></td><td><button className="danger-icon" disabled={locked} onClick={() => void remove(r.id)}><Trash2 size={16}/></button></td></tr>})}</tbody></table>{!rows.length && <Empty text="등록된 집계장 내역이 없습니다." />}</div>
  </>;
}

function VendorsPage({ store, setStore }: { store: Store; setStore: (s: Store) => void }) {
  const empty: Vendor = { id:'', category:'부자재', name:'', code:'', ceo:'', businessType:'', businessItem:'', registrationNo:'', manager:'', phone:'' };
  const [form, setForm] = useState<Vendor>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const save = async () => {
    if (!form.name.trim()) { setMessage('업체명을 입력해 주세요.'); return; }
    const duplicate = store.vendors.some(v => v.code.trim() && v.code.trim() === form.code.trim() && v.id !== form.id);
    if (duplicate) { setMessage('이미 사용 중인 업체코드입니다.'); return; }

    setSaving(true); setMessage('');
    const payload = {
      category: form.category,
      name: form.name.trim(),
      code: form.code.trim(),
      ceo: form.ceo.trim(),
      business_type: form.businessType.trim(),
      business_item: form.businessItem.trim(),
      registration_no: form.registrationNo.trim(),
      manager: form.manager?.trim() ?? '',
      phone: form.phone?.trim() ?? '',
    };

    const result = form.id
      ? await supabase.from('vendors').update(payload).eq('id', form.id).select().single()
      : await supabase.from('vendors').insert(payload).select().single();

    setSaving(false);
    if (result.error) { setMessage(`저장 실패: ${result.error.message}`); return; }

    const row = result.data;
    const vendor: Vendor = {
      id: row.id,
      category: row.category as Category,
      name: row.name,
      code: row.code ?? '',
      ceo: row.ceo ?? '',
      businessType: row.business_type ?? '',
      businessItem: row.business_item ?? '',
      registrationNo: row.registration_no ?? '',
      manager: row.manager ?? '',
      phone: row.phone ?? '',
    };
    setStore({ ...store, vendors: form.id ? store.vendors.map(v => v.id === form.id ? vendor : v) : [...store.vendors, vendor].sort((a,b) => a.name.localeCompare(b.name, 'ko')) });
    setOpen(false); setForm(empty);
  };

  const edit=(v:Vendor)=>{setMessage('');setForm(v);setOpen(true)};
  const remove=async(id:string)=>{
    const vendor=store.vendors.find(v=>v.id===id);
    if(!confirm(`${vendor?.name ?? '거래처'} 정보를 삭제할까요?`)) return;
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if(error){ alert(`삭제 실패: ${error.message}`); return; }
    setStore({...store,vendors:store.vendors.filter(v=>v.id!==id)});
  };
  return <><div className="toolbar"><div className="toolbar-note">Supabase에 저장되는 거래처 기본정보입니다. 다른 PC에서도 동일하게 표시됩니다.</div><button className="primary" onClick={()=>{setMessage('');setForm(empty);setOpen(true)}}><Plus size={16}/> 거래처 등록</button></div><div className="panel table-panel"><table><thead><tr><th>구분</th><th>업체명</th><th>업체코드</th><th>대표자</th><th>업태</th><th>업종</th><th>등록번호</th><th></th></tr></thead><tbody>{store.vendors.map(v=><tr key={v.id}><td><span className="category-chip">{v.category}</span></td><td><b>{v.name}</b></td><td>{v.code}</td><td>{v.ceo}</td><td>{v.businessType}</td><td>{v.businessItem}</td><td>{v.registrationNo}</td><td><div className="row-actions"><button onClick={()=>edit(v)}>수정</button><button className="danger" onClick={()=>void remove(v.id)}>삭제</button></div></td></tr>)}</tbody></table>{!store.vendors.length && <Empty text="등록된 거래처가 없습니다. 거래처 등록 버튼을 눌러 추가하세요." />}</div>{open&&<Modal title={form.id?'거래처 정보 수정':'거래처 등록'} onClose={()=>!saving&&setOpen(false)}><div className="form-grid"><Field label="구분"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as Category})}><option>부자재</option><option>상품 및 외주가공</option></select></Field><Field label="업체명"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="업체코드"><input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></Field><Field label="대표자"><input value={form.ceo} onChange={e=>setForm({...form,ceo:e.target.value})}/></Field><Field label="업태"><input value={form.businessType} onChange={e=>setForm({...form,businessType:e.target.value})}/></Field><Field label="업종"><input value={form.businessItem} onChange={e=>setForm({...form,businessItem:e.target.value})}/></Field><Field label="등록번호"><input value={form.registrationNo} onChange={e=>setForm({...form,registrationNo:e.target.value})}/></Field></div>{message&&<p style={{color:'#c2410c',margin:'12px 0 0'}}>{message}</p>}<button className="primary wide" disabled={saving} onClick={()=>void save()}>{saving?'저장 중...':'저장'}</button></Modal>}</>;
}

function ContactsPage({ store, setStore }: { store: Store; setStore: (s: Store) => void }) {
  const updateLocal=(id:string,patch:Partial<Vendor>)=>setStore({...store,vendors:store.vendors.map(v=>v.id===id?{...v,...patch}:v)});
  const saveContact=async(v:Vendor)=>{
    const { error } = await supabase.from('vendors').update({ manager: v.manager ?? '', phone: v.phone ?? '' }).eq('id', v.id);
    if(error) alert(`연락처 저장 실패: ${error.message}`);
  };
  return <><div className="toolbar"><div className="toolbar-note">담당자와 연락처는 입력 후 다른 칸을 클릭하면 Supabase에 저장됩니다.</div></div><div className="panel table-panel"><table><thead><tr><th>거래처명</th><th>담당자</th><th>연락처</th><th>분류</th></tr></thead><tbody>{store.vendors.map(v=><tr key={v.id}><td><b>{v.name}</b><small>{v.code}</small></td><td><input value={v.manager??''} onChange={e=>updateLocal(v.id,{manager:e.target.value})} onBlur={()=>void saveContact(v)}/></td><td><input value={v.phone??''} onChange={e=>updateLocal(v.id,{phone:e.target.value})} onBlur={()=>void saveContact(v)}/></td><td><span className="category-chip">{v.category}</span></td></tr>)}</tbody></table></div></>;
}

function SettingsPage({ store, setStore, monthKey }: { store: Store; setStore: (s: Store) => void; monthKey: string }) {
  const locked=store.lockedMonths.includes(monthKey);
  const toggle=async()=>{
    if(locked){
      const { error } = await supabase.from('locked_months').delete().eq('month_key', monthKey);
      if(error){ alert(`잠금 해제 실패: ${error.message}`); return; }
      setStore({...store,lockedMonths:store.lockedMonths.filter(k=>k!==monthKey)});
    } else {
      const { error } = await supabase.from('locked_months').insert({ month_key: monthKey });
      if(error){ alert(`월 마감 실패: ${error.message}`); return; }
      setStore({...store,lockedMonths:[...store.lockedMonths,monthKey]});
    }
  };
  const reset=()=>{ if(confirm('모든 로컬 데이터를 초기화할까요?')) setStore(seedStore); };
  return <div className="settings-grid"><div className="panel setting-card"><div className="setting-icon"><Lock/></div><div><h3>마감 잠금 관리</h3><p>월 마감 후 체크리스트와 집계장 수정을 막습니다.</p><button className={locked?'secondary':'primary'} onClick={() => void toggle()}>{locked?<><Unlock size={16}/> {monthKey} 잠금 해제</>:<><Lock size={16}/> {monthKey} 월 마감</>}</button></div></div><div className="panel setting-card"><div className="setting-icon"><ClipboardCheck/></div><div><h3>기본 체크리스트</h3><p>{checklistNames.join(' · ')}</p><small>현재는 회사 기본 항목으로 고정되어 있습니다.</small></div></div><div className="panel setting-card"><div className="setting-icon"><Building2/></div><div><h3>분류 관리</h3><p>상품 및 외주가공 · 부자재</p><small>집계장 합계 구분에 사용됩니다.</small></div></div><div className="panel setting-card danger-zone"><div className="setting-icon"><Trash2/></div><div><h3>데이터 초기화</h3><p>브라우저에 저장된 테스트 데이터를 삭제합니다.</p><button className="danger-button" onClick={reset}>초기화</button></div></div></div>;
}

function Stat({label,value,sub}:{label:string;value:string;sub:string}){return <div className="stat-card"><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}
function Summary({label,value,strong}:{label:string;value:number;strong?:boolean}){return <div className={strong?'summary strong':'summary'}><small>{label}</small><b>{won(value)}</b></div>}
function StatusBadge({status}:{status:Status}){return <span className={`status ${status}`}>{status}</span>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Modal({title,onClose,children,wide}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="modal-backdrop" onMouseDown={onClose}><div className={wide?'modal wide-modal':'modal'} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>}
