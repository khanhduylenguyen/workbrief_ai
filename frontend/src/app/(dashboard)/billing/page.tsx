"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CreditCard, Info, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Badge, Button, Card, ErrorBox, PageHeader, PageLoader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { qk, useBilling, useCheckout, useMe } from "@/lib/queries";
import type { Order, PlanCode } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
const ORDER_STATUS: Record<Order["status"], { label: string; cls: string }> = {
  PAID: { label: "Đã thanh toán", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Chờ thanh toán", cls: "bg-slate-100 text-slate-600" },
  FAILED: { label: "Thất bại / huỷ", cls: "bg-rose-50 text-rose-700" },
};

export default function BillingPage() {
  const billing = useBilling();
  const me = useMe();
  const checkout = useCheckout();
  const toast = useToast();

  async function buy(plan: PlanCode) {
    try {
      await checkout.mutateAsync(plan); // navigates to VNPay on success
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const b = billing.data;
  const access = b?.access;
  const planName = (code: PlanCode | null | undefined) => b?.plans.find((p) => p.code === code)?.name ?? code ?? "";
  const daysLeft = access?.daysLeft ?? null;

  return (
    <>
      <PageHeader title="Gói & thanh toán" description="Chọn gói để tiếp tục dùng WorkBrief AI. Thanh toán an toàn qua cổng VNPay (thẻ ATM, QR ngân hàng, thẻ quốc tế)." />

      <Suspense fallback={null}>
        <PaymentResultNotice />
      </Suspense>

      {billing.isLoading ? (
        <PageLoader />
      ) : billing.isError || !b ? (
        <ErrorBox message={billing.error?.message ?? "Không tải được thông tin gói"} onRetry={() => billing.refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Current status */}
          <Card className={cn("flex flex-wrap items-center justify-between gap-3 p-5", !access?.active && "border-[#d03b3b]/40 bg-rose-50/40")}>
            <div className="flex items-start gap-3">
              {access?.active ? <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-[#d03b3b]" />}
              <div>
                <p className="font-semibold text-slate-900">
                  {access?.unlimited
                    ? "Tài khoản không giới hạn thời gian"
                    : access?.active
                      ? access.paidActive
                        ? `Đang dùng gói ${planName(access.plan)}`
                        : "Đang dùng thử"
                      : "Tài khoản đã hết hạn"}
                </p>
                <p className="text-sm text-slate-600">
                  {access?.unlimited
                    ? "Không cần mua gói."
                    : access?.active
                      ? `Sử dụng đến ${formatDateTime(access.expiresAt)} (còn ${daysLeft} ngày). Mua thêm sẽ cộng dồn thời gian.`
                      : `Hết hạn từ ${formatDate(access?.expiresAt)}. Chọn một gói bên dưới để mở lại toàn bộ tính năng — dữ liệu của bạn vẫn được giữ nguyên.`}
                </p>
              </div>
            </div>
            {me.data && (
              <p className="text-xs text-slate-500">
                Lượt AI: {me.data.aiQuotaUsed}/{me.data.aiQuotaLimit}
              </p>
            )}
          </Card>

          {!b.enabled && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Info className="h-4 w-4 shrink-0" />
              <span>Thanh toán trực tuyến chưa được bật trên máy chủ. Vui lòng liên hệ quản trị viên để gia hạn hoặc nâng cấp.</span>
            </div>
          )}

          {/* Plans */}
          {!access?.unlimited && (
            <div className="grid gap-4 md:grid-cols-3">
              {b.plans.map((p) => (
                <Card key={p.code} className={cn("relative flex flex-col p-5", p.highlight && "border-indigo-500 ring-1 ring-indigo-500")}>
                  {p.highlight && <Badge className="absolute -top-2.5 left-5 bg-indigo-600 text-white">Phổ biến</Badge>}
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="mt-2">
                    <span className="text-3xl font-semibold tracking-tight text-slate-900">{vnd(p.price)}</span>
                    <span className="text-sm text-slate-500"> / {p.days === 365 ? "năm" : `${p.days} ngày`}</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    variant={p.highlight ? "primary" : "outline"}
                    disabled={!b.enabled}
                    loading={checkout.isPending && checkout.variables === p.code}
                    onClick={() => buy(p.code)}
                  >
                    {!(checkout.isPending && checkout.variables === p.code) && <CreditCard className="h-4 w-4" />}
                    {b.enabled ? "Thanh toán qua VNPay" : "Liên hệ quản trị viên"}
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {/* History */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Lịch sử giao dịch</h2>
            {b.orders.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có giao dịch nào.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="py-2 pr-2 font-medium">Mã đơn</th>
                      <th className="px-2 py-2 font-medium">Gói</th>
                      <th className="px-2 py-2 text-right font-medium">Số tiền</th>
                      <th className="px-2 py-2 font-medium">Trạng thái</th>
                      <th className="py-2 pl-2 font-medium">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {b.orders.map((o) => (
                      <tr key={o._id}>
                        <td className="py-2 pr-2 font-mono text-xs text-slate-600">{o.txnRef}</td>
                        <td className="px-2 py-2">{planName(o.plan)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{vnd(o.amount)}</td>
                        <td className="px-2 py-2">
                          <Badge className={ORDER_STATUS[o.status].cls}>{ORDER_STATUS[o.status].label}</Badge>
                        </td>
                        <td className="py-2 pl-2 text-xs text-slate-500">
                          {formatDateTime(o.paidAt ?? o.createdAt)}
                          {o.periodEnd && <span className="block">→ dùng đến {formatDate(o.periodEnd)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/** Reads ?payment=success|failed|invalid after VNPay redirects back (useSearchParams needs Suspense). */
function PaymentResultNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const status = params.get("payment");
  const order = params.get("order");

  useEffect(() => {
    if (!status) return;
    if (status === "success") toast.success(`Thanh toán thành công${order ? ` (đơn ${order})` : ""}. Cảm ơn bạn!`);
    else if (status === "failed") toast.error("Giao dịch chưa thành công hoặc đã bị huỷ. Bạn có thể thử lại.");
    else if (status === "invalid") toast.error("Không xác thực được kết quả thanh toán. Nếu đã bị trừ tiền, hãy liên hệ quản trị viên kèm mã đơn.");
    qc.invalidateQueries({ queryKey: ["billing"] });
    qc.invalidateQueries({ queryKey: qk.me });
    router.replace("/billing");
  }, [status, order, toast, qc, router]);

  return null;
}
