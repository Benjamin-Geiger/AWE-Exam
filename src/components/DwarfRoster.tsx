import { jobLabel, STARVATION_DAYS } from "../simulation";
import type { Dwarf, JobType } from "../types";

const jobs: Exclude<JobType, null>[] = [
  "woodcutting",
  "mining",
  "farming",
];

interface Props {
  dwarves: Dwarf[];
  // num of available tools in storage
  tools: number;
  starvationDays: number;
  starvationExpected: boolean;
  onAssign: (id: string, job: JobType) => void;
  onEquip: (id: string) => void;
  onReturn: (id: string) => void;
}

export function DwarfRoster({
  dwarves,
  tools,
  starvationDays,
  starvationExpected,
  onAssign,
  onEquip,
  onReturn,
}: Props) {
  const presentDwarves = dwarves.filter(
    (dwarf) => dwarf.status !== "expedition",
  ).length;

  return (
    <section className="panel roster">
      <header>
        <div>
          <small>THE COMPANY</small>
          <h2>Holdfolk</h2>
        </div>
        <span>
          {presentDwarves} / {dwarves.length} present
        </span>
      </header>

      <div className="dwarf-list">
        {dwarves.map((dwarf, index) => {
          const isAway = dwarf.status === "expedition";
  
          const daysUntilStarvation =
            index === dwarves.length - 1 && starvationDays > 0
              ? STARVATION_DAYS - starvationDays
              : null;
          const isNewestDwarf = index === dwarves.length - 1;
          const specialty = dwarf.specialty
            ? `Skilled in ${jobLabel(dwarf.specialty)}`
            : "Generalist";

          return (
            <article
              className={isAway ? "dwarf away" : "dwarf"}
              key={dwarf.id}
            >
              <div className="portrait">
                {dwarf.icon}
                <i className={dwarf.status} />
              </div>

              <div className="dwarf-details">
                <h3>{dwarf.name}</h3>
                <p>
                  {dwarf.species === "Skarner" ? "Crystal scorpion" : dwarf.title} · {specialty}
                </p>
                <p className="tool-line">
                  {dwarf.species === "Skarner"
                    ? "Claws cannot use tools"
                    : dwarf.hasTool
                    ? "⚒️ Carries a tool (+1 / day)"
                    : "No tool"}
                </p>
                {isNewestDwarf && starvationExpected && starvationDays === 0 && (
                  <p className="starvation-warning" role="status">
                    Starvation may start tomorrow if food doesn't improve
                  </p>
                )}
                {isNewestDwarf && daysUntilStarvation !== null && (
                  <p className="starvation-warning" role="status">
                    Starves in {daysUntilStarvation}{" "}
                    {daysUntilStarvation === 1 ? "day" : "days"} if rations
                    stay low
                  </p>
                )}

                <select
                  value={dwarf.assignment ?? ""}
                  disabled={isAway}
                  onChange={(event) =>
                    onAssign(
                      dwarf.id,
                      (event.target.value || null) as JobType,
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {jobs.map((job) => (
                    <option value={job} key={job}>
                      {jobLabel(job)}
                    </option>
                  ))}
                </select>

                <div className="tool-actions">
                  <button
                    disabled={
                      isAway ||
                      dwarf.species === "Skarner" ||
                      dwarf.hasTool ||
                      tools < 1
                    }
                    onClick={() => onEquip(dwarf.id)}
                  >
                    Equip
                  </button>
                  <button
                    disabled={isAway || !dwarf.hasTool}
                    onClick={() => onReturn(dwarf.id)}
                  >
                    Return
                  </button>
                </div>
              </div>

              <span className="status">{dwarf.status}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
