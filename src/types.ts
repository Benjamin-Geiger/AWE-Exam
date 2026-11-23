export type ResourceKey = "wood" | "stone" | "food" | "tools" | "weapons";
export type JobType = "woodcutting" | "mining" | "farming" | null;
export type DwarfStatus = "idle" | "working" | "expedition" | "crafting";
export interface Resources { wood: number; stone: number; food: number; tools: number; weapons: number }

export interface Dwarf { 
    id: string;
     name: string; 
     title: string; 
     icon: string; 
     species?: "Skarner";
     assignment: JobType; 
     status: DwarfStatus; 
     specialty?: Exclude<JobType, null>;
     hasTool: boolean;
}

export interface ColonyState { 
    day: number; 
    resources: Resources; 
    dwarves: Dwarf[];
    // Consecutive days when rations do not cover the population.
    starvationDays: number;
    // Keep recruitment one-time even if Skarner later dies.
    skarnerJoined: boolean;
    forgeEvents: ForgeEvent[];
    attack: Attack | null;
    attackOutcome: AttackOutcome | null;
}

export interface Attack {
    attacker: "Piltovians";
    weaponsPerDay: number;
    daysLeft: number;
    totalDays: number;
}

export interface AttackOutcome {
    day: number;
    result: "defended" | "plundered";
}

export interface ExpeditionResult { 
    expeditionId: string; 
    status: "completed"; 
    rewards: Partial<Resources>; 
    message: string 
}

export interface Activity { 
    id: string; 
    day: number; 
    message: string; 
    tone?: "good" | "warning" 
}

export interface ForgeEvent {
    id: string;
    recipe: "tool" | "weapon";
    dwarfId: string;
    startDay: number;
    duration: number;
}
