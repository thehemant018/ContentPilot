function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function PhaseTabBadge({
  number,
  completed,
  colorClass,
}: {
  number: number;
  completed: boolean;
  colorClass: string;
}) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white ${
        completed ? "bg-emerald-600" : colorClass
      }`}
    >
      {completed ? <CheckIcon /> : number}
    </span>
  );
}
