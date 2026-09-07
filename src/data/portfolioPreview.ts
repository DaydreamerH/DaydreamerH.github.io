export type PortfolioPreviewProject = {
  slug: string;
  title: string;
  titleLines?: [string, string];
  eyebrow: string;
  summary: string;
  role: string;
  stack: string[];
  period: string;
  visual: "northstar" | "relay" | "solace";
  cover?: "hero-shooters" | "stylized-renderer";
  banner: string;
  overview: string[];
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
  externalLinks: Array<{
    label: string;
    href: string;
  }>;
  document?: "hero-shooters" | "stylized-renderer";
  relatedPosts: Array<{
    title: string;
    description: string;
    href: string;
  }>;
};

// 仅用于作品集页面的视觉预览。接入真实项目时，这个文件会由 portfolio Content Collection 替代。
export const portfolioPreviewProjects: PortfolioPreviewProject[] = [
  {
    slug: "hero-shooters",
    title: "HeroShooters",
    titleLines: ["Hero", "Shooters"],
    eyebrow: "UE 5.4 · Multiplayer Hero Shooter",
    summary: "以 GAS、动画层与服务端回溯构建的多人第三人称英雄据点射击项目。",
    role: "Gameplay Systems",
    stack: ["Unreal Engine 5.4", "C++", "GAS", "Enhanced Input"],
    period: "UE 5.4",
    visual: "relay",
    cover: "hero-shooters",
    banner: "linear-gradient(135deg, #1e2034 0%, #554775 48%, #db9b6a 130%)",
    overview: [
      "HeroShooters 是一个 UE 5.4 多人第三人称英雄射击项目。红蓝双方围绕据点争夺积分，击杀、重生、补给与英雄技能共同影响战场节奏；当前版本包含 Phoebe 与 FemaleRover 两名英雄，以及步枪、手枪和狙击枪三类武器表现。",
      "项目把输入、技能、武器、动画、命中与积分组织为同一条战斗闭环：客户端先给出即时操作反馈，服务端再依据 GAS 规则和命中验证确认最终结果。"
    ],
    sections: [],
    externalLinks: [],
    document: "hero-shooters",
    relatedPosts: [
      {
        title: "Refactoring Lag Compensation——Introducing Sphere-Based Collision Verification",
        description: "将延迟补偿的命中验证改为基于球体碰撞的实现记录。",
        href: "/knowledge/refactoring-lag-compensation-introducing-sphere-based-collision-verification/"
      },
      {
        title: "Perfecting a Material-Only Sniper Scope in Unreal Engine",
        description: "完善材质驱动狙击镜表现的迭代记录。",
        href: "/knowledge/perfecting-a-material-only-sniper-scope-in-unreal-engine/"
      },
      {
        title: "A Material-Only Sniper Scope in Unreal Engine — No SceneCapture, No UI, No Barrel Occlusion",
        description: "不依赖 SceneCapture、UI 或枪管遮挡的瞄准镜方案。",
        href: "/knowledge/a-material-only-sniper-scope-in-unreal-engine-no-scenecapture-no-ui-no-barrel-occlusion/"
      },
      {
        title: "A Server-Authoritative Architecture for Lag-Compensated Projectile Hits",
        description: "服务端权威的延迟补偿投射物命中架构。",
        href: "/knowledge/a-server-authoritative-architecture-for-lag-compensated-projectile-hits/"
      },
      {
        title: "Decoupling Logic and Visuals for Bullet Object Pooling",
        description: "将子弹逻辑与视觉对象池解耦的实现记录。",
        href: "/knowledge/decoupling-logic-and-visuals-for-bullet-object-pooling/"
      },
      {
        title: "Building a Simple Parkour System in Unreal Engine",
        description: "角色跑酷检测与动作系统的实现记录。",
        href: "/knowledge/building-a-simple-parkour-system-in-unreal-engine/"
      },
      {
        title: "Implementation of a Local Firing Prediction Mechanism in Multiplayer TPS with Unreal Engine GAS",
        description: "多人 TPS 本地开火预测机制的实现记录。",
        href: "/knowledge/implementation-of-a-local-firing-prediction-mechanism-in-multiplayer-tps-with-unreal-engine-gas/"
      },
      {
        title: "Modify GameplayEffect Duration at Runtime in Unreal GAS",
        description: "运行时调整 GameplayEffect 持续时间的实现记录。",
        href: "/knowledge/modify-gameplayeffect-duration-at-runtime-in-unreal-gas/"
      },
      {
        title: "Unreal Engine MMD Skeleton Retargeting Guide",
        description: "MMD 骨骼重定向至 Unreal Engine 的工作记录。",
        href: "/knowledge/unreal-engine-mmd-skeleton-retargeting-guide/"
      }
    ]
  },
  {
    slug: "stylized-renderer",
    title: "StylizedRenderer",
    titleLines: ["Stylized", "Renderer"],
    eyebrow: "C++20 · OpenGL 4.5 · NPR",
    summary: "面向三渲二角色的实时风格化渲染框架与角色查看器。",
    role: "Renderer / Viewer",
    stack: ["C++20", "OpenGL 4.5", "GLSL", "Dear ImGui"],
    period: "C++20 · OpenGL 4.5",
    visual: "solace",
    cover: "stylized-renderer",
    banner: "linear-gradient(135deg, #182039 0%, #4c69a8 48%, #bdd2ff 130%)",
    overview: [
      "StylizedRenderer 是一个基于 C++20 与 OpenGL 4.5 Core 的实时风格化角色渲染项目。它以可扩展、可调试的渲染框架为目标，并通过 Viewer 将模型加载、材质与光照调整、动画播放、调试视图和性能观察放进同一套运行环境。"
    ],
    sections: [],
    externalLinks: [],
    document: "stylized-renderer",
    relatedPosts: [
      {
        title: "StylizedRenderer 阶段一与二：从图形抽象到静态模型渲染",
        description: "从图形抽象与资源导入建立静态模型渲染基础。",
        href: "/knowledge/stylized-renderer-phase-one-two/"
      },
      {
        title: "StylizedRenderer 第三阶段：从单次绘制到多 Pass HDR 渲染管线",
        description: "搭建多 Pass、HDR 与后处理的渲染路径。",
        href: "/knowledge/stylized-renderer-phase-three/"
      },
      {
        title: "StylizedRenderer 第四阶段：MToon 材质、编辑器与 Sidecar 工作流",
        description: "MToon 材质参数、编辑器与 Sidecar 工作流。",
        href: "/knowledge/stylized-renderer-phase-four/"
      },
      {
        title: "StylizedRenderer 第五阶段：Inverse Hull 与屏幕空间描边系统",
        description: "几何与屏幕空间描边的实现与取舍。",
        href: "/knowledge/stylized-renderer-phase-five/"
      },
      {
        title: "StylizedRenderer 第六阶段：骨骼动画、GPU 蒙皮与 Morph 表情系统",
        description: "骨骼动画、GPU 蒙皮与 Morph 表情系统。",
        href: "/knowledge/stylized-renderer-phase-six/"
      }
    ]
  }
];

export const featuredPortfolioPreview = portfolioPreviewProjects[0];
