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
    description: "Creator Reward dashboard for Base App weekly rewards",
    iconUrl: "https://baseapp-reward-dashboard.vercel.app/icon.png",
    splashImageUrl: "https://baseapp-reward-dashboard.vercel.app/splash.png",
    splashBackgroundColor: "#000000",
    homeUrl: "https://baseapp-reward-dashboard.vercel.app",
    webhookUrl: "https://baseapp-reward-dashboard.vercel.app/api/webhook",
    primaryCategory: "utility",
    tags: ["rewards", "base", "creator"],
    heroImageUrl: "https://baseapp-reward-dashboard.vercel.app/hero.png",
    ogImageUrl: "https://baseapp-reward-dashboard.vercel.app/og.png",
  },
} as const;
