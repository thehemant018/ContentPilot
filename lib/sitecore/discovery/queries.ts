export const GET_SITES_QUERY = `
  query MigrateXGetSites {
    sites {
      name
      rootPath
      domain
      startPath
      rootItem {
        itemId
        path
      }
    }
  }
`;

export const VALIDATE_PATH_QUERY = `
  query MigrateXValidatePath($path: String!) {
    item(where: { path: $path }) {
      itemId
      name
      path
      hasChildren
      template {
        name
        templateId
      }
    }
  }
`;

export const SEARCH_UNDER_PATH_QUERY = `
  query MigrateXSearchUnderPath($path: String!, $pageSize: Int!, $pageIndex: Int!) {
    search(
      query: {
        index: "sitecore_master_index"
        searchStatement: {
          criteria: [
            {
              criteriaType: STARTSWITH
              field: "_fullpath"
              value: $path
            }
          ]
        }
        paging: { pageSize: $pageSize, pageIndex: $pageIndex }
      }
    ) {
      totalCount
      results {
        innerItem {
          itemId
          name
          path
          template {
            name
            templateId
          }
        }
      }
    }
  }
`;

export const ITEM_FIELDS_QUERY = `
  query MigrateXItemFields($path: String!) {
    item(where: { path: $path }) {
      itemId
      name
      path
      fields(ownFields: true, excludeStandardFields: false) {
        nodes {
          name
          value
        }
      }
    }
  }
`;

export const ITEM_INHERITED_FIELDS_QUERY = `
  query MigrateXItemInheritedFields($path: String!) {
    item(where: { path: $path }) {
      itemId
      name
      path
      fields(ownFields: false, excludeStandardFields: false) {
        nodes {
          name
          value
        }
      }
    }
  }
`;

export const ITEM_PATH_BY_ID_QUERY = `
  query MigrateXItemPathById($itemId: ID!) {
    item(where: { itemId: $itemId }) {
      itemId
      path
    }
  }
`;

export const ITEM_FIELDS_BY_ID_QUERY = `
  query MigrateXItemFieldsById($itemId: ID!) {
    item(where: { itemId: $itemId }) {
      itemId
      name
      path
      fields(ownFields: true, excludeStandardFields: false) {
        nodes {
          name
          value
        }
      }
    }
  }
`;

export const SEARCH_ITEM_BY_ID_QUERY = `
  query MigrateXSearchItemById($itemId: String!, $pageSize: Int!) {
    search(
      query: {
        index: "sitecore_master_index"
        searchStatement: {
          criteria: [
            {
              criteriaType: EQUALS
              field: "_id"
              value: $itemId
            }
          ]
        }
        paging: { pageSize: $pageSize, pageIndex: 0 }
      }
    ) {
      results {
        innerItem {
          itemId
          path
        }
      }
    }
  }
`;

export const TEMPLATE_STRUCTURE_QUERY = `
  query MigrateXTemplateStructure($path: String!) {
    item(where: { path: $path }) {
      itemId
      name
      path
      children {
        nodes {
          name
          template {
            name
          }
          children {
            nodes {
              name
              template {
                name
              }
              fields(ownFields: true, excludeStandardFields: false) {
                nodes {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Resolves parameter template base templates (e.g. IDynamicPlaceholder inheritance). */
export const TEMPLATE_INHERITANCE_QUERY = `
  query MigrateXTemplateInheritance($path: String!) {
    templates(path: $path) {
      name
      baseTemplates {
        name
        baseTemplates {
          name
          baseTemplates {
            name
            baseTemplates {
              name
            }
          }
        }
      }
      ownFields {
        name
      }
    }
  }
`;
