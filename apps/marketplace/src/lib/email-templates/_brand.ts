import logoAsset from '@/assets/borvat-logo.jpg.asset.json'

export const BRAND = {
  logoPath: logoAsset.url,
  primary: '#000000',
  accent: '#dc2626',
} as const

export const brandLogoUrl = (siteUrl: string) =>
  `${siteUrl.replace(/\/$/, '')}${BRAND.logoPath}`
