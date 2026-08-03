import { useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarDays,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  CloudSun,
  FileText,
  Grid2X2,
  Home,
  Inbox,
  ListChecks,
  Menu,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  PackageCheck,
  Palette,
  PiggyBank,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react'

type DesignId = 'home' | 'calendar' | 'tasks' | 'shopping' | 'meals' | 'capture' | 'notes' | 'household' | 'vault' | 'bins' | 'plans' | 'reminders' | 'weather'

type Feature = {
  id: DesignId
  label: string
  sub: string
  href: string
  color: string
  soft: string
  icon: LucideIcon
}

const features: Feature[] = [
  { id: 'calendar', label: 'Calendar', sub: '4 events today', href: '/designs/calendar', color: '#2787d8', soft: '#e5f3ff', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', sub: '6 left to do', href: '/designs/tasks', color: '#ef9b2d', soft: '#fff2df', icon: ListChecks },
  { id: 'shopping', label: 'Shopping', sub: '12 items', href: '/designs/shopping', color: '#49a96f', soft: '#e5f6eb', icon: ShoppingBasket },
  { id: 'meals', label: 'Meals', sub: 'Plan this week', href: '/designs/meals', color: '#e36574', soft: '#ffe9ed', icon: Utensils },
  { id: 'capture', label: 'Capture', sub: '3 to organise', href: '/designs/capture', color: '#7d73d8', soft: '#eeebff', icon: Inbox },
  { id: 'notes', label: 'Notes', sub: '18 shared notes', href: '/designs/notes', color: '#d5a22d', soft: '#fff5d8', icon: NotebookPen },
  { id: 'household', label: 'Household', sub: 'Home at a glance', href: '/designs/household', color: '#2ea7a0', soft: '#e2f7f5', icon: Home },
  { id: 'vault', label: 'Vault', sub: 'Documents & records', href: '/designs/vault', color: '#6471c9', soft: '#e9ebff', icon: FileText },
  { id: 'weather', label: 'Weather', sub: '18° · Partly cloudy', href: '/designs/weather', color: '#47a5d9', soft: '#e5f5ff', icon: CloudSun },
  { id: 'reminders', label: 'Reminders', sub: '2 coming up', href: '/designs/reminders', color: '#e17055', soft: '#ffebe5', icon: Bell },
  { id: 'bins', label: 'Bins', sub: 'Recycling tomorrow', href: '/designs/bins', color: '#4d8e74', soft: '#e4f2ec', icon: Trash2 },
  { id: 'plans', label: 'House plans', sub: '4 active projects', href: '/designs/plans', color: '#a26d45', soft: '#f7ece2', icon: PackageCheck },
]

const featureById = new Map(features.map(feature => [feature.id, feature]))

function Avatar({ name, color, small = false }: { name: string; color: string; small?: boolean }) {
  return <span className={`fw-avatar ${small ? 'fw-avatar-small' : ''}`} style={{ background: color }}>{name.slice(0, 1)}</span>
}

function DesignHeader({ title, subtitle, onMenu, trailing }: { title: string; subtitle?: string; onMenu: () => void; trailing?: ReactNode }) {
  return (
    <header className="fw-header">
      <div className="fw-header-row">
        <button type="button" className="fw-icon-button fw-icon-button-light" aria-label="Open design navigation" onClick={onMenu}><Menu /></button>
        <div className="fw-header-copy">
          {subtitle ? <p>{subtitle}</p> : null}
          <h1>{title}</h1>
        </div>
        {trailing ?? <button type="button" className="fw-icon-button fw-icon-button-light" aria-label="Design settings"><Settings /></button>}
      </div>
    </header>
  )
}

function BottomTabs({ active }: { active: DesignId }) {
  const tabs: Array<{ id: DesignId; label: string; href: string; icon: LucideIcon }> = [
    { id: 'home', label: 'Home', href: '/designs', icon: Home },
    { id: 'calendar', label: 'Calendar', href: '/designs/calendar', icon: CalendarDays },
    { id: 'tasks', label: 'Lists', href: '/designs/tasks', icon: ListChecks },
    { id: 'household', label: 'More', href: '/designs/household', icon: Grid2X2 },
  ]
  return (
    <nav className="fw-tabs" aria-label="Design prototype navigation">
      {tabs.map(tab => {
        const Icon = tab.icon
        const selected = tab.id === active || (tab.id === 'household' && !['home', 'calendar', 'tasks'].includes(active))
        return <a key={tab.id} href={tab.href} className={selected ? 'is-active' : ''}><Icon /><span>{tab.label}</span></a>
      })}
    </nav>
  )
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fw-drawer-wrap ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <button type="button" className="fw-drawer-scrim" onClick={onClose} aria-label="Close navigation" />
      <aside className="fw-drawer">
        <div className="fw-drawer-family">
          <button type="button" className="fw-drawer-close" onClick={onClose} aria-label="Close navigation"><X /></button>
          <div className="fw-family-mark"><Users /></div>
          <div><strong>The Coakes Family</strong><span>Dan & Imogen</span></div>
        </div>
        <p className="fw-drawer-label">Design prototype</p>
        <div className="fw-drawer-links">
          <a href="/designs"><Home /><span>Home</span></a>
          {features.map(feature => {
            const Icon = feature.icon
            return <a href={feature.href} key={feature.id}><Icon style={{ color: feature.color }} /><span>{feature.label}</span></a>
          })}
        </div>
        <div className="fw-drawer-later">
          <span>Later</span>
          <p>Media · TV guide · Cycle · Ulcer tracker</p>
        </div>
        <a className="fw-exit-preview" href="/"><ChevronLeft /> Exit designs</a>
      </aside>
    </div>
  )
}

function AddSheet({ label, onClose }: { label: string | null; onClose: () => void }) {
  if (!label) return null
  return (
    <div className="fw-sheet-wrap">
      <button className="fw-sheet-scrim" onClick={onClose} aria-label="Close preview sheet" />
      <div className="fw-sheet">
        <span className="fw-sheet-handle" />
        <div className="fw-sheet-heading"><div><small>INTERACTION PREVIEW</small><h3>Add {label}</h3></div><button onClick={onClose}><X /></button></div>
        <label className="fw-sheet-field"><span>Title</span><input placeholder={`New ${label.toLowerCase()}`} autoFocus /></label>
        <div className="fw-sheet-options"><button><CalendarDays /> Today</button><button><Users /> Everyone</button></div>
        <button className="fw-primary-button" onClick={onClose}>Save preview</button>
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return <div className="fw-section-heading"><div>{eyebrow ? <small>{eyebrow}</small> : null}<h2>{title}</h2></div>{action ? <button>{action}</button> : null}</div>
}

function HomeDesign({ openSheet }: { openSheet: (label: string) => void }) {
  return (
    <>
      <section className="fw-home-hero">
        <div className="fw-preview-pill"><Palette /> DESIGN PREVIEW</div>
        <div className="fw-home-welcome">
          <div><p>Monday, 3 August</p><h1>Hello, Dan</h1><span>Here’s what’s happening at home.</span></div>
          <div className="fw-avatar-stack"><Avatar name="Dan" color="#f0a25a" /><Avatar name="Imogen" color="#be6b91" /></div>
        </div>
        <div className="fw-next-event">
          <div className="fw-date-tile"><b>03</b><span>AUG</span></div>
          <div><small>NEXT UP · 10:30</small><strong>Vet appointment</strong><span>Dan · Greenbank Vets</span></div>
          <ChevronRight />
        </div>
      </section>
      <div className="fw-content fw-home-content">
        <SectionHeading title="Our family" action="Customise" />
        <div className="fw-feature-grid">
          {features.slice(0, 8).map(feature => {
            const Icon = feature.icon
            return (
              <a href={feature.href} className="fw-feature-card" key={feature.id}>
                <span className="fw-feature-icon" style={{ color: feature.color, background: feature.soft }}><Icon /></span>
                <strong>{feature.label}</strong><span>{feature.sub}</span>
              </a>
            )
          })}
        </div>
        <SectionHeading eyebrow="TODAY" title="Family timeline" action="See all" />
        <div className="fw-timeline-card">
          <div className="fw-timeline-item"><span className="fw-time">10:30</span><i style={{ background: '#f0a25a' }} /><div><strong>Vet appointment</strong><span>Dan · Greenbank Vets</span></div><Avatar small name="Dan" color="#f0a25a" /></div>
          <div className="fw-timeline-item"><span className="fw-time">18:00</span><i style={{ background: '#be6b91' }} /><div><strong>Chicken traybake</strong><span>Dinner · Meal plan</span></div><Avatar small name="Imogen" color="#be6b91" /></div>
          <div className="fw-timeline-item"><span className="fw-time">20:00</span><i style={{ background: '#55a673' }} /><div><strong>Put recycling out</strong><span>Shared task</span></div><span className="fw-mini-check"><Check /></span></div>
        </div>
        <button className="fw-quick-add" onClick={() => openSheet('something')}><Sparkles /><span><strong>Quick add</strong><small>Event, task, note or shopping item</small></span><CirclePlus /></button>
      </div>
    </>
  )
}

function CalendarDesign({ openSheet }: { openSheet: (label: string) => void }) {
  const [selectedDay, setSelectedDay] = useState(3)
  const days = [{ d: 'M', n: 3 }, { d: 'T', n: 4 }, { d: 'W', n: 5 }, { d: 'T', n: 6 }, { d: 'F', n: 7 }, { d: 'S', n: 8 }, { d: 'S', n: 9 }]
  return <div className="fw-content fw-calendar-content">
    <div className="fw-month-switch"><button><ChevronLeft /></button><strong>August 2026</strong><button><ChevronRight /></button></div>
    <div className="fw-week-strip">{days.map(day => <button key={day.n} onClick={() => setSelectedDay(day.n)} className={selectedDay === day.n ? 'is-selected' : ''}><span>{day.d}</span><b>{day.n}</b>{day.n === 3 || day.n === 6 ? <i /> : null}</button>)}</div>
    <div className="fw-member-filters"><button className="is-active"><Users /> Everyone</button><button><Avatar small name="Dan" color="#f0a25a" /> Dan</button><button><Avatar small name="Imogen" color="#be6b91" /> Imogen</button></div>
    <SectionHeading eyebrow="MONDAY 3 AUGUST" title="Today" />
    <div className="fw-agenda">
      <div className="fw-agenda-row"><time>All day</time><div className="fw-event-card blue"><small>HOUSEHOLD</small><strong>Boiler service window</strong><span>Home · Everyone</span></div></div>
      <div className="fw-agenda-row"><time>10:30</time><div className="fw-event-card orange"><small>APPOINTMENT</small><strong>Vet appointment</strong><span>Greenbank Vets · Dan</span></div></div>
      <div className="fw-agenda-row"><time>18:00</time><div className="fw-event-card pink"><small>MEAL</small><strong>Chicken traybake</strong><span>At home · Imogen</span></div></div>
    </div>
    <button className="fw-fab" onClick={() => openSheet('event')} aria-label="Add event"><CirclePlus /></button>
  </div>
}

function TasksDesign({ openSheet }: { openSheet: (label: string) => void }) {
  const [done, setDone] = useState<string[]>(['book'])
  const toggle = (id: string) => setDone(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const tasks = [
    { id: 'recycling', title: 'Put recycling out', meta: 'Tonight · Dan', color: '#49a96f' },
    { id: 'vet', title: 'Collect prescription', meta: 'Today · Imogen', color: '#e36574' },
    { id: 'quote', title: 'Reply to kitchen quote', meta: 'Tomorrow · Dan', color: '#7d73d8' },
    { id: 'book', title: 'Book boiler service', meta: 'Completed by Dan', color: '#47a5d9' },
  ]
  return <div className="fw-content">
    <div className="fw-summary-banner amber"><div><small>THIS WEEK</small><strong>6 tasks left</strong><span>You’ve completed 8 together</span></div><div className="fw-progress-ring">57%</div></div>
    <div className="fw-list-cards"><a href="/designs/shopping"><span className="fw-list-icon" style={{ background: '#e5f6eb', color: '#49a96f' }}><ShoppingBasket /></span><div><strong>Shopping</strong><span>12 unchecked items</span></div><ChevronRight /></a><a href="/designs/plans"><span className="fw-list-icon" style={{ background: '#f7ece2', color: '#a26d45' }}><PackageCheck /></span><div><strong>House projects</strong><span>4 active tasks</span></div><ChevronRight /></a></div>
    <SectionHeading eyebrow="SHARED TO-DO" title="Up next" action="Filter" />
    <div className="fw-check-list">{tasks.map(task => <button key={task.id} onClick={() => toggle(task.id)} className={done.includes(task.id) ? 'is-done' : ''}><span className="fw-check-circle" style={{ borderColor: task.color, background: done.includes(task.id) ? task.color : undefined }}>{done.includes(task.id) ? <Check /> : null}</span><span><strong>{task.title}</strong><small>{task.meta}</small></span><MoreHorizontal /></button>)}</div>
    <button className="fw-fab" onClick={() => openSheet('task')}><CirclePlus /></button>
  </div>
}

function ShoppingDesign({ openSheet }: { openSheet: (label: string) => void }) {
  const [checked, setChecked] = useState<string[]>([])
  const items = [{ id: 'milk', name: 'Oat milk', by: 'Imogen', category: 'DAIRY & CHILLED' }, { id: 'tomatoes', name: 'Cherry tomatoes', by: 'Dan', category: 'FRUIT & VEG' }, { id: 'chicken', name: 'Chicken thighs', by: 'Meal plan', category: 'MEAT & FISH' }, { id: 'bread', name: 'Sourdough loaf', by: 'Dan', category: 'BAKERY' }]
  return <div className="fw-content">
    <div className="fw-shopping-hero"><div><small>SHARED LIST</small><strong>Big shop</strong><span>12 items · Tesco</span></div><ShoppingBasket /></div>
    <div className="fw-shop-progress"><div><span>4 of 16 collected</span><b>25%</b></div><i><span /></i></div>
    <div className="fw-grocery-list">{items.map((item, index) => <div key={item.id}>{index === 0 || items[index - 1].category !== item.category ? <p>{item.category}</p> : null}<button onClick={() => setChecked(c => c.includes(item.id) ? c.filter(x => x !== item.id) : [...c, item.id])} className={checked.includes(item.id) ? 'is-checked' : ''}><span className="fw-check-circle">{checked.includes(item.id) ? <Check /> : null}</span><span><strong>{item.name}</strong><small>Added by {item.by}</small></span><MoreHorizontal /></button></div>)}</div>
    <div className="fw-related-link"><a href="/designs/meals"><Utensils /><div><strong>Meals this week</strong><span>3 ingredients added from your plan</span></div><ChevronRight /></a></div>
    <button className="fw-fab" onClick={() => openSheet('shopping item')}><CirclePlus /></button>
  </div>
}

function MealsDesign({ openSheet }: { openSheet: (label: string) => void }) {
  const meals = [
    { day: 'MON', date: '3', dinner: 'Chicken traybake', detail: 'Dinner · 45 min', emoji: '🍗', color: '#ffe9ed' },
    { day: 'TUE', date: '4', dinner: 'Mushroom pasta', detail: 'Dinner · 25 min', emoji: '🍝', color: '#fff2df' },
    { day: 'WED', date: '5', dinner: 'Leftovers night', detail: 'Easy evening', emoji: '🥡', color: '#e5f3ff' },
    { day: 'THU', date: '6', dinner: 'Add a meal', detail: 'Nothing planned yet', emoji: '+', color: '#eef1f5' },
  ]
  return <div className="fw-content">
    <div className="fw-week-title"><button><ChevronLeft /></button><div><small>MEALS OF THE WEEK</small><strong>3 – 9 August</strong></div><button><ChevronRight /></button></div>
    <button className="fw-meal-shopping"><ShoppingBasket /><span><strong>Build shopping list</strong><small>Add 9 ingredients from this week</small></span><ChevronRight /></button>
    <div className="fw-meal-list">{meals.map(meal => <button key={meal.day} onClick={() => meal.day === 'THU' && openSheet('meal')}><span className="fw-meal-day"><small>{meal.day}</small><b>{meal.date}</b></span><span className="fw-meal-emoji" style={{ background: meal.color }}>{meal.emoji}</span><span><strong>{meal.dinner}</strong><small>{meal.detail}</small></span><ChevronRight /></button>)}</div>
    <SectionHeading title="Saved favourites" action="See recipes" />
    <div className="fw-recipe-row"><div><span>🥘</span><strong>One-pot favourites</strong><small>8 recipes</small></div><div><span>🥗</span><strong>Quick & fresh</strong><small>11 recipes</small></div></div>
  </div>
}

function CaptureDesign({ openSheet }: { openSheet: (label: string) => void }) {
  return <div className="fw-content">
    <div className="fw-capture-box"><Sparkles /><div><small>QUICK CAPTURE</small><h2>What do you need to remember?</h2></div><textarea placeholder="Paste a link, write a thought, or add something for later…" /><div><button><FileText /> File</button><button><CalendarDays /> Event</button><button className="send" onClick={() => openSheet('capture')}>Add</button></div></div>
    <SectionHeading eyebrow="TO ORGANISE" title="Inbox" action="3 items" />
    <div className="fw-inbox-list"><article><span className="fw-inbox-type link">LINK</span><strong>Kitchen tiles we liked</strong><small>victorianplumbing.co.uk · 2h ago</small><div><button>Move to plans</button><button>Dismiss</button></div></article><article><span className="fw-inbox-type note">NOTE</span><strong>Ask Sarah about pet sitter dates</strong><small>Added by Imogen · Yesterday</small><div><button>Make task</button><button>Dismiss</button></div></article><article><span className="fw-inbox-type file">FILE</span><strong>Boiler warranty.pdf</strong><small>1.2 MB · Friday</small><div><button>Move to vault</button><button>Dismiss</button></div></article></div>
  </div>
}

function NotesDesign({ openSheet }: { openSheet: (label: string) => void }) {
  return <div className="fw-content"><div className="fw-search"><Search /><input placeholder="Search shared notes" /></div><div className="fw-note-feature"><small>PINNED</small><strong>House information</strong><p>Wi-Fi, alarm details and useful numbers in one shared place.</p><div><Avatar small name="Dan" color="#f0a25a" /><Avatar small name="Imogen" color="#be6b91" /><span>Updated yesterday</span></div></div><SectionHeading title="Recent notes" action="View all" /><div className="fw-notes-grid"><article><span>WEEKEND</span><strong>Things to do in Tenby</strong><p>Beach walk, book the seafood place, check parking…</p><small>Updated by Imogen</small></article><article><span>HOME</span><strong>Paint colours</strong><p>Kitchen: Setting Plaster. Hall: School House White.</p><small>Updated by Dan</small></article><article><span>PETS</span><strong>Vet notes</strong><p>Medication timings and questions for Monday.</p><small>Updated today</small></article><article className="fw-new-note" onClick={() => openSheet('note')}><CirclePlus /><strong>New note</strong></article></div><button className="fw-fab" onClick={() => openSheet('note')}><CirclePlus /></button></div>
}

function HouseholdDesign() {
  return <div className="fw-content"><div className="fw-house-card"><div><small>OUR HOME</small><strong>Good morning</strong><span>Everything looks on track today.</span></div><Home /></div><div className="fw-house-status"><a href="/designs/bins"><span style={{ background: '#e4f2ec', color: '#4d8e74' }}><Trash2 /></span><div><small>NEXT COLLECTION</small><strong>Recycling & food</strong><p>Tomorrow morning</p></div><ChevronRight /></a><a href="/designs/reminders"><span style={{ background: '#ffebe5', color: '#e17055' }}><Bell /></span><div><small>COMING UP</small><strong>Boiler service</strong><p>Friday · 09:00–12:00</p></div><ChevronRight /></a></div><SectionHeading title="Manage our home" /><div className="fw-feature-grid compact">{features.filter(f => ['bins', 'plans', 'reminders', 'weather', 'vault'].includes(f.id)).map(feature => { const Icon = feature.icon; return <a href={feature.href} className="fw-feature-card" key={feature.id}><span className="fw-feature-icon" style={{ color: feature.color, background: feature.soft }}><Icon /></span><strong>{feature.label}</strong><span>{feature.sub}</span></a> })}</div><SectionHeading title="Family members" action="Manage" /><div className="fw-family-members"><div><Avatar name="Dan" color="#f0a25a" /><span><strong>Dan</strong><small>Home · Active now</small></span><ChevronRight /></div><div><Avatar name="Imogen" color="#be6b91" /><span><strong>Imogen</strong><small>Home · 5 min ago</small></span><ChevronRight /></div></div></div>
}

function VaultDesign({ openSheet }: { openSheet: (label: string) => void }) {
  const folders = [{ icon: '🏠', name: 'Home', count: 12 }, { icon: '🚗', name: 'Vehicles', count: 8 }, { icon: '🐾', name: 'Pets', count: 6 }, { icon: '💷', name: 'Finance', count: 9 }]
  return <div className="fw-content"><div className="fw-search"><Search /><input placeholder="Search documents and records" /></div><SectionHeading title="Folders" action="Edit" /><div className="fw-folder-grid">{folders.map(folder => <button key={folder.name}><span>{folder.icon}</span><strong>{folder.name}</strong><small>{folder.count} items</small></button>)}</div><SectionHeading title="Needs attention" /><div className="fw-alert-card"><Bell /><div><small>RENEWAL · 18 DAYS</small><strong>Car insurance</strong><span>Ford Focus · 21 August</span></div><ChevronRight /></div><SectionHeading title="Recently updated" action="See all" /><div className="fw-document-list"><button><span className="pdf">PDF</span><div><strong>Boiler warranty</strong><small>Home · Updated Friday</small></div><MoreHorizontal /></button><button><span className="doc">DOC</span><div><strong>Pet medication schedule</strong><small>Pets · Updated today</small></div><MoreHorizontal /></button></div><button className="fw-fab" onClick={() => openSheet('document')}><CirclePlus /></button></div>
}

function BinsDesign() {
  return <div className="fw-content"><div className="fw-bin-hero"><small>NEXT COLLECTION · TOMORROW</small><div><span className="fw-bin-icon blue"><Trash2 /></span><div><strong>Recycling & food</strong><p>Put out by 7:00 am</p></div></div><button>Mark as out</button></div><SectionHeading title="Collection schedule" /><div className="fw-bin-list"><div><i className="blue" /><span><strong>Recycling & food</strong><small>Tue 4 Aug · Weekly</small></span><b>Tomorrow</b></div><div><i className="black" /><span><strong>Black bin</strong><small>Wed 12 Aug · Every 3 weeks</small></span><b>9 days</b></div><div><i className="green" /><span><strong>Garden waste</strong><small>Tue 18 Aug · Fortnightly</small></span><b>15 days</b></div></div><div className="fw-tip"><Sparkles /><div><strong>Evening reminder is on</strong><span>We’ll remind everyone at 8 pm the night before.</span></div></div></div>
}

function PlansDesign({ openSheet }: { openSheet: (label: string) => void }) {
  return <div className="fw-content"><div className="fw-plan-feature"><small>IN PROGRESS</small><strong>Kitchen refresh</strong><span>6 of 11 tasks complete</span><i><span /></i><div><Avatar small name="Dan" color="#f0a25a" /><Avatar small name="Imogen" color="#be6b91" /><b>Due 28 Aug</b></div></div><SectionHeading title="All projects" action="Sort" /><div className="fw-project-list"><a><span style={{ background: '#f7ece2' }}>🎨</span><div><strong>Hallway decorating</strong><small>3 tasks · Planning</small></div><b>25%</b><ChevronRight /></a><a><span style={{ background: '#e5f6eb' }}>🌱</span><div><strong>Autumn garden</strong><small>5 tasks · September</small></div><b>10%</b><ChevronRight /></a><a><span style={{ background: '#e5f3ff' }}>🚿</span><div><strong>Bathroom ideas</strong><small>8 saved links · Someday</small></div><b>—</b><ChevronRight /></a></div><SectionHeading title="Recent activity" /><div className="fw-activity"><i style={{ background: '#be6b91' }} /><p><strong>Imogen</strong> added “Order paint samples”<span>2 hours ago</span></p></div><button className="fw-fab" onClick={() => openSheet('project')}><CirclePlus /></button></div>
}

function RemindersDesign({ openSheet }: { openSheet: (label: string) => void }) {
  return <div className="fw-content"><div className="fw-reminder-date"><b>03</b><span>August<br />Monday</span></div><SectionHeading title="Coming up" /><div className="fw-reminder-list"><article className="urgent"><span><Car /></span><div><small>IN 18 DAYS</small><strong>Car insurance renewal</strong><p>Ford Focus · Assigned to Dan</p></div><ChevronRight /></article><article><span><Home /></span><div><small>FRIDAY</small><strong>Boiler service</strong><p>09:00–12:00 · Everyone</p></div><ChevronRight /></article><article><span><Bell /></span><div><small>12 AUGUST</small><strong>Order repeat prescription</strong><p>Imogen</p></div><ChevronRight /></article></div><SectionHeading title="Completed recently" action="Show" /><button className="fw-fab" onClick={() => openSheet('reminder')}><CirclePlus /></button></div>
}

function WeatherDesign() {
  return <div className="fw-content fw-weather"><div className="fw-weather-hero"><div><small>HOME · SWANSEA</small><strong>18°</strong><span>Partly cloudy</span><p>Feels like 17° · High 20°</p></div><CloudSun /></div><div className="fw-hourly"><div><span>Now</span><CloudSun /><b>18°</b></div><div><span>11</span><CloudSun /><b>19°</b></div><div><span>12</span><CloudSun /><b>20°</b></div><div><span>13</span><CloudSun /><b>20°</b></div><div><span>14</span><CloudSun /><b>19°</b></div></div><div className="fw-weather-note"><Sparkles /><span><strong>Good drying weather</strong><small>Low chance of rain until 6 pm.</small></span></div><SectionHeading title="This week" /><div className="fw-forecast"><div><strong>Today</strong><span>Partly cloudy</span><CloudSun /><b>20° <i>12°</i></b></div><div><strong>Tue</strong><span>Light rain</span><CloudSun /><b>17° <i>11°</i></b></div><div><strong>Wed</strong><span>Cloudy</span><CloudSun /><b>18° <i>10°</i></b></div><div><strong>Thu</strong><span>Sunny spells</span><CloudSun /><b>21° <i>12°</i></b></div></div></div>
}

function DesignBody({ id, openSheet }: { id: DesignId; openSheet: (label: string) => void }) {
  if (id === 'home') return <HomeDesign openSheet={openSheet} />
  if (id === 'calendar') return <CalendarDesign openSheet={openSheet} />
  if (id === 'tasks') return <TasksDesign openSheet={openSheet} />
  if (id === 'shopping') return <ShoppingDesign openSheet={openSheet} />
  if (id === 'meals') return <MealsDesign openSheet={openSheet} />
  if (id === 'capture') return <CaptureDesign openSheet={openSheet} />
  if (id === 'notes') return <NotesDesign openSheet={openSheet} />
  if (id === 'household') return <HouseholdDesign />
  if (id === 'vault') return <VaultDesign openSheet={openSheet} />
  if (id === 'bins') return <BinsDesign />
  if (id === 'plans') return <PlansDesign openSheet={openSheet} />
  if (id === 'reminders') return <RemindersDesign openSheet={openSheet} />
  return <WeatherDesign />
}

function Prototype({ requestedId }: { requestedId?: string }) {
  const id = useMemo<DesignId>(() => requestedId && featureById.has(requestedId as DesignId) ? requestedId as DesignId : 'home', [requestedId])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sheet, setSheet] = useState<string | null>(null)
  const feature = featureById.get(id)
  return (
    <div className="fw-design">
      <div className="fw-phone">
        {id === 'home' ? <button type="button" className="fw-home-menu" onClick={() => setDrawerOpen(true)} aria-label="Open design navigation"><Menu /></button> : <DesignHeader title={feature?.label ?? 'Designs'} subtitle="THE COAKES FAMILY" onMenu={() => setDrawerOpen(true)} />}
        <main><DesignBody id={id} openSheet={setSheet} /></main>
        <BottomTabs active={id} />
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <AddSheet label={sheet} onClose={() => setSheet(null)} />
      </div>
    </div>
  )
}

export function DesignsPage() { return <Prototype /> }
export function DesignDetailPage({ designId }: { designId: string }) { return <Prototype requestedId={designId} /> }
