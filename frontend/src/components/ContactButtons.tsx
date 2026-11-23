"use client";

import { Mail, MessageCircle } from "lucide-react";
import { cn, mailtoLink, zaloLink } from "@/lib/utils";

interface ContactButtonsProps {
  email?: string | null;
  zaloPhone?: string | null;
  subject?: string;
  size?: "sm" | "md";
  showLabels?: boolean;
}

/** Quick "Mail" (mailto:) and "Zalo" (https://zalo.me/<phone>) buttons. Disabled when the info is missing. */
export function ContactButtons({ email, zaloPhone, subject, size = "sm", showLabels = true }: ContactButtonsProps) {
  const mail = mailtoLink(email, subject);
  const zalo = zaloLink(zaloPhone);
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors",
    size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
  );
  const off = "pointer-events-none border-slate-100 bg-slate-50 text-slate-300";

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={mail ?? undefined}
        aria-disabled={!mail}
        title={mail ? `Gửi mail tới ${email}` : "Chưa có email"}
        className={cn(base, mail ? "border-red-100 bg-red-50 text-red-600 hover:bg-red-100" : off)}
      >
        <Mail className="h-3.5 w-3.5" />
        {showLabels && "Mail"}
      </a>
      <a
        href={zalo ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!zalo}
        title={zalo ? `Mở Zalo ${zaloPhone}` : "Chưa có SĐT Zalo"}
        className={cn(base, zalo ? "border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100" : off)}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {showLabels && "Zalo"}
      </a>
    </div>
  );
}
