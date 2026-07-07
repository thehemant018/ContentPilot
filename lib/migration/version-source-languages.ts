import { buildVersionSourceLanguageCandidates } from "@/lib/sitecore/item-version";

export function resolveVersionSourceLanguages(
  targetLanguage: string,
  queueLanguages: string[],
): string[] {
  return buildVersionSourceLanguageCandidates(targetLanguage, queueLanguages);
}
