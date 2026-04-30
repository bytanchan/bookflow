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
  categoryLabel:
    | "Functional Focus"
    | "Cinematic Score"
    | "Vibe Playlist"
    | "Ambient World"
    | "Unexpected Pick";
  score: number;
};

// Bias YouTube toward reading-friendly, low-vocal results.
const READING_SOUNDTRACK_BIAS =
  "instrumental ambient reading study soundtrack no vocals";

// Keep q short so the request URL stays under common limits (very long GPT queries can 400).
const MAX_QUERY_CHARS = 180;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_RETURNED_RESULTS = 5;

const POSITIVE_KEYWORDS = [
  "playlist",
  "mix",
  "ambience",
  "ambient",
  "oldies",
  "vintage",
  "soundtrack",
  "score",
  "study",
  "reading",
  "focus",
  "no vocals",
  "instrumental",
  "philosophy",
  "baroque",
  "jazz",
  "house",
  "electronic",
  "classical",
  "night",
  "rain",
  "room",
  "world",
  "lock in",
  "deep",
];

const SCENARIO_PATTERNS = [
  "music for when",
  "you are",
  "reading in",
  "studying like",
  "meditating like",
  "walking through",
  "in another room",
  "forces you to lock in",
];

const BLOCKED_KEYWORDS = [
  "lyrics",
  "lyric",
  "official music video",
  "karaoke",
  "reaction",
  "interview",
  "podcast",
  "trailer",
];

function buildSearchUrl(query: string, apiKey: string): string {
  const trimmed = query.length > MAX_QUERY_CHARS
    ? `${query.slice(0, MAX_QUERY_CHARS)}…`
    : query;
  const q = `${trimmed} ${READING_SOUNDTRACK_BIAS}`.trim();
  const base =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${MAX_RESULTS_PER_QUERY}`;
  const params = new URLSearchParams({
    q,
    key: apiKey,
  });
  return `${base}&${params.toString()}`;
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

function isLowercaseTitle(title: string): boolean {
  const lettersOnly = title.replace(/[^a-zA-Z]/g, "");
  return lettersOnly.length > 0 && lettersOnly === lettersOnly.toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((word) => text.includes(word));
}

function pickCategory(lowerTitle: string): YouTubeVideo["categoryLabel"] {
  if (containsAny(lowerTitle, ["playlist", "music for when", "forces you to lock in"])) {
    return "Vibe Playlist";
  }
  if (containsAny(lowerTitle, ["soundtrack", "score", "cinematic", "baroque", "classical"])) {
    return "Cinematic Score";
  }
  if (containsAny(lowerTitle, ["ambient", "ambience", "rain", "room", "night", "world"])) {
    return "Ambient World";
  }
  if (containsAny(lowerTitle, ["focus", "study", "reading", "no vocals", "instrumental"])) {
    return "Functional Focus";
  }
  return "Unexpected Pick";
}

function scoreVideo(title: string): number {
  const lowerTitle = title.toLowerCase();
  let score = 0;

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lowerTitle.includes(keyword)) {
      score += 3;
    }
  }

  for (const pattern of SCENARIO_PATTERNS) {
    if (lowerTitle.includes(pattern)) {
      score += 5;
    }
  }

  if (isLowercaseTitle(title)) {
    score += 3;
  }

  return score;
}

export async function POST(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing YOUTUBE_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as SearchYouTubeRequest;
    const rawQueries = Array.isArray(body.queries) ? body.queries : [];
    const queries = rawQueries
      .map((q) => String(q).trim())
      .filter((q) => q.length > 0);

    if (queries.length === 0) {
      return NextResponse.json(
        { error: "Send at least one search query." },
        { status: 400 }
      );
    }

    const candidates: YouTubeVideo[] = [];
    let lastYouTubeMessage = "";

    for (const searchQuery of queries) {
      const url = buildSearchUrl(searchQuery, apiKey);
      const response = await fetch(url, { cache: "no-store" });

      let data: YouTubeApiPayload;
      try {
        data = (await response.json()) as YouTubeApiPayload;
      } catch {
        lastYouTubeMessage = "Invalid response from YouTube.";
        videos.push({
          searchQuery,
          videoId: "",
          title: "",
          channelTitle: "",
          thumbnail: "",
          youtubeUrl: "",
          embedUrl: "",
        });
        continue;
      }

      const apiError = data.error?.message;
      if (!response.ok || apiError) {
        lastYouTubeMessage =
          apiError ||
          `YouTube returned ${response.status}. Check API key and quota.`;
        videos.push({
          searchQuery,
          videoId: "",
          title: "",
          channelTitle: "",
          thumbnail: "",
          youtubeUrl: "",
          embedUrl: "",
        });
        continue;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const videoId = item?.id?.videoId;
        const snippet = item?.snippet;
        const title = snippet?.title ?? "";
        const lowerTitle = title.toLowerCase();

        if (!videoId || !snippet || !title) {
          continue;
        }

        if (containsAny(lowerTitle, BLOCKED_KEYWORDS)) {
          continue;
        }

        const thumb =
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url ??
          "";

        const score = scoreVideo(title);
        candidates.push({
          searchQuery,
          videoId,
          title,
          channelTitle: snippet.channelTitle ?? "",
          thumbnail: thumb,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          categoryLabel: pickCategory(lowerTitle),
          score,
        });
      }
    }

    const uniqueById = new Map<string, YouTubeVideo>();
    for (const video of candidates) {
      const existing = uniqueById.get(video.videoId);
      if (!existing || video.score > existing.score) {
        uniqueById.set(video.videoId, video);
      }
    }

    const videos = Array.from(uniqueById.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RETURNED_RESULTS)
      .map(({ score, ...rest }) => ({ ...rest, score }));

    const anyVideo = videos.length > 0;
    const payload: {
      videos: YouTubeVideo[];
      error?: string;
    } = { videos };

    if (!anyVideo && queries.length > 0) {
      payload.error =
        lastYouTubeMessage ||
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
