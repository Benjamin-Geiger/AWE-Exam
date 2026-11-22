import type { ColonyState, Dwarf, ForgeEvent, JobType, Resources } from "./types";

export type RecipeId = ForgeEvent["recipe"];

export interface Recipe {
  label: string;
  cost: Partial<Resources>;
  output: Partial<Resources>;
  // duration in days for crafting to complete
  days: number;
}

export const recipes: Record<RecipeId, Recipe> = {
  tool: { label: "tool", cost: { wood: 3, stone: 2 }, output: { tools: 1 }, days: 2 },
  weapon: { label: "weapon", cost: { wood: 1, stone: 3, tools: 1 }, output: { weapons: 1 }, days: 3 },
};

// A dwarf on expedition or forging cant do other jobs
export const isBusy = (dwarf: Dwarf) =>
  dwarf.status === "expedition" || dwarf.status === "crafting";

export const forgeCompletionDay = (event: ForgeEvent) => event.startDay + event.duration;

function addResources(resources: Resources, delta: Partial<Resources>, sign: 1 | -1): Resources {
  const next = { ...resources };
  Object.entries(delta).forEach(([resource, amount]) => {
    next[resource as keyof Resources] += sign * (amount ?? 0);
  });
  return next;
}

// returns reason for why crafting cant start, null if possible
export function craftBlocker(state: ColonyState, recipeId: RecipeId, dwarfId: string): string | null {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);
  if (!dwarf) return "Choose a dwarf.";
  if (dwarf.status === "expedition") return `${dwarf.name} is on expedition.`;
  if (dwarf.status === "crafting") return `${dwarf.name} is already forging.`;

  for (const [resource, amount] of Object.entries(recipes[recipeId].cost)) {
    if (state.resources[resource as keyof Resources] < (amount ?? 0)) return `Not enough ${resource}.`;
  }

  return null;
}

// reserves resources for crafting + occupies dwarf, invalid requests return state unchanged
export function startCrafting(state: ColonyState, recipeId: RecipeId, dwarfId: string): ColonyState {
  if (craftBlocker(state, recipeId, dwarfId)) return state;
  const recipe = recipes[recipeId];

  const event: ForgeEvent = {
    // only 1 task per day per dwarf
    id: `forge-${dwarfId}-${state.day}`,
    recipe: recipeId,
    dwarfId,
    startDay: state.day,
    duration: recipe.days,
  };

  return {
    ...state,
    resources: addResources(state.resources, recipe.cost, -1),
    dwarves: state.dwarves.map((d) => (d.id === dwarfId ? { ...d, status: "crafting" } : d)),
    forgeEvents: [...state.forgeEvents, event],
  };
}

// change a dwarfs job if they arent busy
export function assignJob(state: ColonyState, dwarfId: string, assignment: JobType): ColonyState {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);
  if (!dwarf || isBusy(dwarf)) return state;
  return {
    ...state,
    dwarves: state.dwarves.map((d) =>
      d.id === dwarfId ? { ...d, assignment, status: assignment ? "working" : "idle" } : d,
    ),
  };
}

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

// Amount added to harvest if darf has tool
export const TOOL_BONUS = 1;

// Daily dwarf harvest rate
export function dwarfOutput(dwarf: Dwarf): Partial<Resources> {
  // Only dwarves working a job produce resources
  if (!dwarf.assignment || dwarf.status !== "working") return {};
  const [[resource, base]] = Object.entries(production[dwarf.assignment]);
  return { [resource]: (base ?? 0) + (dwarf.hasTool ? TOOL_BONUS : 0) };
}

// Equip tool from storage to a dwarf
export function equipTool(state: ColonyState, dwarfId: string): ColonyState {
  const dwarf = state.dwarves.find((d) => d.id === dwarfId);
  if (!dwarf || dwarf.hasTool || isBusy(dwarf) || state.resources.tools < 1) {
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
  if (!dwarf || !dwarf.hasTool || isBusy(dwarf)) return state;
  return {
    ...state,
    resources: { ...state.resources, tools: state.resources.tools + 1 },
    dwarves: state.dwarves.map((d) => (d.id === dwarfId ? { ...d, hasTool: false } : d)),
  };
}

export function advanceDay(state: ColonyState): ColonyState {
  const day = state.day + 1;
  let resources = { ...state.resources };
  let dwarves = state.dwarves;

  dwarves.forEach((dwarf) => {
    Object.entries(dwarfOutput(dwarf)).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += amount ?? 0;
    });
  });

  // finish forge events, send dwarf back to previous assignment afterwards
  const finished = state.forgeEvents.filter((event) => forgeCompletionDay(event) <= day);
  let forgeEvents = state.forgeEvents.filter((event) => forgeCompletionDay(event) > day);
  finished.forEach((event) => {
    resources = addResources(resources, recipes[event.recipe].output, 1);
  });
  const finishedSmiths = new Set(finished.map((event) => event.dwarfId));
  dwarves = dwarves.map((dwarf) =>
    finishedSmiths.has(dwarf.id)
      ? { ...dwarf, status: dwarf.assignment ? "working" : "idle" }
      : dwarf,
  );

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

  // dwarf who dies, cancel crafting and refund the materials
  const orphaned = forgeEvents.filter((event) => !dwarves.some((d) => d.id === event.dwarfId));
  orphaned.forEach((event) => {
    resources = addResources(resources, recipes[event.recipe].cost, 1);
  });
  forgeEvents = forgeEvents.filter((event) => !orphaned.includes(event));

  return { ...state, day, resources, dwarves, starvationDays, forgeEvents };
}

export const jobLabel = (job: JobType) => job ? ({
  woodcutting: "Woodcutting",
  mining: "Deep Mining",
  farming: "Mushroom Farm"
}[job]) : "Unassigned";
