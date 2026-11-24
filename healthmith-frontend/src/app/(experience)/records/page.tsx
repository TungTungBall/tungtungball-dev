export const dynamic = "force-dynamic";
import { ConnectedRecordsView } from "./connected-records";
import Link from "next/link";
export default function Page(){return <><Link className="hm-action" href="/profile">새 운동 기록과 성향 보기</Link><ConnectedRecordsView/></>;}
