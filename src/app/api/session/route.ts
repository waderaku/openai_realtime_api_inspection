import { NextResponse } from "next/server";

const sessionConfig = JSON.stringify({
  type: "realtime",
  model: "gpt-realtime",
  audio: { output: { voice: "marin" } }
});

export async function POST(req: Request) {
  try {
    // read the incoming request body as text (SDP offer from client)
    const sdpOffer = await req.text();

    if (!sdpOffer) {
      return NextResponse.json(
        { error: "SDP offer is required" },
        { status: 400 }
      );
    }

    const fd = new FormData();
    fd.set("sdp", sdpOffer);
    fd.set("session", sessionConfig);

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: fd,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to create session with OpenAI" },
        { status: response.status }
      );
    }

    // Send back the SDP answer we received from the OpenAI REST API
    const sdpAnswer = await response.text();

    return new NextResponse(sdpAnswer, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
      },
    });
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
