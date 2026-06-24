export const UPLOAD_MEDIA_MUTATION = `
  mutation MigrateXUploadMedia($itemPath: String!, $language: String, $alt: String) {
    uploadMedia(input: { itemPath: $itemPath, language: $language, alt: $alt }) {
      presignedUploadUrl
    }
  }
`;
