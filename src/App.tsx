import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronDown,
  Clock3,
  TrendingUp,
  Tag,
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

type Page = 'dashboard' | 'monthly' | 'ledger' | 'prices' | 'vendors' | 'contacts' | 'settings';
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

type ChecklistItem = { id?: string; name: string; checked: boolean; missingDate: string; missingDates: string[] };
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
type ScheduleItem = { id: string; date: string; time: string; text: string };
type PriceItem = { id: string; vendorId: string; name: string; unit: string };
type PriceHistory = { id: string; itemId: string; yearMonth: string; price: number; note: string };
type Deadline = { monthKey: string; deadlineDate: string };
type ManualUnpaid = { id: string; monthKey: string; vendorName: string; amount: number; dueDate: string; note: string };

type Store = {
  vendors: Vendor[];
  monthly: Record<string, MonthlyVendor[]>;
  ledger: Record<string, LedgerRow[]>;
  schedules: ScheduleItem[];
  priceItems: PriceItem[];
  priceHistory: PriceHistory[];
  deadlines: Deadline[];
  manualUnpaids: ManualUnpaid[];
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

const blankChecklist = (): ChecklistItem[] => checklistNames.map((name) => ({ name, checked: false, missingDate: '', missingDates: [] }));
const seedStore: Store = {
  vendors: seedVendors,
  monthly: {
    [currentKey]: [
      { id: 'm1', vendorId: 'v1', checklist: checklistNames.map((name, i) => ({ name, checked: i < 4, missingDate: i === 4 ? `${currentKey}-18` : '', missingDates: i === 4 ? [`${currentKey}-18`] : [] })), updatedAt: new Date().toISOString() },
      { id: 'm2', vendorId: 'v2', checklist: checklistNames.map((name, i) => ({ name, checked: i < 7, missingDate: '', missingDates: [] })), updatedAt: new Date().toISOString() },
    ],
  },
  ledger: {
    [currentKey]: [
      { id: 'l1', category: '부자재', vendorId: 'v1', supply: 1800000, tax: 180000, payment: '미결제', note: '' },
      { id: 'l2', category: '상품 및 외주가공', vendorId: 'v2', supply: 2500000, tax: 250000, payment: '결제', note: '' },
    ],
  },
  schedules: [{ id: 's1', date: new Date().toISOString().slice(0, 10), time: '09:00', text: '마감원장 누락 거래처 확인' }],
  priceItems: [],
  priceHistory: [],
  deadlines: [],
  manualUnpaids: [],
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
      if (!saved) return seedStore;
      const parsed = JSON.parse(saved);
      return {
        ...seedStore,
        ...parsed,
        schedules: (parsed.schedules ?? []).map((item: any) => ({ ...item, time: item.time ?? '' })),
        priceItems: parsed.priceItems ?? [],
        priceHistory: parsed.priceHistory ?? [],
        deadlines: parsed.deadlines ?? [],
        manualUnpaids: parsed.manualUnpaids ?? [],
      };
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
        supabase.from('schedules').select('*').order('schedule_date', { ascending: true }).order('schedule_time', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('locked_months').select('month_key').order('month_key', { ascending: true }),
      ]);
      if (!active) return;
      if (scheduleResult.error) console.error('일정 불러오기 실패:', scheduleResult.error.message);
      if (lockResult.error) console.error('잠금 정보 불러오기 실패:', lockResult.error.message);
      setStore((current: Store) => ({
        ...current,
        schedules: (scheduleResult.data ?? []).map((row: any) => ({ id: row.id, date: row.schedule_date, time: row.schedule_time?.slice(0,5) ?? '', text: row.content })),
        lockedMonths: (lockResult.data ?? []).map((row: any) => row.month_key),
      }));
    };
    void loadSharedData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDashboardData = async () => {
      const [itemsResult, historyResult, deadlineResult, unpaidResult] = await Promise.all([
        supabase.from('vendor_price_items').select('*').order('item_name', { ascending: true }),
        supabase.from('vendor_price_history').select('*').order('year_month', { ascending: false }),
        supabase.from('closing_deadlines').select('*').order('month_key', { ascending: true }),
        supabase.from('manual_unpaid_vendors').select('*').order('created_at', { ascending: false }),
      ]);
      if (!active) return;
      if (itemsResult.error) console.error('단가 품목 불러오기 실패:', itemsResult.error.message);
      if (historyResult.error) console.error('단가 이력 불러오기 실패:', historyResult.error.message);
      if (deadlineResult.error) console.error('마감기한 불러오기 실패:', deadlineResult.error.message);
      if (unpaidResult.error) console.error('미결제 거래처 불러오기 실패:', unpaidResult.error.message);
      setStore((current: Store) => ({
        ...current,
        priceItems: (itemsResult.data ?? []).map((r:any) => ({ id:r.id, vendorId:r.vendor_id, name:r.item_name, unit:r.unit ?? '' })),
        priceHistory: (historyResult.data ?? []).map((r:any) => ({ id:r.id, itemId:r.price_item_id, yearMonth:r.year_month, price:Number(r.price ?? 0), note:r.note ?? '' })),
        deadlines: (deadlineResult.data ?? []).map((r:any) => ({ monthKey:r.month_key, deadlineDate:r.deadline_date })),
        manualUnpaids: (unpaidResult.data ?? []).map((r:any) => ({ id:r.id, monthKey:r.month_key, vendorName:r.vendor_name, amount:Number(r.amount ?? 0), dueDate:r.due_date ?? '', note:r.note ?? '' })),
      }));
    };
    void loadDashboardData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadMonthData = async () => {
      const [monthlyResult, ledgerResult] = await Promise.all([
        supabase
          .from('monthly_vendors')
          .select('id, vendor_id, updated_at, checklist_items(id, item_name, checked, missing_date, missing_dates, sort_order)')
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
            missingDates: Array.isArray(item.missing_dates) && item.missing_dates.length ? item.missing_dates : (item.missing_date ? [item.missing_date] : []),
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
    ['prices', '거래처 단가', Tag],
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
        {page === 'prices' && <PricesPage store={store} setStore={setStore} />}
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
  const [calendarMonth, setCalendarMonth] = useState(monthKey);
  const [editing, setEditing] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [text, setText] = useState('');
  const [previousLedger, setPreviousLedger] = useState<LedgerRow[]>([]);
  const [priceDetailId, setPriceDetailId] = useState<string | null>(null);
  const [unpaidOpen, setUnpaidOpen] = useState(false);
  const [unpaidForm, setUnpaidForm] = useState({ vendorName:'', amount:'', dueDate:'', note:'' });
  const firstCompleteNames = ['거래명세서', '품의서', '세금계산서', '마감원장'];
  const isFirstComplete = (r: MonthlyVendor) => firstCompleteNames.every(name => r.checklist.find(c => c.name === name)?.checked === true);
  const statusOf = (r: MonthlyVendor) => { const n=r.checklist.filter(c=>c.checked).length; return n===0?'미진행':n===7?'최종완료':isFirstComplete(r)?'1차완료':'진행중'; };
  const progress = rows.length ? Math.round(rows.reduce((a, r) => a + r.checklist.filter(c => c.checked).length, 0) / (rows.length * checklistNames.length) * 100) : 0;
  const counts = { notStarted:rows.filter(r=>statusOf(r)==='미진행').length, progress:rows.filter(r=>statusOf(r)==='진행중').length, first:rows.filter(r=>statusOf(r)==='1차완료').length, final:rows.filter(r=>statusOf(r)==='최종완료').length };
  const schedules = store.schedules.filter(s => s.date === selectedDate).sort((a,b)=>(a.time??'').localeCompare(b.time??''));
  const calcLedger = (list: LedgerRow[]) => ({
    goods:list.filter(r=>r.category==='상품 및 외주가공').reduce((a,r)=>a+r.supply+r.tax,0),
    material:list.filter(r=>r.category==='부자재').reduce((a,r)=>a+r.supply+r.tax,0),
    supply:list.reduce((a,r)=>a+r.supply,0), tax:list.reduce((a,r)=>a+r.tax,0), total:list.reduce((a,r)=>a+r.supply+r.tax,0),
  });
  const currentAmount=calcLedger(ledger), previousAmount=calcLedger(previousLedger);
  const previousUnpaid=store.manualUnpaids.filter(r=>r.monthKey===monthKey).sort((a,b)=>b.amount-a.amount);
  const deadline=store.deadlines.find(d=>d.monthKey===monthKey)?.deadlineDate ?? `${monthKey}-${new Date(Number(monthKey.slice(0,4)),Number(monthKey.slice(5,7)),0).getDate()}`;
  const daysLeft=Math.ceil((new Date(deadline+'T23:59:59').getTime()-new Date().getTime())/86400000);

  useEffect(()=>{
    const d=new Date(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7))-2, 1);
    const prevKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    let active=true;
    void supabase.from('ledger_rows').select('*').eq('month_key',prevKey).order('created_at',{ascending:true}).then(({data,error})=>{
      if(!active) return;
      if(error){console.error('전월 집계장 불러오기 실패:',error.message);return;}
      setPreviousLedger((data??[]).map((r:any)=>({id:r.id,category:r.category as Category,vendorId:r.vendor_id??'',supply:Number(r.supply??0),tax:Number(r.tax??0),payment:r.payment as Payment,note:r.note??''})));
    });
    return()=>{active=false};
  },[monthKey]);

  const addSchedule = async () => {
    if (!text.trim()) return;
    const { data, error } = await supabase.from('schedules').insert({ schedule_date: selectedDate, schedule_time: scheduleTime || null, content: text.trim() }).select().single();
    if (error) { alert(`일정 저장 실패: ${error.message}`); return; }
    setStore({ ...store, schedules: [...store.schedules, { id: data.id, date: data.schedule_date, time: data.schedule_time?.slice(0,5) ?? '', text: data.content }] });
    setText(''); setEditing(false);
  };
  const removeSchedule = async (id: string) => { const {error}=await supabase.from('schedules').delete().eq('id',id); if(error){alert(`일정 삭제 실패: ${error.message}`);return;} setStore({...store,schedules:store.schedules.filter(x=>x.id!==id)}); };
  const saveDeadline = async (value:string) => {
    const {error}=await supabase.from('closing_deadlines').upsert({month_key:monthKey,deadline_date:value},{onConflict:'month_key'});
    if(error){alert(`마감기한 저장 실패: ${error.message}`);return;}
    setStore({...store,deadlines:[...store.deadlines.filter(d=>d.monthKey!==monthKey),{monthKey,deadlineDate:value}]});
  };
  const [cy,cm]=calendarMonth.split('-').map(Number); const first=new Date(cy,cm-1,1); const last=new Date(cy,cm,0); const cells=[...Array(first.getDay()).fill(null),...Array.from({length:last.getDate()},(_,i)=>i+1)];
  const moveCal=(delta:number)=>{const d=new Date(cy,cm-1+delta,1);setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)};
  const changes=useMemo(()=>{
    return store.priceItems.flatMap(item=>{
      const hs=store.priceHistory.filter(h=>h.itemId===item.id).sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth));
      if(hs.length<2) return [];
      const latest=hs[0],prev=hs[1]; if(latest.price===prev.price)return[];
      return [{item,latest,prev,rate:prev.price?((latest.price-prev.price)/prev.price*100):0}];
    }).sort((a,b)=>b.latest.yearMonth.localeCompare(a.latest.yearMonth)).slice(0,6);
  },[store.priceItems,store.priceHistory]);
  const selectedChange=changes.find(c=>c.item.id===priceDetailId);
  const addManualUnpaid = async () => {
    if(!unpaidForm.vendorName.trim()) return;
    const payload={month_key:monthKey,vendor_name:unpaidForm.vendorName.trim(),amount:Number(unpaidForm.amount||0),due_date:unpaidForm.dueDate||null,note:unpaidForm.note.trim()};
    const {data,error}=await supabase.from('manual_unpaid_vendors').insert(payload).select().single();
    if(error){alert(`미결제 거래처 저장 실패: ${error.message}`);return;}
    setStore({...store,manualUnpaids:[...store.manualUnpaids,{id:data.id,monthKey:data.month_key,vendorName:data.vendor_name,amount:Number(data.amount??0),dueDate:data.due_date??'',note:data.note??''}]});
    setUnpaidForm({vendorName:'',amount:'',dueDate:'',note:''}); setUnpaidOpen(false);
  };
  const removeManualUnpaid=async(id:string)=>{if(!confirm('이 미결제 거래처를 삭제할까요?'))return;const{error}=await supabase.from('manual_unpaid_vendors').delete().eq('id',id);if(error){alert(`삭제 실패: ${error.message}`);return;}setStore({...store,manualUnpaids:store.manualUnpaids.filter(x=>x.id!==id)});};

  return <div className="dashboard-v27">
    <section className="dashboard-main">
      <div className="closing-overview panel">
        <div className="overview-title"><span>{monthKey.slice(0,4)}년 {Number(monthKey.slice(5,7))}월</span><h2>마감현황</h2></div>
        <div className="progress-ring compact" style={{'--p':`${progress*3.6}deg`} as React.CSSProperties}><div><strong>{progress}%</strong><span>{rows.reduce((a,r)=>a+r.checklist.filter(c=>c.checked).length,0)} / {rows.length*7}건</span></div></div>
        <DashboardCount label="미진행" value={counts.notStarted} kind="gray"/><DashboardCount label="진행 중" value={counts.progress} kind="purple"/><DashboardCount label="1차 완료" value={counts.first} kind="green"/><DashboardCount label="최종 완료" value={counts.final} kind="violet"/>
      </div>
      <div className="amount-grid"><AmountPanel title="이번달 마감금액" amount={currentAmount}/><AmountPanel title="전월 마감금액" amount={previousAmount}/></div>
      <div className="dashboard-lists">
        <div className="panel"><div className="panel-head"><div><h3>전월 미결제 거래처</h3><p>실제 지급하지 않은 거래처를 직접 등록합니다.</p></div><button className="secondary" onClick={()=>setUnpaidOpen(true)}><Plus size={15}/> 등록</button></div><div className="data-list">{previousUnpaid.slice(0,7).map(r=><div key={r.id} className="manual-unpaid-row"><div><b>{r.vendorName}</b><small>{r.dueDate?`지급예정 ${r.dueDate}`:'지급예정일 없음'}{r.note?` · ${r.note}`:''}</small></div><strong>{won(r.amount)}</strong><button className="danger-icon" onClick={()=>void removeManualUnpaid(r.id)}><Trash2 size={14}/></button></div>)}{!previousUnpaid.length&&<Empty text="등록된 전월 미결제 거래처가 없습니다."/>}</div>{unpaidOpen&&<Modal title="전월 미결제 거래처 등록" onClose={()=>setUnpaidOpen(false)}><div className="form-grid"><Field label="거래처명"><input value={unpaidForm.vendorName} onChange={e=>setUnpaidForm({...unpaidForm,vendorName:e.target.value})}/></Field><Field label="미지급 금액"><input type="number" value={unpaidForm.amount} onChange={e=>setUnpaidForm({...unpaidForm,amount:e.target.value})}/></Field><Field label="지급 예정일"><input type="date" value={unpaidForm.dueDate} onChange={e=>setUnpaidForm({...unpaidForm,dueDate:e.target.value})}/></Field><Field label="비고"><input value={unpaidForm.note} onChange={e=>setUnpaidForm({...unpaidForm,note:e.target.value})}/></Field></div><button className="primary wide" onClick={()=>void addManualUnpaid()}>저장</button></Modal>}</div>
        <div className="panel"><div className="panel-head"><div><h3>최근 단가 변동 거래처</h3><p>클릭하면 단가 변동 내역을 확인합니다.</p></div></div><div className="data-list clickable-list">{changes.map(c=>{const v=store.vendors.find(v=>v.id===c.item.vendorId);return <button key={c.item.id} onClick={()=>setPriceDetailId(c.item.id)}><div><b>{v?.name} · {c.item.name}</b><small>{c.prev.yearMonth} → {c.latest.yearMonth}</small></div><strong className={c.rate>=0?'up':'down'}>{c.rate>=0?'▲':'▼'} {Math.abs(c.rate).toFixed(1)}%</strong></button>})}{!changes.length&&<Empty text="등록된 단가 변동이 없습니다."/>}</div></div>
      </div>
    </section>
    <aside className="dashboard-side">
      <div className="panel calendar-card"><div className="calendar-nav"><button onClick={()=>moveCal(-1)}><ChevronLeft size={16}/></button><b>{cy}년 {cm}월</b><button onClick={()=>moveCal(1)}><ChevronRight size={16}/></button></div><div className="calendar-week">{['일','월','화','수','목','금','토'].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-grid">{cells.map((day,i)=>day===null?<span key={`e${i}`}/>:<button key={day} className={`${selectedDate===`${calendarMonth}-${String(day).padStart(2,'0')}`?'selected':''} ${store.schedules.some(s=>s.date===`${calendarMonth}-${String(day).padStart(2,'0')}`)?'has-event':''}`} onClick={()=>setSelectedDate(`${calendarMonth}-${String(day).padStart(2,'0')}`)}>{day}</button>)}</div></div>
      <div className="panel today-card"><div className="panel-head"><div><h3>{selectedDate===today?'오늘 일정':'선택 날짜 일정'}</h3><p>{selectedDate}</p></div><button className="text-link" onClick={()=>setEditing(true)}>일정 추가</button></div><div className="timeline">{schedules.map(s=><div key={s.id}><time>{s.time||'시간 미정'}</time><span/><p>{s.text}</p><button onClick={()=>void removeSchedule(s.id)}><X size={14}/></button></div>)}{!schedules.length&&<Empty text="등록된 일정이 없습니다."/>}</div></div>
      <div className="deadline-v27"><CalendarDays size={20}/><div><small>이번 달 마감 기한</small><input type="date" value={deadline} onChange={e=>void saveDeadline(e.target.value)}/><span>{daysLeft>=0?`D-${daysLeft}`:`D+${Math.abs(daysLeft)}`} 남음</span></div></div>
    </aside>
    {editing&&<Modal title={`${selectedDate} 일정 추가`} onClose={()=>setEditing(false)}><div className="form-grid"><Field label="시간"><input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)}/></Field><Field label="일정"><input value={text} onChange={e=>setText(e.target.value)} placeholder="일정 내용을 입력하세요" autoFocus/></Field></div><button className="primary wide" onClick={()=>void addSchedule()}>일정 저장</button></Modal>}
    {selectedChange&&<Modal title="단가 변동 내역" onClose={()=>setPriceDetailId(null)}><div className="price-change-detail"><b>{store.vendors.find(v=>v.id===selectedChange.item.vendorId)?.name} · {selectedChange.item.name}</b><div><span>{selectedChange.prev.yearMonth}<strong>{won(selectedChange.prev.price)}</strong></span><ChevronRight/><span>{selectedChange.latest.yearMonth}<strong>{won(selectedChange.latest.price)}</strong></span></div><p>변동액 {won(selectedChange.latest.price-selectedChange.prev.price)} · 변동률 {selectedChange.rate.toFixed(1)}%</p></div></Modal>}
  </div>;
}

