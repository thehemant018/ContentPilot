import { describe, expect, it } from "vitest";

import {
  assignDynamicPlaceholderPresentation,
  collectBaseTemplateNames,
  parameterTemplateSupportsDynamicPlaceholders,
  parseSitecoreOtherProperties,
  renderingHasSxaDynamicPlaceholdersEnabled,
  resolveNestedDynamicPresentationPlaceholder,
  resolveRenderingDynamicPlaceholderSupport,
  templateInheritsIDynamicPlaceholder,
} from "@/lib/sitecore/rendering-parameters";
import type { RenderingPlaceholderProfile } from "@/types/discovery";

describe("templateInheritsIDynamicPlaceholder", () => {
  it("detects IDynamicPlaceholder in base template chain", () => {
    expect(
      templateInheritsIDynamicPlaceholder([
        "Standard Rendering Parameters",
        "IDynamicPlaceholder",
      ]),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(templateInheritsIDynamicPlaceholder(["idynamicplaceholder"])).toBe(
      true,
    );
  });

  it("detects IDynamicPlaceholder from template path segment", () => {
    expect(
      templateInheritsIDynamicPlaceholder([
        "/sitecore/templates/Foundation/Experience Accelerator/Rendering Parameters/IDynamicPlaceholder",
      ]),
    ).toBe(true);
  });
});

describe("collectBaseTemplateNames", () => {
  it("walks nested base template inheritance", () => {
    expect(
      collectBaseTemplateNames([
        {
          name: "Card List Parameters",
          baseTemplates: [
            {
              name: "Standard Rendering Parameters",
              baseTemplates: [{ name: "IDynamicPlaceholder" }],
            },
          ],
        },
      ]),
    ).toEqual([
      "Card List Parameters",
      "Standard Rendering Parameters",
      "IDynamicPlaceholder",
    ]);
  });
});

describe("parameterTemplateSupportsDynamicPlaceholders", () => {
  it("returns true when IDynamicPlaceholder is inherited", () => {
    expect(
      parameterTemplateSupportsDynamicPlaceholders({
        parameterFields: [],
        baseTemplateNames: ["IDynamicPlaceholder"],
      }),
    ).toBe(true);
  });

  it("returns true when DynamicPlaceholderId field exists on template", () => {
    expect(
      parameterTemplateSupportsDynamicPlaceholders({
        parameterFields: [{ name: "DynamicPlaceholderId" }],
        baseTemplateNames: [],
      }),
    ).toBe(true);
  });
});

describe("renderingHasSxaDynamicPlaceholdersEnabled", () => {
  it("reads IsRenderingsWithDynamicPlaceholders from Other properties", () => {
    expect(
      renderingHasSxaDynamicPlaceholdersEnabled([
        {
          name: "Other properties",
          value: "IsRenderingsWithDynamicPlaceholders=true",
        },
      ]),
    ).toBe(true);
  });

  it("reads ampersand-separated Other properties", () => {
    expect(
      renderingHasSxaDynamicPlaceholdersEnabled([
        {
          name: "Other properties",
          value:
            "IsRenderingsWithDynamicPlaceholders=true&IsAutoDatasourceRendering=true",
        },
      ]),
    ).toBe(true);
  });
});

describe("resolveRenderingDynamicPlaceholderSupport", () => {
  it("requires SXA flag and IDynamicPlaceholder parameter template", () => {
    expect(
      resolveRenderingDynamicPlaceholderSupport({
        renderingFields: [
          {
            name: "Other properties",
            value: "IsRenderingsWithDynamicPlaceholders=true",
          },
        ],
        parametersTemplatePath: "/sitecore/templates/Feature/CardList/Rendering Parameters",
        parameterFields: [],
        baseTemplateNames: ["IDynamicPlaceholder"],
      }),
    ).toEqual({
      usesSxaDynamicPlaceholders: true,
      inheritsIDynamicPlaceholder: true,
      parametersTemplateConfigured: true,
      hasDynamicPlaceholders: true,
    });
  });

  it("is false when SXA flag is missing", () => {
    expect(
      resolveRenderingDynamicPlaceholderSupport({
        renderingFields: [],
        parametersTemplatePath: "/sitecore/templates/Feature/CardList/Rendering Parameters",
        parameterFields: [{ name: "DynamicPlaceholderId" }],
        baseTemplateNames: ["IDynamicPlaceholder"],
      }).hasDynamicPlaceholders,
    ).toBe(false);
  });
});

describe("parseSitecoreOtherProperties", () => {
  it("parses key=value pairs", () => {
    expect(
      parseSitecoreOtherProperties("IsRenderingsWithDynamicPlaceholders=true"),
    ).toEqual({
      IsRenderingsWithDynamicPlaceholders: "true",
    });
  });
});

const dynamicParentProfile: RenderingPlaceholderProfile = {
  renderingPath: "/sitecore/layout/Renderings/Feature/Project/CardList",
  renderingId: "parent-id",
  renderingName: "CardList",
  allowedParentPlaceholderKeys: ["headless-main"],
  exposedChildPlaceholderKeys: ["CardList-Demo-{*}"],
  defaultDynamicPlaceholderId: 2,
  hasDynamicPlaceholders: true,
  usesSxaDynamicPlaceholders: true,
  inheritsIDynamicPlaceholder: true,
  nestedPlaceholderFormat: "path-suffix",
};

describe("assignDynamicPlaceholderPresentation", () => {
  it("writes DynamicPlaceholderId when profile hasDynamicPlaceholders", () => {
    const result = assignDynamicPlaceholderPresentation({
      profile: dynamicParentProfile,
      hasQueuedChildren: true,
      layoutXml: "",
      parentResolvedPlaceholder: "headless-main",
      nestedPlaceholderKeyPattern: "CardList-Demo-{*}",
      preferredId: 2,
    });

    expect(result.apply).toBe(true);
    expect(result.dynamicPlaceholderId).toBe(2);
    expect(result.parameters.DynamicPlaceholderId).toBe(2);
  });

  it("skips when profile is not dynamic-placeholder capable", () => {
    const result = assignDynamicPlaceholderPresentation({
      profile: {
        ...dynamicParentProfile,
        hasDynamicPlaceholders: false,
        usesSxaDynamicPlaceholders: false,
      },
      hasQueuedChildren: false,
      layoutXml: "",
      parentResolvedPlaceholder: "headless-main",
      nestedPlaceholderKeyPattern: "CardList-Demo-{*}",
    });

    expect(result.apply).toBe(false);
    expect(result.parameters).toEqual({});
  });
});

describe("resolveNestedDynamicPresentationPlaceholder", () => {
  it("builds path-based nested placeholder for child presentation", () => {
    expect(
      resolveNestedDynamicPresentationPlaceholder({
        parentProfile: dynamicParentProfile,
        childProfile: undefined,
        parentResolvedPlaceholder: "headless-main",
        parentRenderingName: "CardList",
        parentRenderingUid: "{AAA}",
        parentDynamicPlaceholderId: 2,
        childPlaceholderKey: "CardList-Demo-{*}",
      }),
    ).toBe("/headless-main/CardList-Demo-2");
  });
});
