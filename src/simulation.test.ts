import { describe, expect, it } from "vitest";
import {
  advanceDay,
  craftBlocker,
  dwarfOutput,
  equipTool,
  foodCost,
  recruitSkarner,
  startAttack,
  startCrafting,
  willStarveNextDay,
} from "./simulation";
import type { ColonyState } from "./types";
describe("colony simulation", () => {
  it("uses Skarner work rates and food cost", () => {
    const skarner = {
      id: "skarner",
      name: "Skarner",
      title: "Crystal Cave survivor",
      icon: "🦂",
      species: "Skarner" as const,
      assignment: "woodcutting" as const,
      status: "working" as const,
      hasTool: false,
    };

    expect(dwarfOutput(skarner)).toEqual({ wood: 5 });
    expect(foodCost(skarner)).toBe(2);
    expect(dwarfOutput({ ...skarner, assignment: "mining" })).toEqual({ stone: 6 });
    expect(dwarfOutput({ ...skarner, assignment: "farming" })).toEqual({});
  });

  it("uses Skarner food cost for meals and starvation forecasts", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 1, tools: 0, weapons: 0 },
      dwarves: [
        {
          id: "skarner",
          name: "Skarner",
          title: "",
          icon: "🦂",
          species: "Skarner",
          assignment: null,
          status: "idle",
          hasTool: false,
        },
      ],
      starvationDays: 0,
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    expect(willStarveNextDay(state)).toBe(true);
    expect(advanceDay(state)).toMatchObject({
      resources: { food: 0 },
      starvationDays: 1,
    });
  });

  it("recruits Skarner only once from the Crystal Cave", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 5, tools: 0, weapons: 0 },
      dwarves: [],
      starvationDays: 0,
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    expect(recruitSkarner(state, "old-mine")).toBe(state);

    const recruited = recruitSkarner(state, "crystal-cave");
    expect(recruited.skarnerJoined).toBe(true);
    expect(recruited.dwarves.map((dwarf) => dwarf.id)).toEqual(["skarner"]);

    const afterDeath = {
      ...recruited,
      dwarves: [],
    };
    const secondAttempt = recruitSkarner(afterDeath, "crystal-cave");
    expect(secondAttempt.dwarves).toHaveLength(0);
    expect(secondAttempt.skarnerJoined).toBe(true);
  });

  it("prevents Skarner from equipping tools or starting forge tasks", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 10, stone: 10, food: 5, tools: 1, weapons: 0 },
      dwarves: [
        {
          id: "skarner",
          name: "Skarner",
          title: "",
          icon: "🦂",
          species: "Skarner",
          assignment: null,
          status: "idle",
          hasTool: false,
        },
      ],
      starvationDays: 0,
      skarnerJoined: true,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    expect(equipTool(state, "skarner")).toBe(state);
    expect(craftBlocker(state, "tool", "skarner")).toBe(
      "Claws cannot use the forge.",
    );
    expect(startCrafting(state, "tool", "skarner")).toBe(state);
    expect(state.resources.tools).toBe(1);
    expect(state.resources.wood).toBe(10);
  });

  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, weapons: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working", hasTool: false }],  starvationDays: 0, skarnerJoined: false, forgeEvents: [], attack: null, attackOutcome: null };
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
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
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

  it("does not count a shortage when production feeds everyone", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: "farming", status: "working", hasTool: false },
        { id: "d2", name: "Yrsa", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
        { id: "d3", name: "Dori", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
      ],
      starvationDays: 0,
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    const nextDay = advanceDay(state);
    expect(nextDay.resources.food).toBe(1);
    expect(nextDay.starvationDays).toBe(0);
    expect(nextDay.dwarves).toHaveLength(3);
  });

  it("warns before the first shortage day when next-day food will be short", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "idle", hasTool: false },
      ],
      starvationDays: 0,
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    expect(willStarveNextDay(state)).toBe(true);
    expect(advanceDay(state).starvationDays).toBe(1);
  });

  it("does not warn if next-day production will feed everyone", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 0, tools: 0, weapons: 0 },
      dwarves: [
        { id: "d1", name: "Brom", title: "", icon: "", assignment: "farming", status: "working", hasTool: false },
      ],
      starvationDays: 0,
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    expect(willStarveNextDay(state)).toBe(false);
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
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
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
      skarnerJoined: false,
      forgeEvents: [], attack: null, attackOutcome: null,
    };

    const nextDay = advanceDay(state);
    expect(nextDay.resources.food).toBe(2);
    expect(nextDay.starvationDays).toBe(0);
    expect(nextDay.dwarves).toHaveLength(2);
  });
});

describe("piltovian attack", () => {
  const peace = (overrides: Partial<ColonyState> = {}): ColonyState => ({
    day: 1,
    resources: { wood: 9, stone: 7, food: 10, tools: 3, weapons: 6 },
    dwarves: [],
    starvationDays: 0,
    skarnerJoined: false,
    forgeEvents: [],
    attack: null,
    attackOutcome: null,
    ...overrides,
  });

  it("starts only after the attack destination and never twice", () => {
    expect(startAttack(peace(), "old-mine").attack).toBeNull();

    const attacked = startAttack(peace(), "piltover-outpost");
    expect(attacked.attack).toEqual({ attacker: "Piltovians", weaponsPerDay: 2, daysLeft: 3, totalDays: 3 });

    const running = { ...attacked, attack: { ...attacked.attack!, daysLeft: 1 } };
    expect(startAttack(running, "piltover-outpost")).toBe(running);
  });

  it("consumes weapons each day and is defended after the last day", () => {
    const dayOne = advanceDay(startAttack(peace(), "piltover-outpost"));
    expect(dayOne.resources.weapons).toBe(4);
    expect(dayOne.attack?.daysLeft).toBe(2);
    expect(dayOne.attackOutcome).toBeNull();

    const dayThree = advanceDay(advanceDay(dayOne));
    expect(dayThree.resources.weapons).toBe(0);
    expect(dayThree.attack).toBeNull();
    expect(dayThree.attackOutcome).toEqual({ day: 4, result: "defended" });
  });

  it("halves all stores and ends the attack when weapons run short", () => {
    const state = startAttack(
      peace({
        resources: { wood: 9, stone: 7, food: 10, tools: 3, weapons: 1 },
        dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "idle", hasTool: false }],
      }),
      "piltover-outpost",
    );

    const next = advanceDay(state);
    // halved before meals: food 10 -> 5, then one ration eaten
    expect(next.resources).toEqual({ wood: 4, stone: 3, food: 4, tools: 1, weapons: 0 });
    expect(next.attack).toBeNull();
    expect(next.attackOutcome).toEqual({ day: 2, result: "plundered" });
  });

  it("counts weapons finished at the forge on the same day", () => {
    const state = peace({
      day: 3,
      resources: { wood: 0, stone: 0, food: 10, tools: 0, weapons: 1 },
      dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "crafting", hasTool: false }],
      forgeEvents: [{ id: "forge-d1-1", recipe: "weapon", dwarfId: "d1", startDay: 1, duration: 3 }],
      attack: { attacker: "Piltovians", weaponsPerDay: 2, daysLeft: 1, totalDays: 3 },
    });

    const next = advanceDay(state);
    expect(next.resources.weapons).toBe(0);
    expect(next.attackOutcome).toEqual({ day: 4, result: "defended" });
  });
});