function DashboardCount({label,value,kind}:{label:string;value:number;kind:string}){return <div className={`dash-count ${kind}`}><small>{label}</small><strong>{value}</strong><span>건</span></div>}
function AmountPanel({title,amount}:{title:string;amount:{goods:number;material:number;supply:number;tax:number;total:number}}){return <div className="panel amount-panel"><div className="panel-head"><div><h3>{title}</h3><p>매입세금계산서 집계장 기준</p></div></div><table><thead><tr><th>구분</th><th>공급가액</th><th>세액</th><th>합계</th></tr></thead><tbody><tr><td>상품 및 외주가공</td><td colSpan={2}>집계 포함</td><td>{won(amount.goods)}</td></tr><tr><td>부자재</td><td colSpan={2}>집계 포함</td><td>{won(amount.material)}</td></tr><tr className="total"><td>총 매입 합계</td><td>{won(amount.supply)}</td><td>{won(amount.tax)}</td><td>{won(amount.total)}</td></tr></tbody></table></div>}

function MonthlyPage({ store, setStore, monthKey, locked }: { store: Store; setStore: (s: Store) => void; monthKey: string; locked: boolean }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'category' | 'status'>('name');
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const rows = store.monthly[monthKey] ?? [];
  const availableVendors = store.vendors.filter((vendor) => {
    if (rows.some((row) => row.vendorId === vendor.id)) return false;
    const keyword = addQuery.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return true;
    return [vendor.name, vendor.code, vendor.category].some((value) => value.toLocaleLowerCase('ko-KR').includes(keyword));
  });
  const statusOf = (r: MonthlyVendor): Status => { const n = r.checklist.filter(c => c.checked).length; return n === 0 ? '미진행' : n === 7 ? '완료' : '진행중'; };
  const firstCompleteNames = ['거래명세서', '품의서', '세금계산서', '마감원장'];
  const isFirstComplete = (r: MonthlyVendor) => firstCompleteNames.every(name => r.checklist.find(c => c.name === name)?.checked === true);
  const counts = {
    total: rows.length,
    notStarted: rows.filter(r => statusOf(r) === '미진행').length,
    inProgress: rows.filter(r => statusOf(r) === '진행중' && !isFirstComplete(r)).length,
    firstComplete: rows.filter(r => isFirstComplete(r) && statusOf(r) !== '완료').length,
    complete: rows.filter(r => statusOf(r) === '완료').length,
  };
  const averageProgress = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.checklist.filter(c => c.checked).length / checklistNames.length * 100, 0) / rows.length) : 0;
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
    const checklistResult = await supabase.from('checklist_items').insert(checklistNames.map((name, index) => ({ monthly_vendor_id: monthlyResult.data.id, item_name: name, checked: false, missing_date: null, missing_dates: [], sort_order: index }))).select();
    if (checklistResult.error) {
      await supabase.from('monthly_vendors').delete().eq('id', monthlyResult.data.id);
      alert(`체크리스트 생성 실패: ${checklistResult.error.message}`); setWorking(false); return;
    }
    const ledgerResult = await supabase.from('ledger_rows').insert({ month_key: monthKey, category: vendor.category, vendor_id: vendorId, supply: 0, tax: 0, payment: '미결제', note: '' }).select().single();
    if (ledgerResult.error) {
      await supabase.from('monthly_vendors').delete().eq('id', monthlyResult.data.id);
      alert(`집계장 자동 추가 실패로 전체 작업을 취소했습니다: ${ledgerResult.error.message}`);
      setWorking(false);
      return;
    }
    const newMonthly: MonthlyVendor = {
      id: monthlyResult.data.id, vendorId, updatedAt: monthlyResult.data.updated_at,
      checklist: (checklistResult.data ?? []).sort((a,b) => a.sort_order-b.sort_order).map(item => ({ id:item.id, name:item.item_name, checked:item.checked, missingDate:item.missing_date ?? '', missingDates: Array.isArray(item.missing_dates) ? item.missing_dates : (item.missing_date ? [item.missing_date] : []) }))
    };
    const nextStore: Store = {
      ...store,
      monthly: { ...store.monthly, [monthKey]: [...rows, newMonthly] },
      ledger: { ...store.ledger, [monthKey]: [...(store.ledger[monthKey] ?? []), { id: ledgerResult.data.id, category: ledgerResult.data.category as Category, vendorId: ledgerResult.data.vendor_id, supply: Number(ledgerResult.data.supply), tax: Number(ledgerResult.data.tax), payment: ledgerResult.data.payment as Payment, note: ledgerResult.data.note ?? '' }] },
    };
    setStore(nextStore); setShowAdd(false); setAddQuery(''); setWorking(false);
  };
  const updateChecklist = async (rowId: string, index: number, patch: Partial<ChecklistItem>) => {
    if (locked) return;
    const row = rows.find(r => r.id === rowId);
    const item = row?.checklist[index];
    if (!row || !item?.id) return;
    const nextItem = { ...item, ...patch };
    const nextRows = rows.map(r => r.id === rowId ? { ...r, updatedAt: new Date().toISOString(), checklist: r.checklist.map((c,i) => i === index ? nextItem : c) } : r);
    setStore({ ...store, monthly: { ...store.monthly, [monthKey]: nextRows } });
    const normalizedDates = [...new Set((nextItem.missingDates ?? []).filter(Boolean))].sort();
    const { error } = await supabase.from('checklist_items').update({ checked: nextItem.checked, missing_date: normalizedDates[0] || null, missing_dates: normalizedDates }).eq('id', item.id);
    if (error) {
      setStore({ ...store, monthly: { ...store.monthly, [monthKey]: rows } });
      alert(`체크리스트 저장 실패: ${error.message}`);
      return;
    }
    await supabase.from('monthly_vendors').update({ updated_at: new Date().toISOString() }).eq('id', rowId);
  };
  const addMissingDate = async (rowId: string, index: number) => {
    const row = rows.find(r => r.id === rowId);
    const item = row?.checklist[index];
    if (!item) return;
    const dates = item.missingDates ?? (item.missingDate ? [item.missingDate] : []);
    await updateChecklist(rowId, index, { missingDates: [...dates, ''], missingDate: dates.find(Boolean) ?? '' });
  };
  const changeMissingDate = async (rowId: string, index: number, dateIndex: number, value: string) => {
    const row = rows.find(r => r.id === rowId);
    const item = row?.checklist[index];
    if (!item) return;
    const dates = [...(item.missingDates ?? [])];
    dates[dateIndex] = value;
    await updateChecklist(rowId, index, { missingDates: dates, missingDate: dates.find(Boolean) ?? '' });
  };
  const removeMissingDate = async (rowId: string, index: number, dateIndex: number) => {
    const row = rows.find(r => r.id === rowId);
    const item = row?.checklist[index];
    if (!item) return;
    const dates = (item.missingDates ?? []).filter((_, i) => i !== dateIndex);
    await updateChecklist(rowId, index, { missingDates: dates, missingDate: dates[0] ?? '' });
  };
  const removeMonthlyVendor = async (row: MonthlyVendor) => {
    if (locked || working) return;
    const vendor = store.vendors.find(v => v.id === row.vendorId);
    const vendorName = vendor?.name ?? '선택한 거래처';
    if (!confirm(`${vendorName}를 ${monthKey} 월별 마감 현황에서 삭제할까요?\n\n체크리스트와 같은 달 집계장 내역도 함께 삭제됩니다.`)) return;

    setWorking(true);
    const { error: monthlyError } = await supabase.from('monthly_vendors').delete().eq('id', row.id);
    if (monthlyError) {
      alert(`월별 마감 거래처 삭제 실패: ${monthlyError.message}`);
      setWorking(false);
      return;
    }

    const { error: ledgerError } = await supabase
      .from('ledger_rows')
      .delete()
      .eq('month_key', monthKey)
      .eq('vendor_id', row.vendorId);

    const nextMonthlyRows = rows.filter(r => r.id !== row.id);
    const currentLedgerRows = store.ledger[monthKey] ?? [];
    const nextLedgerRows = ledgerError
      ? currentLedgerRows
      : currentLedgerRows.filter(ledgerRow => ledgerRow.vendorId !== row.vendorId);

    setStore({
      ...store,
      monthly: { ...store.monthly, [monthKey]: nextMonthlyRows },
      ledger: { ...store.ledger, [monthKey]: nextLedgerRows },
    });
    if (detailId === row.id) setDetailId(null);
    setWorking(false);

    if (ledgerError) {
      alert(`월별 마감 거래처는 삭제됐지만 집계장 내역 삭제에 실패했습니다: ${ledgerError.message}`);
      return;
    }
    alert(`${vendorName}가 삭제되었습니다.`);
  };
  const detail = rows.find(r => r.id === detailId);
  const detailVendor = detail ? store.vendors.find(v => v.id === detail.vendorId) : undefined;
  return <>
    <div className="monthly-status-grid">
      <div className="monthly-status-card"><small>전체 거래처</small><strong>{counts.total}</strong></div>
      <div className="monthly-status-card"><small>미진행</small><strong>{counts.notStarted}</strong></div>
      <div className="monthly-status-card"><small>진행중</small><strong>{counts.inProgress}</strong></div>
      <div className="monthly-status-card first"><small>1차완료</small><strong>{counts.firstComplete}</strong></div>
      <div className="monthly-status-card complete-card"><small>완료</small><strong>{counts.complete}</strong></div>
      <div className="monthly-status-card"><small>평균 진행률</small><strong>{averageProgress}%</strong></div>
    </div>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="거래처명 검색" value={query} onChange={e => setQuery(e.target.value)}/></div><select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="name">거래처명순</option><option value="category">분류순</option><option value="status">마감상태순</option></select><button className="primary" onClick={() => setShowAdd(true)} disabled={locked || working}><Plus size={16}/> 거래처 추가</button></div>
    <div className="panel table-panel"><table><thead><tr><th>거래처명</th><th>분류</th><th>진행률</th><th>누락</th><th>마감상태</th><th>최근 수정</th><th>삭제</th><th></th></tr></thead><tbody>{filtered.map(r => { const v = store.vendors.find(v => v.id === r.vendorId)!; const done = r.checklist.filter(c => c.checked).length; const missingCount = r.checklist.reduce((total, item) => {
  const dates =
    Array.isArray(item.missingDates) && item.missingDates.length > 0
      ? item.missingDates
      : item.missingDate
        ? [item.missingDate]
        : [];

  return total + dates.filter(Boolean).length;
}, 0); const status = statusOf(r); const firstComplete = isFirstComplete(r); return <tr key={r.id} onClick={() => setDetailId(r.id)} className="clickable"><td><b>{v?.name}</b><small>{v?.code}</small></td><td><span className="category-chip">{v?.category}</span></td><td><div className="progress-cell"><div><span style={{width:`${done/7*100}%`}}/></div><b>{done}/7</b></div></td><td>
  {missingCount > 0 ? (
    <span className="missing">누락 {missingCount}건</span>
  ) : (
    <span className="complete">없음</span>
  )}
</td><td><div className="status-stack"><StatusBadge status={status}/>{firstComplete && status !== '완료' && <span className="first-complete-badge">1차완료</span>}</div></td><td>{new Date(r.updatedAt).toLocaleDateString('ko-KR')}</td><td><button className="monthly-delete-button" disabled={locked || working} title={locked ? '마감 잠금 해제 후 삭제할 수 있습니다.' : `${v?.name ?? '거래처'} 삭제`} onClick={e => { e.stopPropagation(); void removeMonthlyVendor(r); }}><Trash2 size={15}/> 삭제</button></td><td><ChevronRight size={17}/></td></tr>})}</tbody></table>{!filtered.length && <Empty text="검색 결과가 없습니다." />}</div>
    {showAdd && <Modal title="거래처 정보에서 추가" onClose={() => { if (!working) { setShowAdd(false); setAddQuery(''); } }}><div className="modal-search search"><Search size={17}/><input autoFocus placeholder="업체명·분류 검색" value={addQuery} onChange={e => setAddQuery(e.target.value)}/></div><div className="select-list">{availableVendors.map(v => <button key={v.id} disabled={working} onClick={() => void addVendor(v.id)}><div><b>{v.name}</b><small>{v.category}</small></div><Plus size={17}/></button>)}{!availableVendors.length && <Empty text={addQuery ? "검색 결과가 없습니다." : "추가 가능한 거래처가 없습니다."} />}</div></Modal>}
    {detail && detailVendor && <Modal title={detailVendor.name} onClose={() => setDetailId(null)} wide><div className="detail-summary"><div><small>현재 상태</small><div className="status-stack"><StatusBadge status={statusOf(detail)}/>{isFirstComplete(detail) && statusOf(detail) !== '완료' && <span className="first-complete-badge">1차완료</span>}</div></div><div><small>진행률</small><b>{Math.round(detail.checklist.filter(c=>c.checked).length/7*100)}%</b></div><div><small>최근 수정</small><b>{new Date(detail.updatedAt).toLocaleString('ko-KR')}</b></div></div><div className="checklist">{detail.checklist.map((c,i) => { const dates = c.missingDates ?? (c.missingDate ? [c.missingDate] : []); return <div key={c.id ?? c.name} className={c.checked ? 'done' : ''}><label><input type="checkbox" checked={c.checked} disabled={locked} onChange={e => void updateChecklist(detail.id, i, { checked: e.target.checked, missingDate: c.missingDate, missingDates: dates })}/><span>{c.checked && <Check size={15}/>}</span><b>{c.name}</b></label><div className="missing-dates"><div className="missing-dates-head"><span>누락일</span><button type="button" disabled={locked} onClick={() => void addMissingDate(detail.id, i)}><Plus size={14}/> 날짜 추가</button></div>{dates.map((date, dateIndex) => <div className="missing-date-row" key={`${c.id}-${dateIndex}`}><input type="date" value={date} disabled={locked} onChange={e => void changeMissingDate(detail.id, i, dateIndex, e.target.value)}/><button type="button" disabled={locked} aria-label="누락일 삭제" onClick={() => void removeMissingDate(detail.id, i, dateIndex)}><X size={14}/></button></div>)}{!dates.length && <small className="no-missing-date">등록된 누락일 없음</small>}</div></div>})}</div>{locked && <div className="locked-note"><Lock size={16}/> 월 마감되어 수정할 수 없습니다.</div>}</Modal>}
  </>;
}

