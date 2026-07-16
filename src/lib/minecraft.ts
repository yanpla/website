import { MINECRAFT } from "@/consts";
import { cached, ONE_DAY, type CachedResult } from "@/lib/cache";
import { fetchJson } from "@/lib/fetch";

export interface MinecraftProfile {
  uuid: string;
  name: string;
  slimModel: boolean;
  hasCape: boolean;
}

// Mojang's public API needs no key
const fetchProfile = async (): Promise<MinecraftProfile> => {
  const { id, name } = await fetchJson<{ id: string; name: string }>(
    `https://api.mojang.com/users/profiles/minecraft/${MINECRAFT.username}`,
  );

  const session = await fetchJson<{
    properties: { name: string; value: string }[];
  }>(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`);

  // The base64 "textures" property holds skin model and cape info
  const texturesProp = session.properties.find((p) => p.name === "textures");
  const textures = texturesProp
    ? (JSON.parse(atob(texturesProp.value)) as {
        textures: {
          SKIN?: { metadata?: { model?: string } };
          CAPE?: { url: string };
        };
      }).textures
    : {};

  return {
    uuid: id,
    name,
    slimModel: textures.SKIN?.metadata?.model === "slim",
    hasCape: Boolean(textures.CAPE),
  };
};

export function getMinecraftProfile(): Promise<CachedResult<MinecraftProfile>> {
  // Profiles rarely change, so a day of staleness is fine
  return cached("minecraft-profile", ONE_DAY, fetchProfile);
}
