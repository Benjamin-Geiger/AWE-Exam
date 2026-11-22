import type { ColonyState, Dwarf, JobType, Resources } from "./types";

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

// Amount added to harvest if darf has tool
export const TOOL_BONUS = 1;

// Daily dwarf harvest rate
export function dwarfOutput(dwarf: Dwarf): Partial<Resources> {
  if (!dwarf.assignment || dwarf.status === "expedition") return {};
  const [[resource, base]] = Object.entries(production[dwarf.assignment]);
  return { [resource]: (base ?? 0) + (dwarf.hasTool ? TOOL_BONUS : 0) };
}

// Equip tool from storage to a dwarf
export function equipTool(state: ColonyState, dwarfId: string): ColonyState {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);
  if (!dwarf || dwarf.hasTool || dwarf.status === "expedition" || state.resources.tools < 1) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, tools: state.resources.tools - 1 },
    dwarves: state.dwarves.map((d) => (d.id === dwarfId ? { ...d, hasTool: true } : d)),
  };
}

// Return a tool from a dwarf to storage
export function unequipTool(state: ColonyState, dwarfId: string): ColonyState {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);
  if (!dwarf || !dwarf.hasTool) return state;
  return {
    ...state,
    resources: { ...state.resources, tools: state.resources.tools + 1 },
    dwarves: state.dwarves.map((d) => (d.id === dwarfId ? { ...d, hasTool: false } : d)),
  };
}

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };
  let dwarves = state.dwarves;

  dwarves.forEach((dwarf) => {
    Object.entries(dwarfOutput(dwarf)).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += amount ?? 0;
    });
  });

  resources.food = Math.max(0, resources.food - dwarves.length);
  // Check the remaining rations after production and meals
  let starvationDays =
    dwarves.length > 0 && resources.food < dwarves.length
      ? state.starvationDays + 1
      : 0;

  // Remove the newest dwarf after three shortage days in a row
  if (starvationDays >= 3) {
    dwarves = dwarves.slice(0, -1);
    starvationDays = 0;
  }

  return { ...state, day: state.day + 1, resources, dwarves, starvationDays };
}

export const jobLabel = (job: JobType) => job ? ({
  woodcutting: "Woodcutting",
  mining: "Deep Mining",
  farming: "Mushroom Farm"
}[job]) : "Unassigned";

export const recipes = {
  tool: { label: "tool", cost: { wood: 3, stone: 2 }, output: { tools: 1 } },
  weapon: { label: "weapon", cost: { wood: 1, stone: 3, tools: 1 }, output: { weapons: 1 } },
};
