import { useCallback, useRef, useState } from 'react';
import { SessionStatus } from '../types';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { useTranscript } from '../contexts/TranscriptContext';
import { executeToolCall } from '../tools';

export interface RealtimeWebRTCCallbacks {
    onConnectionChange?: (status: SessionStatus) => void;
}

export interface ConnectOptions {
    audioElement?: HTMLAudioElement;
}

export function useRealtimeWebRTC(callbacks: RealtimeWebRTCCallbacks = {}) {
    const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const isResponseInProgressRef = useRef<boolean>(false);

    const { logClientEvent, logServerEvent } = useEvent();
    const historyHandlers = useHandleSessionHistory();
    const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } = useTranscript();

    const updateStatus = useCallback(
        (s: SessionStatus) => {
            setStatus(s);
            callbacks.onConnectionChange?.(s);
            logClientEvent({}, s);
        },
        [callbacks, logClientEvent],
    );

    const connect = useCallback(
        async ({ audioElement }: ConnectOptions) => {
            if (peerConnectionRef.current) {
                return;
            }

            try {
                updateStatus('CONNECTING');

                // Create peer connection
                const pc = new RTCPeerConnection();
                peerConnectionRef.current = pc;

                // Set up audio element for remote audio
                if (audioElement) {
                    audioElementRef.current = audioElement;
                }

                // Handle incoming tracks (remote audio)
                pc.ontrack = (event) => {
                    if (audioElementRef.current && event.streams[0]) {
                        audioElementRef.current.srcObject = event.streams[0];

                        // Try to play audio
                        audioElementRef.current.play().then(() => {
                            console.log('[WebRTC] Audio playback started successfully');
                        }).catch((err) => {
                            console.error('[WebRTC] Audio playback failed:', err);
                        });
                    } else {
                        console.warn('[WebRTC] No audio element or stream available');
                    }
                };

                // Get user media (microphone)
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
                localStreamRef.current = stream;
                // Add audio tracks to peer connection
                stream.getTracks().forEach((track) => {
                    pc.addTrack(track, stream);
                });

                // Create data channel for events
                const dc = pc.createDataChannel('oai-events');
                dataChannelRef.current = dc;

                // Data channel event handlers
                dc.onopen = () => {
                    updateStatus('CONNECTED');
                };

                dc.onclose = () => {
                    updateStatus('DISCONNECTED');
                };

                dc.onerror = (error) => {
                    console.error('[WebRTC] Data channel error:', error);
                };

                dc.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        logServerEvent(message);

                        // Handle specific message types
                        handleServerEvent(message);
                    } catch (error) {
                        console.error('[WebRTC] Failed to parse message:', error);
                    }
                };

                // Create SDP offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                // Send SDP offer to server
                const response = await fetch('/api/session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/sdp',
                    },
                    body: offer.sdp,
                });

                if (!response.ok) {
                    throw new Error(`Failed to create session: ${response.statusText}`);
                }

                const answerSdp = await response.text();

                // Set remote description
                const answer: RTCSessionDescriptionInit = {
                    type: 'answer',
                    sdp: answerSdp,
                };
                await pc.setRemoteDescription(answer);
                // Monitor connection state
                pc.onconnectionstatechange = () => {
                    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                        updateStatus('DISCONNECTED');
                    }
                };

                pc.oniceconnectionstatechange = () => {
                    console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
                };


            } catch (error) {
                console.error('[WebRTC] Connection failed:', error);
                updateStatus('DISCONNECTED');
                throw error;
            }
        },
        [updateStatus, logServerEvent],
    );

    const disconnect = useCallback(() => {

        // Close data channel
        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }

        // Close peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Stop local media tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
        }

        updateStatus('DISCONNECTED');
    }, [updateStatus]);

    const sendEvent = useCallback((event: any) => {
        if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            return;
        }

        // Prevent sending response.create if one is already in progress
        if (event.type === 'response.create' && isResponseInProgressRef.current) {
            console.warn('[WebRTC] Response already in progress, skipping response.create');
            return;
        }

        try {
            const message = JSON.stringify(event);
            dataChannelRef.current.send(message);
            logClientEvent(event);

            // Track response state
            if (event.type === 'response.create') {
                isResponseInProgressRef.current = true;
            }
        } catch (error) {
            console.error('[WebRTC] Failed to send event:', error);
        }
    }, [logClientEvent]);

    const sendUserText = useCallback((text: string) => {

        // Create conversation item
        sendEvent({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text,
                    },
                ],
            },
        });

        // Trigger response
        sendEvent({
            type: 'response.create',
        });
    }, [sendEvent]);

    const mute = useCallback((muted: boolean) => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
            });
        }
    }, []);

    const interrupt = useCallback(() => {
        // Reset response state when interrupting
        isResponseInProgressRef.current = false;
        sendEvent({
            type: 'response.cancel',
        });
    }, [sendEvent]);

    const pushToTalkStart = useCallback(() => {
        sendEvent({ type: 'input_audio_buffer.clear' });
    }, [sendEvent]);

    const pushToTalkStop = useCallback(() => {
        sendEvent({ type: 'input_audio_buffer.commit' });
        sendEvent({ type: 'response.create' });
    }, [sendEvent]);

    // Handle function calls
    const handleFunctionCall = useCallback(async (event: any) => {
        const { call_id, name, arguments: args } = event;

        try {
            const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

            const resultOrPromise = executeToolCall(name, parsedArgs, transcriptItems);

            // 非同期の場合は待つ
            const result = resultOrPromise instanceof Promise
                ? await resultOrPromise
                : resultOrPromise;


            // Transcriptにfunction callの結果を表示
            addTranscriptBreadcrumb(`Function call: ${name}`, result);

            // Send function call output back
            sendEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: call_id,
                    output: JSON.stringify(result),
                },
            });

            // Create response
            sendEvent({
                type: 'response.create',
            });

        } catch (error) {
            console.error('[WebRTC] Function call error:', error);

            // Transcriptにエラーを表示
            addTranscriptBreadcrumb(`❌ Function error: ${name}`, { error: String(error) });

            sendEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: call_id,
                    output: JSON.stringify({ error: 'Function execution failed' }),
                },
            });
        }
    }, [sendEvent, transcriptItems, addTranscriptBreadcrumb]);

    // Handle server events
    const handleServerEvent = useCallback((event: any) => {

        switch (event.type) {
            case 'response.created':
                // Response has started
                isResponseInProgressRef.current = true;
                break;
            case 'response.done':
                // Response has completed
                isResponseInProgressRef.current = false;
                break;
            case 'response.cancelled':
                // Response was cancelled
                isResponseInProgressRef.current = false;
                break;
            case 'conversation.item.created':
                console.log('[WebRTC] Conversation item created:', event.item);
                // Handle as history added
                if (event.item) {
                    console.log('[WebRTC] Calling handleHistoryAdded with:', {
                        itemId: event.item.id,
                        role: event.item.role,
                        content: event.item.content,
                        type: event.item.type,
                    });
                    historyHandlers.current.handleHistoryAdded({
                        itemId: event.item.id,
                        role: event.item.role,
                        content: event.item.content,
                        type: event.item.type,
                    });
                }
                break;
            case 'response.output_item.added':
                // Create a conversation item for the assistant response
                if (event.item) {
                    historyHandlers.current.handleHistoryAdded({
                        itemId: event.item.id,
                        role: 'assistant',
                        content: event.item.content || [],
                        type: event.item.type || 'message',
                    });
                }
                break;
            case 'conversation.item.input_audio_transcription.delta':
                // Ensure the transcript item exists before trying to update it
                if (event.item_id) {
                    const itemExists = transcriptItems.find((i) => i.itemId === event.item_id);

                    if (!itemExists) {
                        addTranscriptMessage(event.item_id, 'user', '[Transcribing...]', true);
                    }

                    historyHandlers.current.handleTranscriptionDelta(event);
                }
                break;
            case 'conversation.item.input_audio_transcription.completed':
                historyHandlers.current.handleTranscriptionCompleted(event);
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                historyHandlers.current.handleTranscriptionCompleted(event);
                break;
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':

                // Ensure the transcript item exists before trying to update it
                if (event.item_id) {
                    const itemExists = transcriptItems.find((i) => i.itemId === event.item_id);

                    if (!itemExists) {
                        addTranscriptMessage(event.item_id, 'assistant', '[Transcribing...]', true);
                    }

                    historyHandlers.current.handleTranscriptionDelta(event);
                }
                break;
            case 'response.function_call_arguments.done':
                // Handle function call
                handleFunctionCall(event);
                break;
            case 'response.output_item.done':
                // function_callタイプのitemの場合
                if (event.item?.type === 'function_call') {
                    handleFunctionCall({
                        call_id: event.item.call_id,
                        name: event.item.name,
                        arguments: event.item.arguments,
                    });
                }
                break;
            case 'error':
                console.error('[WebRTC] Server error:', event.error);
                break;
            default:
                break;
        }
    }, [historyHandlers, handleFunctionCall, transcriptItems, addTranscriptMessage]);

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
