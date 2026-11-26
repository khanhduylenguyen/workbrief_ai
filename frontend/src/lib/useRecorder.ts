"use client";

import { useEffect, useRef, useState } from "react";

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
}

export const formatClock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Microphone recorder (low bitrate so ~12 minutes stays under the 3 MB upload limit).
 * `onDone` receives the recording and its length in seconds; `onError` a Vietnamese message.
 */
export function useRecorder({
  maxSeconds = 12 * 60,
  onDone,
  onError,
}: {
  maxSeconds?: number;
  onDone: (blob: Blob, seconds: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbacks = useRef({ onDone, onError });
  useEffect(() => {
    callbacks.current = { onDone, onError };
  });

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      secondsRef.current = s;
      setSeconds(s);
      if (s >= maxSeconds) recorderRef.current?.stop();
    }, 500);
    return () => clearInterval(id);
  }, [recording, maxSeconds]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    const mimeType = pickRecorderMime();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      callbacks.current.onError("Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome/Edge bản mới hoặc tải file ghi âm lên.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        callbacks.current.onDone(new Blob(chunks, { type: mimeType.split(";")[0] }), secondsRef.current);
      };
      recorderRef.current = rec;
      rec.start(1000);
      secondsRef.current = 0;
      setSeconds(0);
      setRecording(true);
    } catch {
      callbacks.current.onError("Không truy cập được micro. Hãy cho phép quyền micro cho trang này.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return { recording, seconds, start, stop };
}

/** File extension for a recorded blob. */
export function recordingExt(blob: Blob): string {
  return blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
}
