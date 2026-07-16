export const UPLOAD_MEDIA_MUTATION = `
  mutation ContentPilotUploadMedia($itemPath: String!, $language: String, $alt: String) {
    uploadMedia(input: { itemPath: $itemPath, language: $language, alt: $alt }) {
      presignedUploadUrl
    }
  }
`;
