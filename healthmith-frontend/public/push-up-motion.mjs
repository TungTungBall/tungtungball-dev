export const FRAME_WIDTH = 120;
export const FRAME_HEIGHT = 80;
const MIN_TRAVEL = 2.6;
const MIN_DURATION_MS = 450;
const MAX_DURATION_MS = 5000;
const MAX_FRAME_GAP_MS = 300;

/** @param {Uint8Array} previous @param {Uint8Array} current */
function measureMotion(previous, current) {
  let center = 0;
  let centerBlocks = 0;
  let leftEdge = 0;
  let rightEdge = 0;
  let leftMoving = 0;
  let rightMoving = 0;
  let leftBlocks = 0;
  let rightBlocks = 0;

  for (let y = 9; y < 66; y += 7) {
    for (let x = 8; x < 112; x += 7) {
      const isCenter = x >= 27 && x <= 92;
      if (isCenter) centerBlocks++;
      else if (x < 27) leftBlocks++;
      else rightBlocks++;

      let texture = 0;
      for (let row = -3; row <= 3; row += 2) {
        for (let col = -3; col <= 3; col += 2) {
          const i = (y + row) * FRAME_WIDTH + x + col;
          texture += Math.abs(previous[i] - previous[i + 1]);
          texture += Math.abs(previous[i] - previous[i + FRAME_WIDTH]);
        }
      }
      if (texture < 90) continue;

      let bestCost = Infinity;
      let stillCost = 0;
      let bestX = 0;
      let bestY = 0;
      for (let dy = -7; dy <= 7; dy++) {
        if (y + dy < 3) continue;
        for (let dx = -3; dx <= 3; dx++) {
          let cost = 0;
          for (let row = -3; row <= 3; row += 2) {
            for (let col = -3; col <= 3; col += 2) {
              const i = (y + row) * FRAME_WIDTH + x + col;
              cost += Math.abs(previous[i] - current[i + dy * FRAME_WIDTH + dx]);
            }
          }
          if (dx === 0 && dy === 0) stillCost = cost;
          cost += Math.abs(dx) + Math.abs(dy);
          if (cost < bestCost) {
            bestCost = cost;
            bestX = dx;
            bestY = dy;
          }
        }
      }
      if (stillCost - bestCost < 18 || bestCost > stillCost * 0.78) continue;
      if (Math.abs(bestY) < Math.abs(bestX)) continue;

      if (isCenter) center += bestY;
      else if (x < 27) {
        leftEdge += bestY;
        if (bestY) leftMoving++;
      } else {
        rightEdge += bestY;
        if (bestY) rightMoving++;
      }
    }
  }
  const vertical = center / centerBlocks;
  const left = leftEdge / leftBlocks;
  const right = rightEdge / rightBlocks;
  // Matching vertical movement on both sides indicates a moving camera.
  const edgeMotion = Math.min(Math.abs(left), Math.abs(right));
  const unstable = Math.sign(left) === Math.sign(right)
    && leftMoving / leftBlocks > 0.6 && rightMoving / rightBlocks > 0.6
    && edgeMotion > 0.45 && edgeMotion > Math.abs(vertical) * 0.65;
  return { vertical, unstable };
}

export class PushUpMotionCounter {
  /** @type {Uint8Array | undefined} */
  previous;
  lastTime = -Infinity;
  position = 0;
  bottom = 0;
  startedAt = null;

  resetCycle() {
    this.position = 0;
    this.bottom = 0;
    this.startedAt = null;
  }

  /** @param {Uint8Array} pixels @param {number} time */
  update(pixels, time) {
    const idle = { completed: false, moving: false, tracking: false };
    if (pixels.length !== FRAME_WIDTH * FRAME_HEIGHT || !Number.isFinite(time) || time <= this.lastTime) {
      return idle;
    }
    const previous = this.previous;
    const gap = time - this.lastTime;
    this.previous = pixels;
    this.lastTime = time;
    if (!previous || gap > MAX_FRAME_GAP_MS) {
      this.resetCycle();
      return idle;
    }

    const { vertical, unstable } = measureMotion(previous, pixels);
    if (unstable) {
      this.resetCycle();
      return idle;
    }

    const moving = Math.abs(vertical) > 0.15;
    if (this.startedAt !== null && time - this.startedAt > MAX_DURATION_MS) {
      this.resetCycle();
    }
    if (this.startedAt === null) {
      if (vertical <= 0.15) return { completed: false, moving, tracking: true };
      this.startedAt = time;
    }
    this.position += vertical;
    this.bottom = Math.max(this.bottom, this.position);
    const returned = this.bottom - this.position >= this.bottom * 0.65;
    const completed = this.bottom >= MIN_TRAVEL && returned && time - this.startedAt >= MIN_DURATION_MS;
    if (completed || this.position < 0) this.resetCycle();
    return { completed, moving, tracking: true };
  }
}
