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
