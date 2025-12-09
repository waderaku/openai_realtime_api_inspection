import { useCallback, useRef, useState, useEffect } from 'react';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents?: any[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const { logClientEvent, logServerEvent } = useEvent();
  const historyHandlers = useHandleSessionHistory().current;

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks, logClientEvent],
  );

  // 音声再生用のAudioContextとバッファ処理
  const playAudioChunk = useCallback(async (pcm16Data: Int16Array) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const audioContext = audioContextRef.current;

    // Int16ArrayをFloat32Arrayに変換
    const float32Data = new Float32Array(pcm16Data.length);
    for (let i = 0; i < pcm16Data.length; i++) {
      float32Data[i] = pcm16Data[i] / 32768.0;
    }

    // AudioBufferを作成して再生
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();

    // 再生終了を待つ
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
    });
  }, []);

  // 音声キューの処理
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift();
      if (chunk) {
        await playAudioChunk(chunk);
      }
    }

    isPlayingRef.current = false;
  }, [playAudioChunk]);


  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);

      logServerEvent(message);

      switch (message.type) {
        case 'session.created':
          console.log('Session created:', message.session.id);
          break;

        case 'response.audio.delta':
          // Base64デコードしてPCM16データに変換
          if (message.delta) {
            const binaryString = atob(message.delta);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            audioQueueRef.current.push(pcm16);
            processAudioQueue();
          }
          break;

        case 'response.audio_transcript.delta':
          historyHandlers.handleTranscriptionDelta(message);
          break;

        case 'response.audio_transcript.done':
          historyHandlers.handleTranscriptionCompleted(message);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          historyHandlers.handleTranscriptionCompleted(message);
          break;

        case 'response.function_call_arguments.done':
          // Function Call完了
          console.log('Function call:', message.name, message.arguments);
          break;

        case 'error':
          console.error('Server error:', message.error);
          logServerEvent({
            type: 'error',
            message: message.error?.message || 'Unknown error',
          });
          break;

        default:
          // その他のイベントは通常のログ処理
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }, [logServerEvent, historyHandlers, processAudioQueue]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      audioElement,
      extraContext,
    }: ConnectOptions) => {
      if (wsRef.current) return; // already connected

      updateStatus('CONNECTING');

      try {
        // FastAPIサーバーに接続（環境変数から取得、デフォルトはlocalhost）
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected to FastAPI server');
          updateStatus('CONNECTED');
        };

        ws.onmessage = handleWebSocketMessage;

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          updateStatus('DISCONNECTED');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          updateStatus('DISCONNECTED');
          wsRef.current = null;
        };

        wsRef.current = ws;
        audioElementRef.current = audioElement || null;

        // マイク入力の設定
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
          }
        });

        const audioContext = new AudioContext({ sampleRate: 24000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);

            // Float32ArrayをInt16Arrayに変換
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Base64エンコードして送信
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));

            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64,
            }));
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

      } catch (error) {
        console.error('Connection error:', error);
        updateStatus('DISCONNECTED');
      }
    },
    [updateStatus, handleWebSocketMessage],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    audioQueueRef.current = [];
    updateStatus('DISCONNECTED');
  }, [updateStatus]);

  const assertConnected = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
  };


  const interrupt = useCallback(() => {
    try {
      assertConnected();
      wsRef.current!.send(JSON.stringify({
        type: 'response.cancel',
      }));
      // 音声キューをクリア
      audioQueueRef.current = [];
    } catch (error) {
      console.error('Error interrupting:', error);
    }
  }, []);

  const sendUserText = useCallback((text: string) => {
    try {
      assertConnected();
      wsRef.current!.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text,
            },
          ],
        },
      }));

      // レスポンスをリクエスト
      wsRef.current!.send(JSON.stringify({
        type: 'response.create',
      }));
    } catch (error) {
      console.error('Error sending text:', error);
    }
  }, []);

  const sendEvent = useCallback((ev: any) => {
    try {
      assertConnected();
      wsRef.current!.send(JSON.stringify(ev));
    } catch (error) {
      console.error('Error sending event:', error);
    }
  }, []);

  const mute = useCallback((m: boolean) => {
    console.log('Mute:', m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    try {
      if (!wsRef.current) return;
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.clear'
      }));
    } catch (error) {
      console.error('Error in pushToTalkStart:', error);
    }
  }, []);

  const pushToTalkStop = useCallback(() => {
    try {
      if (!wsRef.current) return;
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
      wsRef.current.send(JSON.stringify({
        type: 'response.create'
      }));
    } catch (error) {
      console.error('Error in pushToTalkStop:', error);
    }
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
