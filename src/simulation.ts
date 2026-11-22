import type { ColonyState, JobType, Resources } from "./types";

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };
  let dwarves = state.dwarves;

  dwarves.forEach((dwarf) => {
    if (!dwarf.assignment) return;

    const output = production[dwarf.assignment];

    Object.entries(output).forEach(([resource, amount]) => {
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
