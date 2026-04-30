"use client";

import { useState } from "react";

type Book = {
  title: string;
  authorName: string;
  firstPublishedYear?: number;
  coverId?: number;
  subjects?: string[];
};

type BookVibe = {
  playlistTitle: string;
  readingVibe: string;
  moodTags: string[];
  youtubeSearchQueries: string[];
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
};

const GENERATION_STEPS = [
  { key: "findingBook", label: "Finding your book..." },
  { key: "generatingVibe", label: "Generating your reading vibe..." },
  { key: "curatingSoundtrack", label: "Curating your soundtrack..." },
] as const;

type GenerationStage = "idle" | (typeof GENERATION_STEPS)[number]["key"];
type LoadingStepStatus = "pending" | "loading" | "done";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [statusText, setStatusText] = useState("");
  const [bookResult, setBookResult] = useState<Book | null>(null);
  const [vibeResult, setVibeResult] = useState<BookVibe | null>(null);
  const [generationStage, setGenerationStage] =
    useState<GenerationStage>("idle");
  const [vibeError, setVibeError] = useState("");
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [youtubeError, setYoutubeError] = useState("");
  const isGenerating = generationStage !== "idle";
  const activeStepIndex = GENERATION_STEPS.findIndex(
    (step) => step.key === generationStage
  );

  const getLoadingStepStatus = (stepIndex: number): LoadingStepStatus => {
    if (!isGenerating || activeStepIndex === -1) {
      return "pending";
    }

    if (stepIndex < activeStepIndex) {
      return "done";
    }

    if (stepIndex === activeStepIndex) {
      return "loading";
    }

    return "pending";
  };

  const handleGenerate = async () => {
    const bookTitle = prompt.trim();

    if (!bookTitle) {
      setGenerationStage("idle");
      setBookResult(null);
      setVibeResult(null);
      setVibeError("");
      setYoutubeVideos([]);
      setYoutubeError("");
      setStatusText("We couldn’t find that book—try another title.");
      return;
    }
    setGenerationStage("findingBook");
    setStatusText("");
    setBookResult(null);
    setVibeResult(null);
    setVibeError("");
    setYoutubeVideos([]);
    setYoutubeError("");

    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(bookTitle)}`
      );

      if (!response.ok) {
        throw new Error("Open Library request failed");
      }

      const data = await response.json();
      const firstResult = data?.docs?.[0];

      if (!firstResult) {
        setStatusText("We couldn’t find that book—try another title.");
        return;
      }

      const selectedBook: Book = {
        title: firstResult.title ?? "Untitled",
        authorName: firstResult.author_name?.[0] ?? "Unknown author",
        firstPublishedYear: firstResult.first_publish_year,
        coverId: firstResult.cover_i,
        subjects: Array.isArray(firstResult.subject)
          ? firstResult.subject.slice(0, 8)
          : [],
      };

      setBookResult(selectedBook);
      setGenerationStage("generatingVibe");
      try {
        const vibeResponse = await fetch("/api/generate-vibe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: selectedBook.title,
            author: selectedBook.authorName,
            firstPublishYear: selectedBook.firstPublishedYear,
            subjects: selectedBook.subjects,
          }),
        });

        if (!vibeResponse.ok) {
          throw new Error("Vibe API request failed");
        }

        const vibeData = await vibeResponse.json();
        const rawQueries = Array.isArray(vibeData.youtubeSearchQueries)
          ? vibeData.youtubeSearchQueries
          : Array.isArray(vibeData.spotifySearchQueries)
          ? vibeData.spotifySearchQueries
          : [];
        let musicQueries = rawQueries
          .map((q: unknown) => String(q).trim())
          .filter((q: string) => q.length > 0);

        // If the model omits queries, still run YouTube using the book we found.
        if (musicQueries.length === 0) {
          musicQueries = [
            `${selectedBook.title} instrumental reading soundtrack`,
            `${selectedBook.title} ambient study music`,
            `${selectedBook.title} cinematic score focus mix`,
            `${selectedBook.authorName} no vocals reading music`,
            `music for when you are reading ${selectedBook.title}`,
            `reading in a quiet library while rain falls ${selectedBook.title}`,
            `${selectedBook.title} character energy forces you to lock in`,
            `${selectedBook.title} world ambience playlist`,
          ];
        }

        setVibeResult({
          playlistTitle: vibeData.playlistTitle ?? "Untitled Reading Mix",
          readingVibe: vibeData.readingVibe ?? "A focused reading vibe.",
          moodTags: Array.isArray(vibeData.moodTags) ? vibeData.moodTags : [],
          youtubeSearchQueries: musicQueries,
        });
        setGenerationStage("curatingSoundtrack");
        setYoutubeError("");
        setYoutubeVideos([]);
        try {
          const youtubeResponse = await fetch("/api/search-youtube", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ queries: musicQueries }),
          });

          let youtubeData: { videos?: YouTubeVideo[]; error?: string } = {};
          try {
            youtubeData = await youtubeResponse.json();
          } catch {
            setYoutubeError("Something went wrong. Try again.");
            return;
          }

          if (!youtubeResponse.ok) {
            setYoutubeError(
              typeof youtubeData.error === "string"
                ? youtubeData.error
                : "Something went wrong. Try again."
            );
            setYoutubeVideos([]);
            return;
          }

          const videos = Array.isArray(youtubeData.videos)
            ? youtubeData.videos
            : [];
          setYoutubeVideos(videos);

          if (typeof youtubeData.error === "string" && youtubeData.error) {
            setYoutubeError(youtubeData.error);
          }
        } catch {
          setYoutubeError("Something went wrong. Try again.");
        }
      } catch {
        setVibeError("Something went wrong. Try again.");
      }
    } catch {
      setBookResult(null);
      setVibeResult(null);
      setVibeError("");
      setYoutubeVideos([]);
      setYoutubeError("");
      setStatusText("Something went wrong. Try again.");
    } finally {
      setGenerationStage("idle");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f3ef] px-6 py-10 text-zinc-900 md:px-10">
      <main className="mx-auto w-full max-w-6xl">
        <p className="mb-3 inline-flex rounded-full border border-zinc-900 bg-yellow-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          BookFlow
        </p>
        <p className="mb-8 max-w-2xl text-lg text-zinc-700">
          Instrumental soundtracks tuned to the book in your hands—quiet enough
          to read, bold enough to feel.
        </p>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-zinc-900 bg-[#f8f8f8] p-4 shadow-[3px_3px_0_0_#111]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide">
                Start here
              </p>
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                <span className="h-2 w-2 rounded-full bg-green-400" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold leading-snug text-zinc-900 md:text-3xl">
              Turn any book into a reading soundtrack
            </h2>
            <p className="mt-2 text-sm text-zinc-600 md:text-base">
              Enter a book and get a focus-friendly, instrumental soundtrack
              tailored to its mood.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              placeholder="Search for a book (e.g. The Secret History)"
              className="mt-4 h-40 w-full resize-none border-0 bg-transparent text-2xl font-serif italic text-zinc-900 outline-none placeholder:text-zinc-500 md:h-48 md:text-3xl"
            />
            <div className="mt-4 flex items-center justify-between border-t border-dashed border-zinc-300 pt-4">
              <span className="text-xs text-zinc-500">
                {prompt.length} / 500 characters
              </span>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="rounded-full border border-zinc-900 bg-yellow-400 px-5 py-2 text-sm font-semibold shadow-[2px_2px_0_0_#111] transition hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#111] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_0_#111]"
              >
                Generate soundtrack
              </button>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-zinc-900 bg-zinc-950 p-4 text-zinc-100 shadow-[3px_3px_0_0_#f1cc32]">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-200">
              Your soundtrack
            </p>
            {isGenerating ? (
              <div className="flex min-h-56 flex-col justify-center">
                <p className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
                  We&apos;re building your soundtrack
                </p>
                <ul className="space-y-2.5">
                  {GENERATION_STEPS.map((step, index) => {
                    const stepStatus = getLoadingStepStatus(index);

                    return (
                      <li
                        key={step.key}
                        className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                              stepStatus === "done"
                                ? "border-green-300/60 bg-green-300/15 text-green-200"
                                : stepStatus === "loading"
                                ? "border-yellow-200/50 bg-yellow-200/10"
                                : "border-zinc-700 bg-zinc-900"
                            }`}
                          >
                            {stepStatus === "done" ? (
                              "✓"
                            ) : stepStatus === "loading" ? (
                              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-zinc-600" />
                            )}
                          </span>
                          <span
                            className={`text-sm ${
                              stepStatus === "pending"
                                ? "text-zinc-500"
                                : "text-zinc-200"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        {stepStatus === "loading" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-yellow-200">
                            <span className="h-3 w-3 animate-spin rounded-full border border-yellow-200/30 border-t-yellow-200" />
                            Loading
                          </span>
                        ) : stepStatus === "done" ? (
                          <span className="text-xs text-green-200">Done</span>
                        ) : (
                          <span className="text-xs text-zinc-500">Queued</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : bookResult ? (
              <div className="space-y-3 text-zinc-200">
                {bookResult.coverId ? (
                  <img
                    src={`https://covers.openlibrary.org/b/id/${bookResult.coverId}-L.jpg`}
                    alt={`Cover of ${bookResult.title}`}
                    className="h-44 w-32 rounded-md border border-zinc-700 object-cover"
                  />
                ) : null}
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {bookResult.title}
                  </h2>
                  <p className="text-zinc-300">{bookResult.authorName}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    First published{" "}
                    {bookResult.firstPublishedYear ?? "—"}
                  </p>
                </div>

                <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    From the book’s mood
                  </p>
                  {vibeError ? (
                    <p className="text-sm text-red-300">{vibeError}</p>
                  ) : vibeResult ? (
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Playlist title
                        </p>
                        <p className="text-base font-medium text-white">
                          {vibeResult.playlistTitle}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Reading vibe
                        </p>
                        <p className="text-zinc-300">{vibeResult.readingVibe}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Mood tags
                        </p>
                        <p className="text-zinc-300">
                          {vibeResult.moodTags.join(" · ")}
                        </p>
                      </div>

                      <div className="mt-4 border-t border-zinc-700 pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          Tracks
                        </p>
                        {youtubeError ? (
                          <p className="text-sm text-red-300">{youtubeError}</p>
                        ) : youtubeVideos.length > 0 ? (
                          <ul className="space-y-4">
                            {youtubeVideos.map((video, index) => (
                              <li
                                key={`${video.searchQuery}-${index}`}
                                className="rounded-md border border-zinc-700 bg-zinc-950 p-3"
                              >
                                {!video.videoId ? (
                                  <p className="text-sm text-zinc-400">
                                    No track turned up for this pick—skip ahead
                                    or try another book.
                                  </p>
                                ) : (
                                  <>
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                      {video.thumbnail ? (
                                        <img
                                          src={video.thumbnail}
                                          alt=""
                                          className="h-24 w-40 shrink-0 rounded object-cover"
                                        />
                                      ) : null}
                                      <div className="min-w-0 flex-1">
                                        <p className="mb-1 inline-flex rounded-full border border-zinc-600 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                                          {video.categoryLabel}
                                        </p>
                                        <p className="font-semibold text-white">
                                          {video.title}
                                        </p>
                                        <p className="text-sm text-zinc-400">
                                          {video.channelTitle}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <a
                                            href={video.youtubeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex rounded-full border border-zinc-600 bg-yellow-400 px-4 py-1.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-yellow-300"
                                          >
                                            Play
                                          </a>
                                          <a
                                            href={video.youtubeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-yellow-300 underline decoration-yellow-300/50 underline-offset-2 hover:decoration-yellow-300"
                                          >
                                            Open on YouTube
                                          </a>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-3 overflow-hidden rounded-md">
                                      <iframe
                                        src={video.embedUrl}
                                        title={video.title}
                                        className="aspect-video w-full max-w-xl"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                      />
                                    </div>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-zinc-400">
                            We couldn&apos;t find tracks this round—try
                            generating again.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">
                      Generate a soundtrack to see your vibe.
                    </p>
                  )}
                </div>
              </div>
            ) : statusText ? (
              <div className="flex min-h-56 flex-col justify-center">
                <p className="text-lg text-zinc-300">{statusText}</p>
              </div>
            ) : (
              <div className="flex min-h-56 flex-col justify-center gap-2">
                <h2 className="text-2xl font-semibold text-white md:text-3xl">
                  Your reading soundtrack will appear here
                </h2>
                <p className="text-base leading-relaxed text-zinc-400">
                  We&apos;ll match your book with a mood and generate a playlist
                  you can play instantly.
                </p>
              </div>
            )}
            <p className="mt-4 text-xs text-zinc-500">
              Drop in a title—BookFlow handles the rest.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-8 border-t border-zinc-300 pt-7 text-zinc-700 md:grid-cols-3">
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">01.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">
              Name the book
            </h3>
            <p>
              Tell us what you&apos;re reading. We look up the real title and
              details so the vibe fits the page, not a guess.
            </p>
          </article>
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">02.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">
              Shape the mood
            </h3>
            <p>
              BookFlow reads the tone—then sketches a playlist name, a short
              vibe story, and tags you can feel in one glance.
            </p>
          </article>
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">03.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">
              Hit play, keep reading
            </h3>
            <p>
              You get instrumental-friendly picks you can play right here—less
              distraction, more flow.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
