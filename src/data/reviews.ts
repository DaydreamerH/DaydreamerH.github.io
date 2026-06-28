export type ReviewPerformance = "good" | "partial" | "wrong" | "skipped";

export type ReviewMarkStatus = "active" | "resolved" | "deleted";

export type ReviewMarkType = "mistake" | "unclear" | "note";

export interface ReviewQuestionDetail {
  question: string;
  answer: string;
  result: string;
  diagnosis: string;
}

export type ReviewQuestion = string | ReviewQuestionDetail;

export interface ReviewSession {
  id: string;
  reviewedAt: string;
  performance: ReviewPerformance;
  score?: number;
  questions: ReviewQuestion[];
  coachSummary: string;
  createdMarks: string[];
}

export interface ReviewMark {
  id: string;
  status: ReviewMarkStatus;
  type: ReviewMarkType;
  severity: "low" | "medium" | "high";
  quote: string;
  reason: string;
  sessionId: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ReviewSummary {
  reviewCount: number;
  lastReviewedAt?: string;
  lastPerformance?: ReviewPerformance;
  activeMarkCount: number;
  resolvedMarkCount: number;
}

export interface KnowledgeReview {
  slug: string;
  summary: ReviewSummary;
  sessions: ReviewSession[];
  marks: ReviewMark[];
}

export const performanceLabels: Record<ReviewPerformance, string> = {
  good: "掌握良好",
  partial: "有遗漏",
  wrong: "存在错误",
  skipped: "未完成"
};

export const markTypeLabels: Record<ReviewMarkType, string> = {
  mistake: "错误",
  unclear: "模糊",
  note: "补充"
};

const reviewModules = import.meta.glob<KnowledgeReview>(
  "../reviews/knowledge/*.json",
  { eager: true, import: "default" }
);

function getSlugFromReviewPath(path: string) {
  return path.match(/\/knowledge\/(.+)\.json$/)?.[1] ?? "";
}

export function getReviewIndex() {
  return Object.fromEntries(
    Object.entries(reviewModules)
      .map(([path, review]) => [review.slug || getSlugFromReviewPath(path), review])
      .filter(([slug]) => slug)
  ) as Record<string, KnowledgeReview>;
}

export function getReviewForSlug(slug: string) {
  return getReviewIndex()[slug];
}

export function getActiveMarks(review?: KnowledgeReview) {
  return review?.marks.filter((mark) => mark.status === "active") ?? [];
}

export function formatReviewDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function getReviewCardLabel(review?: KnowledgeReview) {
  if (!review) return "未复习";
  const { summary } = review;
  const parts = [`已复习 ${summary.reviewCount} 次`];
  if (summary.lastReviewedAt) parts.push(`最近 ${formatReviewDate(summary.lastReviewedAt)}`);
  if (summary.lastPerformance) parts.push(performanceLabels[summary.lastPerformance]);
  if (summary.activeMarkCount > 0) parts.push(`${summary.activeMarkCount} 处需回看`);
  return parts.join(" · ");
}

export function getReviewCardCompactLabel(review?: KnowledgeReview) {
  if (!review) return "未复习";
  const { summary } = review;
  const parts = [`复习 ${summary.reviewCount} 次`];
  if (summary.lastPerformance) parts.push(performanceLabels[summary.lastPerformance]);
  if (summary.activeMarkCount > 0) parts.push(`标注 ${summary.activeMarkCount} 处`);
  return parts.join(" · ");
}
