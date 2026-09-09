/**
 * @sfmc-bds/module-afk — 位移检测与挂机标记
 */

import { Player, system, world } from "@minecraft/server";
import { config } from "@sfmc-bds/sdk/sapi/config";
import { ModuleRegistry } from "@sfmc-bds/sdk/module-loader";
import { Command, debug, Msg, Permission } from "@sfmc-bds/sdk/sapi/runtime";
import {
  isSignificantMove,
  secondsToTicks,
  TAG_AFK,
  TAG_NOAFK,
  type Vec3,
} from "./afk-util.js";

const MODULE_ID = "afk";

interface TrackState {
  lastPos: Vec3;
  idleSeconds: number;
}

const tracks = new Map<string, TrackState>();
const eventCleanups: Array<() => void> = [];
let pollRunId: number | undefined;
let afkTimeSec = 120;
let stepTimeSec = 15;

function broadcastAll(text: string): void {
  for (const p of world.getAllPlayers()) {
    Msg.info(text, p);
  }
}

function setAfk(player: Player, afk: boolean): void {
  try {
    if (afk) {
      if (player.hasTag(TAG_NOAFK)) {
        Msg.tips("你拥有 NOAFK 豁免，不会进入挂机。", player);
        return;
      }
      if (!player.hasTag(TAG_AFK)) player.addTag(TAG_AFK);
      broadcastAll(`§e${player.name} §7进入挂机状态`);
      Msg.tips("已进入 AFK 状态", player);
    } else {
      if (player.hasTag(TAG_AFK)) player.removeTag(TAG_AFK);
      broadcastAll(`§a${player.name} §7已返回游戏`);
    }
  } catch (err) {
    debug.w(
      "AFK",
      `setAfk: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function resetTrack(player: Player): void {
  const loc = player.location;
  tracks.set(player.id, {
    lastPos: { x: loc.x, y: loc.y, z: loc.z },
    idleSeconds: 0,
  });
}

function clearPlayer(playerId: string, player?: Player): void {
  tracks.delete(playerId);
  if (player) {
    try {
      if (player.hasTag(TAG_AFK)) player.removeTag(TAG_AFK);
    } catch {
      /* ignore */
    }
  }
}

function pollOnce(): void {
  for (const player of world.getAllPlayers()) {
    const loc = player.location;
    const pos: Vec3 = { x: loc.x, y: loc.y, z: loc.z };
    let state = tracks.get(player.id);
    if (!state) {
      tracks.set(player.id, { lastPos: pos, idleSeconds: 0 });
      continue;
    }

    if (isSignificantMove(state.lastPos, pos)) {
      state.lastPos = pos;
      state.idleSeconds = 0;
      if (player.hasTag(TAG_AFK)) {
        setAfk(player, false);
      }
      continue;
    }

    state.idleSeconds += stepTimeSec;
    state.lastPos = pos;

    if (player.hasTag(TAG_NOAFK)) continue;
    if (player.hasTag(TAG_AFK)) continue;
    if (state.idleSeconds >= afkTimeSec) {
      setAfk(player, true);
    }
  }
}

function registerCommands(): void {
  Command.register(
    "afk",
    "afk.use",
    (player) => {
      if (!player) {
        debug.i("AFK", "该指令必须由玩家执行");
        return;
      }
      const next = !player.hasTag(TAG_AFK);
      setAfk(player, next);
      if (!next) resetTrack(player);
    },
    "切换挂机状态",
    MODULE_ID,
  );

  // 平台 Command 仅匹配首 token；对自身施加/移除 NOAFK 豁免
  Command.register(
    "noafk",
    "afk.clear.other",
    (player) => {
      if (!player) {
        debug.i("AFK", "该指令必须由玩家执行");
        return;
      }
      if (player.hasTag(TAG_NOAFK)) {
        player.removeTag(TAG_NOAFK);
        Msg.success("已移除 NOAFK 豁免", player);
      } else {
        player.addTag(TAG_NOAFK);
        if (player.hasTag(TAG_AFK)) player.removeTag(TAG_AFK);
        Msg.success("已添加 NOAFK 豁免（免疫自动挂机）", player);
      }
    },
    "切换自身 NOAFK 挂机豁免",
    MODULE_ID,
  );
}

registerCommands();

ModuleRegistry.register({
  id: MODULE_ID,
  afterWorldLoad: false,
  lifecycle: {
    registerPermissions() {
      Permission.register("afk.use", Permission.Member);
      Permission.register("afk.clear.other", Permission.OP);
    },
    registerEvents() {
      const spawnCb = world.afterEvents.playerSpawn.subscribe((ev) => {
        if (ev.initialSpawn) {
          clearPlayer(ev.player.id);
          resetTrack(ev.player);
        }
      });
      eventCleanups.push(() => {
        try {
          world.afterEvents.playerSpawn.unsubscribe(spawnCb);
        } catch {
          /* ignore */
        }
      });

      const leaveCb = world.afterEvents.playerLeave.subscribe((ev) => {
        clearPlayer(ev.playerId);
      });
      eventCleanups.push(() => {
        try {
          world.afterEvents.playerLeave.unsubscribe(leaveCb);
        } catch {
          /* ignore */
        }
      });
    },
    async init() {
      const afkTime = await config.get<number>("afk_time");
      const stepTime = await config.get<number>("step_time");
      if (typeof afkTime === "number" && afkTime > 0) afkTimeSec = afkTime;
      if (typeof stepTime === "number" && stepTime > 0) stepTimeSec = stepTime;

      for (const p of world.getAllPlayers()) resetTrack(p);

      pollRunId = system.runInterval(
        () => pollOnce(),
        secondsToTicks(stepTimeSec),
      );
      debug.i("AFK", `init afk_time=${afkTimeSec}s step=${stepTimeSec}s`);
    },
    cleanup() {
      for (const c of eventCleanups.splice(0, eventCleanups.length)) c();
      if (pollRunId !== undefined) {
        try {
          system.clearRun(pollRunId);
        } catch {
          /* ignore */
        }
        pollRunId = undefined;
      }
      tracks.clear();
      debug.i("AFK", "cleanup");
    },
  },
});
