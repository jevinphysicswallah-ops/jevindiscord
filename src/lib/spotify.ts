export function spotifyEmbedFromInput(input: string): { embed: string; canonical: string; label: string } | null {
  const value = input.trim();
  const match = value.match(/(?:open\.)?spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i);
  if (match) {
    const [, type, id] = match;
    return {
      embed: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      canonical: `https://open.spotify.com/${type}/${id}`,
      label: `Shared ${type}`,
    };
  }

  if (!value || value.length > 120) return null;
  return {
    embed: `https://open.spotify.com/embed/search/${encodeURIComponent(value)}?utm_source=generator&theme=0`,
    canonical: `https://open.spotify.com/search/${encodeURIComponent(value)}`,
    label: value,
  };
}

export function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
