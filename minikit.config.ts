const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "eyJmaWQiOjI2NDM0NCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweEU2QTYxODg4NTQxMTcxNmY0MDgyQkU3NjA2M0YxODk3ODVhNjAwNTgifQ",
    payload: "eyJkb21haW4iOiJiYXNlYXBwLXJld2FyZC1kYXNoYm9hcmQudmVyY2VsLmFwcCJ9",
    signature: "MHhhNWU1MDYzNmY1Mzg4MzNiNDczMDYxZmNlNmI2NTBlNGEyYTllZGM5YjVjNTYzZGUwYmM1OTg1ZjcyODE3NjQ4MDAxZjMwNGRhMWI1NGViOTM1ZjA4YzcyNDQwOGY2NjNmY2RhZmY4OTA1M2MyNjE4ZWFkYzljNmY0ZmVkNjcxMzFi",
  },
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "baseapp reward dashboard",
    subtitle: "",
    description: "",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["example"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
