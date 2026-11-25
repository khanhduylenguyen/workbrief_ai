"use client";

import { CheckCircle2, ExternalLink, Info, Send, Unplug, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useTelegramLink, useTelegramUnlink } from "@/lib/queries";
import type { IntegrationOverview } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function TelegramCard({ telegram }: { telegram: IntegrationOverview["telegram"] }) {
  const toast = useToast();
  const link = useTelegramLink();
  const unlink = useTelegramUnlink();
  const [deepLink, setDeepLink] = useState<{ url: string; expiresAt: string } | null>(null);

  async function onConnect() {
    try {
      const { data } = await link.mutateAsync();
      setDeepLink({ url: data.deepLink, expiresAt: data.expiresAt });
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onUnlink() {
    if (!window.confirm("Ngắt kết nối Telegram? Tin nhắn gửi tới bot sẽ không còn tạo công việc.")) return;
    try {
      const { message } = await unlink.mutateAsync();
      setDeepLink(null);
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-sky-50 p-2.5">
            <Send className="h-5 w-5 text-sky-500" />
          </span>
          <h2 className="font-semibold text-slate-900">Telegram bot</h2>
        </div>
        {telegram.isLinked ? (
          <Badge className="bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Đã kết nối
          </Badge>
        ) : (
          <Badge className="bg-slate-100 text-slate-500">
            <XCircle className="h-3 w-3" /> Chưa kết nối
          </Badge>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-600">
        {telegram.isLinked ? (
          <>
            Đã liên kết với Telegram{" "}
            <b>{telegram.username ? `@${telegram.username}` : telegram.firstName ?? ""}</b>
            {telegram.botUsername && (
              <>
                {" "}
                qua bot <b>@{telegram.botUsername}</b>
              </>
            )}
            .
          </>
        ) : (
          "Nhắn hoặc chuyển tiếp tin nhắn giao việc, ảnh, PDF, tin nhắn thoại cho bot — AI tự tóm tắt và tạo công việc."
        )}
      </p>
      <dl className="mt-3 space-y-1.5 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>Task từ Telegram</dt>
          <dd className="font-medium text-slate-700">{telegram.taskCount}</dd>
        </div>
        {telegram.linkedAt && (
          <div className="flex justify-between">
            <dt>Kết nối lúc</dt>
            <dd className="font-medium text-slate-700">{formatDateTime(telegram.linkedAt)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto space-y-2 pt-4">
        {!telegram.configured ? (
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Máy chủ chưa cấu hình bot (<code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_BOT_USERNAME</code>).
            </span>
          </div>
        ) : telegram.isLinked ? (
          <>
            <a
              href={`https://t.me/${telegram.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-500 text-sm font-medium text-white hover:bg-sky-400"
            >
              <Send className="h-4 w-4" /> Mở chat với bot
            </a>
            <Button variant="ghost" size="sm" className="w-full text-slate-500 hover:text-rose-600" onClick={onUnlink} loading={unlink.isPending}>
              <Unplug className="h-3.5 w-3.5" /> Ngắt kết nối
            </Button>
          </>
        ) : (
          <>
            <Button className="w-full bg-sky-500 hover:bg-sky-400" onClick={onConnect} loading={link.isPending}>
              {!link.isPending && <Send className="h-4 w-4" />} Kết nối Telegram
            </Button>
            {deepLink && (
              <p className="text-center text-xs text-slate-500">
                Telegram sẽ mở ra — bấm <b>Start</b> trong chat với bot. Không tự mở?{" "}
                <a href={deepLink.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-sky-600 hover:underline">
                  Mở link <ExternalLink className="h-3 w-3" />
                </a>{" "}
                (hết hạn {formatDateTime(deepLink.expiresAt)}). Sau khi bấm Start, tải lại trang này.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
