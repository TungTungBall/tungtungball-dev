import {describe,it,expect} from "vitest";
import {FrontalPushupCounter} from "@/lib/healthmith/frontal-pushup";
import type {Landmark} from "@/lib/healthmith/pose-counter";
function pose(depth=0,scale=1):Landmark[]{const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,in_frame:true}));const width=.3*scale;
 p[11]={...p[11],x:.5-width/2,y:.3+depth*width};p[12]={...p[12],x:.5+width/2,y:.3+depth*width};
 for(const i of [15,16])p[i].y=.55;for(const i of [23,24])p[i].y=.45;return p;}
describe("정면 푸시업 후보 판정기",()=>{
 it.each([.7,1,1.4])("같은 몸 비율 왕복은 카메라 크기 %s에서도 한 번 센다",scale=>{const c=new FrontalPushupCounter();let total=0;const depths=[0,0,0,.05,.1,.2,.3,.3,.2,.1,0,0];depths.forEach((d,i)=>{if(c.update(pose(d,scale),i*80).completed)total++;});expect(total).toBe(1);});
 it("빈 화면과 직립 팔 흔들기는 판정 불가다",()=>{const c=new FrontalPushupCounter();expect(c.update([],0).tracking).toBe(false);const p=pose();p[23].y=p[24].y=.9;expect(c.update(p,80).tracking).toBe(false);});
 it("추적 누락 전후의 반쪽 동작은 합쳐 세지 않는다",()=>{const c=new FrontalPushupCounter();[0,0,0,.1,.2,.3].forEach((d,i)=>c.update(pose(d),i*80));expect(c.update([],480).completed).toBe(false);for(let i=0;i<5;i++)expect(c.update(pose(0),560+i*80).completed).toBe(false);});
 it("휴식 이후 새 왕복부터 세며 얕은 동작은 무시한다",()=>{const c=new FrontalPushupCounter();for(let i=0;i<40;i++)expect(c.update(pose(i%2*.08),i*80).completed).toBe(false);c.suspend();expect(c.update(pose(),4000).completed).toBe(false);});
 it("손 위치가 함께 흔들리면 준비 자세부터 다시 확인한다",()=>{const c=new FrontalPushupCounter();[0,0,0,.2].forEach((d,i)=>c.update(pose(d),i*80));const p=pose(.3);p[15].y=p[16].y=.8;expect(c.update(p,320).tracking).toBe(false);});
});
