import {
  BadgeCheck,
  Contact,
  FileText,
  Gavel,
  IdCard,
  Laptop,
  Mail,
  Receipt,
  ScrollText,
  ShieldAlert,
  ShoppingBag,
  Stamp,
  type LucideIcon,
} from 'lucide-react';

/** One icon per registry document type, used across Search, Document, Key dates and Insights. */
const TYPE_ICONS: Record<string, LucideIcon> = {
  invoice: Receipt,
  receipt: ShoppingBag,
  contract: FileText,
  legal_notice: ShieldAlert,
  court_judgment: Gavel,
  power_of_attorney: Stamp,
  trade_licence: BadgeCheck,
  id_document: IdCard,
  letter: Mail,
  business_card: Contact,
  asset_undertaking: Laptop,
};

export function typeIcon(type: string | null | undefined): LucideIcon {
  return (type && TYPE_ICONS[type]) || ScrollText;
}
