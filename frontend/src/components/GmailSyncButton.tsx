"use client";

import { Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useGmailSync, useIntegrations } from "@/lib/queries";
import type { GmailSyncResult } from "@/lib/types";

interface GmailSyncButtonProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onSynced?: (result: GmailSyncResult) => void;
}

/**
 * "Đồng bộ Gmail ngay". When Gmail isn't connected yet it links to /integrations instead,
 * so the button is useful on any page.
 */
export function GmailSyncButton({ variant = "outline", size = "md", onSynced }: GmailSyncButtonProps) {
  const toast = useToast();
  const overview = useIntegrations();
  const sync = useGmailSync();
  const gmail = overview.data?.gmail;

  if (gmail && !gmail.isConnected) {
    return (
      <Link
        href="/integrations"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        title="Kết nối Gmail để đồng bộ email thành công việc"
      >
        <Mail className="h-4 w-4 text-red-500" /> Kết nối Gmail
      </Link>
    );
  }

  async function run() {
    try {
      const { data, message } = await sync.mutateAsync();
      if (data.created > 0) toast.success(message);
      else if (data.quotaExhausted) toast.error(message);
      else toast.info(message);
      onSynced?.(data);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={run} loading={sync.isPending} disabled={!gmail}>
      {!sync.isPending && <RefreshCw className="h-4 w-4" />}
      {sync.isPending ? "Đang đồng bộ Gmail…" : "Đồng bộ Gmail ngay"}
    </Button>
  );
}
