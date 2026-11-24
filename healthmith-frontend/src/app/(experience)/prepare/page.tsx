import { CyclePrepare } from "@/components/cycle/screens";
import { redirect } from "next/navigation";
export default async function Page({searchParams}:{searchParams:Promise<{requestId?:string}>}){const {requestId}=await searchParams;if(!requestId)redirect("/");return <CyclePrepare id={requestId}/>;}
