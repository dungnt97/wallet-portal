// Icons — minimal stroke-based icon set (Lucide-like, hand-tuned)
// Direct port of prototype src/icons.jsx. Exposed as the `I` object so
// feature ports can keep the same call-sites (I.Dashboard, I.ArrowDown, …).

import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke' | 'fill'> {
  size?: number;
  stroke?: number;
  fill?: string;
}

function Icon({
  size = 16,
  stroke = 1.6,
  fill = 'none',
  className,
  children,
  ...rest
}: IconProps & { children?: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const I = {
  Dashboard: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  ),
  Users: (p: IconProps) => (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </Icon>
  ),
  Inbox: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </Icon>
  ),
  ArrowDown: (p: IconProps) => (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </Icon>
  ),
  ArrowUp: (p: IconProps) => (
    <Icon {...p}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Icon>
  ),
  Sweep: (p: IconProps) => (
    <Icon {...p}>
      <path d="M19 8l-7 8-3-3" />
      <path d="M3 12h6" />
      <path d="M3 16h6" />
      <path d="M3 8h6" />
    </Icon>
  ),
  Withdraw: (p: IconProps) => (
    <Icon {...p}>
      <path d="M21 12V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h10" />
      <path d="M16 14h6" />
      <path d="M19 11l3 3-3 3" />
    </Icon>
  ),
  Shield: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  ),
  Activity: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Icon>
  ),
  Logs: (p: IconProps) => (
    <Icon {...p}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </Icon>
  ),
  Network: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </Icon>
  ),
  Search: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
  ),
  Bell: (p: IconProps) => (
    <Icon {...p}>
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </Icon>
  ),
  Settings: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Icon>
  ),
  Plus: (p: IconProps) => (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  ),
  X: (p: IconProps) => (
    <Icon {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),
  Check: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  ),
  Copy: (p: IconProps) => (
    <Icon {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </Icon>
  ),
  External: (p: IconProps) => (
    <Icon {...p}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
  ),
  Filter: (p: IconProps) => (
    <Icon {...p}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </Icon>
  ),
  ChevronDown: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  ),
  ChevronRight: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="9 18 15 12 9 6" />
    </Icon>
  ),
  ChevronLeft: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="15 18 9 12 15 6" />
    </Icon>
  ),
  Refresh: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </Icon>
  ),
  AlertTri: (p: IconProps) => (
    <Icon {...p}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
  Info: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Icon>
  ),
  Sun: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </Icon>
  ),
  Moon: (p: IconProps) => (
    <Icon {...p}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </Icon>
  ),
  Sliders: (p: IconProps) => (
    <Icon {...p}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Icon>
  ),
  Sidebar: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </Icon>
  ),
  Lightning: (p: IconProps) => (
    <Icon {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
  ),
  Database: (p: IconProps) => (
    <Icon {...p}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </Icon>
  ),
  Layers: (p: IconProps) => (
    <Icon {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  ),
  Clock: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  ),
  Zap: (p: IconProps) => (
    <Icon {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
  ),
  Trash: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
    </Icon>
  ),
  LogOut: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Icon>
  ),
  Lock: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </Icon>
  ),
  Key: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3L22 7l-3-3" />
    </Icon>
  ),
  UserCheck: (p: IconProps) => (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </Icon>
  ),
  ShieldCheck: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </Icon>
  ),
  UserX: (p: IconProps) => (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="17" y1="8" x2="22" y2="13" />
      <line x1="22" y1="8" x2="17" y2="13" />
    </Icon>
  ),
  UserPlus: (p: IconProps) => (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </Icon>
  ),
  Command: (p: IconProps) => (
    <Icon {...p}>
      <path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z" />
    </Icon>
  ),
  Close: (p: IconProps) => (
    <Icon {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),
  ArrowRight: (p: IconProps) => (
    <Icon {...p}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  ),
  ArrowLeft: (p: IconProps) => (
    <Icon {...p}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </Icon>
  ),
  Send: (p: IconProps) => (
    <Icon {...p}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Icon>
  ),
  Loader: (p: IconProps) => (
    <Icon {...p}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </Icon>
  ),
  Wallet: (p: IconProps) => (
    <Icon {...p}>
      <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-5" />
      <path d="M17 12h4" />
      <circle cx="17" cy="14" r="1" />
    </Icon>
  ),
  Link: (p: IconProps) => (
    <Icon {...p}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </Icon>
  ),
  Mail: (p: IconProps) => (
    <Icon {...p}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2 7 12 13 22 7" />
    </Icon>
  ),
  Globe: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Icon>
  ),
} as const;

export type IconKey = keyof typeof I;
