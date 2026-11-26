"use client";

import { ArrowLeft, BookOpen, Info, Mic, Paperclip, PenLine, Square, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EMPTY_GUIDE_FORM, formFromGuide, GuideEditor, type GuideForm } from "@/components/guides/GuideEditor";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ACCEPT_TASK_FILES, fileKindLabel, MAX_UPLOAD_BYTES, toFilePayload } from "@/lib/files";
import { useCreateGuide, useGuideExtract, useGuides } from "@/lib/queries";
import type { FilePayload, GuideDraft, GuideInputKind } from "@/lib/types";
import { formatClock, recordingExt, useRecorder } from "@/lib/useRecorder";
import { cn } from "@/lib/utils";

const MAX_RECORD_SECONDS = 12 * 60;

export default function NewGuidePage() {
  const router = useRouter();
  const toast = useToast();
  const extract = useGuideExtract();
  const create = useCreateGuide();
  const topics = useGuides({}).data?.topics ?? [];

  const [text, setText] = useState("");
  const [file, setFile] = useState<{ payload: FilePayload; name: string; size: number } | null>(null);
  const [draft, setDraft] = useState<GuideDraft | null>(null);
  /** Changes whenever a new draft / blank form is loaded so the editor re-initialises. */
  const [editor, setEditor] = useState<{ key: number; form: GuideForm } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const recorder = useRecorder({
    maxSeconds: MAX_RECORD_SECONDS,
    onError: (m) => toast.error(m),
    onDone: async (blob, seconds) => {
      try {
        const payload = await toFilePayload(blob, `ghi-am-huong-dan.${recordingExt(blob)}`);
        setFile({ payload, name: `Ghi âm ${formatClock(seconds)}`, size: blob.size });
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
  });

  async function onPickFile(f: File) {
    try {
      const payload = await toFilePayload(f);
      setFile({ payload, name: f.name, size: f.size });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function analyse() {
    try {
      const { data, message } = await extract.mutateAsync({ text: text.trim() || undefined, file: file?.payload });
      setDraft(data);
      setEditor({ key: Date.now(), form: formFromGuide(data) });
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function manual() {
    setDraft(null);
    const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    setEditor({
      key: Date.now(),
      form: lines.length
        ? { ...EMPTY_GUIDE_FORM, title: lines[0]!, steps: (lines.length > 1 ? lines.slice(1) : [""]).map((l, i) => ({ key: i, text: l.replace(/^(?:[-*•+]|\d+[.)])\s*/, ""), detail: "" })) }
        : EMPTY_GUIDE_FORM,
    });
  }

  const inputKind: GuideInputKind = draft ? draft.inputKind : "manual";
  const canAnalyse = !recorder.recording && (!!file || text.trim().length >= 10);

  return (
    <>
      <PageHeader
        title="Ghi hướng dẫn mới"
        description="Khi được anh chị chỉ việc: gõ vội, ghi âm hoặc chụp màn hình — AI sắp xếp thành các bước làm, lưu ý và việc cần làm."
        actions={
          <Link href="/guides" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" /> Sổ tay
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="h-fit p-5">
          <Field label="Ghi chép nhanh" htmlFor="g-text" hint="Gõ vội cũng được, không cần đúng thứ tự hay chính tả.">
            <Textarea
              id="g-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-56"
              maxLength={30000}
              placeholder={
                "VD:\nAnh Nam chỉ xuất hoá đơn MISA\nvào MISA meInvoice > Hoá đơn > Lập hoá đơn\nchọn mẫu 1C24TAA, nhập MST khách thì tự ra tên\nlưu ý: kiểm tra thuế suất 8% hay 10% trước khi phát hành\nbấm Phát hành > ký bằng USB token\ncần làm: xin anh Nam cấp quyền tài khoản"
              }
            />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant={recorder.recording ? "danger" : "outline"}
              onClick={recorder.recording ? recorder.stop : () => void recorder.start().then(() => setFile(null))}
              className={cn(recorder.recording && "animate-pulse")}
            >
              {recorder.recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-4 w-4" />}
              {recorder.recording ? `Dừng ${formatClock(recorder.seconds)}` : "Ghi âm"}
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={recorder.recording}>
              <Paperclip className="h-4 w-4" /> Ảnh / PDF / audio
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT_TASK_FILES}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
          </div>
          {recorder.recording && <p className="mt-2 text-xs text-slate-500">Đang ghi… đặt máy gần người hướng dẫn (tối đa {MAX_RECORD_SECONDS / 60} phút).</p>}

          {file && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <Badge className="mr-2 bg-indigo-50 text-indigo-700">{fileKindLabel(file.payload.mimeType)}</Badge>
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <Button variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Bỏ file">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button
            className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500"
            onClick={analyse}
            loading={extract.isPending}
            disabled={!canAnalyse}
          >
            {!extract.isPending && <Wand2 className="h-4 w-4" />}
            {extract.isPending ? "AI đang sắp xếp…" : "AI sắp xếp thành hướng dẫn"}
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={manual} disabled={recorder.recording}>
            <PenLine className="h-4 w-4" /> Tự nhập, không dùng AI
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            AI dùng 1 lượt. Có thể vừa gõ vừa đính kèm ghi âm / ảnh chụp màn hình (tối đa {MAX_UPLOAD_BYTES / 1024 / 1024} MB); ghi âm/ảnh/PDF cần GEMINI_API_KEY.
          </p>
        </Card>

        {!editor ? (
          <Card>
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title="Chưa có nội dung"
              description="Sau khi AI sắp xếp (hoặc chọn tự nhập), bạn kiểm tra lại các bước, lưu ý, việc cần làm rồi lưu vào sổ tay."
            />
          </Card>
        ) : (
          <Card className="p-5">
            {draft?.isMock && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Đang dùng sắp xếp mẫu (chưa cấu hình GEMINI_API_KEY): mỗi dòng là một bước, dòng bắt đầu bằng “Lưu ý” là lưu ý, “Cần làm” là việc cần làm.
              </p>
            )}
            <GuideEditor
              key={editor.key}
              initial={editor.form}
              topics={topics}
              saving={create.isPending}
              onCancel={() => setEditor(null)}
              onSave={async (input) => {
                try {
                  const { data, message } = await create.mutateAsync({
                    ...input,
                    rawNote: draft?.rawNote ?? text.trim(),
                    inputKind,
                    isMock: draft?.isMock ?? false,
                  });
                  toast.success(message);
                  router.push(`/guides?id=${data._id}`);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          </Card>
        )}
      </div>
    </>
  );
}
