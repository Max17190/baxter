import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  tools: string[];
  complexity: "simple" | "medium" | "complex";
  prompt: string;
}

/**
 * Parse a SKILL.md file with YAML frontmatter.
 * Format:
 * ---
 * name: skill-name
 * description: What this skill does
 * triggers: [keyword1, keyword2]
 * tools: [tool1, tool2]
 * complexity: medium
 * ---
 * # Prompt content here...
 */
export function parseSkillFile(content: string): SkillMeta {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("Invalid SKILL.md format: missing YAML frontmatter");
  }

  const [, yaml, prompt] = frontmatterMatch;
  const meta = parseYamlFrontmatter(yaml);

  return {
    name: meta.name ?? "unnamed",
    description: meta.description ?? "",
    triggers: parseStringArray(meta.triggers),
    tools: parseStringArray(meta.tools),
    complexity: (meta.complexity as SkillMeta["complexity"]) ?? "medium",
    prompt: prompt.trim(),
  };
}

function parseYamlFrontmatter(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      result[match[1]] = match[2].trim();
    }
  }
  return result;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  // Handle [item1, item2] format
  const match = value.match(/^\[(.*)\]$/);
  if (match) {
    return match[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
  }
  return [value];
}

/** Load all built-in skills from the skills/builtin directory */
export async function loadBuiltinSkills(basePath: string): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];
  const builtinDir = join(basePath, "src", "skills", "builtin");

  try {
    const dirs = await readdir(builtinDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const skillPath = join(builtinDir, dir.name, "SKILL.md");
        try {
          const content = await Bun.file(skillPath).text();
          skills.push(parseSkillFile(content));
        } catch {
          // Skip skills that can't be loaded
        }
      }
    }
  } catch {
    // Builtin directory may not exist yet
  }

  return skills;
}
