export type WorkflowPhaseId =
  | "auth"
  | "discovery"
  | "crawl"
  | "ai-match"
  | "review"
  | "migrate";

export interface WorkflowPhase {
  id: WorkflowPhaseId;
  number: number;
  name: string;
  description: string;
  color: string;
  activeRing: string;
  activeBorder: string;
  activeBg: string;
  labelColor: string;
  available: boolean;
}

export const WORKFLOW_PHASES: WorkflowPhase[] = [
  {
    id: "auth",
    number: 1,
    name: "Auth",
    description: "Connect to Sitecore XM Cloud with OAuth credentials.",
    color: "bg-violet-600",
    activeRing: "ring-violet-500",
    activeBorder: "border-violet-600",
    activeBg: "bg-violet-50",
    labelColor: "text-violet-800",
    available: true,
  },
  {
    id: "discovery",
    number: 2,
    name: "Discovery",
    description: "List sites, renderings, and template field maps.",
    color: "bg-teal-600",
    activeRing: "ring-teal-500",
    activeBorder: "border-teal-600",
    activeBg: "bg-teal-50",
    labelColor: "text-teal-800",
    available: true,
  },
  {
    id: "crawl",
    number: 3,
    name: "Crawl",
    description: "Parse source pages and detect semantic content blocks.",
    color: "bg-blue-600",
    activeRing: "ring-blue-500",
    activeBorder: "border-blue-600",
    activeBg: "bg-blue-50",
    labelColor: "text-blue-800",
    available: false,
  },
  {
    id: "ai-match",
    number: 4,
    name: "AI Match",
    description: "Match blocks to Sitecore renderings with field previews.",
    color: "bg-orange-500",
    activeRing: "ring-orange-500",
    activeBorder: "border-orange-500",
    activeBg: "bg-orange-50",
    labelColor: "text-orange-800",
    available: false,
  },
  {
    id: "review",
    number: 5,
    name: "Review",
    description: "Confirm, override, or skip suggested mappings.",
    color: "bg-rose-500",
    activeRing: "ring-rose-500",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-50",
    labelColor: "text-rose-800",
    available: false,
  },
  {
    id: "migrate",
    number: 6,
    name: "Migrate",
    description: "Create items, upload media, and populate fields.",
    color: "bg-emerald-600",
    activeRing: "ring-emerald-500",
    activeBorder: "border-emerald-600",
    activeBg: "bg-emerald-50",
    labelColor: "text-emerald-800",
    available: false,
  },
];

export function isWorkflowPhaseId(value: string): value is WorkflowPhaseId {
  return WORKFLOW_PHASES.some((phase) => phase.id === value);
}

export function getPhaseById(id: WorkflowPhaseId): WorkflowPhase {
  const phase = WORKFLOW_PHASES.find((entry) => entry.id === id);
  if (!phase) {
    throw new Error(`Unknown workflow phase: ${id}`);
  }
  return phase;
}
