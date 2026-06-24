import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export default defineConfig({
  output: "static",
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
    shikiConfig: {
      theme: "github-dark"
    }
  }
});
