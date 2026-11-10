import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { CalendarClock, ChartPie, LibraryBig, Menu, MessageSquare, Search, type LucideIcon } from 'lucide-react';
import { SearchPage } from './pages/SearchPage';
import { DocumentPage } from './pages/DocumentPage';
import { LibraryPage } from './pages/LibraryPage';
import { AssistantPage } from './pages/AssistantPage';
import { InsightsPage } from './pages/InsightsPage';
import { KeyDatesPage } from './pages/KeyDatesPage';
import { useWhoAmI } from './lib/records';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Search', icon: Search, end: true },
  { to: '/library', label: 'Library', icon: LibraryBig },
  { to: '/key-dates', label: 'Key dates', icon: CalendarClock },
  { to: '/assistant', label: 'Assistant', icon: MessageSquare },
  { to: '/insights', label: 'Insights', icon: ChartPie },
];

// Header links sit on the carbon bar: active = Rosso Corsa pill, others light grey turning white on hover.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `font-display inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-bold tracking-wide transition-all ${
    isActive
      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
      : 'text-white/65 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className} aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass} onClick={onClick}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** "jsmith@x.com" -> "JS"; "first.last@x.com" -> "FL". */
function initials(email: string | null | undefined): string {
  if (!email) return '?';
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.replace(/[^a-z]/gi, '').slice(0, 2);
  return (letters || '?').toUpperCase();
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const me = useWhoAmI();
  const who = me?.email ?? me?.user ?? null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="f1-header sticky top-0 z-40 px-4 md:px-6 py-2.5 flex items-center gap-5 backdrop-blur">
        <NavLink to="/" className="flex items-center gap-2.5" aria-label="Records home">
          <span className="f1-mark" aria-hidden="true" />
          <h1 className="text-xl font-black text-white tracking-tight">Records</h1>
        </NavLink>
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-warning text-sm font-black text-warning-foreground ring-2 ring-white/15"
                aria-label={who ? `Signed in as ${who}` : 'Signed in'}
              >
                {initials(who)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {who ?? 'Signed in'}: you only see records your account can access
            </TooltipContent>
          </Tooltip>
          <div className="md:hidden">
            <Sheet open={mobileNavOpen && isMobile} onOpenChange={setMobileNavOpen}>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setMobileNavOpen(true)}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>Records</SheetTitle>
                </SheetHeader>
                <NavLinks className="flex flex-col gap-1 px-2" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SearchPage /> },
      { path: '/documents/:documentId', element: <DocumentPage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/key-dates', element: <KeyDatesPage /> },
      { path: '/assistant', element: <AssistantPage /> },
      { path: '/insights', element: <InsightsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
