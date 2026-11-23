import { addResources, recipes } from "./simulation";
import type { Activity, Attack, AttackOutcome, ColonyState, Dwarf, ForgeEvent, Resources } from "./types";

export const SAVE_KEY = "dwarfhold.save";
// increment if colony state changes
export const SAVE_VERSION = 3;

interface SaveEnvelope {
  version: number;
  savedAt: string;
  colony: ColonyState;
}

const RESOURCE_KEYS = ["wood", "stone", "food", "tools", "weapons"] as const;
const JOBS = ["woodcutting", "mining", "farming"] as const;
const STATUSES = ["idle", "working", "expedition", "crafting"] as const;
const SPECIES = ["Skarner"] as const;
const ATTACKERS = ["Piltovians"] as const;
const ATTACK_RESULTS = ["defended", "plundered"] as const;

type UnknownRecord = Record<string, unknown>;

// type guards for save data validation, value = unknown from local storage till validation
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

// objects are rebuilt only from validated data -> aviods save editing/corruption
function parseResources(value: unknown): Resources | null {
  if (!isRecord(value)) return null;
  if (!RESOURCE_KEYS.every((key) => isCount(value[key]))) return null;
  return {
    wood: value.wood as number,
    stone: value.stone as number,
    food: value.food as number,
    tools: value.tools as number,
    weapons: value.weapons as number,
  };
}

function parseDwarf(value: unknown): Dwarf | null {
  if (!isRecord(value)) return null;
  const { id, name, title, icon, species, assignment, status, specialty, hasTool } = value;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof title !== "string" ||
    typeof icon !== "string" ||
    !(species === undefined || isOneOf(SPECIES, species)) ||
    !(assignment === null || isOneOf(JOBS, assignment)) ||
    !isOneOf(STATUSES, status) ||
    !(specialty === undefined || isOneOf(JOBS, specialty)) ||
    typeof hasTool !== "boolean"
  ) {
    return null;
  }
  return {
    id,
    name,
    title,
    icon,
    ...(species ? { species } : {}),
    assignment,
    status,
    ...(specialty ? { specialty } : {}),
    hasTool,
  };
}

function parseForgeEvent(value: unknown): ForgeEvent | null {
  if (!isRecord(value)) return null;
  const { id, recipe, dwarfId, startDay, duration } = value;
  if (
    typeof id !== "string" ||
    !(typeof recipe === "string" && Object.hasOwn(recipes, recipe)) ||
    typeof dwarfId !== "string" ||
    !isCount(startDay) ||
    !isCount(duration)
  ) {
    return null;
  }
  return { id, recipe: recipe as ForgeEvent["recipe"], dwarfId, startDay, duration };
}

// running attack, null in peace time -> undefined = invalid data
function parseAttack(value: unknown): Attack | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { attacker, weaponsPerDay, daysLeft, totalDays } = value;
  if (
    !isOneOf(ATTACKERS, attacker) ||
    !isCount(weaponsPerDay) ||
    weaponsPerDay < 1 ||
    !isCount(totalDays) ||
    !isCount(daysLeft) ||
    daysLeft < 1 ||
    daysLeft > totalDays
  ) {
    return undefined;
  }
  return { attacker, weaponsPerDay, daysLeft, totalDays };
}

function parseAttackOutcome(value: unknown): AttackOutcome | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { day, result } = value;
  if (!isCount(day) || !isOneOf(ATTACK_RESULTS, result)) return undefined;
  return { day, result };
}

function parseList<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseItem);
  return items.every((item) => item !== null) ? (items as T[]) : null;
}

