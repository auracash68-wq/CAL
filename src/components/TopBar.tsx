import { Moon, Sun } from 'lucide-react';

export type WorkspaceTab = 'calculator' | 'gst' | 'cash' | 'ledger';
export type DesktopSideTab = 'ledger' | 'gst' | 'cash';

interface TopBarProps {
  activeMobileTab: WorkspaceTab;
  activeSideTab: DesktopSideTab;
  onSelectMobileTab: (tab: WorkspaceTab) => void;
  onSelectSideTab: (tab: DesktopSideTab) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function TopBar({
  activeSideTab,
  onSelectMobileTab,
  onSelectSideTab,
  isDark,
  onToggleTheme,
}: TopBarProps) {
  const handleDesktopNav = (tab: WorkspaceTab) => {
    onSelectMobileTab(tab);
    if (tab !== 'calculator') {
      onSelectSideTab(tab);
    }
  };

  return (
    <header className="sticky top-0 z-30 pt-safe border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#111722]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-12 lg:h-14 px-3.5 lg:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="#calculator"
          onClick={(e) => {
            e.preventDefault();
            onSelectMobileTab('calculator');
          }}
          className="flex items-center gap-2.5 text-base lg:text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B] rounded-md"
        >
          <span
            aria-hidden="true"
            className="w-7 h-7 rounded-lg bg-[#1E3A8A] dark:bg-[#D97706] text-white flex items-center justify-center font-mono text-sm font-bold shadow-xs"
          >
            ₹
          </span>
          <span>Ganaka</span>
        </a>

        {/* Zone 2: Desktop single-line text navigation */}
        <nav
          aria-label="Workspace sections"
          className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          <button
            type="button"
            onClick={() => handleDesktopNav('calculator')}
            className="py-1 text-slate-900 dark:text-slate-100 hover:text-[#1E3A8A] dark:hover:text-[#F59E0B] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Calculator
          </button>
          <button
            type="button"
            onClick={() => handleDesktopNav('ledger')}
            className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSideTab === 'ledger'
                ? 'text-[#1E3A8A] dark:text-[#F59E0B] font-semibold'
                : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Tape &amp; Ledger
          </button>
          <button
            type="button"
            onClick={() => handleDesktopNav('gst')}
            className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSideTab === 'gst'
                ? 'text-[#1E3A8A] dark:text-[#F59E0B] font-semibold'
                : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            GST Desk
          </button>
          <button
            type="button"
            onClick={() => handleDesktopNav('cash')}
            className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSideTab === 'cash'
                ? 'text-[#1E3A8A] dark:text-[#F59E0B] font-semibold'
                : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Cash Counter
          </button>
        </nav>

        {/* Zone 3: Single theme action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="min-h-[38px] min-w-[38px] lg:min-h-[40px] px-2.5 lg:px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B]"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
