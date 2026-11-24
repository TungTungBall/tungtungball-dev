import Link from "next/link";
import { UUID_PATTERN } from "@/lib/healthmith/intake-contract";
import { redirect } from "next/navigation";
import { ConnectedFeedbackForm } from "./connected-feedback-form";
export default async function Page({searchParams}:{searchParams:Promise<{sessionId?:string;cycleId?:string}>}){const p=await searchParams;if(p.cycleId)redirect(`/workout/complete?cycleId=${p.cycleId}`);if(p.sessionId){if(!UUID_PATTERN.test(p.sessionId))return <section><h1>운동 세션을 확인할 수 없어요</h1><Link href="/records">운동 기록 보기</Link></section>;return <ConnectedFeedbackForm sessionId={p.sessionId}/>;}redirect("/profile");}