function parseColony(value: unknown): ColonyState | null {
  if (!isRecord(value)) return null;
  const { day, starvationDays, skarnerJoined } = value;
  if (!isCount(day) || day < 1 || !isCount(starvationDays)) return null;
  if (typeof skarnerJoined !== "boolean") return null;

  const resources = parseResources(value.resources);
  const dwarves = parseList(value.dwarves, parseDwarf);
  const forgeEvents = parseList(value.forgeEvents, parseForgeEvent);
  const attack = parseAttack(value.attack);
  const attackOutcome = parseAttackOutcome(value.attackOutcome);
  if (!resources || !dwarves || !forgeEvents) return null;
  if (attack === undefined || attackOutcome === undefined) return null;

  const ids = new Set(dwarves.map((dwarf) => dwarf.id));
  if (ids.size !== dwarves.length) return null;
  if (!forgeEvents.every((event) => ids.has(event.dwarfId))) return null;

  // check skaners requirements
  const skarners = dwarves.filter((dwarf) => dwarf.species === "Skarner");
  if (skarners.length > 1) return null;
  if (skarners.length === 1 && !skarnerJoined) return null;
  if (
    skarners.some(
      (skarner) =>
        skarner.hasTool ||
        skarner.status === "crafting" ||
        forgeEvents.some((event) => event.dwarfId === skarner.id),
    )
  ) {
    return null;
  }

  return {
    day,
    resources,
    dwarves,
    starvationDays,
    skarnerJoined,
    forgeEvents,
    attack,
    attackOutcome,
  };
}

export function serializeSave(colony: ColonyState): string {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    colony,
  };
  return JSON.stringify(envelope);
}

// returns null for missing, corrupt or incompatible save data
export function parseSave(raw: string | null): ColonyState | null {
  if (raw === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(data) || data.version !== SAVE_VERSION) return null;
  return parseColony(data.colony);
}

const returnToWork = (dwarf: Dwarf): Dwarf => ({
  ...dwarf,
  status: dwarf.assignment ? "working" : "idle",
});

// running forge jobs are abandoned and refunded
// running expeditions are aborted without rewards -> busy dwarves return to their job.
export function resolveInterruptions(state: ColonyState): {
  colony: ColonyState;
  notices: Activity[];
} {
  const notices: Activity[] = [];
  let resources = state.resources;

  state.forgeEvents.forEach((event) => {
    const recipe = recipes[event.recipe];
    const smith = state.dwarves.find((dwarf) => dwarf.id === event.dwarfId);
    resources = addResources(resources, recipe.cost, 1);
    notices.push({
      id: `restore-${event.id}`,
      day: state.day,
      message: `The refresh cooled the forge: ${smith?.name ?? "The worker"}'s unfinished ${recipe.label} was abandoned. Materials return to the stores.`,
      tone: "warning",
    });
  });

  const dwarves = state.dwarves.map((dwarf) => {
    if (dwarf.status === "expedition") {
      notices.push({
        id: `restore-expedition-${dwarf.id}`,
        day: state.day,
        message: `${dwarf.name} turned back when the hold was refreshed. The expedition was aborted without rewards.`,
        tone: "warning",
      });
      return returnToWork(dwarf);
    }
    // forge events are cancelled -> no crafting dwarf
    return dwarf.status === "crafting" ? returnToWork(dwarf) : dwarf;
  });

  return {
    colony: { ...state, resources, dwarves, forgeEvents: [] },
    notices,
  };
}

// reads save from the local storage, fallback to new game if missing save
export function loadGame(fallback: ColonyState): {
  colony: ColonyState;
  notices: Activity[];
} {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    console.warn("No Save -> New Game");
  }

  if (raw === null) return { colony: fallback, notices: [] };

  const saved = parseSave(raw);
  if (!saved) {
    return {
      colony: fallback,
      notices: [
        {
          id: "restore-failed",
          day: fallback.day,
          message: "No records found. A new colony was founded.",
          tone: "warning",
        },
      ],
    };
  }

  const { colony, notices } = resolveInterruptions(saved);
  return {
    colony,
    notices: [
      ...notices,
      {
        id: "restore-success",
        day: colony.day,
        message: `Stonehome was restored from the records of day ${colony.day}.`,
        tone: "good",
      },
    ],
  };
}

export function saveGame(colony: ColonyState): void {
  try {
    window.localStorage.setItem(SAVE_KEY, serializeSave(colony));
  } catch {
    console.warn("Failed to save data!");
  }
}
