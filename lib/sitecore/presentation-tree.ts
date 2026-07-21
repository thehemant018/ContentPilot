import { randomUUID } from "node:crypto";

import {
  extractRenderingsFromLayout,
  normalizePlaceholderKey,
  readDynamicPlaceholderIdFromNestedPath,
  readDynamicPlaceholderIdFromParameters,
  resolvePresentationPlaceholder,
} from "@/lib/sitecore/dynamic-placeholder";
import {
  buildRenderingElement,
  formatSitecoreGuid,
  insertRenderingInLayoutXml,
  layoutContainsRendering,
} from "@/lib/sitecore/layout-xml";
import {
  assignDynamicPlaceholderPresentation,
  DYNAMIC_PLACEHOLDER_ID_PARAM,
  mergeLayoutRenderingParametersByUid,
  renderingRequiresDynamicPlaceholderId,
  resolveNestedDynamicPresentationPlaceholder,
} from "@/lib/sitecore/rendering-parameters";
import { resolveNestedPlaceholderFormatForPair } from "@/lib/sitecore/nested-placeholder-format";
import type { RenderingPlaceholderProfile } from "@/types/discovery";
import type { MigrationComponentExport } from "@/types/migration-export";
import { pickNestedPlaceholderKeyPattern } from "@/lib/migration/target/placeholder-registry";

export interface PresentationTreeNode {
  component: MigrationComponentExport;
  renderingUid: string;
  resolvedPlaceholder: string;
  parentQueueItemId?: string;
  depth: number;
  siblingIndex: number;
  /** DynamicPlaceholderId written on the parent rendering's s:par. */
  dynamicPlaceholderId?: number;
}

export interface PresentationTreeSkip {
  queueItemId: string;
  renderingName: string;
  reason: string;
}

export interface PresentationTreeResult {
  layoutXml: string;
  nodes: PresentationTreeNode[];
  skipped: PresentationTreeSkip[];
}

function comparePresentationOrder(
  left: MigrationComponentExport,
  right: MigrationComponentExport,
): number {
  const leftDepth = left.presentation.presentationDepth ?? 0;
  const rightDepth = right.presentation.presentationDepth ?? 0;
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  const leftSibling = left.presentation.presentationSiblingIndex ?? left.presentation.index;
  const rightSibling =
    right.presentation.presentationSiblingIndex ?? right.presentation.index;
  if (leftSibling !== rightSibling) {
    return leftSibling - rightSibling;
  }

  return left.presentation.index - right.presentation.index;
}

export function sortComponentsForPresentationTree(
  components: MigrationComponentExport[],
): MigrationComponentExport[] {
  return [...components].sort(comparePresentationOrder);
}

function buildProfileMap(
  profiles: RenderingPlaceholderProfile[] | undefined,
): Map<string, RenderingPlaceholderProfile> {
  const map = new Map<string, RenderingPlaceholderProfile>();
  for (const profile of profiles ?? []) {
    map.set(profile.renderingPath.trim(), profile);
  }
  return map;
}

function componentHasQueuedChildren(
  component: MigrationComponentExport,
  components: MigrationComponentExport[],
): boolean {
  return components.some(
    (candidate) =>
      candidate.presentation.parentQueueItemId === component.queueItemId,
  );
}

function readDynamicIdFromPlaceholderPath(
  placeholder: string,
  nestedPlaceholderKeyPattern: string,
): number | undefined {
  return readDynamicPlaceholderIdFromNestedPath(
    placeholder,
    nestedPlaceholderKeyPattern,
  );
}

function readDynamicPlaceholderIdFromLayout(
  layoutXml: string,
  renderingUid: string,
): number | undefined {
  const renderings = extractRenderingsFromLayout(layoutXml);
  const match = renderings.find((rendering) => rendering.uid === renderingUid);
  if (!match) {
    return undefined;
  }

  return (
    readDynamicPlaceholderIdFromParameters(match.parameters) ??
    readDynamicIdFromPlaceholderPath(
      match.placeholder,
      match.placeholder.split("/").pop() ?? "",
    )
  );
}

