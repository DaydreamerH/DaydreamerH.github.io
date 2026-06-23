export const categoryLabels: Record<string, string> = {
  cpp: "C++ 基础",
  "ue-core": "UE 核心",
  gameplay: "Gameplay",
  rendering: "图形渲染",
  tools: "工具工程",
  portfolio: "作品集"
};

export const levelLabels: Record<string, string> = {
  foundation: "基础",
  intermediate: "进阶",
  advanced: "高级"
};

export function getCategoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

export function getLevelLabel(level: string) {
  return levelLabels[level] ?? level;
}

export const trackDescriptions = [
  {
    title: "UE Gameplay Programmer",
    body: "整理 UE C++、Gameplay Framework、蓝图协作、AI、UI 和网络基础相关内容。"
  },
  {
    title: "Engine/Tools",
    body: "记录模块、插件、编辑器扩展、资产管线和性能分析相关内容。"
  },
  {
    title: "Rendering/TA",
    body: "整理图形学、材质、Shader、Niagara 和渲染调试相关内容。"
  }
];
