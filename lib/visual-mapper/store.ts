import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  autoSuggestFieldAssignments,
  emptyFieldAssignments,
  fieldValueFromPick,
  mergeAssignmentsWithTemplate,
} from "@/lib/visual-mapper/auto-suggest-fields";
import {
  buildDraftRenderingInfo,
  findTemplateForRendering,
} from "@/lib/visual-mapper/rendering-template";
import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";
import type {
  ComponentMappingPhase,
  DraftRenderingInfo,
  ExtractedContent,
  FieldAssignment,
  MappingEntry,
  SelectedElement,
  VisualMapperSession,
} from "@/types/visual-mapper";

interface VisualMapperStore {
  session: VisualMapperSession;
  mappingPhase: ComponentMappingPhase;
  selectedElement: SelectedElement | null;
  activeFieldId: string | null;
  draftRendering: DraftRenderingInfo | null;
  draftFieldAssignments: FieldAssignment[];
  discoveryRenderings: DiscoveryItem[];
  discoveryTemplates: TemplateDefinition[];
  targetPagePath: string;
  migrationWarning: string | null;

  resetStore: () => void;
  setDiscoveryData: (
    renderings: DiscoveryItem[],
    templates: TemplateDefinition[],
    siteId: string,
  ) => void;
  setTargetPagePath: (path: string) => void;
  loadPage: (url: string) => void;
  pageLoaded: () => void;
  pageLoadFailed: () => void;
  setSelectedElement: (element: SelectedElement) => void;
  clearSelection: () => void;
  setDraftRenderingByName: (renderingName: string) => void;
  assignField: (
    fieldId: string,
    value: string,
    selector: string,
    preview: string,
    manual?: boolean,
  ) => void;
  assignFieldFromPick: (
    fieldId: string,
    content: ExtractedContent,
    selector: string,
  ) => void;
  clearField: (fieldId: string) => void;
  setActiveFieldId: (fieldId: string | null) => void;
  autoSuggestFields: () => void;
  confirmComponent: () => boolean;
  cancelComponentMapping: () => void;
  addToQueue: () => boolean;
  editMapping: (id: string) => void;
  removeFromQueue: (id: string) => void;
  setMigrationWarning: (message: string | null) => void;
  startMigration: () => void;
  migrationComplete: () => void;
  migrationFailed: (message: string) => void;
}

const initialSession = (siteId = ""): VisualMapperSession => ({
  siteId,
  sourceUrl: "",
  mappings: [],
  status: "idle",
});

