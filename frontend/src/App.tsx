import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, ChevronDown,
  CircleHelp, Download, ExternalLink, LayoutDashboard, LoaderCircle,
  MapPin, Menu, RefreshCw, Search, Sparkles, Store, Target, TrendingUp, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const API = `${(import.meta.env.VITE_API_URL || 'https://retailiq-api-ez9o.onrender.com').replace(/\/$/, '')}/api`;
const CHART_COLORS = ['#6b8afd', '#50c7aa', '#f4b65f', '#b48afa', '#f47b7b'];

type View = 'overview' | 'stores' | 'sales' | 'segments' | 'model';
type Overview = {
  total_sales: number;
  sales_records: number;
  stores: number;
  departments: number;
  average_weekly_sales: number;
  date_start: string;
  date_end: string;
};
type TrendRow = { period: string; sales: number };
type StoreRow = {
  Store: number;
  total_sales: number;
  avg_weekly_sales: number;
  sales_volatility: number;
  store_type: string;
  size: number;
};
type SegmentRow = {
  Store: number;
  avg_sales: number;
  sales_std: number;
  sales_cv: number;
  size: number;
  store_type: string;
  cluster: number;
};
type Evaluation = {
  model: string;
  test_rows: number;
  train_end: string;
  test_start: string;
  mae: number;
  rmse: number;
  r2: number;
  baseline_mae: number;
  baseline_rmse: number;
  feature_importance: { feature: string; importance: number }[];
};
type DashboardData = {
  overview: Overview;
  stores: StoreRow[];
  trend: TrendRow[];
  segments: SegmentRow[];
};

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'stores', label: 'Store performance', icon: Store },
  { id: 'sales', label: 'Sales analytics', icon: TrendingUp },
  { id: 'segments', label: 'Store segments', icon: Target },
  { id: 'model', label: 'Model evaluation', icon: Sparkles },
];

const money = (value: number, compact = false) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  notation: compact ? 'compact' : 'standard',
}).format(value);

