export const CREATE_ITEM_MUTATION = `
  mutation MigrateXCreateItem($input: CreateItemInput!) {
    createItem(input: $input) {
      item {
        itemId
        name
        path
      }
    }
  }
`;

export const UPDATE_ITEM_MUTATION = `
  mutation MigrateXUpdateItem($input: UpdateItemInput!) {
    updateItem(input: $input) {
      item {
        itemId
        name
        path
      }
    }
  }
`;