function LedgerPage({ store, setStore, monthKey, locked }: { store: Store; setStore: (s: Store) => void; monthKey: string; locked: boolean }) {
  const rows = store.ledger[monthKey] ?? [];
  const categoryOrder: Record<Category, number> = {'상품 및 외주가공':0,'부자재':1};
  const sortedRows = [...rows].sort((a,b)=>{const c=categoryOrder[a.category]-categoryOrder[b.category];if(c!==0)return c;const an=store.vendors.find(v=>v.id===a.vendorId)?.name??'';const bn=store.vendors.find(v=>v.id===b.vendorId)?.name??'';return an.localeCompare(bn,'ko');});
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
    const body = sortedRows.map((r, i) => { const v = store.vendors.find(v => v.id === r.vendorId); return [i + 1, r.category, v?.name ?? '', v?.code ?? '', v?.ceo ?? '', v?.businessType ?? '', v?.businessItem ?? '', v?.registrationNo ?? '', r.supply, r.tax, r.supply + r.tax, r.payment, r.note]; });
    body.push([]); body.push(['', '상품 및 외주가공 합계 (a)', '', '', '', '', '', '', '', '', a]); body.push(['', '부자재 미결제분', '', '', '', '', '', '', '', '', unpaid]); body.push(['', '부자재 결제완료', '', '', '', '', '', '', '', '', paid]); body.push(['', '부자재 소계 (b)', '', '', '', '', '', '', '', '', b]); body.push(['', '총 매입 합계 (a+b)', '', '', '', '', '', '', '', '', a + b]);
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
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
    <div className="panel table-panel ledger-table"><table><thead><tr><th>No</th><th>구분</th><th>업체명/코드 검색</th><th>대표자</th><th>업태</th><th>업종</th><th>등록번호</th><th>공급가액</th><th>세액</th><th>합계금액</th><th>결제여부</th><th>비고</th><th>삭제</th></tr></thead><tbody>{sortedRows.map((r,i) => { const v = store.vendors.find(v => v.id === r.vendorId); const total = r.supply + r.tax; return <tr key={r.id}><td>{i+1}</td><td><select value={r.category} disabled={locked} onChange={e => void update(r.id,{category:e.target.value as Category})}><option>상품 및 외주가공</option><option>부자재</option></select></td><td><select value={r.vendorId} disabled={locked} onChange={e => { const nv=store.vendors.find(v=>v.id===e.target.value); if(nv) void update(r.id,{vendorId:nv.id,category:nv.category}); }}><option value="">선택</option>{store.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td><td>{v?.ceo}</td><td>{v?.businessType}</td><td>{v?.businessItem}</td><td>{v?.registrationNo}</td><td><input className="money" type="number" value={r.supply || ''} disabled={locked} onChange={e => { const supply=Number(e.target.value); void update(r.id,{supply,tax:Math.round(supply*0.1)}); }}/></td><td><input className="money" type="number" value={r.tax || ''} disabled={locked} onChange={e => void update(r.id,{tax:Number(e.target.value)})}/></td><td><b>{total.toLocaleString()}</b></td><td><select value={r.payment} disabled={locked} onChange={e => void update(r.id,{payment:e.target.value as Payment})}><option value="미결제">미결제</option><option value="결제">결제</option></select></td><td><input value={r.note} disabled={locked} onChange={e=>void update(r.id,{note:e.target.value})}/></td><td><button className="danger-icon" disabled={locked} onClick={() => void remove(r.id)}><Trash2 size={16}/></button></td></tr>})}</tbody></table>{!rows.length && <Empty text="등록된 집계장 내역이 없습니다." />}</div>
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
    const [monthlyUsage, ledgerUsage] = await Promise.all([
      supabase.from('monthly_vendors').select('id', { count: 'exact', head: true }).eq('vendor_id', id),
      supabase.from('ledger_rows').select('id', { count: 'exact', head: true }).eq('vendor_id', id),
    ]);
    if (monthlyUsage.error || ledgerUsage.error) {
      alert(`사용 여부 확인 실패: ${monthlyUsage.error?.message ?? ledgerUsage.error?.message}`);
      return;
    }
    if ((monthlyUsage.count ?? 0) > 0 || (ledgerUsage.count ?? 0) > 0) {
      alert(`${vendor?.name ?? '거래처'}는 월별 마감 또는 집계장에서 사용 중이라 삭제할 수 없습니다.`);
      return;
    }
    if(!confirm(`${vendor?.name ?? '거래처'} 정보를 삭제할까요?`)) return;
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if(error){ alert(`삭제 실패: ${error.message}`); return; }
    setStore({...store,vendors:store.vendors.filter(v=>v.id!==id)});
  };
  return <><div className="toolbar"><div className="toolbar-note">Supabase에 저장되는 거래처 기본정보입니다. 다른 PC에서도 동일하게 표시됩니다.</div><button className="primary" onClick={()=>{setMessage('');setForm(empty);setOpen(true)}}><Plus size={16}/> 거래처 등록</button></div><div className="panel table-panel"><table><thead><tr><th>구분</th><th>업체명</th><th>대표자</th><th>업태</th><th>업종</th><th>등록번호</th><th></th></tr></thead><tbody>{store.vendors.map(v=><tr key={v.id}><td><span className={`category-chip ${v.category==='부자재'?'material':'goods'}`}>{v.category}</span></td><td><b>{v.name}</b></td><td>{v.ceo}</td><td>{v.businessType}</td><td>{v.businessItem}</td><td>{v.registrationNo}</td><td><div className="row-actions"><button onClick={()=>edit(v)}>수정</button><button className="danger" onClick={()=>void remove(v.id)}>삭제</button></div></td></tr>)}</tbody></table>{!store.vendors.length && <Empty text="등록된 거래처가 없습니다. 거래처 등록 버튼을 눌러 추가하세요." />}</div>{open&&<Modal title={form.id?'거래처 정보 수정':'거래처 등록'} onClose={()=>!saving&&setOpen(false)}><div className="form-grid"><Field label="구분"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as Category})}><option>부자재</option><option>상품 및 외주가공</option></select></Field><Field label="업체명"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="대표자"><input value={form.ceo} onChange={e=>setForm({...form,ceo:e.target.value})}/></Field><Field label="업태"><input value={form.businessType} onChange={e=>setForm({...form,businessType:e.target.value})}/></Field><Field label="업종"><input value={form.businessItem} onChange={e=>setForm({...form,businessItem:e.target.value})}/></Field><Field label="등록번호"><input value={form.registrationNo} onChange={e=>setForm({...form,registrationNo:e.target.value})}/></Field></div>{message&&<p style={{color:'#c2410c',margin:'12px 0 0'}}>{message}</p>}<button className="primary wide" disabled={saving} onClick={()=>void save()}>{saving?'저장 중...':'저장'}</button></Modal>}</>;
}

