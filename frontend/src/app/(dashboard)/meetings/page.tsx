"use client";

import { CheckCircle2, ChevronDown, FileUp, Info, Mic, PenLine, Sparkles, Square, Trash2, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ACCEPT_TASK_FILES, fileKindLabel, MAX_UPLOAD_BYTES, toFilePayload } from "@/lib/files";
import { useBulkCreateTasks, useColleagues, useMeetingExtract } from "@/lib/queries";
import type { FilePayload, MeetingResult, TaskPriority } from "@/lib/types";
import { cn, fromDateTimeLocal, PRIORITY_LABEL, toDateTimeLocal } from "@/lib/utils";

type Mode = "record" | "file" | "text";

interface DraftRow {
  key: number;
  include: boolean;
  title: string;
  aiSummary: string;
  checklist: { text: string; isDone: boolean }[];
  priority: TaskPriority;
  deadline: string; // datetime-local
  assignedBy: string; // colleague id or ""
  requestedBy: string | null;
  owner: string | null;
}

const MAX_RECORD_SECONDS = 12 * 60;
let rowSeq = 1;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
}

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function MeetingsPage() {
  const toast = useToast();
  const colleagues = useColleagues();
  const extract = useMeetingExtract();
  const bulk = useBulkCreateTasks();

  const [mode, setMode] = useState<Mode>("record");
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ payload: FilePayload; name: string; size: number } | null>(null);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);

  // --- recorder
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now() - seconds * 1000;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      secondsRef.current = s;
      setSeconds(s);
      if (s >= MAX_RECORD_SECONDS) recorderRef.current?.stop();
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `seconds` only seeds the start time
  }, [recording]);

  // Release the microphone if the user navigates away mid-recording.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function startRecording() {
    const mimeType = pickRecorderMime();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome/Edge bản mới hoặc tải file ghi âm lên.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        try {
          const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
          const payload = await toFilePayload(blob, `ghi-am-cuoc-hop.${ext}`);
          setFile({ payload, name: `Ghi âm ${fmtTime(secondsRef.current)}`, size: blob.size });
        } catch (err) {
          toast.error((err as Error).message);
        }
      };
      recorderRef.current = rec;
      rec.start(1000);
      secondsRef.current = 0;
      setSeconds(0);
      setFile(null);
      setRecording(true);
    } catch {
      toast.error("Không truy cập được micro. Hãy cho phép quyền micro cho trang này.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

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
      const body = mode === "text" ? { text, note: note || undefined } : { file: file?.payload, note: note || undefined };
      if (mode !== "text" && !file) return toast.error(mode === "record" ? "Hãy ghi âm trước." : "Hãy chọn file.");
      const { data, message } = await extract.mutateAsync(body);
      setResult(data);
      setRows(
        data.tasks.map((t) => ({
          key: rowSeq++,
          include: true,
          title: t.title,
          aiSummary: t.aiSummary,
          checklist: t.checklist,
          priority: t.suggestedPriority,
          deadline: toDateTimeLocal(t.suggestedDeadline),
          assignedBy: t.assignedBy ?? "",
          requestedBy: t.requestedBy,
          owner: t.owner,
        })),
      );
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function createSelected() {
    const chosen = rows.filter((r) => r.include && r.title.trim());
    if (!chosen.length || !result) return;
    const context = [`Cuộc họp: ${result.meetingTitle}`, result.summary, result.transcript && `\nNội dung:\n${result.transcript}`]
      .filter(Boolean)
      .join("\n")
      .slice(0, 18_000);
    try {
      const { message } = await bulk.mutateAsync(
        chosen.map((r) => ({
          title: r.title.trim(),
          aiSummary: [r.aiSummary, r.owner && `Phụ trách: ${r.owner}`, r.requestedBy && `Người giao: ${r.requestedBy}`].filter(Boolean).join("\n"),
          rawContent: context,
          checklist: r.checklist,
          source: "MEETING",
          priority: r.priority,
          deadline: fromDateTimeLocal(r.deadline),
          assignedBy: r.assignedBy || null,
        })),
      );
      toast.success(message);
      setResult(null);
      setRows([]);
      setFile(null);
      setText("");
      setNote("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const update = (key: number, patch: Partial<DraftRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.include).length;

  return (
    <>
      <PageHeader title="Họp → Việc" description="Ghi âm cuộc họp, tải biên bản (ảnh/PDF) hoặc dán ghi chép — AI tách thành danh sách việc để bạn duyệt và tạo hàng loạt." />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Input */}
        <Card className="h-fit p-5">
          <div className="mb-4 inline-flex w-full rounded-lg bg-slate-100 p-1">
            {(
              [
                ["record", "Ghi âm", Mic],
                ["file", "Tải file", FileUp],
                ["text", "Dán ghi chép", PenLine],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                disabled={recording}
                onClick={() => setMode(m)}
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium disabled:cursor-not-allowed",
                  mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {mode === "record" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={cn(
                  "flex h-20 w-20 cursor-pointer items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105",
                  recording ? "animate-pulse bg-rose-600" : "bg-gradient-to-br from-indigo-600 to-violet-600",
                )}
                aria-label={recording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}
              >
                {recording ? <Square className="h-7 w-7" fill="currentColor" /> : <Mic className="h-8 w-8" />}
              </button>
              <p className="font-mono text-2xl font-semibold text-slate-900">{fmtTime(seconds)}</p>
              <p className="text-xs text-slate-500">
                {recording ? "Đang ghi… bấm để dừng." : `Bấm để ghi âm (tối đa ${MAX_RECORD_SECONDS / 60} phút). Đặt máy gần người nói.`}
              </p>
            </div>
          )}

          {mode === "file" && (
            <div className="py-2">
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
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/40"
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="font-medium text-slate-700">Chọn file ghi âm, ảnh biên bản hoặc PDF</span>
                <span className="text-xs">MP3, M4A, WAV, OGG, WEBM, PNG, JPG, PDF · tối đa {MAX_UPLOAD_BYTES / 1024 / 1024} MB</span>
              </button>
            </div>
          )}

          {mode === "text" && (
            <Field label="Ghi chép / biên bản cuộc họp" htmlFor="m-text">
              <Textarea
                id="m-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-56"
                placeholder={"VD:\nHọp giao ban sáng thứ 2\n- Chị Hương: Duy làm báo cáo doanh thu, hạn thứ 6\n- Anh Nam nhờ gửi hợp đồng ABC trước 15h mai\n- Chốt: tuần sau demo sản phẩm"}
                maxLength={30000}
              />
            </Field>
          )}

          {file && mode !== "text" && (
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

          <Field label="Ghi chú cho AI (tuỳ chọn)" htmlFor="m-note" className="mt-4">
            <Input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: tôi là Duy, chỉ lấy việc giao cho tôi" maxLength={1000} />
          </Field>

          <Button
            className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500"
            onClick={analyse}
            loading={extract.isPending}
            disabled={recording || (mode === "text" ? text.trim().length < 10 : !file)}
          >
            {!extract.isPending && <Wand2 className="h-4 w-4" />}
            {extract.isPending ? "AI đang nghe & tách việc…" : "Tách việc bằng AI"}
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Dùng 1 lượt AI. Ghi âm dài có thể mất 30–90 giây để xử lý. Ghi âm/ảnh/PDF cần GEMINI_API_KEY.
          </p>
        </Card>

        {/* Result */}
        {!result ? (
          <Card>
            <EmptyState
              icon={<Mic className="h-6 w-6" />}
              title="Chưa có kết quả"
              description="Sau khi AI xử lý, danh sách việc sẽ hiện ở đây. Bạn chọn việc nào cần tạo, chỉnh tiêu đề, hạn chót, người giao rồi bấm tạo hàng loạt."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase">Cuộc họp</p>
                  <h2 className="text-lg font-semibold text-slate-900">{result.meetingTitle}</h2>
                </div>
                {result.isMock && <Badge className="bg-amber-100 text-amber-800">Tách việc mẫu</Badge>}
              </div>
              {result.summary && <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.summary}</p>}
              {result.decisions.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-700">Quyết định đã chốt</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                    {result.decisions.map((d, i) => (
                      <li key={i} className="flex gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.transcript && (
                <div className="mt-3">
                  <button type="button" onClick={() => setShowTranscript((s) => !s)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTranscript && "rotate-180")} />
                    {showTranscript ? "Ẩn nội dung đã chép" : "Xem nội dung AI đã chép lại"}
                  </button>
                  {showTranscript && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-sans text-xs whitespace-pre-wrap text-slate-600">{result.transcript}</pre>
                  )}
                </div>
              )}
            </Card>

            {rows.length === 0 ? (
              <Card>
                <EmptyState icon={<Sparkles className="h-6 w-6" />} title="AI không tìm thấy đầu việc nào" description="Cuộc họp có thể không giao việc cụ thể. Bạn vẫn có thể tạo việc thủ công ở trang Công việc." />
              </Card>
            ) : (
              <>
                {rows.map((r) => (
                  <Card key={r.key} className={cn("p-4 transition-opacity", !r.include && "opacity-50")}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => update(r.key, { include: e.target.checked })}
                        className="mt-2.5 h-4 w-4 cursor-pointer accent-indigo-600"
                        aria-label="Chọn việc này"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} className="font-medium" aria-label="Tiêu đề" />
                        {r.aiSummary && <p className="text-sm text-slate-600">{r.aiSummary}</p>}
                        {(r.requestedBy || r.owner) && (
                          <p className="text-xs text-slate-500">
                            {r.requestedBy && <>Người giao: <b>{r.requestedBy}</b></>}
                            {r.requestedBy && r.owner && " · "}
                            {r.owner && <>Phụ trách: <b>{r.owner}</b></>}
                          </p>
                        )}
                        {r.checklist.length > 0 && (
                          <ul className="list-inside list-disc text-xs text-slate-500">
                            {r.checklist.map((c, i) => (
                              <li key={i}>{c.text}</li>
                            ))}
                          </ul>
                        )}
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Select value={r.priority} onChange={(e) => update(r.key, { priority: e.target.value as TaskPriority })} aria-label="Mức ưu tiên">
                            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                              <option key={p} value={p}>
                                {PRIORITY_LABEL[p]}
                              </option>
                            ))}
                          </Select>
                          <Input type="datetime-local" value={r.deadline} onChange={(e) => update(r.key, { deadline: e.target.value })} aria-label="Hạn chót" />
                          <Select value={r.assignedBy} onChange={(e) => update(r.key, { assignedBy: e.target.value })} aria-label="Người giao việc">
                            <option value="">— Người giao —</option>
                            {colleagues.data?.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
                  <span className="text-sm text-slate-600">
                    Đã chọn <b>{selected}</b>/{rows.length} việc
                  </span>
                  <div className="flex gap-2">
                    <Link href="/tasks" className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                      Xem công việc
                    </Link>
                    <Button onClick={createSelected} loading={bulk.isPending} disabled={selected === 0}>
                      Tạo {selected} công việc
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
