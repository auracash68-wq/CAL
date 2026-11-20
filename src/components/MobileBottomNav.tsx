import { Banknote, Calculator, History, Percent } from 'lucide-react';
import type { WorkspaceTab } from './TopBar';

interface MobileBottomNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  historyCount: number;
}

const TABS: { id: WorkspaceTab; label: string; icon: typeof Calculator }[] = [
  { id: 'calculator', label: 'Calc', icon: Calculator },
  { id: 'gst', label: 'GST', icon: Percent },
  { id: 'cash', label: 'Cash ₹', icon: Banknote },
  { id: 'ledger', label: 'Ledger', icon: History },
];

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  historyCount,
}: MobileBottomNavProps) {
  return (
    <nav
      aria-label="Mobile workspace navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#111722]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
    >
      <div className="grid grid-cols-4 h-14 max-w-lg mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B] ${
                isActive
                  ? 'text-[#1E3A8A] dark:text-[#F59E0B] font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.85} />
              <span className="text-[11px] leading-none tracking-tight whitespace-nowrap">
                {label}
                {id === 'ledger' && historyCount > 0 ? ` (${historyCount})` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
