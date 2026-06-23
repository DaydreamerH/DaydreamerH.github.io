import { defineCollection, z } from "astro:content";

const knowledge = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    date: z.string().optional(),
    category: z.string().default("其他笔记"),
    originalCategory: z.string().optional(),
    track: z.string().default("Knowledge Base"),
    level: z.enum(["foundation", "intermediate", "advanced"]).default("foundation"),
    status: z.enum(["draft", "ready"]).default("ready"),
    published: z.boolean().default(true),
    minutes: z.number().int().positive().default(20),
    order: z.number().int().nonnegative().default(0),
    prerequisites: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    photos: z.string().optional(),
    source: z.string().optional()
  })
});

export const collections = {
  knowledge
};
