import { useState } from "react";
import { Chronicle } from "../components/Chronicle";
import { craftBlocker, recipes, type RecipeId } from "../simulation";
import { useColony } from "../state/ColonyContext";

export function ForgePage() {
  const { colony, activities, craftItem } = useColony();
  const [picking, setPicking] = useState<RecipeId | null>(null);

  function smithList(recipeId: RecipeId) {
    if (picking !== recipeId) return null;
    const eligible = colony.dwarves.filter(
      (dwarf) => craftBlocker(colony, recipeId, dwarf.id) === null,
    );

    return (
      <div className="smith-list">
        {eligible.length === 0 ? (
          <p>No dwarf can forge this right now.</p>
        ) : (
          eligible.map((dwarf) => (
            <button
              key={dwarf.id}
              onClick={() => {
                craftItem(recipeId, dwarf.id);
                setPicking(null);
              }}
            >
              {dwarf.icon} {dwarf.name}
            </button>
          ))
        )}
      </div>
    );
  }

  const toggle = (recipeId: RecipeId) =>
    setPicking((current) => (current === recipeId ? null : recipeId));

  return (
    <div className="forge-layout">
      <section className="panel forge">
        <div>
          <small>EMBER FORGE</small>
          <h2>Craft a tool</h2>
          <p>Equip the hold for future work.</p>
        </div>
        <div className="recipe">
          <span>3 🪵</span>
          <i>+</i>
          <span>2 🪨</span>
          <i>→</i>
          <span>1 ⚒️</span>
          <i>·</i>
          <span>⏳ {recipes.tool.days} days</span>
          <button onClick={() => toggle("tool")}>Forge tool</button>
        </div>
        {smithList("tool")}
      </section>

      <section className="panel forge">
        <div>
          <small>EMBER FORGE</small>
          <h2>Craft a weapon</h2>
          <p>Arm Stonehome against hostile raids.</p>
        </div>
        <div className="recipe">
          <span>3 🪨</span>
          <i>+</i>
          <span>1 🪵</span>
          <i>+</i>
          <span>1 ⚒️</span>
          <i>→</i>
          <span>1 🗡️</span>
          <i>·</i>
          <span>⏳ {recipes.weapon.days} days</span>
          <button onClick={() => toggle("weapon")}>Forge weapon</button>
        </div>
        {smithList("weapon")}
      </section>

      <Chronicle activities={activities} />
    </div>
  );
}
