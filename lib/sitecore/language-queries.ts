export const GET_INSTANCE_LANGUAGES_QUERY = `
  query MigrateXInstanceLanguages {
    item(where: { path: "/sitecore/system/Languages" }) {
      children {
        nodes {
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
    }
  }
`;

/** Authoring GraphQL — probe whether an item exists in a given language. */
export const SITE_ROOT_IN_LANGUAGE_QUERY = `
  query MigrateXSiteRootInLanguage($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      name
      path
      language {
        name
      }
    }
  }
`;

export const ITEM_BY_PATH_LANGUAGE_QUERY = SITE_ROOT_IN_LANGUAGE_QUERY;

/**
 * Strict language-version probe — reading a standard field fails when the item
 * has no version in the requested language (unlike path-only item lookups).
 */
export const ITEM_VERSION_STRICT_PROBE_QUERY = `
  query MigrateXItemVersionStrictProbe($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      versionProbe: field(name: "__Display name") {
        value
      }
    }
  }
`;

export const ADD_ITEM_VERSION_MUTATION = `
  mutation MigrateXAddItemVersion($input: AddItemVersionInput!) {
    addItemVersion(input: $input) {
      item {
        itemId
        path
      }
    }
  }
`;
