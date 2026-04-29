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
  spotifySearchQueries: string[];
};

function parseVibeJson(text: string): VibeResponse {
  const maybeJsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = maybeJsonMatch ? maybeJsonMatch[0] : text;
  const parsed = JSON.parse(jsonText);

  const rawMoodTags = Array.isArray(parsed.moodTags)
    ? parsed.moodTags.map(String)
    : [];
  const rawQueries = Array.isArray(parsed.spotifySearchQueries)
    ? parsed.spotifySearchQueries.map(String)
    : [];

  return {
    playlistTitle: String(parsed.playlistTitle ?? "Untitled Reading Mix"),
    readingVibe: String(parsed.readingVibe ?? "A focused reading mood."),
    moodTags: rawMoodTags.slice(0, 6),
    spotifySearchQueries: rawQueries.slice(0, 5),
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
      "- spotifySearchQueries should have exactly 5 useful search queries.",
      "",
      "Return ONLY valid JSON with this exact shape:",
      "{",
      '  "playlistTitle": "string",',
      '  "readingVibe": "string",',
      '  "moodTags": ["string", "string", "string", "string"],',
      '  "spotifySearchQueries": ["string", "string", "string", "string", "string"]',
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

    if (vibe.moodTags.length < 4 || vibe.spotifySearchQueries.length < 5) {
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
