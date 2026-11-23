"use client";

import { ClipboardList, Mail, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ContactButtons } from "@/components/ContactButtons";
import { Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useColleagues, useCreateColleague, useDeleteColleague, type ColleagueInput } from "@/lib/queries";
import type { Colleague } from "@/lib/types";
import { initials } from "@/lib/utils";

const EMPTY: ColleagueInput = { name: "", position: "", department: "", email: "", zaloPhone: "" };

export default function ColleaguesPage() {
  const toast = useToast();
  const colleagues = useColleagues();
  const create = useCreateColleague();
  const del = useDeleteColleague();
  const [form, setForm] = useState<ColleagueInput>(EMPTY);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = colleagues.data ?? [];
    if (!term) return list;
    return list.filter((c) =>
      [c.name, c.position, c.department, c.email, c.zaloPhone].some((v) => v.toLowerCase().includes(term)),
    );
  }, [colleagues.data, search]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ ...form, name: form.name.trim() });
      toast.success(`Đã thêm ${form.name.trim()} vào danh bạ.`);
      setForm(EMPTY);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(c: Colleague) {
    const extra = c.taskCount ? `\n${c.taskCount} công việc đang gán cho người này sẽ được bỏ gán.` : "";
    if (!window.confirm(`Xóa ${c.name} khỏi danh bạ?${extra}`)) return;
    try {
      await del.mutateAsync(c._id);
      toast.success(`Đã xóa ${c.name}.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const set = (key: keyof ColleagueInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader title="Danh bạ đồng nghiệp" description="Lưu sếp và đồng nghiệp để gán người giao việc và liên hệ nhanh qua Mail / Zalo." />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="h-4 w-4 text-indigo-600" /> Thêm liên hệ
          </h2>
          <form onSubmit={onSubmit} className="space-y-3.5">
            <Field label="Họ tên" htmlFor="c-name" required>
              <Input id="c-name" value={form.name} onChange={set("name")} required placeholder="Trần Thị B" maxLength={120} />
            </Field>
            <Field label="Chức vụ" htmlFor="c-position">
              <Input id="c-position" value={form.position} onChange={set("position")} placeholder="Trưởng phòng" maxLength={120} />
            </Field>
            <Field label="Phòng ban" htmlFor="c-department">
              <Input id="c-department" value={form.department} onChange={set("department")} placeholder="Kinh doanh" maxLength={120} />
            </Field>
            <Field label="Email" htmlFor="c-email">
              <Input id="c-email" type="email" value={form.email} onChange={set("email")} placeholder="b@congty.vn" />
            </Field>
            <Field label="SĐT Zalo" htmlFor="c-zalo" hint="Dùng để mở nhanh zalo.me và tự khớp người gửi từ Zalo Webhook.">
              <Input id="c-zalo" type="tel" value={form.zaloPhone} onChange={set("zaloPhone")} placeholder="0912 345 678" maxLength={20} />
            </Field>
            <Button type="submit" className="w-full" loading={create.isPending} disabled={!form.name.trim()}>
              Thêm vào danh bạ
            </Button>
          </form>
        </Card>

        <div>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, chức vụ, email, SĐT…" className="pl-9" aria-label="Tìm liên hệ" />
          </div>

          {colleagues.isLoading ? (
            <PageLoader />
          ) : colleagues.isError ? (
            <ErrorBox message={colleagues.error.message} onRetry={() => colleagues.refetch()} />
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={search ? "Không tìm thấy liên hệ" : "Danh bạ đang trống"}
                description={search ? "Thử từ khóa khác." : "Thêm sếp và đồng nghiệp ở form bên cạnh."}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {filtered.map((c) => (
                <Card key={c._id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{c.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[c.position, c.department].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(c)} aria-label={`Xóa ${c.name}`} className="hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 text-slate-400" /> {c.email || <span className="text-slate-400">Chưa có email</span>}
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {c.zaloPhone || <span className="text-slate-400">Chưa có SĐT</span>}
                    </p>
                    <p className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-slate-400" /> {c.taskCount ?? 0} việc đã giao
                    </p>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <ContactButtons email={c.email} zaloPhone={c.zaloPhone} size="md" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