const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [granularity, setGranularity] = useState<'month' | 'week'>('month');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [modelBusy, setModelBusy] = useState(false);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [overview, stores, trend, segments] = await Promise.all([
        getJson<Overview>('/overview'),
        getJson<StoreRow[]>('/stores'),
        getJson<TrendRow[]>(`/sales/trend?granularity=${granularity}`),
        getJson<SegmentRow[]>('/segments'),
      ]);
      setData({ overview, stores, trend, segments });
    } catch (reason) {
      setError(reason instanceof Error
        ? `Unable to load analytics. ${reason.message}`
        : 'Unable to load analytics. Check that the RetailIQ API is running and accessible.');
    } finally {
      setBusy(false);
    }
  }, [granularity]);

  useEffect(() => { void refresh(); }, [refresh]);

  const refreshEvaluation = useCallback(async () => {
    setModelBusy(true);
    setModelError('');
    try {
      setEvaluation(await getJson<Evaluation>('/model/evaluation'));
    } catch (reason) {
      setModelError(reason instanceof Error
        ? `Unable to evaluate the model. ${reason.message}`
        : 'Unable to evaluate the model. Check the API and try again.');
    } finally {
      setModelBusy(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'model' && !evaluation && !modelBusy && !modelError) {
      void refreshEvaluation();
    }
  }, [view, evaluation, modelBusy, modelError, refreshEvaluation]);

  const refreshAll = () => {
    void refresh();
    if (view === 'model') {
      setEvaluation(null);
      setModelError('');
    }
  };

  const filteredStores = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return data.stores.filter((store) =>
      !term || `store ${store.Store} ${store.store_type}`.toLowerCase().includes(term),
    );
  }, [data, query]);

  const selectView = (nextView: View) => {
    setView(nextView);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); selectView('overview'); }}>
          <span className="brand-mark"><BarChart3 size={21} strokeWidth={2.4} /></span>
          <span className="brand-copy"><b>RetailIQ</b><small>RETAIL INTELLIGENCE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item${view === id ? ' nav-active' : ''}`} onClick={() => selectView(id)}>
              <Icon size={17} strokeWidth={1.9} /><span>{label}</span>
              {view === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-card">
            <div className="source-title"><span className="status-dot" /> DATA SOURCE</div>
            <b>Walmart weekly sales</b>
            <small>Historical dataset · 2010–2012</small>
          </div>
          <div className="side-user">
            <span className="user-avatar">R</span>
            <span><b>Retail analyst</b><small>Analytics workspace</small></span>
            <CircleHelp size={17} className="help-icon" />
          </div>
        </div>
      </aside>

      {menuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="menu-toggle icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>RetailIQ</span><span className="crumb-slash">/</span><b>{NAV_ITEMS.find((item) => item.id === view)?.label}</b></div>
          <div className="topbar-actions">
            <div className="period-pill"><CalendarDays size={15} /><span>{data ? `${data.overview.date_start} — ${data.overview.date_end}` : 'Dataset period'}</span><ChevronDown size={14} /></div>
            <button className="icon-button refresh-button" title="Refresh analytics" onClick={refreshAll} disabled={busy || modelBusy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={16} />}
            </button>
            <span className="avatar-small">R</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> RETAIL ANALYTICS PLATFORM</div>
              <h1>{headingFor(view)}</h1>
              <p>{descriptionFor(view)}</p>
            </div>
            <button className="primary-button" onClick={refreshAll} disabled={busy || modelBusy}>
              {busy || modelBusy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={15} />}
              {busy || modelBusy ? 'Updating' : 'Refresh data'}
            </button>
          </div>

          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}
          {busy && !data ? <LoadingState /> : data ? (
            <>
              {view === 'overview' && <OverviewView data={data} granularity={granularity} setGranularity={setGranularity} />}
              {view === 'stores' && <StoresView stores={filteredStores} query={query} setQuery={setQuery} />}
              {view === 'sales' && <SalesView data={data} granularity={granularity} setGranularity={setGranularity} />}
              {view === 'segments' && <SegmentsView segments={data.segments} />}
              {view === 'model' && (evaluation
                ? <ModelView evaluation={evaluation} />
                : modelError
                  ? <div className="model-error" role="alert"><span>{modelError}</span><button className="primary-button" onClick={() => { setModelError(''); void refreshEvaluation(); }}>Retry evaluation</button></div>
                  : <LoadingState />)}
            </>
          ) : !error ? <LoadingState /> : null}
          <footer className="page-footer">
            <span>RetailIQ <span className="footer-dot">·</span> Sales intelligence for better retail decisions</span>
            <a href={`${API.replace(/\/api$/, '')}/docs`} target="_blank" rel="noreferrer">API documentation <ExternalLink size={12} /></a>
          </footer>
        </div>
      </main>
    </div>
  );
}

function headingFor(view: View) {
  return ({
    overview: 'Your retail, in focus.',
    stores: 'Know every store.',
    sales: 'Follow the sales story.',
    segments: 'Find the store patterns.',
    model: 'Measure what the model knows.',
  })[view];
}

function descriptionFor(view: View) {
  return ({
    overview: 'A clear picture of sales, store performance, and the signals shaping your business.',
    stores: 'Compare locations side by side and find the stores setting the pace.',
    sales: 'Explore how weekly sales move through the calendar.',
    segments: 'Group stores by sales scale, variability, and physical footprint.',
    model: 'Evaluate a time-aware sales estimate against a simple seasonal benchmark.',
  })[view];
}

function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" size={23} /><span>Loading your retail insights…</span></div>;
}

function KpiCard({ label, value, note, icon: Icon, tone, badge }: {
  label: string; value: string; note: string; icon: typeof Store; tone: string; badge?: string;
}) {
  return (
    <article className="kpi-card">
      <div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${tone}`}><Icon size={17} strokeWidth={1.9} /></span></div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot"><span>{note}</span>{badge && <span className="kpi-badge"><Activity size={11} /> {badge}</span>}</div>
    </article>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><b>{label}</b>{payload.map((item, index) => (
    <div key={`${item.name}-${index}`}><i style={{ background: item.color }} />{item.name || 'Sales'} <strong>{money(item.value)}</strong></div>
  ))}</div>;
}

