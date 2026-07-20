import { RIOT_API_KEY } from "astro:env/server";

import { RIOT } from "@/consts";
import { cached, ONE_HOUR, type CachedResult } from "@/lib/cache";

export interface RankedEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

export interface ArenaStats {
  games: number;
  firsts: number;
  top4: number;
  avgPlacement: number;
  topChamps: { name: string; games: number; icon: string }[];
}

export interface LeagueStats {
  summonerLevel: number;
  solo: RankedEntry | null;
  flex: RankedEntry | null;
  topChamps: { name: string; level: number; points: number; icon: string }[];
  arena: ArenaStats | null;
}

const { gameName, tagLine, platform, region } = RIOT;

// Riot rate limits are tight (dev keys: 20/s, 100/2min), so honor
// Retry-After on 429 instead of failing the whole section
const riotFetch = async <T,>(url: string, retries = 2): Promise<T> => {
  const res = await fetch(url, {
    headers: { "X-Riot-Token": RIOT_API_KEY ?? "" },
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 5);
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    return riotFetch(url, retries - 1);
  }
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return (await res.json()) as T;
};

const fetchLeagueStats = async (): Promise<LeagueStats> => {
  const { puuid } = await riotFetch<{ puuid: string }>(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
  );

  // Champion names/icons come from the public Data Dragon CDN (no key needed)
  const [versions, summoner, entries, masteries, arenaMatchIds] =
    await Promise.all([
      riotFetch<string[]>("https://ddragon.leagueoflegends.com/api/versions.json"),
      riotFetch<{ summonerLevel: number }>(
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      ),
      riotFetch<RankedEntry[]>(
        `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
      ),
      riotFetch<ChampionMastery[]>(
        `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=3`,
      ),
      // Arena rating isn't in the public API; stats are aggregated from the
      // last 20 Arena matches (queue 1740) instead
      riotFetch<string[]>(
        `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=1740&count=20`,
      ),
    ]);

  const arenaParticipants = (
    await Promise.all(
      arenaMatchIds.map(async (id) => {
        const match = await riotFetch<{
          info: {
            participants: {
              puuid: string;
              championId: number;
              placement: number;
            }[];
          };
        }>(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`);
        return match.info.participants.find((p) => p.puuid === puuid) ?? null;
      }),
    )
  ).filter((p) => p !== null);

  const ddVersion = versions[0];
  const championData = await riotFetch<{
    data: Record<string, { key: string; name: string; id: string }>;
  }>(
    `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/champion.json`,
  );
  const champById = new Map(
    Object.values(championData.data).map((c) => [c.key, c]),
  );

  const champIcon = (championId: number) => {
    const champ = champById.get(String(championId));
    return {
      name: champ?.name ?? `Champion ${championId}`,
      icon: champ
        ? `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${champ.id}.png`
        : "",
    };
  };

  let arena: ArenaStats | null = null;
  if (arenaParticipants.length > 0) {
    const games = arenaParticipants.length;
    const byChamp = arenaParticipants.reduce<Record<number, number>>(
      (acc, p) => ((acc[p.championId] = (acc[p.championId] ?? 0) + 1), acc),
      {},
    );
    arena = {
      games,
      firsts: arenaParticipants.filter((p) => p.placement === 1).length,
      top4: arenaParticipants.filter((p) => p.placement <= 4).length,
      avgPlacement:
        arenaParticipants.reduce((acc, p) => acc + p.placement, 0) / games,
      topChamps: Object.entries(byChamp)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([championId, count]) => ({
          ...champIcon(Number(championId)),
          games: count,
        })),
    };
  }

  return {
    summonerLevel: summoner.summonerLevel,
    arena,
    solo: entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null,
    flex: entries.find((e) => e.queueType === "RANKED_FLEX_SR") ?? null,
    topChamps: masteries.map((m) => ({
      ...champIcon(m.championId),
      level: m.championLevel,
      points: m.championPoints,
    })),
  };
};

export function getLeagueStats(): Promise<CachedResult<LeagueStats>> {
  if (!RIOT_API_KEY) {
    return Promise.resolve({ data: null, error: "Riot API key not configured" });
  }
  return cached("league-stats", ONE_HOUR, fetchLeagueStats);
}
