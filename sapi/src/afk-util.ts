/** AFK 位移与空闲判定纯函数。 */

export const TAG_AFK = "AFK";
export const TAG_NOAFK = "NOAFK";
/** 判定有效位移的欧氏距离阈值（方块） */
export const MOVE_THRESHOLD = 1.0;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 计算两点欧氏距离。 */
export function distance3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 是否构成有效位移（≥ MOVE_THRESHOLD）。 */
export function isSignificantMove(from: Vec3, to: Vec3): boolean {
  return distance3(from, to) >= MOVE_THRESHOLD;
}

/**
 * 秒 → ticks（20 tps）。
 */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * 20));
}
