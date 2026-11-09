"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionBar, Card, Notice, PageIntro, PoseFigure } from "@/components/healthmith/ui";

export default function CameraPage() {
  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "active">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(true);
  const router = useRouter();

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  async function requestCamera() {
    if (cameraState === "active") { router.push("/workout"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { router.push("/camera/permission"); return; }
    setCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (!activeRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState("active");
    } catch {
      if (activeRef.current) router.push("/camera/permission");
    }
  }

  return <>
    <PageIntro eyebrow="READY YOUR CRAFT" title="세공을 시작할 준비" description={<>전신이 화면에 들어오도록<br />휴대폰을 고정하고 공간을 확보해주세요.</>} />
    <div className="hm-camera-stage"><video ref={videoRef} hidden={cameraState !== "active"} autoPlay playsInline muted aria-label="내 카메라 미리보기" />{cameraState !== "active" && <PoseFigure />}<span>{cameraState === "active" ? "내 카메라 · 기기 안에서만 표시돼요" : "카메라 미리보기 예시"}</span></div>
    <Card className="hm-camera-instructions"><h2>Ⅰ 전신이 보이게</h2><p>머리부터 발끝까지 화면에 맞춰요.</p><h2>Ⅱ 밝고 넉넉한 공간</h2><p>주변 물건을 정리하고 조명을 켜주세요.</p></Card>
    <div className="hm-camera-privacy"><Notice>영상·이미지·관절 좌표는<br />루틴 생성 AI에 전달되지 않아요.</Notice></div>
    <div className="hm-centered-link"><Link className="hm-text-link" href="/camera/permission">권한이 거절되었나요? ↗</Link></div>
    <div className="hm-centered-link"><Link className="hm-text-link" href="/workout">카메라 없이 운동 화면 둘러보기</Link></div>
    <ActionBar><Button className="hm-action-button" disabled={cameraState === "requesting"} onClick={requestCamera}>{cameraState === "requesting" ? <LoaderCircle size={16} /> : <Camera size={16} />}{cameraState === "active" ? "준비 완료, 운동 화면 보기" : cameraState === "requesting" ? "카메라 권한 확인 중" : "카메라 허용하고 준비하기"}</Button></ActionBar>
  </>;
}
