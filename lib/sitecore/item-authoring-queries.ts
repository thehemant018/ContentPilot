export const CREATE_ITEM_MUTATION = `
  mutation ContentPilotCreateItem($input: CreateItemInput!) {
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
  mutation ContentPilotUpdateItem($input: UpdateItemInput!) {
    updateItem(input: $input) {
      item {
        itemId
        name
        path
      }
    }
  }
`;