export const useVisualMapperStore = create<VisualMapperStore>((set, get) => ({
  session: initialSession(),
  mappingPhase: "select-component",
  selectedElement: null,
  activeFieldId: null,
  draftRendering: null,
  draftFieldAssignments: [],
  discoveryRenderings: [],
  discoveryTemplates: [],
  targetPagePath: "",
  migrationWarning: null,

  resetStore: () =>
    set({
      session: initialSession(),
      mappingPhase: "select-component",
      selectedElement: null,
      activeFieldId: null,
      draftRendering: null,
      draftFieldAssignments: [],
      targetPagePath: "",
      migrationWarning: null,
    }),

  setDiscoveryData: (renderings, templates, siteId) =>
    set({
      discoveryRenderings: renderings,
      discoveryTemplates: templates,
      session: { ...get().session, siteId },
    }),

  setTargetPagePath: (path) => set({ targetPagePath: path }),

  loadPage: (url) => {
    set({
      session: {
        ...get().session,
        sourceUrl: url,
        status: "loading",
        mappings: [],
      },
      mappingPhase: "select-component",
      selectedElement: null,
      activeFieldId: null,
      draftRendering: null,
      draftFieldAssignments: [],
      migrationWarning: null,
    });
  },

  pageLoaded: () =>
    set({
      session: { ...get().session, status: "ready" },
    }),

  pageLoadFailed: () =>
    set({
      session: { ...get().session, status: "error" },
    }),

  setSelectedElement: (element) => {
    if (get().mappingPhase !== "select-component") {
      return;
    }

    set({
      selectedElement: element,
      draftRendering: null,
      draftFieldAssignments: [],
      activeFieldId: null,
    });
  },

  clearSelection: () =>
    set({
      mappingPhase: "select-component",
      selectedElement: null,
      draftRendering: null,
      draftFieldAssignments: [],
      activeFieldId: null,
    }),

  setDraftRenderingByName: (renderingName) => {
    if (get().mappingPhase !== "select-component") {
      return;
    }

    const { discoveryRenderings, discoveryTemplates } = get();
    const rendering = discoveryRenderings.find(
      (item) => item.name === renderingName,
    );
    if (!rendering) {
      return;
    }

    const template = findTemplateForRendering(rendering, discoveryTemplates);
    if (!template) {
      set({ draftRendering: null, draftFieldAssignments: [] });
      return;
    }

    const draftRendering = buildDraftRenderingInfo(rendering, template);
    set({
      draftRendering,
      draftFieldAssignments: emptyFieldAssignments(template),
    });
  },

  assignField: (fieldId, value, selector, preview, manual = true) => {
    set({
      draftFieldAssignments: get().draftFieldAssignments.map((field) =>
        field.sitecoreField === fieldId
          ? {
              ...field,
              value,
              sourceSelector: selector,
              valuePreview: preview,
              assignedManually: manual,
            }
          : field,
      ),
      activeFieldId: null,
    });
  },

  assignFieldFromPick: (fieldId, content, selector) => {
    const field = get().draftFieldAssignments.find(
      (item) => item.sitecoreField === fieldId,
    );
    if (!field) {
      return;
    }

    const { value, preview } = fieldValueFromPick(
      field.fieldType,
      field.sitecoreField,
      content,
      get().session.sourceUrl,
    );
    get().assignField(fieldId, value, selector, preview, true);
  },

  clearField: (fieldId) => {
    set({
      draftFieldAssignments: get().draftFieldAssignments.map((field) =>
        field.sitecoreField === fieldId
          ? {
              ...field,
              value: "",
              sourceSelector: "",
              valuePreview: "",
              assignedManually: false,
            }
          : field,
      ),
    });
  },

  setActiveFieldId: (fieldId) => set({ activeFieldId: fieldId }),

  autoSuggestFields: () => {
    const { selectedElement, draftRendering, discoveryTemplates, session } =
      get();
    if (!selectedElement || !draftRendering) {
      return;
    }

    const template = discoveryTemplates.find(
      (item) => item.name === draftRendering.templateName,
    );
    if (!template) {
      return;
    }

    const suggested = autoSuggestFieldAssignments(
      selectedElement,
      template,
      session.sourceUrl,
    );
    set({
      draftFieldAssignments: mergeAssignmentsWithTemplate(template, suggested),
    });
  },

  confirmComponent: () => {
    const { selectedElement, draftRendering } = get();
    if (!selectedElement || !draftRendering) {
      return false;
    }

    set({ mappingPhase: "map-fields", activeFieldId: null });
    get().autoSuggestFields();
    return true;
  },

  cancelComponentMapping: () => {
    set({
      mappingPhase: "select-component",
      selectedElement: null,
      draftRendering: null,
      draftFieldAssignments: [],
      activeFieldId: null,
    });
  },

  addToQueue: () => {
    const {
      selectedElement,
      draftRendering,
      draftFieldAssignments,
      session,
    } = get();

    if (!selectedElement || !draftRendering) {
      return false;
    }

    const entry: MappingEntry = {
      id: nanoid(),
      sourceSelector: selectedElement.selector,
      sourcePageUrl: session.sourceUrl,
      renderingName: draftRendering.renderingName,
      renderingPath: draftRendering.renderingPath,
      templateName: draftRendering.templateName,
      templatePath: draftRendering.templatePath,
      fieldAssignments: [...draftFieldAssignments],
      createdAt: new Date(),
    };

    set({
      session: {
        ...session,
        mappings: [...session.mappings, entry],
      },
      mappingPhase: "select-component",
      selectedElement: null,
      draftRendering: null,
      draftFieldAssignments: [],
      activeFieldId: null,
    });
    return true;
  },

  editMapping: (id) => {
    const entry = get().session.mappings.find((item) => item.id === id);
    if (!entry) {
      return;
    }

    const template = get().discoveryTemplates.find(
      (item) => item.name === entry.templateName,
    );

    set({
      mappingPhase: "map-fields",
      selectedElement: {
        selector: entry.sourceSelector,
        tagName: entry.sourceSelector.split(".")[0]?.replace("#", "") ?? "div",
        extracted: {
          text: entry.fieldAssignments[0]?.value ?? "",
          html: "",
          src: "",
          href: "",
          alt: "",
          tagName: "DIV",
          isImage: false,
          isLink: false,
          isHeading: false,
          isRichText: false,
        },
        boundingRect: new DOMRect(),
      },
      draftRendering: {
        renderingName: entry.renderingName,
        renderingPath: entry.renderingPath,
        templateName: entry.templateName,
        templatePath: entry.templatePath,
      },
      draftFieldAssignments: template
        ? mergeAssignmentsWithTemplate(template, entry.fieldAssignments)
        : entry.fieldAssignments,
      activeFieldId: null,
    });
  },

  removeFromQueue: (id) => {
    const { session } = get();
    set({
      session: {
        ...session,
        mappings: session.mappings.filter((item) => item.id !== id),
      },
    });
  },

  setMigrationWarning: (message) => set({ migrationWarning: message }),

  startMigration: () =>
    set({
      session: { ...get().session, status: "migrating" },
      migrationWarning: null,
    }),

  migrationComplete: () =>
    set({
      session: { ...get().session, status: "done" },
    }),

  migrationFailed: (message) =>
    set({
      session: { ...get().session, status: "error" },
      migrationWarning: message,
    }),
}));

export function hasCompleteMapping(session: VisualMapperSession): boolean {
  return session.mappings.some((entry) =>
    entry.fieldAssignments.some((field) => field.value.trim() !== ""),
  );
}
