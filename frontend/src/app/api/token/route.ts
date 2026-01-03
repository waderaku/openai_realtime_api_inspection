import { NextResponse } from "next/server";
// import OpenAI from "openai";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessionConfig = JSON.stringify({
    session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: {
            output: {
                voice: "marin",
            },
        },
    },
});
export async function GET() {
    try {
        const response = await fetch(
            "https://api.openai.com/v1/realtime/client_secrets",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: sessionConfig,
            }
        );

        // 以下はOpenAI SDKを使用する場合の例
        // const data = await openai.realtime.clientSecrets.create({
        //     session: {
        //         type: "realtime",
        //         model: "gpt-realtime",
        //         output_modalities: ["audio"],
        //         audio: {
        //             input: {
        //                 format: { type: "audio/pcm", rate: 24000 },
        //                 transcription: {
        //                     model: "gpt-4o-mini-transcribe",
        //                 },
        //             },
        //             output: {
        //                 format: { type: "audio/pcm", rate: 24000 },
        //                 voice: "marin",
        //             },
        //         },
        //     },
        // });
        const data = await response.json();
        return NextResponse.json({
            client_secret: {
                value: data.value,
                expires_at: data.expires_at,
            },
            session: data.session,
        });
    } catch (error) {
        console.error("Error in /session:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}