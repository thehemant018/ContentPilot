"use client";

import { RenderingPicker } from "@/components/visual-mapper/RenderingPicker";
import { FieldAssignmentTable } from "@/components/visual-mapper/FieldAssignmentTable";
import { MappingsTable } from "@/components/visual-mapper/MappingsTable";
import { visualMapperInputMonoClass } from "@/components/visual-mapper/form-styles";
import { useVisualMapperStore } from "@/lib/visual-mapper/store";

interface MappingPanelProps {
  onHighlightSelector: (selector: string) => void;
  onClearHighlights: () => void;
}

function StepBadge({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-blue-600 text-white"
              : "bg-zinc-200 text-zinc-500"
        }`}
      >
        {done ? "✓" : step}
      </span>
      <span
        className={`text-xs font-semibold uppercase tracking-wide ${
          active || done ? "text-zinc-800" : "text-zinc-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function MappingPanel({
  onHighlightSelector,
  onClearHighlights,
}: MappingPanelProps) {
  const mappingPhase = useVisualMapperStore((s) => s.mappingPhase);
  const selectedElement = useVisualMapperStore((s) => s.selectedElement);
  const draftRendering = useVisualMapperStore((s) => s.draftRendering);
  const draftFieldAssignments = useVisualMapperStore(
    (s) => s.draftFieldAssignments,
  );
  const activeFieldId = useVisualMapperStore((s) => s.activeFieldId);
  const discoveryRenderings = useVisualMapperStore((s) => s.discoveryRenderings);
  const mappings = useVisualMapperStore((s) => s.session.mappings);
  const targetPagePath = useVisualMapperStore((s) => s.targetPagePath);
  const setTargetPagePath = useVisualMapperStore((s) => s.setTargetPagePath);

  const setDraftRenderingByName = useVisualMapperStore(
    (s) => s.setDraftRenderingByName,
  );
  const setActiveFieldId = useVisualMapperStore((s) => s.setActiveFieldId);
  const clearField = useVisualMapperStore((s) => s.clearField);
  const setLinkFieldType = useVisualMapperStore((s) => s.setLinkFieldType);
  const sourcePageUrl = useVisualMapperStore((s) => s.session.sourceUrl);
  const autoSuggestFields = useVisualMapperStore((s) => s.autoSuggestFields);
  const confirmComponent = useVisualMapperStore((s) => s.confirmComponent);
  const cancelComponentMapping = useVisualMapperStore(
    (s) => s.cancelComponentMapping,
  );
  const addToQueue = useVisualMapperStore((s) => s.addToQueue);
  const editMapping = useVisualMapperStore((s) => s.editMapping);
  const removeFromQueue = useVisualMapperStore((s) => s.removeFromQueue);

  const canConfirm =
    mappingPhase === "select-component" &&
    Boolean(selectedElement && draftRendering);

  const mappedFieldCount = draftFieldAssignments.filter(
    (field) => field.value.trim() !== "",
  ).length;

  function handleConfirmComponent() {
    if (confirmComponent() && selectedElement) {
      onHighlightSelector(selectedElement.selector);
    }
  }

  function handleAddToQueue() {
    if (addToQueue()) {
      onClearHighlights();
    }
  }

  function handleEdit(id: string) {
    editMapping(id);
    const entry = mappings.find((item) => item.id === id);
    if (entry) {
      onHighlightSelector(entry.sourceSelector);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-zinc-200 bg-white text-zinc-900">
      <div className="border-b border-zinc-200 bg-zinc-50/80 p-4">
        <label
          htmlFor="targetPagePath"
          className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
        >
          Target page path
        </label>
        <input
          id="targetPagePath"
          type="text"
          value={targetPagePath}
          onChange={(event) => setTargetPagePath(event.target.value)}
          placeholder="/sitecore/content/.../home"
          className={`mt-1.5 w-full ${visualMapperInputMonoClass}`}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Sitecore item path where mapped components will be placed.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-zinc-200 p-4">
          <div className="flex items-center gap-6">
            <StepBadge
              step={1}
              label="Select component"
              active={mappingPhase === "select-component"}
              done={mappingPhase === "map-fields"}
            />
            <div className="h-px flex-1 bg-zinc-200" />
            <StepBadge
              step={2}
              label="Map fields"
              active={mappingPhase === "map-fields"}
              done={false}
            />
          </div>

          {mappingPhase === "select-component" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-zinc-600">
                Click a component on the page (e.g. the Hero section), then pick
                the matching Sitecore rendering.
              </p>

              {!selectedElement ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-zinc-700">
                    No component selected
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Click a section in the page preview on the left.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Source component
                  </p>
                  <p className="mt-1 font-mono text-xs text-blue-900">
                    {selectedElement.tagName.toLowerCase()}{" "}
                    {selectedElement.selector}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-blue-800">
                    {selectedElement.extracted.text.slice(0, 100) ||
                      "(container element)"}
                  </p>
                </div>
              )}

              <RenderingPicker
                renderings={discoveryRenderings}
                value={draftRendering?.renderingName ?? null}
                onChange={setDraftRenderingByName}
              />

              {draftRendering && selectedElement && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-medium text-emerald-900">Ready to match</p>
                  <p className="mt-1 text-emerald-800">
                    <span className="font-mono text-xs">
                      {selectedElement.selector}
                    </span>
                    {" → "}
                    <span className="font-semibold">
                      {draftRendering.renderingName}
                    </span>
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmComponent}
                disabled={!canConfirm}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm component match
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Matched component
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-900">
                      {draftRendering?.renderingName}
                    </p>
                    <p className="mt-1 font-mono text-xs text-zinc-600">
                      {selectedElement?.selector}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cancelComponentMapping();
                      onClearHighlights();
                    }}
                    className="shrink-0 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm text-zinc-600">
                  Map each Sitecore field by clicking{" "}
                  <span className="font-semibold">Pick from page</span>, then
                  click the matching element inside this component.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {mappedFieldCount}/{draftFieldAssignments.length} fields mapped
                </p>
              </div>

              <FieldAssignmentTable
                fields={draftFieldAssignments}
                activeFieldId={activeFieldId}
                sourcePageUrl={sourcePageUrl}
                onPickFromPage={setActiveFieldId}
                onClearField={clearField}
                onLinkTypeChange={setLinkFieldType}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={autoSuggestFields}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Auto-suggest fields
                </button>
                <button
                  type="button"
                  onClick={handleAddToQueue}
                  disabled={!draftRendering}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Add to queue
                </button>
              </div>

              <p className="text-xs text-zinc-500">
                Once added, select the next component on the page and repeat.
              </p>
            </div>
          )}
        </section>

        <section className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Queue</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
              {mappings.length} component{mappings.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3">
            <MappingsTable
              mappings={mappings}
              onEdit={handleEdit}
              onRemove={removeFromQueue}
              onRowClick={onHighlightSelector}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
