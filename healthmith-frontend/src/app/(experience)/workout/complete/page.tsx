import { CycleComplete } from "@/components/cycle/screens";
import { ConnectedWorkoutResult } from "./connected-result";
import { redirect } from "next/navigation";
export default async function Page({searchParams}:{searchParams:Promise<{cycleId?:string;sessionId?:string;connected?:string}>}){const p=await searchParams;if(p.cycleId)return <CycleComplete id={p.cycleId}/>;if(p.sessionId)return <ConnectedWorkoutResult sessionId={p.sessionId}/>;redirect("/");}
