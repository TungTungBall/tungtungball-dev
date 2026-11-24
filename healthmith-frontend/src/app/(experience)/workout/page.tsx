import { CycleWorkout } from "@/components/cycle/screens";
import { ConnectedWorkout } from "./connected-workout";
import { redirect } from "next/navigation";
export default async function Page({searchParams}:{searchParams:Promise<{cycleId?:string;sessionId?:string;connected?:string}>}){const p=await searchParams;if(p.cycleId)return <CycleWorkout id={p.cycleId}/>;if(p.sessionId)return <ConnectedWorkout sessionId={p.sessionId}/>;if(p.connected==="1")return <ConnectedWorkout/>;redirect("/");}