function PricesPage({ store, setStore }: { store: Store; setStore: (s: Store) => void }) {
  const [vendorId,setVendorId]=useState(store.vendors[0]?.id??'');
  const [itemName,setItemName]=useState(''); const [unit,setUnit]=useState('');
  const [editingItem,setEditingItem]=useState<PriceItem|null>(null); const [yearMonth,setYearMonth]=useState(currentKey); const [price,setPrice]=useState(''); const [note,setNote]=useState('');
  const items=store.priceItems.filter(i=>i.vendorId===vendorId);
  const addItem=async()=>{if(!vendorId||!itemName.trim())return;const{data,error}=await supabase.from('vendor_price_items').insert({vendor_id:vendorId,item_name:itemName.trim(),unit:unit.trim()}).select().single();if(error){alert(`품목 저장 실패: ${error.message}`);return;}setStore({...store,priceItems:[...store.priceItems,{id:data.id,vendorId:data.vendor_id,name:data.item_name,unit:data.unit??''}]});setItemName('');setUnit('');};
  const addPrice=async()=>{if(!editingItem||!yearMonth||!price)return;const payload={price_item_id:editingItem.id,year_month:yearMonth,price:Number(price),note};const{data,error}=await supabase.from('vendor_price_history').upsert(payload,{onConflict:'price_item_id,year_month'}).select().single();if(error){alert(`단가 저장 실패: ${error.message}`);return;}const row={id:data.id,itemId:data.price_item_id,yearMonth:data.year_month,price:Number(data.price),note:data.note??''};setStore({...store,priceHistory:[...store.priceHistory.filter(h=>!(h.itemId===row.itemId&&h.yearMonth===row.yearMonth)),row]});setPrice('');setNote('');};
  const removeItem=async(item:PriceItem)=>{if(!confirm(`${item.name} 품목과 단가 이력을 삭제할까요?`))return;const{error}=await supabase.from('vendor_price_items').delete().eq('id',item.id);if(error){alert(`삭제 실패: ${error.message}`);return;}setStore({...store,priceItems:store.priceItems.filter(i=>i.id!==item.id),priceHistory:store.priceHistory.filter(h=>h.itemId!==item.id)});};
  return <><div className="toolbar"><select value={vendorId} onChange={e=>setVendorId(e.target.value)}>{store.vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><div className="toolbar-note">거래처별 품목과 연월별 단가를 관리합니다.</div></div><div className="price-layout"><div className="panel"><div className="panel-head"><div><h3>품목 등록</h3><p>한 거래처에 여러 품목을 추가할 수 있습니다.</p></div></div><div className="form-grid"><Field label="품목명"><input value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="예: 공업용 랩"/></Field><Field label="단위"><input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="예: 롤, kg, 장"/></Field></div><button className="primary wide" onClick={()=>void addItem()}><Plus size={15}/> 품목 추가</button></div><div className="panel table-panel"><table><thead><tr><th>품목명</th><th>단위</th><th>최근 단가</th><th>최근 적용월</th><th></th></tr></thead><tbody>{items.map(item=>{const hs=store.priceHistory.filter(h=>h.itemId===item.id).sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth));return <tr key={item.id}><td><b>{item.name}</b></td><td>{item.unit||'-'}</td><td>{hs[0]?won(hs[0].price):'-'}</td><td>{hs[0]?.yearMonth??'-'}</td><td><div className="row-actions"><button onClick={()=>setEditingItem(item)}>단가 입력</button><button className="danger" onClick={()=>void removeItem(item)}>삭제</button></div></td></tr>})}</tbody></table>{!items.length&&<Empty text="등록된 품목이 없습니다."/>}</div></div>{editingItem&&<Modal title={`${editingItem.name} 단가 이력`} onClose={()=>setEditingItem(null)} wide><div className="form-grid"><Field label="적용 연월"><input type="month" value={yearMonth} onChange={e=>setYearMonth(e.target.value)}/></Field><Field label="단가"><input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0"/></Field><Field label="비고"><input value={note} onChange={e=>setNote(e.target.value)}/></Field></div><button className="primary wide" onClick={()=>void addPrice()}>단가 저장</button><div className="price-history"><h4>변동 이력</h4>{store.priceHistory.filter(h=>h.itemId===editingItem.id).sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth)).map((h,i,arr)=>{const prev=arr[i+1];return <div key={h.id}><span>{h.yearMonth}</span><b>{won(h.price)}</b><em>{prev?`${h.price-prev.price>=0?'+':''}${won(h.price-prev.price)}`:'최초'}</em></div>})}</div></Modal>}</>;
}

