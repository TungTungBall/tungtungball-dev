"use server";
import { getUserSession } from "@/config/session";
import { fetchBackendApi } from "@/lib/backend-api";
import { UUID_PATTERN } from "@/lib/healthmith/intake-contract";
export type CycleResult = {ok:true;data:unknown}|{ok:false;code:string;message:string;uncertain:boolean};
const messages:Record<string,string>={UNAUTHORIZED:"로그인 후 이용해 주세요.",NO_CANDIDATES:"조건에 맞는 운동이 없어요.",VERSION_CONFLICT:"다른 화면에서 상태가 바뀌었어요. 다시 불러와 주세요.",ACTIVE_SESSION:"진행 중인 운동을 먼저 이어가거나 종료해 주세요.",STALE_SURVEY:"저장 조건이 바뀌었어요. 새 루틴을 만들어 주세요.",GENERATION_IN_PROGRESS:"이미 만들고 있는 루틴이 있어요. 준비 화면에서 이어가 주세요."};
export async function cycleCall(operation:string,id:string|null=null,body:unknown=undefined,key?:string):Promise<CycleResult>{
  if(!["generate","start","repetition","tracking-lost","pause","resume","rest","stop","feedback","request","session","active","records","latest-request","profile/summary","keywords/preview"].includes(operation)|| (id!==null&&!UUID_PATTERN.test(id)) || (key!==undefined&&!UUID_PATTERN.test(key)))return {ok:false,code:"INVALID_INPUT",message:"요청을 확인해 주세요.",uncertain:false};
  const session=await getUserSession();
  if(session.state!=="authenticated")return {ok:false,code:"UNAUTHORIZED",message:messages.UNAUTHORIZED,uncertain:false};
  try{
    const response=await fetchBackendApi(`v2/cycle/${operation}${id?`?id=${id}`:""}`,session.accessToken,{method:body===undefined?"GET":"POST",headers:body===undefined?{}:{"Content-Type":"application/json",...(key?{"Idempotency-Key":key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data:unknown=await response.json();
    if(response.ok)return {ok:true,data};
    const code=typeof data==="object"&&data!==null&&"code" in data?String(data.code):"FAILED";
    return {ok:false,code,message:messages[code]??"요청을 처리하지 못했어요. 상태를 다시 확인해 주세요.",uncertain:response.status>=500};
  }catch{return {ok:false,code:"NETWORK",message:"처리 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.",uncertain:body!==undefined};}
}
