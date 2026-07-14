import { LayoutDashboard, Users2, CheckSquare, Settings, Truck, FileText, Receipt, Package, ScrollText, Gavel, Sparkles, Tags, ShieldCheck, ShieldAlert, PiggyBank, Sunrise, Building2, Boxes, ScanLine, Inbox } from 'lucide-react';

export const NAV_ICONS = {
  LayoutDashboard,
  Users2,
  CheckSquare,
  Settings,
  Truck,
  FileText,
  Receipt,
  Package,
  ScrollText,
  Gavel,
  Sparkles,
  Tags,
  ShieldCheck,
  ShieldAlert,
  PiggyBank,
  Sunrise,
  Building2,
  Boxes,
  ScanLine,
  Inbox,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
