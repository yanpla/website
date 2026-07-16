import { DISCORD } from "@/consts";
import { fetchJson } from "@/lib/fetch";

export type DiscordStatus =
  | "online"
  | "idle"
  | "dnd"
  | "offline"
  | "streaming";

export interface DiscordPresence {
  status: DiscordStatus;
  /** Name of the current "Playing …" activity, if any. */
  playing: string | null;
}

interface LanyardResponse {
  data?: {
    discord_status?: DiscordStatus;
    activities?: { type: number; name: string }[];
  };
}

/**
 * Live Discord presence via the public Lanyard API. Deliberately uncached:
 * it's a single fast request and staleness defeats the point of a status dot.
 */
export async function getDiscordPresence(): Promise<DiscordPresence> {
  try {
    const { data } = await fetchJson<LanyardResponse>(
      `https://api.lanyard.rest/v1/users/${DISCORD.userId}`,
    );
    return {
      status: data?.discord_status ?? "offline",
      playing: data?.activities?.find((a) => a.type === 0)?.name ?? null,
    };
  } catch {
    return { status: "offline", playing: null };
  }
}
