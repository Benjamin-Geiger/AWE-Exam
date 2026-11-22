import { describe, expect, it } from "vitest";
import { advanceDay } from "./simulation";
import type { ColonyState } from "./types";
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, weapons: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working", hasTool: false }],  starvationDays: 0, forgeEvents: [] };
    expect(advanceDay(state)).toMatchObject({ day: 2, resources: { wood: 3, food: 4 } });
    expect(state.resources.wood).toBe(0);
  });

  it("counts shortage days after production and meals, and resets when rations recover", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
        { id: "d2", name: "Dori", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
      ],
      starvationDays: 0,
      forgeEvents: [],
    };

    const firstShortageDay = advanceDay(state);
    expect(firstShortageDay.starvationDays).toBe(1);
    expect(firstShortageDay.dwarves).toHaveLength(2);

    const recovered = advanceDay({
      ...firstShortageDay,
      resources: { ...firstShortageDay.resources, food: 4 },
    });
    expect(recovered.starvationDays).toBe(0);
    expect(recovered.dwarves).toHaveLength(2);
  });

  it("kills the newest dwarf on the third consecutive shortage day", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
        { id: "d2", name: "Dori", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
      ],
      starvationDays: 0,
      forgeEvents: [],
    };

    const dayOne = advanceDay(state);
    const dayTwo = advanceDay(dayOne);
    expect(dayTwo.starvationDays).toBe(2);
    const dayThree = advanceDay(dayTwo);

    expect(dayThree.dwarves.map((dwarf) => dwarf.id)).toEqual(["d1"]);
    expect(dayThree.starvationDays).toBe(0);
    expect(state.dwarves).toHaveLength(2);
  });

  it("lets daily food production prevent a shortage", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: "farming", status: "working", hasTool: false },
        { id: "d2", name: "Dori", title: "", icon: "", assignment: null, status: "idle", hasTool: false},
      ],
      starvationDays: 0,
      forgeEvents: [],
    };

    const nextDay = advanceDay(state);
    expect(nextDay.resources.food).toBe(2);
    expect(nextDay.starvationDays).toBe(0);
    expect(nextDay.dwarves).toHaveLength(2);
  });
});