function ContactsPage({ store, setStore }: { store: Store; setStore: (s: Store) => void }) {
  const updateLocal=(id:string,patch:Partial<Vendor>)=>setStore({...store,vendors:store.vendors.map(v=>v.id===id?{...v,...patch}:v)});
  const saveContact=async(v:Vendor)=>{
    const { error } = await supabase.from('vendors').update({ manager: v.manager ?? '', phone: v.phone ?? '' }).eq('id', v.id);
    if(error) alert(`연락처 저장 실패: ${error.message}`);
  };
  return <><div className="toolbar"><div className="toolbar-note">담당자와 연락처는 입력 후 다른 칸을 클릭하면 Supabase에 저장됩니다.</div></div><div className="panel table-panel"><table><thead><tr><th>거래처명</th><th>담당자</th><th>연락처</th><th>분류</th></tr></thead><tbody>{store.vendors.map(v=><tr key={v.id}><td><b>{v.name}</b><small>{v.code}</small></td><td><input value={v.manager??''} onChange={e=>updateLocal(v.id,{manager:e.target.value})} onBlur={()=>void saveContact(v)}/></td><td><input value={v.phone??''} onChange={e=>updateLocal(v.id,{phone:e.target.value})} onBlur={()=>void saveContact(v)}/></td><td><span className={`category-chip ${v.category==='부자재'?'material':'goods'}`}>{v.category}</span></td></tr>)}</tbody></table></div></>;
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
