import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState } from 'react';
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  TooltipProvider,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu } from 'lucide-react';
import { SearchPage } from './pages/SearchPage';
import { DocumentPage } from './pages/DocumentPage';
import { LibraryPage } from './pages/LibraryPage';
import { AssistantPage } from './pages/AssistantPage';
import { InsightsPage } from './pages/InsightsPage';
import { KeyDatesPage } from './pages/KeyDatesPage';
import { useWhoAmI } from './lib/records';

// Header links sit on the carbon bar: active = Rosso Corsa, others light grey turning white on hover.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `font-display px-3.5 py-1.5 rounded-md text-sm font-bold tracking-wide transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      <NavLink to="/" end className={linkClass} onClick={onClick}>
        Search
      </NavLink>
      <NavLink to="/library" className={linkClass} onClick={onClick}>
        Library
      </NavLink>
      <NavLink to="/key-dates" className={linkClass} onClick={onClick}>
        Key dates
      </NavLink>
      <NavLink to="/assistant" className={linkClass} onClick={onClick}>
        Assistant
      </NavLink>
      <NavLink to="/insights" className={linkClass} onClick={onClick}>
        Insights
      </NavLink>
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const me = useWhoAmI();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="f1-header px-4 md:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="f1-mark" aria-hidden="true" />
          <h1 className="text-xl font-black text-white">Records</h1>
        </div>
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-warning text-warning-foreground" title="Results are limited to what your account may access">
            {me?.email ?? me?.user ?? 'Signed in'}
          </Badge>
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
                <NavLinks className="flex flex-col gap-1" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
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
