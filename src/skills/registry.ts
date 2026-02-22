import type { SkillMeta } from "./loader.js";

/** Matches user queries to skills based on trigger keywords */
export class SkillRegistry {
  private skills: SkillMeta[] = [];

  register(skill: SkillMeta): void {
    this.skills.push(skill);
  }

  registerAll(skills: SkillMeta[]): void {
    this.skills.push(...skills);
  }

  /** Find the best matching skill for a query */
  match(query: string): SkillMeta | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: SkillMeta | null = null;
    let bestScore = 0;

    for (const skill of this.skills) {
      let score = 0;
      for (const trigger of skill.triggers) {
        if (lowerQuery.includes(trigger.toLowerCase())) {
          score += trigger.length; // Longer matches are more specific
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
      }
    }

    return bestMatch;
  }

  /** Get all registered skills */
  getAll(): readonly SkillMeta[] {
    return this.skills;
  }

  /** Get skill by name */
  get(name: string): SkillMeta | undefined {
    return this.skills.find((s) => s.name === name);
  }
}
