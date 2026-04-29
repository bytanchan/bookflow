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

// Bias YouTube toward reading-friendly, low-vocal results.
const READING_SOUNDTRACK_BIAS =
  "instrumental ambient reading study soundtrack no vocals";

// Keep q short so the request URL stays under common limits (very long GPT queries can 400).
const MAX_QUERY_CHARS = 180;

function buildSearchUrl(query: string, apiKey: string): string {
  const trimmed = query.length > MAX_QUERY_CHARS
    ? `${query.slice(0, MAX_QUERY_CHARS)}…`
    : query;
  const q = `${trimmed} ${READING_SOUNDTRACK_BIAS}`.trim();
  const base =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1";
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

    const videos: YouTubeVideo[] = [];
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

      const item = data?.items?.[0];
      const videoId = item?.id?.videoId as string | undefined;
      const snippet = item?.snippet;

      if (!videoId || !snippet) {
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

      const thumb =
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        snippet.thumbnails?.default?.url ??
        "";

      videos.push({
        searchQuery,
        videoId,
        title: snippet.title ?? "",
        channelTitle: snippet.channelTitle ?? "",
        thumbnail: thumb,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
      });
    }

    const anyVideo = videos.some((v) => v.videoId.length > 0);
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