function TrendChart({ trend, granularity, setGranularity, large = false }: {
  trend: TrendRow[]; granularity: 'month' | 'week'; setGranularity: (value: 'month' | 'week') => void; large?: boolean;
}) {
  const formattedTrend = trend.map((row) => ({
    ...row,
    label: granularity === 'month'
      ? new Date(`${row.period}-02T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : new Date(`${row.period.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
  return (
    <section className={`surface-card chart-card${large ? ' chart-large' : ''}`}>
      <div className="card-heading">
        <div><h2>Sales over time</h2><p>{granularity === 'month' ? 'Monthly sales across the dataset' : 'Weekly sales across the dataset'}</p></div>
        <div className="segmented-control" aria-label="Trend interval">
          {(['month', 'week'] as const).map((option) => (
            <button key={option} className={granularity === option ? 'selected' : ''} onClick={() => setGranularity(option)}>{option}</button>
          ))}
        </div>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedTrend} margin={{ top: 8, right: 7, left: -10, bottom: 0 }}>
            <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6385ff" stopOpacity={0.24} /><stop offset="95%" stopColor="#6385ff" stopOpacity={0.015} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 5" />
            <XAxis dataKey="label" tick={{ fill: '#8b94a6', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
            <YAxis tickFormatter={(value: number) => money(value, true)} tick={{ fill: '#8b94a6', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="sales" name="Sales" stroke="#6989ff" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 4, strokeWidth: 0, fill: '#6989ff' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend"><span><i className="legend-dot blue" /> Recorded weekly sales</span><span>USD</span></div>
    </section>
  );
}

function TopStoresChart({ stores }: { stores: StoreRow[] }) {
  const topStores = stores.slice(0, 6).map((store) => ({ ...store, label: `Store ${store.Store}` })).reverse();
  return (
    <section className="surface-card chart-card">
      <div className="card-heading"><div><h2>Leading stores</h2><p>Highest cumulative sales</p></div><span className="subtle-link"><MapPin size={14} /> Top 6</span></div>
      <div className="chart-container bar-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topStores} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="#edf0f5" strokeDasharray="3 5" />
            <XAxis type="number" tickFormatter={(value: number) => money(value, true)} tick={{ fill: '#8b94a6', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={62} tick={{ fill: '#616c80', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f5f7fb' }} />
            <Bar dataKey="total_sales" name="Sales" fill="#50bda5" radius={[0, 5, 5, 0]} barSize={15} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend"><span><i className="legend-dot green" /> Total recorded sales</span><span>USD</span></div>
    </section>
  );
}

function OverviewView({ data, granularity, setGranularity }: {
  data: DashboardData; granularity: 'month' | 'week'; setGranularity: (value: 'month' | 'week') => void;
}) {
  return <>
    <div className="section-kicker"><span>AT A GLANCE</span><span className="kicker-rule" /><span className="data-caption">ALL STORES · ALL DEPARTMENTS</span></div>
    <div className="kpi-grid">
      <KpiCard label="Total recorded sales" value={money(data.overview.total_sales, true)} note={`${number(data.overview.sales_records)} weekly records`} icon={BarChart3} tone="tone-blue" badge="2010–2012" />
      <KpiCard label="Stores analyzed" value={number(data.overview.stores)} note="Across the dataset" icon={Store} tone="tone-green" />
      <KpiCard label="Departments" value={number(data.overview.departments)} note="Distinct departments" icon={LayoutDashboard} tone="tone-violet" />
      <KpiCard label="Avg. weekly sales" value={money(data.overview.average_weekly_sales)} note="Per store / department" icon={Activity} tone="tone-amber" />
    </div>
    <div className="overview-grid">
      <TrendChart trend={data.trend} granularity={granularity} setGranularity={setGranularity} />
      <TopStoresChart stores={data.stores} />
    </div>
    <StoreTable stores={data.stores.slice(0, 5)} compact />
    <DataNote />
  </>;
}

function StoreTable({ stores, compact = false }: { stores: StoreRow[]; compact?: boolean }) {
  return (
    <section className="surface-card table-card">
      <div className="card-heading">
        <div><h2>{compact ? 'Store leaderboard' : 'Store performance'}</h2><p>{compact ? 'Top locations by cumulative sales' : `${stores.length} locations ranked by total recorded sales`}</p></div>
        {compact && <span className="table-caption">TOP 5 LOCATIONS</span>}
      </div>
      <div className="table-scroll"><table><thead><tr><th>STORE</th><th>TYPE</th><th>STORE SIZE</th><th>AVG. WEEKLY SALES</th><th>SALES VARIABILITY</th><th>TOTAL SALES</th></tr></thead>
        <tbody>{stores.map((store, index) => <tr key={store.Store}>
          <td><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><b>Store {store.Store}</b></td>
          <td><span className={`store-type type-${store.store_type.toLowerCase()}`}>{store.store_type}</span></td>
          <td>{number(store.size)} <span className="cell-muted">sq ft</span></td>
          <td>{money(store.avg_weekly_sales)}</td>
          <td><div className="variability"><span><i style={{ width: `${Math.min(100, (store.sales_volatility / Math.max(store.avg_weekly_sales, 1)) * 100)}%` }} /></span>{percent(store.sales_volatility / Math.max(store.avg_weekly_sales, 1))}</div></td>
          <td className="sales-total">{money(store.total_sales)}</td>
        </tr>)}</tbody>
      </table>
      {!stores.length && <div className="empty-state">No stores match this search.</div>}</div>
    </section>
  );
}

function StoresView({ stores, query, setQuery }: { stores: StoreRow[]; query: string; setQuery: (value: string) => void }) {
  return <>
    <div className="section-kicker"><span>LOCATION COMPARISON</span><span className="kicker-rule" /><span className="data-caption">45 STORES IN DATASET</span></div>
    <div className="store-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by store or type…" aria-label="Search stores" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</div><span>{stores.length} locations</span></div>
    <StoreTable stores={stores} />
    <DataNote />
  </>;
}

function SalesView({ data, granularity, setGranularity }: {
  data: DashboardData; granularity: 'month' | 'week'; setGranularity: (value: 'month' | 'week') => void;
}) {
  const peak = data.trend.reduce((best, row) => row.sales > best.sales ? row : best, data.trend[0] || { period: '—', sales: 0 });
  const low = data.trend.reduce((smallest, row) => row.sales < smallest.sales ? row : smallest, data.trend[0] || { period: '—', sales: 0 });
  const holidayRate = data.overview.total_sales ? 'Holiday weeks are included in reported totals.' : 'No sales available.';
  return <>
    <div className="section-kicker"><span>TREND EXPLORER</span><span className="kicker-rule" /><span className="data-caption">WEEKLY SALES AGGREGATED BY PERIOD</span></div>
    <div className="sales-highlight-grid">
      <div className="highlight-card"><span>Highest {granularity} on record</span><b>{money(peak.sales, true)}</b><small>{peak.period}</small><span className="highlight-icon green-bg"><ArrowUp size={16} /></span></div>
      <div className="highlight-card"><span>Lowest {granularity} on record</span><b>{money(low.sales, true)}</b><small>{low.period}</small><span className="highlight-icon amber-bg"><ArrowDown size={16} /></span></div>
      <div className="highlight-card"><span>Average sales record</span><b>{money(data.overview.average_weekly_sales)}</b><small>Per store and department</small><span className="highlight-icon blue-bg"><Activity size={16} /></span></div>
    </div>
    <TrendChart trend={data.trend} granularity={granularity} setGranularity={setGranularity} large />
    <div className="insight-note"><span className="note-icon"><Sparkles size={16} /></span><div><b>Reading the trend</b><p>{holidayRate} Monthly totals combine all stores and departments; peaks can reflect seasonal demand, holidays, or store mix.</p></div></div>
    <DataNote />
  </>;
}

function SegmentsView({ segments }: { segments: SegmentRow[] }) {
  const clusters = useMemo(() => [...new Set(segments.map((store) => store.cluster))].sort((a, b) => a - b).map((cluster) => {
    const members = segments.filter((store) => store.cluster === cluster);
    return {
      cluster,
      count: members.length,
      average: members.reduce((sum, item) => sum + item.avg_sales, 0) / Math.max(members.length, 1),
      size: members.reduce((sum, item) => sum + item.size, 0) / Math.max(members.length, 1),
      volatility: members.reduce((sum, item) => sum + item.sales_cv, 0) / Math.max(members.length, 1),
      stores: members,
    };
  }), [segments]);
  const pieData = clusters.map((cluster) => ({ name: `Segment ${cluster.cluster + 1}`, value: cluster.count }));
  return <>
    <div className="section-kicker"><span>K-MEANS SEGMENTATION</span><span className="kicker-rule" /><span className="data-caption">3 PERFORMANCE GROUPS</span></div>
    <div className="segment-intro"><div className="segment-symbol"><Target size={20} /></div><div><b>Stores with similar traits, together.</b><p>K-Means groups stores using average sales, sales variability, and store size. Segment numbers are labels—not rankings.</p></div></div>
    <div className="segment-grid">{clusters.map((cluster, index) => (
      <article className="segment-card" key={cluster.cluster}>
        <div className="segment-card-head"><span className={`segment-badge segment-${index}`}>SEGMENT {cluster.cluster + 1}</span><span className="segment-count">{cluster.count} stores</span></div>
        <div className="segment-metric">{money(cluster.average)}<small>average weekly sales</small></div>
        <div className="segment-details"><div><span>Avg. store size</span><b>{number(Math.round(cluster.size))} sq ft</b></div><div><span>Sales variability</span><b>{percent(cluster.volatility)}</b></div></div>
        <div className="store-chips">{cluster.stores.map((store) => <span key={store.Store}>#{store.Store}</span>)}</div>
      </article>
    ))}</div>
    <section className="surface-card segment-chart-card"><div className="card-heading"><div><h2>Store distribution</h2><p>Number of locations assigned to each cluster</p></div></div><div className="donut-wrap">
      <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={66} outerRadius={91} paddingAngle={4} stroke="none">{pieData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => [`${Number(value)} stores`, 'Locations']} /></PieChart></ResponsiveContainer>
      <div className="donut-legend">{pieData.map((entry, index) => <div key={entry.name}><i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} /><span>{entry.name}</span><b>{entry.value} stores</b></div>)}</div>
    </div></section>
    <DataNote />
  </>;
}

function ModelView({ evaluation }: { evaluation: Evaluation }) {
  const topFeatures = evaluation.feature_importance.slice(0, 8);
  return <>
    <div className="section-kicker"><span>RANDOM FOREST REGRESSOR</span><span className="kicker-rule" /><span className="data-caption">CHRONOLOGICAL HOLDOUT</span></div>
    <div className="model-banner"><span className="model-icon"><Sparkles size={18} /></span><div><b>A more honest test of time.</b><p>Trained on data through {evaluation.train_end}; evaluated on later observations starting {evaluation.test_start}. No future weeks are mixed into training.</p></div><span className="benchmark-chip"><Check size={13} /> TIME-ORDERED</span></div>
    <div className="model-kpis">
      <KpiCard label="Mean absolute error" value={money(evaluation.mae)} note="Average absolute prediction error" icon={Target} tone="tone-blue" />
      <KpiCard label="Root mean squared error" value={money(evaluation.rmse)} note="Penalizes larger misses" icon={Activity} tone="tone-violet" />
      <KpiCard label="R² score" value={evaluation.r2.toFixed(3)} note="Model fit on held-out period" icon={BarChart3} tone="tone-green" />
      <KpiCard label="Test observations" value={number(evaluation.test_rows)} note="Unseen store / department weeks" icon={CalendarDays} tone="tone-amber" />
    </div>
    <div className="model-grid">
      <section className="surface-card feature-card"><div className="card-heading"><div><h2>What the model used</h2><p>Relative feature importance · top {topFeatures.length}</p></div></div>
        <div className="feature-list">{topFeatures.map((feature, index) => <div className="feature-row" key={feature.feature}><span className="feature-rank">{String(index + 1).padStart(2, '0')}</span><span className="feature-name">{feature.feature.replaceAll('_', ' ')}</span><div className="feature-track"><i style={{ width: `${(feature.importance / (topFeatures[0]?.importance || 1)) * 100}%` }} /></div><b>{percent(feature.importance)}</b></div>)}</div>
      </section>
      <section className="surface-card benchmark-card"><div className="card-heading"><div><h2>Baseline comparison</h2><p>Random forest vs. seasonal naive</p></div></div>
        <div className="benchmark-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={[{ metric: 'MAE', Model: evaluation.mae, Baseline: evaluation.baseline_mae }, { metric: 'RMSE', Model: evaluation.rmse, Baseline: evaluation.baseline_rmse }]} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 5" /><XAxis dataKey="metric" tick={{ fill: '#616c80', fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => money(Number(value), true)} tick={{ fill: '#8b94a6', fontSize: 10 }} tickLine={false} axisLine={false} width={52} /><Tooltip formatter={(value) => money(Number(value))} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Model" fill="#6989ff" radius={[5, 5, 0, 0]} barSize={29} /><Line dataKey="Baseline" stroke="#50bda5" strokeWidth={2} dot={{ fill: '#50bda5', r: 4 }} /></ComposedChart></ResponsiveContainer></div>
        <div className="benchmark-summary"><span>Baseline MAE</span><b>{money(evaluation.baseline_mae)}</b></div><div className="benchmark-summary"><span>Baseline RMSE</span><b>{money(evaluation.baseline_rmse)}</b></div>
      </section>
    </div>
    <div className="insight-note"><span className="note-icon"><CircleHelp size={16} /></span><div><b>Interpret results with care</b><p>Feature importance describes model behavior, not causation. The seasonal baseline uses the prior year's sales for the same store and department when available; missing matches fall back to the training median.</p></div></div>
    <DataNote />
  </>;
}

function DataNote() {
  return <div className="data-footnote"><span><Download size={13} /> Source: Walmart historical weekly sales dataset</span><span>Analytics are descriptive—not a guarantee of future performance.</span></div>;
}

export default App;
