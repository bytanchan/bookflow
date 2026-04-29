import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input =
      typeof body?.input === "string" ? body.input.trim() : "";

    return NextResponse.json({
      output: `You said the following: ${input}`,
    });
  } catch {
    return NextResponse.json(
      { output: "You said the following:" },
      { status: 400 }
    );
  }
}
