import { LayoutDashboard, Users2, CheckSquare, Settings, Truck, FileText, Receipt, Package, ScrollText, Gavel, Sparkles, Tags, ShieldCheck, ShieldAlert, PiggyBank, Sunrise, Building2, Boxes, ScanLine, Inbox, Calculator, ListChecks, Ship, BarChart3, ClipboardList } from 'lucide-react';

export const NAV_ICONS = {
  BarChart3,
  ClipboardList,
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
  Calculator,
  ListChecks,
  Ship,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
