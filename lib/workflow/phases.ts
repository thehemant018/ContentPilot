export type WorkflowPhaseId =
  | "auth"
  | "discovery"
  | "map-mode"
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
    color: "bg-teal-600",
    activeRing: "ring-teal-500",
    activeBorder: "border-teal-600",
    activeBg: "bg-teal-50",
    labelColor: "text-teal-800",
    available: true,
  },
  {
    id: "discovery",
    number: 2,
    name: "Discovery",
    description: "List sites, renderings, and template field maps.",
    color: "bg-cyan-600",
    activeRing: "ring-cyan-500",
    activeBorder: "border-cyan-600",
    activeBg: "bg-cyan-50",
    labelColor: "text-cyan-800",
    available: true,
  },
  {
    id: "map-mode",
    number: 3,
    name: "Map",
    description: "Choose crawl + AI matching or Visual Mapper.",
    color: "bg-sky-600",
    activeRing: "ring-sky-500",
    activeBorder: "border-sky-600",
    activeBg: "bg-sky-50",
    labelColor: "text-sky-800",
    available: true,
  },
  {
    id: "crawl",
    number: 4,
    name: "Crawl",
    description: "Parse source pages and detect semantic content blocks.",
    color: "bg-blue-600",
    activeRing: "ring-blue-500",
    activeBorder: "border-blue-600",
    activeBg: "bg-blue-50",
    labelColor: "text-blue-800",
    available: true,
  },
  {
    id: "ai-match",
    number: 5,
    name: "AI Match",
    description: "Match blocks to Sitecore renderings with field previews.",
    color: "bg-amber-500",
    activeRing: "ring-amber-500",
    activeBorder: "border-amber-500",
    activeBg: "bg-amber-50",
    labelColor: "text-amber-800",
    available: true,
  },
  {
    id: "review",
    number: 6,
    name: "Review",
    description: "Confirm, override, or skip suggested mappings.",
    color: "bg-rose-500",
    activeRing: "ring-rose-500",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-50",
    labelColor: "text-rose-800",
    available: true,
  },
  {
    id: "migrate",
    number: 7,
    name: "Migrate",
    description: "Create items, upload media, and populate fields.",
    color: "bg-emerald-600",
    activeRing: "ring-emerald-500",
    activeBorder: "border-emerald-600",
    activeBg: "bg-emerald-50",
    labelColor: "text-emerald-800",
    available: true,
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

export function getNextPhaseId(
  phaseId: WorkflowPhaseId,
): WorkflowPhaseId | null {
  const index = WORKFLOW_PHASES.findIndex((phase) => phase.id === phaseId);
  if (index < 0 || index >= WORKFLOW_PHASES.length - 1) {
    return null;
  }
  return WORKFLOW_PHASES[index + 1]?.id ?? null;
}
