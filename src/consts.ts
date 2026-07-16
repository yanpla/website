export const SITE = {
  title: "yanpla",
  description:
    "yanpla's personal corner of the internet. Developer, gamer, maker of things.",
} as const;

export const GITHUB = {
  username: "yanpla",
  // Repos excluded from the top-languages chart
  excludedRepos: ["remnantsoflight"] as string[],
} as const;

export const DISCORD = {
  username: "yanpla",
  userId: "287291530685841409",
} as const;

export const RIOT = {
  gameName: "yanpla",
  tagLine: "EUW",
  platform: "euw1", // platform routing (summoner/league/mastery)
  region: "europe", // regional routing (account-v1, match-v5)
} as const;

export const STEAM = {
  vanityName: "yanpla",
} as const;

export const MINECRAFT = {
  username: "yanpla",
  uuid: "e1e7252a80d84ee4a5d474f7fc6378bb",
} as const;
