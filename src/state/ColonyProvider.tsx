import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
import {
  advanceDay,
  equipTool,
  jobLabel,
  STARVATION_DAYS,
  unequipTool,
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

  // Log the dwarf removed by advanceDay's starvation rule.
  useEffect(() => {
    const previous = previousColony.current;
    previousColony.current = colony;
    if (colony.day === previous.day) return;

    const deceased = previous.dwarves.find(
      (dwarf) => !colony.dwarves.some((remaining) => remaining.id === dwarf.id),
    );
    if (!deceased) return;

    setActivities((current) =>
      [
        {
          id: `starvation-${deceased.id}-${colony.day}`,
          day: colony.day,
          message: `${deceased.name} died after ${STARVATION_DAYS} consecutive days without enough rations.`,
          tone: "warning" as const,
        },
        ...current,
      ].slice(0, 6),
    );
  }, [colony]);

  function assignDwarf(id: string, assignment: JobType) {
    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((dwarf) =>
        dwarf.id === id
          ? {
              ...dwarf,
              assignment,
              status: assignment ? "working" : "idle",
            }
          : dwarf,
      ),
    }));

    const dwarf = colony.dwarves.find((item) => item.id === id);
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

  function craftTool() {
    if (colony.resources.wood < 3) {
      setActivities((current) => [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: "The forge needs more timber.",
          tone: "warning" as const,
        },
        ...current,
      ]);
      return;
    }

    setColony((current) => ({
      ...current,
      resources: {
        ...current.resources,
        wood: current.resources.wood - 3,
        stone: current.resources.stone - 2,
        tools: current.resources.tools + 1,
      },
    }));
    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: "A sturdy iron tool joins the stores.",
          tone: "good" as const,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  function craftWeapon() {
    if (
      colony.resources.stone < 3 ||
      colony.resources.wood < 1 ||
      colony.resources.tools < 1
    ) {
      setActivities((current) => [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: "Not enough materials for a weapon.",
          tone: "warning" as const,
        },
        ...current,
      ]);
      return;
    }

    setColony((current) => ({
      ...current,
      resources: {
        ...current.resources,
        stone: current.resources.stone - 3,
        wood: current.resources.wood - 1,
        tools: current.resources.tools - 1,
        weapons: current.resources.weapons + 1,
      },
    }));
    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: "A stone sword is added to the armoury.",
          tone: "good" as const,
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

      setColony((current) => ({
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
      }));
      setActivities((current) =>
        [
          {
            id: result.expeditionId,
            day: colony.day,
            message: result.message,
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
    craftTool,
    craftWeapon,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
