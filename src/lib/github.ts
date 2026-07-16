import { GITHUB_TOKEN } from "astro:env/server";

import { GITHUB } from "@/consts";
import { cached, ONE_DAY, ONE_HOUR, type CachedResult } from "@/lib/cache";
import { fetchJson } from "@/lib/fetch";

export interface GithubProfileStats {
  repoCount: number;
  totalCommits: number;
}

export interface Language {
  name: string;
  color: string;
  size: number;
}

interface Repo {
  name: string;
  fork: boolean;
  size: number;
  languages_url: string;
}

const { username } = GITHUB;

const ghHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": username,
  Authorization: `Bearer ${GITHUB_TOKEN}`,
};

const ghJson = <T,>(url: string) => fetchJson<T>(url, { headers: ghHeaders });

export function getGithubProfileStats(): Promise<
  CachedResult<GithubProfileStats>
> {
  return cached("github-profile", ONE_HOUR, async () => {
    const [user, commits] = await Promise.all([
      ghJson<{ public_repos: number }>(
        `https://api.github.com/users/${username}`,
      ),
      ghJson<{ total_count: number }>(
        `https://api.github.com/search/commits?q=author:${username}`,
      ),
    ]);
    return {
      repoCount: user.public_repos || 0,
      totalCommits: commits.total_count || 0,
    };
  });
}

const fetchTopLanguages = async (): Promise<Language[]> => {
  // Colors come from GitHub's public linguist data
  const colorsResponse = await fetch(
    "https://raw.githubusercontent.com/IonicaBizau/github-colors/refs/heads/master/lib/colors.json",
  );
  const colors: Record<string, { color: string | null }> = colorsResponse.ok
    ? await colorsResponse.json()
    : {};

  const repos = (
    await ghJson<Repo[]>(
      `https://api.github.com/users/${username}/repos?per_page=100&type=owner`,
    )
  ).filter(
    (repo) => !repo.fork && !GITHUB.excludedRepos.includes(repo.name),
  );

  // Discover external repos (other users/orgs) via the public commit search,
  // collecting our commit SHAs per repo (date-ordered so sampling spans time)
  interface CommitSearchItem {
    sha: string;
    repository: { full_name: string; fork: boolean };
  }
  const externalShas: Record<string, string[]> = {};
  for (let page = 1; page <= 10; page++) {
    let items: CommitSearchItem[];
    try {
      ({ items } = await ghJson<{ items: CommitSearchItem[] }>(
        `https://api.github.com/search/commits?q=author:${username}+-user:${username}&sort=committer-date&order=asc&per_page=100&page=${page}`,
      ));
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    for (const item of items) {
      if (item.repository.fork) continue;
      (externalShas[item.repository.full_name] ??= []).push(item.sha);
    }
    if (items.length < 100) break;
  }

  // Total commit count of a repo, read from the Link header's last page
  const fetchTotalCommits = async (fullName: string) => {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/commits?per_page=1`,
      { headers: ghHeaders },
    );
    if (!res.ok) return null;
    const last = res.headers.get("link")?.match(/&page=(\d+)>; rel="last"/);
    return last ? parseInt(last[1], 10) : 1;
  };

  // Map changed-file extensions to languages so external contributions
  // reflect what we actually wrote there, not the repo's current makeup
  // (e.g. commits to a codebase that was later rewritten in another language)
  const extToLang: Record<string, string> = {
    rs: "Rust", svelte: "Svelte", vue: "Vue", ts: "TypeScript", tsx: "TypeScript",
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cs: "C#", py: "Python",
    go: "Go", java: "Java", kt: "Kotlin", nix: "Nix", astro: "Astro",
    css: "CSS", scss: "SCSS", html: "HTML", sh: "Shell", bash: "Shell",
    c: "C", h: "C", cpp: "C++", hpp: "C++", rb: "Ruby", php: "PHP",
    lua: "Lua", swift: "Swift", zig: "Zig", dart: "Dart", ex: "Elixir",
  };
  const skipFile =
    /(^|\/)(package-lock\.json|bun\.lockb?|Cargo\.lock|yarn\.lock|pnpm-lock\.yaml|flake\.lock)$/;

  // Tally lines added per language across all our commits in a repo, giving
  // our historical language mix there. Commit search already caps discovery
  // at 1000 SHAs, so fetching every one costs at most ~1050 requests/hour of
  // the 5000/hour limit. Batched to stay under GitHub's secondary limits
  // (max ~100 concurrent requests).
  const sampleLanguageMix = async (fullName: string, shas: string[]) => {
    const BATCH_SIZE = 50;
    const mix: Record<string, number> = {};
    for (let i = 0; i < shas.length; i += BATCH_SIZE) {
      await Promise.all(
        shas.slice(i, i + BATCH_SIZE).map(async (sha) => {
          const res = await fetch(
            `https://api.github.com/repos/${fullName}/commits/${sha}`,
            { headers: ghHeaders },
          );
          if (!res.ok) return;
          const { files } = (await res.json()) as {
            files?: { filename: string; additions: number }[];
          };
          for (const file of files ?? []) {
            if (skipFile.test(file.filename)) continue;
            const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
            const lang = extToLang[ext];
            if (lang) mix[lang] = (mix[lang] ?? 0) + file.additions;
          }
        }),
      );
    }
    return mix;
  };

  const [ownedLangs, externalLangs] = await Promise.all([
    Promise.all(
      repos.map((repo) => ghJson<Record<string, number>>(repo.languages_url)),
    ),
    Promise.all(
      Object.entries(externalShas).map(async ([fullName, shas]) => {
        const [langs, total, mix] = await Promise.all([
          ghJson<Record<string, number>>(
            `https://api.github.com/repos/${fullName}/languages`,
          ),
          fetchTotalCommits(fullName),
          sampleLanguageMix(fullName, shas),
        ]);
        // Scale the repo's bytes by our share of its commits so one small
        // contribution to a huge repo doesn't swamp the chart...
        const share = total ? Math.min(1, shas.length / total) : 0;
        const budget = share * Object.values(langs).reduce((a, b) => a + b, 0);
        // ...then split those bytes by our sampled historical language mix,
        // falling back to the repo's current mix if sampling found nothing
        const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0);
        const distribution = mixTotal > 0 ? mix : langs;
        const distTotal = mixTotal > 0 ? mixTotal : budget / (share || 1);
        if (!distTotal) return {};
        return Object.fromEntries(
          Object.entries(distribution).map(([name, size]) => [
            name,
            (size / distTotal) * budget,
          ]),
        );
      }),
    ),
  ]);

  const langMap = [...ownedLangs, ...externalLangs].reduce<
    Record<string, Language>
  >((acc, langs) => {
    for (const [name, size] of Object.entries(langs)) {
      acc[name] ??= { name, color: colors[name]?.color ?? "#8b8b8b", size: 0 };
      acc[name].size += size;
    }
    return acc;
  }, {});

  return Object.values(langMap)
    .sort((a, b) => b.size - a.size)
    .slice(0, 9);
};

export function getTopLanguages(): Promise<CachedResult<Language[]>> {
  if (!GITHUB_TOKEN) {
    return Promise.resolve({ data: null, error: "GitHub token not configured" });
  }
  // Stale-while-revalidate: the full sweep is expensive (up to ~1k requests),
  // so always serve the cached chart immediately and refresh in the background
  return cached("github-top-languages", ONE_DAY, fetchTopLanguages, {
    staleWhileRevalidate: true,
  });
}
