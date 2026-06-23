import { defineCollection, z } from "astro:content";

const knowledge = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(["cpp", "ue-core", "gameplay", "rendering", "tools", "portfolio"]),
    track: z.enum(["UE Gameplay Programmer", "Engine/Tools", "Rendering/TA", "Portfolio"]),
    level: z.enum(["foundation", "intermediate", "advanced"]),
    status: z.enum(["draft", "ready"]),
    minutes: z.number().int().positive(),
    order: z.number().int().nonnegative(),
    prerequisites: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([])
  })
});

export const collections = {
  knowledge
};
