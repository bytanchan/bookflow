import { NextResponse } from "next/server";

type GenerateVibeRequest = {
  title?: string;
  author?: string;
  firstPublishYear?: number;
  subjects?: string[];
};

type VibeResponse = {
  playlistTitle: string;
  readingVibe: string;
  moodTags: string[];
  youtubeSearchQueries: string[];
};

function parseVibeJson(text: string): VibeResponse {
  const maybeJsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = maybeJsonMatch ? maybeJsonMatch[0] : text;
  const parsed = JSON.parse(jsonText);

  const rawMoodTags = Array.isArray(parsed.moodTags)
    ? parsed.moodTags.map(String)
    : [];
  const rawQueries = Array.isArray(parsed.youtubeSearchQueries)
    ? parsed.youtubeSearchQueries.map(String)
    : Array.isArray(parsed.spotifySearchQueries)
    ? parsed.spotifySearchQueries.map(String)
    : [];

  return {
    playlistTitle: String(parsed.playlistTitle ?? "Untitled Reading Mix"),
    readingVibe: String(parsed.readingVibe ?? "A focused reading mood."),
    moodTags: rawMoodTags.slice(0, 6),
    youtubeSearchQueries: rawQueries.slice(0, 8),
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as GenerateVibeRequest;
    const title = body.title?.trim();
    const author = body.author?.trim() || "Unknown author";
    const firstPublishYear = body.firstPublishYear;
    const subjects = Array.isArray(body.subjects) ? body.subjects.slice(0, 8) : [];

    if (!title) {
      return NextResponse.json(
        { error: "Book title is required." },
        { status: 400 }
      );
    }

    const prompt = [
      "Generate a reading-focused instrumental playlist vibe for this book.",
      "",
      `Title: ${title}`,
      `Author: ${author}`,
      `First publish year: ${firstPublishYear ?? "Unknown"}`,
      `Subjects: ${subjects.length > 0 ? subjects.join(", ") : "Not available"}`,
      "",
      "Rules:",
      "- Playlist should be instrumental or no-vocals.",
      "- Avoid lyrical pop.",
      "- Optimize for focus while reading.",
      "- Make the vibe specific to this book.",
      "- Keep it slightly fun and memorable.",
      "- moodTags should have 4 to 6 short tags.",
      "- youtubeSearchQueries should have exactly 8 search queries total.",
      "- The first 4 queries are functional queries for reading focus.",
      "- The last 4 queries are vibe-native YouTube-style queries.",
      "- Keep results reading-friendly, and favor ambient, soundtrack, vintage, classical, jazz, house, electronic, or no-vocal mixes.",
      "- Do not require every query to include the word instrumental.",
      "- Make vibe-native queries poetic/scenario-based when it fits the book.",
      "- Avoid meme, reaction, lyric, interview, podcast, and trailer styles.",
      "",
      "Functional query examples:",
      "- instrumental reading music",
      "- ambient soundtrack no vocals",
      "- cinematic focus mix",
      "",
      "Vibe-native query examples:",
      "- [book mood] playlist",
      "- [specific scene from the book] ambience playlist",
      "- [character energy] forces you to lock in",
      "- music for when [emotional situation]",
      "- reading in [setting] while [atmospheric detail]",
      "",
      "Return ONLY valid JSON with this exact shape:",
      "{",
      '  "playlistTitle": "string",',
      '  "readingVibe": "string",',
      '  "moodTags": ["string", "string", "string", "string"],',
      '  "youtubeSearchQueries": [',
      '    "functional query 1",',
      '    "functional query 2",',
      '    "functional query 3",',
      '    "functional query 4",',
      '    "vibe-native query 1",',
      '    "vibe-native query 2",',
      '    "vibe-native query 3",',
      '    "vibe-native query 4"',
      "  ]",
      "}",
    ].join("\n");

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You create focused, instrumental reading playlist vibes and return strict JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      throw new Error("Failed to generate vibe from OpenAI.");
    }

    const data = await openAiResponse.json();
    const rawText = data?.choices?.[0]?.message?.content ?? "";
    const vibe = parseVibeJson(rawText);

    if (vibe.moodTags.length < 4 || vibe.youtubeSearchQueries.length < 8) {
      throw new Error("OpenAI response did not include enough items.");
    }

    return NextResponse.json(vibe);
  } catch {
    return NextResponse.json(
      { error: "Could not generate vibe right now." },
      { status: 500 }
    );
  }
}
