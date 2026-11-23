import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
import {
  advanceDay,
  assignJob,
  craftBlocker,
  equipTool,
  isBusy,
  jobLabel,
  recipes,
  startCrafting,
  unequipTool,
  type RecipeId,
  STARVATION_DAYS,
  recruitSkarner,
} from "../simulation";
import type {
  Activity,
  ColonyState,
  JobType,
  ResourceKey,
} from "../types";
import { ColonyContext, type ColonyContextValue } from "./ColonyContext";

const initialState: ColonyState = {
  day: 12,
  resources: {
    wood: 14,
    stone: 9,
    food: 6,
    tools: 1,
    weapons: 0,
  },
  starvationDays: 0,
  skarnerJoined: false,
  forgeEvents: [],
  dwarves: [
    {
      id: "dwarf-1",
      name: "Bromli Copperkeg",
      title: "Hold Warden",
      icon: "🧔🏻",
      assignment: "mining",
      status: "working",
      specialty: "mining",
      hasTool: false,
    },
    {
      id: "dwarf-2",
      name: "Yrsa Flintbraid",
      title: "Trail Scout",
      icon: "🧔🏼‍♀️",
      assignment: "woodcutting",
      status: "working",
      specialty: "woodcutting",
      hasTool: false,
    },
    {
      id: "dwarf-3",
      name: "Dori Ashmantle",
      title: "Stone Singer",
      icon: "🧔🏽",
      assignment: null,
      status: "idle",
      hasTool: false,
    },
  ],
};

export function ColonyProvider({ children }: { children: ReactNode }) {
  const [colony, setColony] = useState(initialState);
  const [paused, setPaused] = useState(false);
  const [expeditionPending, setExpeditionPending] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: "welcome",
      day: 12,
      message: "The forge fires are lit. Stonehome wakes.",
    },
  ]);
  const previousColony = useRef(colony);
  const expeditionLock = useRef(false);
  // Keep the request ID for retries of the same expedition
  const expeditionRequests = useRef(new Map<string, string>());

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(
      () => setColony((current) => advanceDay(current)),
      8_000,
    );

    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const previous = previousColony.current;
    previousColony.current = colony;
    if (colony.day === previous.day) return;

    // logs deaths and forge events
    const entries: Activity[] = [];

    const deceased = previous.dwarves.find(
      (dwarf) => !colony.dwarves.some((remaining) => remaining.id === dwarf.id),
    );
    if (deceased) {
      entries.push({
        id: `starvation-${deceased.id}-${colony.day}`,
        day: colony.day,
        message: `${deceased.name} died after ${STARVATION_DAYS} consecutive days without enough rations.`,
        tone: "warning" as const,
      });
    }

    // handle finished or interrupted forge events
    previous.forgeEvents
      .filter((event) => !colony.forgeEvents.some((e) => e.id === event.id))
      .forEach((event) => {
        const smith = colony.dwarves.find((d) => d.id === event.dwarfId);
        const label = recipes[event.recipe].label;
        entries.push({
          id: `${event.id}-end`,
          day: colony.day,
          message: smith
            ? `${smith.name} finished forging a ${label}.`
            : `The unfinished ${label} was abandoned. Its materials return to the stores.`,
          tone: smith ? "good" : "warning",
        });
      });

    if (entries.length === 0) return;
    setActivities((current) => [...entries, ...current].slice(0, 6));
  }, [colony]);

  function assignDwarf(id: string, assignment: JobType) {
    const dwarf = colony.dwarves.find((item) => item.id === id);
    if (!dwarf || isBusy(dwarf)) return;

    setColony((current) => assignJob(current, id, assignment));
    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: `${dwarf?.name ?? "A dwarf"} assigned to ${jobLabel(assignment)}.`,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  // start forge task, remove materials right away -> result when time passes
  function craftItem(recipeId: RecipeId, dwarfId: string) {
    const recipe = recipes[recipeId];
    const blocker = craftBlocker(colony, recipeId, dwarfId);
    const smith = colony.dwarves.find((d) => d.id === dwarfId);

    // check crafting eligibility, if valid start crafting 
    if (!blocker) {
      setColony((current) => startCrafting(current, recipeId, dwarfId));
    }
    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: blocker
            ? `Cannot forge a ${recipe.label}: ${blocker}`
            : `${smith?.name} began forging a ${recipe.label}. Ready on day ${colony.day + recipe.days}.`,
          tone: blocker ? ("warning" as const) : undefined,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  async function sendExpedition(dwarfId: string, destination: string) {
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    if (
      expeditionLock.current ||
      !dwarf ||
      dwarf.status === "expedition"
    ) {
      return;
    }

    expeditionLock.current = true;
    // Match retries by dwarf and destination
    const requestKey = JSON.stringify([dwarfId, destination]);
    const requestId =
      expeditionRequests.current.get(requestKey) ?? crypto.randomUUID();
    expeditionRequests.current.set(requestKey, requestId);
    setExpeditionPending(true);
    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((item) =>
        item.id === dwarf.id ? { ...item, status: "expedition" } : item,
      ),
    }));
    setActivities((current) => [
      {
        id: crypto.randomUUID(),
        day: colony.day,
        message: `${dwarf.name} departed for ${destination.replace("-", " ")}.`,
      },
      ...current,
    ]);

    try {
      const result = await beginExpedition(requestId, dwarf.id, destination);
      // Start a fresh request after success
      expeditionRequests.current.delete(requestKey);
      const recruitedSkarner =
        destination === "crystal-cave" && !colony.skarnerJoined;

      setColony((current) =>
        recruitSkarner(
          {
            ...current,
            resources: Object.entries(result.rewards).reduce(
              (all, [key, amount]) => ({
                ...all,
                [key]: all[key as ResourceKey] + (amount ?? 0),
              }),
              current.resources,
            ),
            dwarves: current.dwarves.map((item) =>
              item.id === dwarf.id
                ? {
                    ...item,
                    status: item.assignment ? "working" : "idle",
                  }
                : item,
            ),
          },
          destination,
        ),
      );
      setActivities((current) =>
        [
          {
            id: result.expeditionId,
            day: colony.day,
            message: recruitedSkarner
              ? `${result.message} Skarner joined the hold.`
              : result.message,
            tone: "good" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    } catch (error) {
      setColony((current) => ({
        ...current,
        dwarves: current.dwarves.map((item) =>
          item.id === dwarf.id
            ? {
                ...item,
                status: item.assignment ? "working" : "idle",
              }
            : item,
        ),
      }));
      setActivities((current) =>
        [
          {
            id: crypto.randomUUID(),
            day: colony.day,
            message:
              error instanceof Error
                ? error.message
                : "The expedition was lost from view.",
            tone: "warning" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    } finally {
      expeditionLock.current = false;
      setExpeditionPending(false);
    }
  }

  const value: ColonyContextValue = {
    colony,
    paused,
    activities,
    expeditionPending,
    togglePaused: () => setPaused((value) => !value),
    assignDwarf,
    equipTool: (id: string) => setColony((current) => equipTool(current, id)),
    unequipTool: (id: string) => setColony((current) => unequipTool(current, id)),
    craftItem,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
