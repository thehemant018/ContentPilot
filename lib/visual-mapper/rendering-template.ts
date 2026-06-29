import type { DiscoveryItem, TemplateDefinition } from "@/types/discovery";
import type { DraftRenderingInfo } from "@/types/visual-mapper";

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findTemplateForRendering(
  rendering: DiscoveryItem,
  templates: TemplateDefinition[],
): TemplateDefinition | undefined {
  const renderingKey = normalizeName(rendering.name);

  const exact = templates.find(
    (template) => normalizeName(template.name) === renderingKey,
  );
  if (exact) {
    return exact;
  }

  const contains = templates.find((template) => {
    const templateKey = normalizeName(template.name);
    return (
      templateKey.includes(renderingKey) ||
      renderingKey.includes(templateKey)
    );
  });
  if (contains) {
    return contains;
  }

  return templates.find((template) =>
    template.fields.some((field) =>
      normalizeName(field.name).includes(renderingKey.slice(0, 4)),
    ),
  );
}

export function buildDraftRenderingInfo(
  rendering: DiscoveryItem,
  template: TemplateDefinition,
): DraftRenderingInfo {
  return {
    renderingName: rendering.name,
    renderingPath: rendering.path,
    templateName: template.name,
    templatePath: template.path,
  };
}
