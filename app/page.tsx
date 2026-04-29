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
  spotifySearchQueries: string[];
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

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [statusText, setStatusText] = useState("Your answer will land here.");
  const [bookResult, setBookResult] = useState<Book | null>(null);
  const [vibeResult, setVibeResult] = useState<BookVibe | null>(null);
  const [isGeneratingVibe, setIsGeneratingVibe] = useState(false);
  const [vibeError, setVibeError] = useState("");
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [isLoadingYoutube, setIsLoadingYoutube] = useState(false);
  const [youtubeError, setYoutubeError] = useState("");

  const handleGenerate = async () => {
    const bookTitle = prompt.trim();

    if (!bookTitle) {
      setBookResult(null);
      setVibeResult(null);
      setVibeError("");
      setYoutubeVideos([]);
      setYoutubeError("");
      setStatusText("No book found. Try another title.");
      return;
    }

    setStatusText("Searching books...");
    setBookResult(null);
    setVibeResult(null);
    setVibeError("");
    setYoutubeVideos([]);
    setYoutubeError("");
    setIsGeneratingVibe(false);
    setIsLoadingYoutube(false);

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
        setStatusText("No book found. Try another title.");
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
      setStatusText("");

      // After we have a book, ask our server route to generate the reading vibe.
      setIsGeneratingVibe(true);
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
        const rawQueries = Array.isArray(vibeData.spotifySearchQueries)
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
            `${selectedBook.authorName} instrumental`,
          ];
        }

        setVibeResult({
          playlistTitle: vibeData.playlistTitle ?? "Untitled Reading Mix",
          readingVibe: vibeData.readingVibe ?? "A focused reading vibe.",
          moodTags: Array.isArray(vibeData.moodTags) ? vibeData.moodTags : [],
          spotifySearchQueries: musicQueries,
        });

        setIsLoadingYoutube(true);
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
        } finally {
          setIsLoadingYoutube(false);
        }
      } catch {
        setVibeError("Something went wrong. Try again.");
      } finally {
        setIsGeneratingVibe(false);
      }
    } catch {
      setBookResult(null);
      setVibeResult(null);
      setVibeError("");
      setYoutubeVideos([]);
      setYoutubeError("");
      setStatusText("Something went wrong. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f3ef] px-6 py-10 text-zinc-900 md:px-10">
      <main className="mx-auto w-full max-w-6xl">
        <p className="mb-5 inline-flex rounded-full border border-zinc-900 bg-yellow-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          Live Lesson
        </p>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
          How does an <span className="font-serif italic font-normal">API</span>{" "}
          actually work?
        </h1>
        <p className="mt-4 mb-8 text-lg text-zinc-700">
          Type something on the left. The API answers on the right. That&apos;s
          the whole job.
        </p>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-zinc-900 bg-[#f8f8f8] p-4 shadow-[3px_3px_0_0_#111]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide">
                Your Prompt
              </p>
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                <span className="h-2 w-2 rounded-full bg-green-400" />
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              placeholder="Type a book title..."
              className="h-56 w-full resize-none border-0 bg-transparent text-4xl font-serif italic text-zinc-900 outline-none placeholder:text-zinc-500"
            />
            <div className="mt-4 flex items-center justify-between border-t border-dashed border-zinc-300 pt-4">
              <span className="text-xs text-zinc-500">
                {prompt.length} / 500 characters
              </span>
              <button
                onClick={handleGenerate}
                className="rounded-full border border-zinc-900 bg-yellow-400 px-5 py-2 text-sm font-semibold shadow-[2px_2px_0_0_#111] transition hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#111]"
              >
                Send
              </button>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-zinc-900 bg-zinc-950 p-4 text-zinc-100 shadow-[3px_3px_0_0_#f1cc32]">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-200">
              The Answer
            </p>
            {bookResult ? (
              <div className="space-y-3 text-zinc-200">
                {bookResult.coverId ? (
                  <img
                    src={`https://covers.openlibrary.org/b/id/${bookResult.coverId}-L.jpg`}
                    alt={`Cover of ${bookResult.title}`}
                    className="h-44 w-32 rounded-md border border-zinc-700 object-cover"
                  />
                ) : null}
                <h2 className="text-2xl font-semibold text-white">{bookResult.title}</h2>
                <p>Author: {bookResult.authorName}</p>
                <p>
                  First published:{" "}
                  {bookResult.firstPublishedYear ?? "Not available"}
                </p>

                <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    OpenAI reading vibe
                  </p>

                  {isGeneratingVibe ? (
                    <p className="text-sm text-zinc-300">Generating vibe...</p>
                  ) : null}

                  {!isGeneratingVibe && vibeError ? (
                    <p className="text-sm text-red-300">{vibeError}</p>
                  ) : null}

                  {!isGeneratingVibe && !vibeError && vibeResult ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-white">
                          Playlist:
                        </span>{" "}
                        {vibeResult.playlistTitle}
                      </p>
                      <p>
                        <span className="font-semibold text-white">Vibe:</span>{" "}
                        {vibeResult.readingVibe}
                      </p>
                      <p>
                        <span className="font-semibold text-white">
                          Mood tags:
                        </span>{" "}
                        {vibeResult.moodTags.join(", ")}
                      </p>
                      <div>
                        <p className="font-semibold text-white">
                          Music search queries:
                        </p>
                        <ul className="list-disc pl-5">
                          {vibeResult.spotifySearchQueries.map((query) => (
                            <li key={query}>{query}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-4 border-t border-zinc-700 pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          YouTube soundtrack preview
                        </p>

                        {isLoadingYoutube ? (
                          <p className="text-sm text-zinc-300">
                            Searching YouTube...
                          </p>
                        ) : null}

                        {!isLoadingYoutube && youtubeError ? (
                          <p className="text-sm text-red-300">{youtubeError}</p>
                        ) : null}

                        {!isLoadingYoutube &&
                        !youtubeError &&
                        youtubeVideos.length > 0 ? (
                          <ul className="space-y-4">
                            {youtubeVideos.map((video, index) => (
                              <li
                                key={`${video.searchQuery}-${index}`}
                                className="rounded-md border border-zinc-700 bg-zinc-950 p-3"
                              >
                                <p className="mb-2 text-xs text-zinc-500">
                                  Query: {video.searchQuery}
                                </p>
                                {!video.videoId ? (
                                  <p className="text-sm text-zinc-400">
                                    No video found for this search.
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
                                        <p className="font-semibold text-white">
                                          {video.title}
                                        </p>
                                        <p className="text-sm text-zinc-400">
                                          {video.channelTitle}
                                        </p>
                                        <a
                                          href={video.youtubeUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 inline-block text-sm text-yellow-300 underline"
                                        >
                                          Open on YouTube
                                        </a>
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
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="h-56 whitespace-pre-wrap font-serif text-5xl italic text-zinc-400">
                {statusText}
              </div>
            )}
            <p className="mt-4 text-xs text-zinc-500">
              listening - tap Send to begin
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-8 border-t border-zinc-300 pt-7 text-zinc-700 md:grid-cols-3">
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">01.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">You ask</h3>
            <p>
              Your message leaves your machine and travels to the API&apos;s
              address.
            </p>
          </article>
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">02.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">
              The server thinks
            </h3>
            <p>
              It reads what you asked and runs the work needed to shape an
              answer.
            </p>
          </article>
          <article>
            <h2 className="mb-2 text-5xl font-serif italic text-zinc-900">03.</h2>
            <h3 className="mb-2 text-lg font-semibold text-zinc-900">
              You get a reply
            </h3>
            <p>
              A reply comes back ready for your app to render and use.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