function ensureParentDynamicPlaceholderId(
  layoutXml: string,
  parentNode: PresentationTreeNode,
  parentProfile: RenderingPlaceholderProfile | undefined,
  components: MigrationComponentExport[],
): { layoutXml: string; parentNode: PresentationTreeNode } {
  const existingId = readDynamicPlaceholderIdFromLayout(
    layoutXml,
    parentNode.renderingUid,
  );
  if (existingId !== undefined) {
    return {
      layoutXml,
      parentNode: {
        ...parentNode,
        dynamicPlaceholderId: existingId,
      },
    };
  }

  if (parentNode.dynamicPlaceholderId) {
    return { layoutXml, parentNode };
  }

  const needsId = renderingRequiresDynamicPlaceholderId(
    parentProfile,
    componentHasQueuedChildren(parentNode.component, components),
  );
  if (!needsId) {
    return { layoutXml, parentNode };
  }

  const assigned = assignDynamicPlaceholderPresentation({
    profile: parentProfile,
    hasQueuedChildren: componentHasQueuedChildren(
      parentNode.component,
      components,
    ),
    layoutXml,
    parentResolvedPlaceholder: parentNode.resolvedPlaceholder,
    nestedPlaceholderKeyPattern:
      pickNestedPlaceholderKeyPattern({
        parentProfile,
        childProfile: undefined,
        childPlaceholderKey:
          parentNode.component.presentation.childPlaceholderKey,
      }) ?? "",
    preferredId:
      parentNode.component.presentation.dynamicPlaceholderId ??
      parentProfile?.defaultDynamicPlaceholderId,
  });

  if (!assigned.apply || assigned.dynamicPlaceholderId === undefined) {
    return { layoutXml, parentNode };
  }

  const updatedLayout = mergeLayoutRenderingParametersByUid(
    layoutXml,
    parentNode.renderingUid,
    { [DYNAMIC_PLACEHOLDER_ID_PARAM]: assigned.dynamicPlaceholderId },
  );

  return {
    layoutXml: updatedLayout,
    parentNode: {
      ...parentNode,
      dynamicPlaceholderId: assigned.dynamicPlaceholderId,
    },
  };
}

function buildNodeFromExistingLayout(
  component: MigrationComponentExport,
  layoutXml: string,
  renderingId: string,
  datasourceId: string,
  profile: RenderingPlaceholderProfile | undefined,
): PresentationTreeNode | undefined {
  const renderings = extractRenderingsFromLayout(layoutXml);
  const normalizedRenderingId = formatSitecoreGuid(renderingId);
  const normalizedDatasourceId = formatSitecoreGuid(datasourceId);

  const match = renderings.find(
    (rendering) =>
      formatSitecoreGuid(rendering.renderingId) === normalizedRenderingId &&
      formatSitecoreGuid(rendering.datasourceId) === normalizedDatasourceId,
  );

  if (!match?.uid) {
    return undefined;
  }

  const nestedKeyPattern =
    pickNestedPlaceholderKeyPattern({
      parentProfile: profile,
      childPlaceholderKey: component.presentation.childPlaceholderKey,
    }) ?? "";
  const dynamicPlaceholderId =
    readDynamicPlaceholderIdFromParameters(match.parameters) ??
    (nestedKeyPattern
      ? readDynamicIdFromPlaceholderPath(match.placeholder, nestedKeyPattern)
      : undefined);

  return {
    component,
    renderingUid: match.uid,
    resolvedPlaceholder: normalizePlaceholderKey(match.placeholder),
    parentQueueItemId: component.presentation.parentQueueItemId,
    depth: component.presentation.presentationDepth ?? 0,
    siblingIndex:
      component.presentation.presentationSiblingIndex ??
      component.presentation.index,
    dynamicPlaceholderId,
  };
}

