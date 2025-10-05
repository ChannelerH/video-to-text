export function resolvePublicR2Base(): string | null {
  const publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
  if (publicDomain) {
    return publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`;
  }

  const bucket = process.env.STORAGE_BUCKET || '';
  if (bucket) {
    return `https://pub-${bucket}.r2.dev`;
  }

  return null;
}
