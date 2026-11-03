import { NavLink } from 'react-router';
import { PLACEHOLDER_ACCOUNT, PRODUCT_NAME, SIDEBAR_LABELS } from '../strings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { MENU } from './menu';

interface SidebarProps {
  id: string;
  isOpenOnPhone: boolean;
  onChoosePage: () => void;
}

export function Sidebar({ id, isOpenOnPhone, onChoosePage }: SidebarProps) {
  return (
    <aside
      id={id}
      className={`${isOpenOnPhone ? 'flex' : 'hidden md:flex'} w-full flex-col gap-5 px-3.5 pt-4.5 pb-3.5 md:sticky md:top-0 md:h-dvh md:w-sidebar md:flex-none md:overflow-y-auto md:border-r md:border-line`}
    >
      <div className="product-mark pl-2 max-md:hidden">{PRODUCT_NAME}</div>
      <nav aria-label={SIDEBAR_LABELS.menu} className="flex flex-col gap-0.5">
        {MENU.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onChoosePage}
            className="px-2 py-1.75 font-medium text-ink-2 hover:text-ink aria-[current=page]:bg-panel aria-[current=page]:text-ink"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <RecentSessions />
      <AccountRow />
    </aside>
  );
}

function RecentSessions() {
  return (
    <div className="flex flex-1 flex-col gap-1 px-2">
      <div className="label text-ink-2">{SIDEBAR_LABELS.recent}</div>
      <p className="text-fine text-ink-2">{SIDEBAR_LABELS.noSessions}</p>
    </div>
  );
}

function AccountRow() {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-2.5">
      <div className="min-w-0">
        <div className="leading-tight font-medium">{PLACEHOLDER_ACCOUNT.name}</div>
        <span className="text-fine text-ink-2">{PLACEHOLDER_ACCOUNT.status}</span>
      </div>
      <ThemeToggle />
    </div>
  );
}
