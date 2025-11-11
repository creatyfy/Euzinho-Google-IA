import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { Message, Role } from '../types';
import { SYSTEM_INSTRUCTION, EUZINHO_IMAGE_BASE64 } from '../constants';
import { decode, decodeAudioData } from '../utils';

// SpeechRecognition might not be on the window type
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const EuzinhoChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [interactionState, setInteractionState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [statusText, setStatusText] = useState("Toque no coração para conversar");
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  
  const chatRef = useRef<Chat | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchCount = useRef(0);
  const outputAudioContext = useRef<AudioContext | null>(null);

  const speak = useCallback(async (text: string) => {
    setInteractionState('speaking');
    setStatusText("Euzinho está respondendo...");

    if (!outputAudioContext.current) {
        outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // A calm, sweet voice
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (base64Audio) {
            const audioData = decode(base64Audio);
            const audioBuffer = await decodeAudioData(audioData, outputAudioContext.current, 24000, 1);
            
            const source = outputAudioContext.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.current.destination);
            source.onended = () => {
                setInteractionState('idle');
                setStatusText("Toque no coração para conversar");
            };
            source.start();
        } else {
             setInteractionState('idle');
             setStatusText("Toque no coração para conversar");
        }
    } catch (err) {
        console.error("TTS Error:", err);
        setInteractionState('idle');
        setStatusText("Tive um problema para falar. Tente de novo.");
    }
  }, []);
  
  const processMessage = async (text: string) => {
    setInteractionState('thinking');
    setStatusText("Euzinho está pensando...");
    
    const userMessage: Message = { role: Role.User, content: text };
    setMessages(prev => [...prev, userMessage]);

    try {
      if (!chatRef.current) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        chatRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
      }
      
      const stream = await chatRef.current.sendMessageStream({ message: text });
      let modelResponse = '';
      
      for await (const chunk of stream) {
        modelResponse += chunk.text;
      }
      
      const newModelMessage: Message = { role: Role.Model, content: modelResponse };
      setMessages(prev => [...prev, newModelMessage]);
      speak(modelResponse);

    } catch (err) {
      console.error(err);
      const errorMsg = "Desculpe, algo deu errado. Por favor, tente novamente.";
      setMessages(prev => [...prev, { role: Role.Model, content: errorMsg }]);
      speak(errorMsg);
    }
  };

  const startListening = useCallback(() => {
    if (interactionState !== 'idle' || !SpeechRecognition) return;

    if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'pt-BR';
        recognitionRef.current.interimResults = false;
        recognitionRef.current.continuous = false;

        recognitionRef.current.onstart = () => {
            setInteractionState('listening');
            setStatusText("Estou te ouvindo...");
        };

        recognitionRef.current.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
                processMessage(transcript);
            }
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setInteractionState('idle');
            setStatusText("Não consegui ouvir direito. Tente de novo.");
        };

        recognitionRef.current.onend = () => {
            if (interactionState === 'listening') {
                setInteractionState('idle');
                setStatusText("Toque no coração para conversar");
            }
        };
    }
    
    recognitionRef.current.start();
  }, [interactionState, processMessage]);
  
  const handleSingleTap = () => {
    if (micPermission === 'granted') {
        startListening();
    } else if (micPermission === 'denied') {
        setStatusText("Preciso de acesso ao microfone para ouvir você.");
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                setMicPermission('granted');
                startListening();
            })
            .catch(() => {
                setMicPermission('denied');
                setStatusText("Acesso ao microfone negado.");
            });
    }
  };
  
  const handleDoubleTap = () => {
      const messages = [
          "Ei, eu senti sua presença. Está tudo bem por aí?",
          "Que bom te ver! Lembre-se de ser gentil com você hoje.",
          "Um oi especial para você! Saiba que você é incrível."
      ];
      const msg = messages[Math.floor(Math.random() * messages.length)];
      setMessages(prev => [...prev, {role: Role.Model, content: msg}]);
      speak(msg);
  };

  const handlePointerDown = () => {
    touchCount.current++;
    
    if (touchTimer.current) {
      clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
    
    touchTimer.current = setTimeout(() => {
      if (touchCount.current === 1) { // Long press
        if (interactionState === 'idle') {
          setModalOpen(true);
          setStatusText("Pode me contar o que está sentindo.");
        }
      }
      touchCount.current = 0;
    }, 700);
  };
  
  const handlePointerUp = () => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current);
      touchTimer.current = null;
      if (touchCount.current === 1) {
        setTimeout(() => {
          if (touchCount.current === 1) {
            if (interactionState === 'idle') handleSingleTap();
            touchCount.current = 0;
          }
        }, 250);
      } else if (touchCount.current >= 2) {
        if (interactionState === 'idle') handleDoubleTap();
        touchCount.current = 0;
      }
    }
  };

  const handleModalSend = () => {
    if (modalInput.trim()) {
      processMessage(modalInput.trim());
    }
    setModalInput('');
    setModalOpen(false);
  };

  const lastMessage = messages.length > 0 ? messages[messages.length-1] : null;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-4">
      {/* Header */}
      <header className="absolute top-8 text-center">
        <h1 className="text-4xl font-bold text-white">Euzinho</h1>
        <p className="text-lg text-blue-200">Seu reflexo mais bonito.</p>
      </header>
      
      {/* Message Bubbles */}
      {lastMessage && (
        <div className="absolute top-1/4 transition-opacity duration-500 ease-in-out">
            <div className={`p-4 rounded-2xl max-w-sm md:max-w-md mx-auto whitespace-pre-wrap break-words text-white ${lastMessage.role === Role.User ? 'bg-blue-600/80' : 'bg-blue-900/80'}`}>
                {lastMessage.content}
            </div>
        </div>
      )}

      {/* Main Interactive Area */}
      <div className="relative flex items-center justify-center w-64 h-64 md:w-80 md:h-80">
          <img src={EUZINHO_IMAGE_BASE64} alt="Euzinho" className="w-full h-full object-contain breathing-avatar" />

          <div
            className={`absolute w-16 h-16 md:w-20 md:h-20 cursor-pointer transition-all duration-300 ${interactionState === 'listening' ? 'listening-pulse' : 'heart-pulse'}`}
            style={{ top: '48%', left: '50%', transform: 'translate(-50%, -50%)' }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            role="button"
            aria-label="Converse com Euzinho"
          >
            <svg viewBox="0 0 24 24" fill="url(#heartGradient)" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="heartGradient">
                  <stop offset="0%" stopColor="#FFF7A8" />
                  <stop offset="100%" stopColor="#F0D24C" />
                </radialGradient>
              </defs>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
      </div>
      
      {/* Status Text */}
      <p className="absolute bottom-12 text-blue-200 text-lg transition-opacity duration-300">
        {statusText}
      </p>

      {/* Text Input Modal */}
      {modalOpen && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a2b56] p-6 rounded-2xl shadow-2xl w-full max-w-sm border border-blue-400/30">
            <h3 className="text-xl font-bold mb-4">Escreva o que você sente</h3>
            <textarea
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              className="w-full bg-[#0c1a3e] rounded-lg p-3 h-32 resize-none border border-blue-400/30 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Caixa de texto para sua mensagem"
            />
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setModalOpen(false)} className="py-2 px-4 text-white rounded-lg hover:bg-white/10">Cancelar</button>
              <button onClick={handleModalSend} className="py-2 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50" disabled={!modalInput.trim()}>Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EuzinhoChat;
