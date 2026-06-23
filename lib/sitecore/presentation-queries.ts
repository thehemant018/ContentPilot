export const GET_PAGE_RENDERINGS_FIELD_QUERY = `
  query MigrateXGetPageRenderings(
    $path: String!
    $language: String!
    $fieldName: String!
  ) {
    item(where: { path: $path, language: $language }) {
      itemId
      path
      renderingsField: field(name: $fieldName) {
        value
      }
    }
  }
`;

export const UPDATE_ITEM_RENDERINGS_MUTATION = `
  mutation MigrateXUpdateItemRenderings($input: UpdateItemInput!) {
    updateItem(input: $input) {
      item {
        itemId
        path
      }
    }
  }
`;
