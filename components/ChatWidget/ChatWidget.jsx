// src/components/ChatWidget/ChatWidget.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import '../../styles/ChatWidget.css';
import { supabase } from '../../supabaseClient';

const MESSAGES_TABLE = 'messages'; // Supabase 테이블명 상수화

/**
 * 채팅 위젯 컴포넌트
 * 고전적인 윈도우 스타일의 채팅 인터페이스를 제공하며,
 * Supabase와 실시간 연동하여 메시지를 저장하고 불러옵니다.
 */
const ChatWidget = () => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null); // 오류 상태 추가

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    /**
     * 메시지 영역을 최신 메시지로 스크롤하는 함수
     */
    const scrollToBottom = useCallback(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
        }
    }, []);

    /**
     * Supabase에서 기존 메시지를 불러오는 함수
     */
    const fetchMessages = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from(MESSAGES_TABLE)
                .select('*')
                .order('timestamp', { ascending: true });

            if (fetchError) {
                console.error('Error fetching messages:', fetchError);
                setError('채팅 기록을 불러오는 데 실패했습니다.');
                setMessages([]); // 오류 발생 시 메시지 목록 초기화
            } else {
                setMessages(data || []);
            }
        } catch (err) {
            console.error('Unexpected error fetching messages:', err);
            setError('알 수 없는 오류로 채팅 기록을 불러올 수 없습니다.');
            setMessages([]);
        }
        setLoading(false);
    }, []);

    // 채팅창 열림/닫힘 및 메시지 변경 시 스크롤 및 포커스 처리
    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            inputRef.current?.focus();
        }
    }, [isOpen, messages, scrollToBottom]);

    // 채팅창이 열릴 때 메시지 로드 및 실시간 구독 설정
    useEffect(() => {
        if (isOpen) {
            fetchMessages();

            const channel = supabase
                .channel('chat-messages')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: MESSAGES_TABLE },
                    (payload) => {
                        setMessages((prevMessages) => {
                            // 중복 메시지 방지 (Supabase ID 또는 고유한 값으로 확인)
                            if (prevMessages.find(msg => msg.id === payload.new.id)) {
                                return prevMessages;
                            }
                            return [...prevMessages, payload.new];
                        });
                    }
                )
                .subscribe();

            // 컴포넌트 언마운트 또는 isOpen 변경 시 구독 해제
            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            // 채팅창이 닫힐 때 메시지 목록 초기화 (선택적: 다시 열 때 새로 불러오도록)
            // setMessages([]); 
            // setLoading(true);
        }
    }, [isOpen, fetchMessages]);

    /**
     * 입력창 텍스트 변경 핸들러
     */
    const handleInputChange = useCallback((event) => {
        setInputValue(event.target.value);
    }, []);

    /**
     * Supabase에 새 메시지를 저장하는 함수
     */
    const saveMessageToSupabase = useCallback(async (messageToSave) => {
        try {
            // id는 Supabase에서 자동 생성되므로 전달하지 않습니다.
            const { error: saveError } = await supabase
                .from(MESSAGES_TABLE)
                .insert([
                    {
                        text: messageToSave.text,
                        sender: messageToSave.sender,
                        timestamp: messageToSave.timestamp.toISOString(),
                    },
                ]);

            if (saveError) {
                console.error('Error saving message:', saveError);
                // UI에 에러 피드백을 줄 수 있습니다. 예를 들어, 메시지 옆에 전송 실패 아이콘 표시
            }
        } catch (err) {
            console.error('Unexpected error saving message:', err);
        }
    }, []);

    /**
     * 메시지 전송 핸들러
     */
    const handleSendMessage = useCallback(async (event) => {
        if (event) event.preventDefault();
        const trimmedInput = inputValue.trim();
        if (trimmedInput === '') return;

        const userMessage = {
            text: trimmedInput,
            sender: 'user',
            timestamp: new Date(),
            // id는 Supabase에서 자동 생성되므로 클라이언트에서 생성하지 않음
            // UI 즉시 업데이트를 위해 임시 id를 사용할 수도 있으나, 구독으로 처리하므로 불필요
        };

        // Optimistic Update는 구독으로 대체되거나, 구독 지연을 고려하여 유지할 수 있음
        // setMessages((prevMessages) => [...prevMessages, userMessage]); // 실시간 구독이 처리
        await saveMessageToSupabase(userMessage);
        const currentInput = trimmedInput; // 클로저를 위해 변수에 할당
        setInputValue('');

        // 봇 응답 시뮬레이션
        setTimeout(async () => {
            const botResponse = {
                text: `\"${currentInput}\" 라고 입력하셨습니다. 저는 고전적인 봇입니다.`,
                sender: 'bot',
                timestamp: new Date(),
            };
            // setMessages((prevMessages) => [...prevMessages, botResponse]); // 실시간 구독이 처리
            await saveMessageToSupabase(botResponse);
        }, 1000);
    }, [inputValue, saveMessageToSupabase]);

    /**
     * Enter 키 입력 핸들러
     */
    const handleKeyPress = useCallback((event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage(event); // event 객체 전달
        }
    }, [handleSendMessage]);

    /**
     * 채팅창 열기/닫기 토글 함수
     */
    const toggleChat = useCallback(() => {
        setIsOpen(prevIsOpen => !prevIsOpen);
    }, []);

    // 메시지 렌더링 로직 개선
    const renderMessages = () => {
        if (loading) {
            return (
                <div className="message-entry">
                    <span className="message-text">채팅 기록을 불러오는 중입니다...</span>
                </div>
            );
        }
        if (error) {
             return (
                <div className="message-entry">
                    <span className="message-sender-bot">봇:</span>
                    <span className="message-text">{error}</span>
                </div>
            );
        }
        if (messages.length === 0) {
            return (
                <div className="message-entry">
                    <span className="message-sender-bot">봇:</span>
                    <span className="message-text">안녕하세요! 고전 스타일 채팅 위젯입니다. 무엇을 도와드릴까요?</span>
                     <span className="message-timestamp">
                        {`(${new Date().toLocaleTimeString([], {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                        })})`}
                    </span>
                </div>
            );
        }
        return messages.map((msg) => (
            <div key={msg.id || `${msg.sender}-${msg.text}-${msg.timestamp}`} className="message-entry">
                <span
                    className={
                        msg.sender === 'user'
                            ? "message-sender-user"
                            : "message-sender-bot"
                    }
                >
                    {msg.sender === 'user' ? "나:" : "봇:"}
                </span>
                <span className="message-text">{msg.text}</span>
                <span className="message-timestamp">
                    {`(${new Date(msg.timestamp).toLocaleTimeString([], {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                    })})`}
                </span>
            </div>
        ));
    };

    return (
        <div className="chat-widget-container">
            {!isOpen && (
                <button
                    onClick={toggleChat}
                    className="chat-toggle-button"
                    aria-label="채팅 열기"
                >
                    채팅 열기
                </button>
            )}

            {isOpen && (
                <div className="chat-window">
                    <div className="chat-header">
                        <span>채팅 문의</span>
                        <button
                            onClick={toggleChat}
                            className="chat-close-button"
                            aria-label="채팅 닫기"
                        >
                            X
                        </button>
                    </div>
                    <div className="messages-area" ref={messagesEndRef}>
                        {renderMessages()}
                    </div>
                    <div className="input-area">
                        <form onSubmit={handleSendMessage} className="input-form">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={handleInputChange}
                                onKeyPress={handleKeyPress}
                                placeholder="메시지를 입력하세요..."
                                className="input-text"
                                disabled={loading || !!error}
                            />
                            <button
                                type="submit"
                                className="send-button"
                                disabled={inputValue.trim() === '' || loading || !!error}
                                aria-label="메시지 전송"
                            >
                                전송
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatWidget;