import { STEAM_API_KEY } from "astro:env/server";

import { STEAM } from "@/consts";
import { cached, ONE_HOUR, type CachedResult } from "@/lib/cache";
import { fetchJson } from "@/lib/fetch";

interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  playtime_2weeks?: number; // minutes
  img_icon_url: string;
}

export interface SteamStats {
  personaName: string;
  personaState: number;
  gameCount: number;
  totalMinutes: number;
  recentMinutes: number;
  topGames: { name: string; hours: number; icon: string }[];
}

const steamFetch = <T,>(
  iface: string,
  method: string,
  version: string,
  params: Record<string, string>,
): Promise<T> => {
  const query = new URLSearchParams({ key: STEAM_API_KEY ?? "", ...params });
  return fetchJson<T>(
    `https://api.steampowered.com/${iface}/${method}/${version}/?${query}`,
  );
};

const fetchSteamStats = async (): Promise<SteamStats> => {
  const vanity = await steamFetch<{
    response: { steamid?: string; success: number };
  }>("ISteamUser", "ResolveVanityURL", "v1", { vanityurl: STEAM.vanityName });
  const steamid = vanity.response.steamid;
  if (!steamid) throw new Error("Could not resolve Steam vanity URL");

  const [summaries, owned] = await Promise.all([
    steamFetch<{
      response: { players: { personaname: string; personastate: number }[] };
    }>("ISteamUser", "GetPlayerSummaries", "v2", { steamids: steamid }),
    steamFetch<{
      response: { game_count: number; games?: OwnedGame[] };
    }>("IPlayerService", "GetOwnedGames", "v1", {
      steamid,
      include_appinfo: "1",
      include_played_free_games: "1",
    }),
  ]);

  const player = summaries.response.players[0];
  const games = owned.response.games ?? [];

  return {
    personaName: player?.personaname ?? STEAM.vanityName,
    personaState: player?.personastate ?? 0,
    gameCount: owned.response.game_count,
    totalMinutes: games.reduce((acc, g) => acc + g.playtime_forever, 0),
    recentMinutes: games.reduce((acc, g) => acc + (g.playtime_2weeks ?? 0), 0),
    topGames: [...games]
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, 3)
      .map((g) => ({
        name: g.name,
        hours: Math.round(g.playtime_forever / 60),
        icon: g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : "",
      })),
  };
};

export function getSteamStats(): Promise<CachedResult<SteamStats>> {
  if (!STEAM_API_KEY) {
    return Promise.resolve({ data: null, error: "Steam API key not configured" });
  }
  return cached("steam-stats", ONE_HOUR, fetchSteamStats);
}
