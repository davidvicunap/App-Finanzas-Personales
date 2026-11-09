/** Iconos SVG (trazos simples, heredan el color del texto). */
import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const IconDashboard = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Icon>
);
export const IconList = () => (
  <Icon>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="14" y2="17" />
  </Icon>
);
export const IconSettings = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6H8.1l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L3.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4.8l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4Z" />
  </Icon>
);
export const IconPlus = () => (
  <Icon>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);
export const IconChevronLeft = () => (
  <Icon width={16} height={16} strokeWidth={2.2}>
    <polyline points="15 18 9 12 15 6" />
  </Icon>
);
export const IconChevronRight = () => (
  <Icon width={16} height={16} strokeWidth={2.2}>
    <polyline points="9 18 15 12 9 6" />
  </Icon>
);
export const IconSearch = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Icon>
);
export const IconEdit = () => (
  <Icon>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);
export const IconArrowDown = () => (
  <Icon>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="6 13 12 19 18 13" />
  </Icon>
);
export const IconArrowUp = () => (
  <Icon>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="6 11 12 5 18 11" />
  </Icon>
);
export const IconMoon = () => (
  <Icon strokeWidth={1.9}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
  </Icon>
);
export const IconSun = () => (
  <Icon strokeWidth={1.9}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const IconEmpty = () => (
  <Icon>
    <path d="M3 7h18M3 12h18M3 17h10" />
  </Icon>
);
export const IconAlert = () => (
  <Icon>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

export const Logo = () => (
  <span className="brand-logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15l5-5 3.5 3L20 6" />
      <circle cx="20" cy="6" r="1.4" fill="#34D399" stroke="none" />
    </svg>
  </span>
);
