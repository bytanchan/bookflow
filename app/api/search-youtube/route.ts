import { NextResponse } from "next/server";

type SearchYouTubeRequest = {
  queries?: string[];
};

type YouTubeVideo = {
  searchQuery: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  youtubeUrl: string;
  embedUrl: string;
};

// One category label per query position — used to enforce diversity.
const CATEGORIES = ["ambient", "cinematic", "classical", "electronic", "experimental"];

// Words that signal an overused, repetitive result.
const PENALIZED_PATTERNS = ["cozy", "reading nook", "cafe ambience", "rain sounds", "lofi"];

// Words that signal a genuinely distinct, intentional result.
const PREFERRED_PATTERNS = ["instrumental", "soundtrack", "mix", "no vocals", "score"];

const MAX_QUERY_CHARS = 180;

function buildSearchUrl(query: string, apiKey: string): string {
  const trimmed = query.length > MAX_QUERY_CHARS
    ? `${query.slice(0, MAX_QUERY_CHARS)}…`
    : query;
  // Category hint is already in the query from the caller; keep bias tight.
  const q = `${trimmed} instrumental no vocals`.trim();
  const base =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5";
  const params = new URLSearchParams({ q, key: apiKey });
  return `${base}&${params.toString()}`;
}

function scoreTitle(title: string): number {
  const lower = title.toLowerCase();
  let score = 0;
  for (const pat of PENALIZED_PATTERNS) if (lower.includes(pat)) score -= 2;
  for (const pat of PREFERRED_PATTERNS) if (lower.includes(pat)) score += 1;
  return score;
}

// Normalise a title to a short key for near-duplicate detection.
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

type YouTubeApiPayload = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
  error?: { message?: string; code?: number };
};

type Candidate = YouTubeVideo & { score: number };

async function fetchCandidates(
  searchQuery: string,
  apiKey: string
): Promise<{ candidates: Candidate[]; errorMessage: string }> {
  const url = buildSearchUrl(searchQuery, apiKey);
  let data: YouTubeApiPayload;
  let response: Response;

  try {
    response = await fetch(url, { cache: "no-store" });
    data = (await response.json()) as YouTubeApiPayload;
  } catch {
    return { candidates: [], errorMessage: "Invalid response from YouTube." };
  }

  const apiError = data.error?.message;
  if (!response.ok || apiError) {
    return {
      candidates: [],
      errorMessage: apiError || `YouTube returned ${response.status}. Check API key and quota.`,
    };
  }

  const candidates: Candidate[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId;
    const snippet = item.snippet;
    if (!videoId || !snippet) continue;

    const title = snippet.title ?? "";
    const thumb =
      snippet.thumbnails?.high?.url ??
      snippet.thumbnails?.medium?.url ??
      snippet.thumbnails?.default?.url ??
      "";

    candidates.push({
      searchQuery,
      videoId,
      title,
      channelTitle: snippet.channelTitle ?? "",
      thumbnail: thumb,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      score: scoreTitle(title),
    });
  }

  // Best score first within this query's batch.
  candidates.sort((a, b) => b.score - a.score);
  return { candidates, errorMessage: "" };
}

export async function POST(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing YOUTUBE_API_KEY." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as SearchYouTubeRequest;
    const rawQueries = Array.isArray(body.queries) ? body.queries : [];
    const queries = rawQueries.map((q) => String(q).trim()).filter((q) => q.length > 0);

    if (queries.length === 0) {
      return NextResponse.json({ error: "Send at least one search query." }, { status: 400 });
    }

    // Fetch up to 5 candidates per query in parallel.
    const perQuery = await Promise.all(
      queries.map((q) => fetchCandidates(q, apiKey!))
    );

    // Pick one winner per category, enforcing global deduplication.
    const seenVideoIds = new Set<string>();
    const seenTitleKeys = new Set<string>();
    const videos: YouTubeVideo[] = [];
    let lastErrorMessage = "";

    for (let i = 0; i < perQuery.length; i++) {
      const { candidates, errorMessage } = perQuery[i];
      const category = CATEGORIES[i] ?? `query-${i}`;

      if (errorMessage) lastErrorMessage = errorMessage;

      let picked: YouTubeVideo | null = null;

      for (const candidate of candidates) {
        if (seenVideoIds.has(candidate.videoId)) continue;
        const tKey = titleKey(candidate.title);
        if (seenTitleKeys.has(tKey)) continue;

        // Accept the highest-scoring non-duplicate for this category.
        seenVideoIds.add(candidate.videoId);
        seenTitleKeys.add(tKey);
        const { score: _score, ...video } = candidate;
        // Label the query with its category so the UI can show context.
        picked = { ...video, searchQuery: `${category}: ${video.searchQuery}` };
        break;
      }

      // Always push a slot (empty videoId = "no result for this category").
      videos.push(
        picked ?? {
          searchQuery: `${category}: ${queries[i]}`,
          videoId: "",
          title: "",
          channelTitle: "",
          thumbnail: "",
          youtubeUrl: "",
          embedUrl: "",
        }
      );
    }

    const anyVideo = videos.some((v) => v.videoId.length > 0);
    const payload: { videos: YouTubeVideo[]; error?: string } = { videos };

    if (!anyVideo && queries.length > 0) {
      payload.error =
        lastErrorMessage ||
        "YouTube did not return any videos. Confirm YOUTUBE_API_KEY, enable YouTube Data API v3, and check quota.";
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Could not search YouTube right now." },
      { status: 500 }
    );
  }
}
