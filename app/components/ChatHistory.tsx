import ChatMessage from './ChatMessage';

type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type ChatHistoryProps = {
    messages?: Message[];
};

export default function ChatHistory({ messages }: ChatHistoryProps) {
    if (!messages || messages.length === 0) {
        return null;
    }

    return (
        <>
            {messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
            ))}
        </>
    );
}
