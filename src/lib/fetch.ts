/** Fetch a JSON resource, throwing on any non-2xx response. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return (await res.json()) as T;
}
