import type { Landmark } from "./pose-counter";

export const FRONTAL_PUSHUP_VERSION = "frontal-shoulder-1-candidate";
/** Normalized image coordinates only. Thresholds are candidates until labelled frontal clips pass. */
export class FrontalPushupCounter {
  private time = -Infinity;
  private baseline: number | null = null;
  private wrist: number | null = null;
  private depth = 0;
  private start = 0;
  private stable = 0;
  private suspended = false;
  reset() { this.baseline = null; this.wrist = null; this.depth = 0; this.stable = 0; this.suspended = false; }
  suspend() { this.depth = 0; this.suspended = true; }
  update(points: Landmark[], time: number) {
    const none = {tracking: false, moving: false, completed: false};
    if (!Number.isFinite(time) || time <= this.time) return none;
    if (this.suspended) {this.start = time;this.suspended = false;}
    else if (time - this.time > 300) this.reset();
    this.time = time;
    const required = [11,12,15,16,23,24].map(i => points[i]);
    if (required.some(p => !p || !p.in_frame || p.visibility < .65 || ![p.x,p.y].every(Number.isFinite))) {this.reset();return none;}
    const [left,right,handL,handR,hipL,hipR] = required;
    const width = Math.hypot(left.x-right.x,left.y-right.y);
    const y = (left.y+right.y)/2, wrist = (handL.y+handR.y)/2, hip = (hipL.y+hipR.y)/2;
    // Reject too-small bodies, side-on shoulders, upright arm waving and hands above the shoulders.
    if (width < .1 || Math.abs(left.y-right.y)>width*.45 || Math.abs(hip-y)>width*1.05 || wrist<y-width*.15) {this.reset();return none;}
    if (this.wrist!==null && Math.abs(wrist-this.wrist)>width*.12) {this.reset();return none;}
    this.wrist=wrist;
    if(this.baseline===null){if(++this.stable>=3){this.baseline=y;this.start=time;}return {...none,tracking:true};}
    const travel=(y-this.baseline)/width;
    if(travel<-.12){this.baseline=y;this.depth=0;this.start=time;}
    this.depth=Math.max(this.depth,travel);
    let completed=false;
    if(this.depth>=.18 && travel<=this.depth*.35){
      completed=time-this.start>=450 && time-this.start<=5000;
      this.baseline=y;this.depth=0;this.start=time;
    } else if(time-this.start>5000){this.baseline=y;this.depth=0;this.start=time;}
    return {tracking:true,moving:Math.abs(travel)>.03,completed};
  }
}
