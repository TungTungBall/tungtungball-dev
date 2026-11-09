import { CameraOff } from "lucide-react";
import { ActionBar, ActionLink, Notice, PageIntro } from "@/components/healthmith/ui";

export default function CameraPermissionPage() {
  return <>
    <PageIntro eyebrow="CAMERA PERMISSION" title="빛과 시야를 열어주세요" />
    <div className="hm-permission-art"><CameraOff size={125} strokeWidth={1} aria-hidden="true" /><span>CAMERA ACCESS</span></div>
    <section className="hm-permission-body"><h2>카메라 접근이 필요해요.</h2><p>브라우저의 사이트 설정에서<br />카메라를 허용한 뒤 다시 시도해주세요.</p><p>카메라가 연결되어 있는지도 확인해주세요.<br />허용 전에는 실제 운동을 측정할 수 없어요.</p><Notice>휴대폰을 세로로 고정하고<br />머리부터 발끝까지 화면에 맞춰주세요.</Notice></section>
    <ActionBar><ActionLink href="/camera">카메라 준비로 돌아가기</ActionLink></ActionBar>
  </>;
}
