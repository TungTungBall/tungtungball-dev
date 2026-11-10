"use client";

import { useEffect, useRef, useState } from "react";
import { RepetitionCounter, type Landmark, type PoseRule } from "@/lib/healthmith/pose-counter";

export function PoseCamera({ rule, enabled, onRepetition, onPause }: { rule: PoseRule; enabled: boolean; onRepetition: () => void; onPause: (reason: "manual" | "no_motion") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onRepetition, onPause, enabled });
  const [message, setMessage] = useState("카메라와 자세 인식을 준비하고 있어요.");
  useEffect(() => { callbacks.current = { onRepetition, onPause, enabled }; }, [onRepetition, onPause, enabled]);
  useEffect(() => {
    let disposed = false, busy = false, ready = false, framePending = false;
    let stream: MediaStream | undefined, worker: Worker | undefined, animation = 0;
    let lastVideoTime = -1, lastFrameTime = 0, lastMotion = performance.now();
    let paused = false;
    const counter = new RepetitionCounter(rule);
    const pause = (reason: "manual" | "no_motion") => {
      if (disposed || paused) return;
      paused = true; ready = false; counter.reset();
      stream?.getTracks().forEach((t) => t.stop());
      callbacks.current.onPause(reason);
    };
    const fail = (message: string) => {
      if (disposed) return;
      setMessage(message); pause("manual");
    };
    const visibility = () => { if (document.hidden) pause("manual"); };
    const initTimeout = setTimeout(() => fail("카메라 측정을 준비하지 못했어요. 연결을 확인하고 다시 시작해 주세요."), 30_000);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof createImageBitmap === "undefined") throw new Error();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        for (const track of stream.getVideoTracks()) track.addEventListener("ended", () => fail("카메라가 꺼져 운동을 일시정지했어요."));
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream; await video.play();
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        worker = new Worker("/pose-worker.js");
        worker.onerror = () => fail("자세 인식을 시작하지 못했어요. 운동을 일시정지했어요.");
        worker.onmessage = ({ data }: MessageEvent<{ type: string; points?: Landmark[]; time?: number }>) => {
          if (disposed || paused) return;
          if (data.type === "ready") { clearTimeout(initTimeout); ready = true; lastMotion = performance.now(); setMessage("전신과 주요 관절이 보이도록 서 주세요."); }
          else if (data.type === "pose" && data.points && typeof data.time === "number") {
            busy = false;
            if (!callbacks.current.enabled) { counter.reset(); lastMotion = performance.now(); return; }
            const result = counter.update(data.points, data.time);
            if (result.moving) lastMotion = performance.now();
            setMessage(result.tracking ? "움직임을 측정하고 있어요." : "주요 관절이 보이도록 위치와 조명을 조절해 주세요.");
            if (result.completed) { counter.reset(); callbacks.current.onRepetition(); }
          } else if (data.type === "error") fail("자세 인식이 중단돼 운동을 일시정지했어요.");
        };
        worker.postMessage({ type: "init" });
        const frame = async (time: number) => {
          if (disposed || paused) return;
          animation = requestAnimationFrame(frame);
          if (!callbacks.current.enabled) { counter.reset(); lastMotion = time; return; }
          if (ready && time - lastMotion >= 30_000) { pause("no_motion"); return; }
          if (!ready || busy || framePending || time - lastFrameTime < 66 || video.readyState < 2 || video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime; lastFrameTime = time; framePending = true;
          try {
            const bitmap = await createImageBitmap(video);
            if (disposed || paused || !ready) { bitmap.close(); return; }
            busy = true; worker?.postMessage({ type: "frame", frame: bitmap, time }, [bitmap]);
          } catch { fail("카메라 영상을 읽지 못해 운동을 일시정지했어요."); }
          finally { framePending = false; }
        };
        animation = requestAnimationFrame(frame);
      } catch { fail("카메라 권한과 지원 브라우저를 확인해 주세요. 운동을 일시정지했어요."); }
    }
    document.addEventListener("visibilitychange", visibility);
    void start();
    return () => {
      disposed = true; clearTimeout(initTimeout); cancelAnimationFrame(animation);
      document.removeEventListener("visibilitychange", visibility);
      worker?.terminate(); stream?.getTracks().forEach((t) => t.stop());
    };
  }, [rule]);
  return <><div className="hm-camera-stage"><video ref={videoRef} autoPlay playsInline muted aria-label="운동 자세 측정 카메라" /></div><p role="status" className="hm-helper">{message}</p></>;
}