function findParentRenderingInLayout(
  layoutXml: string,
  parentComponent: MigrationComponentExport,
  renderingId: string,
  datasourceId: string | undefined,
  profile: RenderingPlaceholderProfile | undefined,
): PresentationTreeNode | undefined {
  const renderings = extractRenderingsFromLayout(layoutXml);
  const normalizedRenderingId = formatSitecoreGuid(renderingId);
  const normalizedDatasourceId = datasourceId
    ? formatSitecoreGuid(datasourceId)
    : undefined;
  const candidates = renderings.filter(
    (rendering) =>
      formatSitecoreGuid(rendering.renderingId) === normalizedRenderingId,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  const rootPlaceholder = normalizePlaceholderKey(
    parentComponent.presentation.placeHolder,
  );

  const datasourceMatch = normalizedDatasourceId
    ? candidates.find(
        (rendering) =>
          formatSitecoreGuid(rendering.datasourceId) === normalizedDatasourceId,
      )
    : undefined;

  const match =
    datasourceMatch ??
    candidates.find(
      (rendering) =>
        normalizePlaceholderKey(rendering.placeholder) === rootPlaceholder,
    ) ??
    candidates.find((rendering) => !rendering.placeholder.includes("/")) ??
    candidates[0];

  if (!match?.uid) {
    return undefined;
  }

  const renderingName =
    parentComponent.presentation.renderingName || profile?.renderingName || "";
  const dynamicPlaceholderId =
    readDynamicPlaceholderIdFromParameters(match.parameters) ??
    readDynamicIdFromPlaceholderPath(match.placeholder, renderingName);

  return {
    component: parentComponent,
    renderingUid: match.uid,
    resolvedPlaceholder: normalizePlaceholderKey(match.placeholder),
    parentQueueItemId: parentComponent.presentation.parentQueueItemId,
    depth: parentComponent.presentation.presentationDepth ?? 0,
    siblingIndex:
      parentComponent.presentation.presentationSiblingIndex ??
      parentComponent.presentation.index,
    dynamicPlaceholderId,
  };
}

function resolveParentNode(
  parentQueueItemId: string,
  layoutXml: string,
  componentByQueueId: Map<string, MigrationComponentExport>,
  nodeByQueueId: Map<string, PresentationTreeNode>,
  renderingIdByPath: Map<string, string>,
  datasourceIdByPath: Map<string, string>,
  profileByPath: Map<string, RenderingPlaceholderProfile>,
): PresentationTreeNode | undefined {
  const cached = nodeByQueueId.get(parentQueueItemId);
  if (cached) {
    return cached;
  }

  const parentComponent = componentByQueueId.get(parentQueueItemId);
  if (!parentComponent) {
    return undefined;
  }

  const renderingPath = parentComponent.presentation.renderingPath?.trim();
  const datasourcePath = parentComponent.presentation.dataSource.trim();
  if (!renderingPath) {
    return undefined;
  }

  const renderingId = renderingIdByPath.get(renderingPath);
  const datasourceId = datasourceIdByPath.get(datasourcePath);
  if (!renderingId || !datasourceId) {
    return undefined;
  }

  const profile = profileByPath.get(renderingPath);
  return (
    buildNodeFromExistingLayout(
      parentComponent,
      layoutXml,
      renderingId,
      datasourceId,
      profile,
    ) ??
    findParentRenderingInLayout(
      layoutXml,
      parentComponent,
      renderingId,
      datasourceId,
      profile,
    )
  );
}

function registerExistingNode(
  node: PresentationTreeNode,
  nodeByQueueId: Map<string, PresentationTreeNode>,
): void {
  nodeByQueueId.set(node.component.queueItemId, node);
}

function patchExistingParentForPendingChildren(
  layoutXml: string,
  component: MigrationComponentExport,
  existingNode: PresentationTreeNode,
  profile: RenderingPlaceholderProfile | undefined,
  components: MigrationComponentExport[],
  renderingIdByPath: Map<string, string>,
  datasourceIdByPath: Map<string, string>,
  nodeByQueueId: Map<string, PresentationTreeNode>,
): string {
  const hasPendingChildren = components.some((candidate) => {
    if (candidate.presentation.parentQueueItemId !== component.queueItemId) {
      return false;
    }
    const childRenderingPath = candidate.presentation.renderingPath?.trim();
    const childDatasourcePath = candidate.presentation.dataSource.trim();
    if (!childRenderingPath) {
      return true;
    }
    const childRenderingId = renderingIdByPath.get(childRenderingPath);
    const childDatasourceId = datasourceIdByPath.get(childDatasourcePath);
    if (!childRenderingId || !childDatasourceId) {
      return true;
    }
    return !layoutContainsRendering(
      layoutXml,
      childRenderingId,
      childDatasourceId,
    );
  });

  if (!hasPendingChildren) {
    return layoutXml;
  }

  const { layoutXml: patchedLayout, parentNode: patchedNode } =
    ensureParentDynamicPlaceholderId(
      layoutXml,
      existingNode,
      profile,
      components,
    );
  registerExistingNode(patchedNode, nodeByQueueId);
  return patchedLayout;
}

export function applyPresentationTreeToLayoutXml(
  currentLayoutXml: string | undefined,
  components: MigrationComponentExport[],
  renderingIdByPath: Map<string, string>,
  datasourceIdByPath: Map<string, string>,
  renderingProfiles?: RenderingPlaceholderProfile[],
): PresentationTreeResult {
  const ordered = sortComponentsForPresentationTree(components);
  const profileByPath = buildProfileMap(renderingProfiles);
  const componentByQueueId = new Map(
    components.map((component) => [component.queueItemId, component]),
  );
  let layoutXml = currentLayoutXml ?? "";
  const nodes: PresentationTreeNode[] = [];
  const skipped: PresentationTreeSkip[] = [];
  const nodeByQueueId = new Map<string, PresentationTreeNode>();

  for (const component of ordered) {
    const renderingPath = component.presentation.renderingPath?.trim();
    const datasourcePath = component.presentation.dataSource.trim();
    const renderingName =
      component.presentation.renderingName ||
      component.presentation.renderingPath ||
      "Component";

    if (!renderingPath) {
      skipped.push({
        queueItemId: component.queueItemId,
        renderingName,
        reason: "Rendering path is missing.",
      });
      continue;
    }

    const renderingId = renderingIdByPath.get(renderingPath);
    const datasourceId = datasourceIdByPath.get(datasourcePath);
    if (!renderingId) {
      skipped.push({
        queueItemId: component.queueItemId,
        renderingName,
        reason: `Rendering item not found at ${renderingPath}.`,
      });
      continue;
    }
    if (!datasourceId) {
      skipped.push({
        queueItemId: component.queueItemId,
        renderingName,
        reason: `Datasource item not found at ${datasourcePath}.`,
      });
      continue;
    }

    if (layoutContainsRendering(layoutXml, renderingId, datasourceId)) {
      const profile = profileByPath.get(renderingPath);
      let existingNode = buildNodeFromExistingLayout(
        component,
        layoutXml,
        renderingId,
        datasourceId,
        profile,
      );
      if (!existingNode) {
        existingNode = findParentRenderingInLayout(
          layoutXml,
          component,
          renderingId,
          datasourceId,
          profile,
        );
      }

      if (existingNode) {
        layoutXml = patchExistingParentForPendingChildren(
          layoutXml,
          component,
          existingNode,
          profile,
          components,
          renderingIdByPath,
          datasourceIdByPath,
          nodeByQueueId,
        );
        registerExistingNode(existingNode, nodeByQueueId);
      }

      const hasPendingChildren = components.some((candidate) => {
        if (candidate.presentation.parentQueueItemId !== component.queueItemId) {
          return false;
        }
        const childRenderingPath = candidate.presentation.renderingPath?.trim();
        const childDatasourcePath = candidate.presentation.dataSource.trim();
        if (!childRenderingPath) {
          return true;
        }
        const childRenderingId = renderingIdByPath.get(childRenderingPath);
        const childDatasourceId = datasourceIdByPath.get(childDatasourcePath);
        if (!childRenderingId || !childDatasourceId) {
          return true;
        }
        return !layoutContainsRendering(
          layoutXml,
          childRenderingId,
          childDatasourceId,
        );
      });

      if (!hasPendingChildren) {
        skipped.push({
          queueItemId: component.queueItemId,
          renderingName,
          reason: "Presentation already exists on the page for this datasource.",
        });
      }
      continue;
    }

    const profile = profileByPath.get(renderingPath);
    let parentNode = component.presentation.parentQueueItemId
      ? nodeByQueueId.get(component.presentation.parentQueueItemId)
      : undefined;

    if (!parentNode && component.presentation.parentQueueItemId) {
      parentNode = resolveParentNode(
        component.presentation.parentQueueItemId,
        layoutXml,
        componentByQueueId,
        nodeByQueueId,
        renderingIdByPath,
        datasourceIdByPath,
        profileByPath,
      );
      if (parentNode) {
        registerExistingNode(parentNode, nodeByQueueId);
      }
    }

    let resolvedPlaceholder: string;
    let dynamicPlaceholderId: number | undefined;
    const renderingParameters: Record<string, string | number | undefined> = {};

    if (component.presentation.parentQueueItemId) {
      if (!parentNode) {
        skipped.push({
          queueItemId: component.queueItemId,
          renderingName,
          reason:
            "Parent component is not on the page yet. Queue and push the parent (e.g. Card List) first, or remove the existing parent from the page and push again.",
        });
        continue;
      }

      const parentProfile = parentNode.component.presentation.renderingPath
        ? profileByPath.get(parentNode.component.presentation.renderingPath.trim())
        : undefined;

      const ensured = ensureParentDynamicPlaceholderId(
        layoutXml,
        parentNode,
        parentProfile,
        components,
      );
      layoutXml = ensured.layoutXml;
      parentNode = ensured.parentNode;
      registerExistingNode(parentNode, nodeByQueueId);

      const nestedKeyPattern = pickNestedPlaceholderKeyPattern({
        childPlaceholderKey: component.presentation.childPlaceholderKey,
        parentProfile,
        childProfile: profile,
      });
      const format = resolveNestedPlaceholderFormatForPair({
        parentProfile,
        childProfile: profile,
      });
      const parentDynamicId =
        parentNode.dynamicPlaceholderId ??
        component.presentation.dynamicPlaceholderId ??
        parentProfile?.defaultDynamicPlaceholderId ??
        1;

      if (!nestedKeyPattern) {
        skipped.push({
          queueItemId: component.queueItemId,
          renderingName,
          reason:
            "Child placeholder key is missing. Re-run Discovery and ensure parent/child rendering profiles are loaded.",
        });
        continue;
      }

      resolvedPlaceholder = resolveNestedDynamicPresentationPlaceholder({
        parentProfile,
        childProfile: profile,
        parentResolvedPlaceholder: parentNode.resolvedPlaceholder,
        parentRenderingName:
          parentNode.component.presentation.renderingName ||
          parentProfile?.renderingName ||
          "",
        parentRenderingUid: parentNode.renderingUid,
        parentDynamicPlaceholderId: parentDynamicId,
        childPlaceholderKey: nestedKeyPattern,
      });
    } else {
      resolvedPlaceholder = resolvePresentationPlaceholder(
        component.presentation.placeHolder,
        layoutXml,
      );

      const assigned = assignDynamicPlaceholderPresentation({
        profile,
        hasQueuedChildren: componentHasQueuedChildren(component, components),
        layoutXml,
        parentResolvedPlaceholder: resolvedPlaceholder,
        nestedPlaceholderKeyPattern:
          pickNestedPlaceholderKeyPattern({
            parentProfile: profile,
            childProfile: profile,
            childPlaceholderKey: component.presentation.childPlaceholderKey,
          }) ?? "",
        preferredId:
          component.presentation.dynamicPlaceholderId ??
          profile?.defaultDynamicPlaceholderId,
      });

      if (assigned.apply) {
        dynamicPlaceholderId = assigned.dynamicPlaceholderId;
        Object.assign(renderingParameters, assigned.parameters);
      }
    }

    const renderingUid = formatSitecoreGuid(randomUUID());
    const renderingElement = buildRenderingElement({
      renderingId,
      placeholder: resolvedPlaceholder,
      datasourceId,
      uid: renderingUid,
      parameters: renderingParameters,
    });

    const insertIndex =
      component.presentation.presentationSiblingIndex ??
      component.presentation.index;

    layoutXml = insertRenderingInLayoutXml(
      layoutXml,
      renderingElement,
      resolvedPlaceholder,
      insertIndex,
    );

    const node: PresentationTreeNode = {
      component,
      renderingUid,
      resolvedPlaceholder,
      parentQueueItemId: component.presentation.parentQueueItemId,
      depth: component.presentation.presentationDepth ?? 0,
      siblingIndex:
        component.presentation.presentationSiblingIndex ??
        component.presentation.index,
      dynamicPlaceholderId,
    };
    nodes.push(node);
    registerExistingNode(node, nodeByQueueId);
  }

  return { layoutXml, nodes, skipped };
}

export function extractRenderingUidFromLayout(
  layoutXml: string,
  renderingId: string,
  datasourceId: string,
): string | undefined {
  const renderings = extractRenderingsFromLayout(layoutXml);
  const normalizedRenderingId = formatSitecoreGuid(renderingId);
  const normalizedDatasourceId = formatSitecoreGuid(datasourceId);

  const match = renderings.find(
    (rendering) =>
      formatSitecoreGuid(rendering.renderingId) === normalizedRenderingId &&
      formatSitecoreGuid(rendering.datasourceId) === normalizedDatasourceId,
  );

  return match?.uid;
}
