import Markdown from 'react-markdown';

type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type ChatMessageProps = {
    message: Message;
};

export default function ChatMessage({ message }: ChatMessageProps) {
    // Don't render empty messages
    if (!message.content || message.content.trim() === '') {
        return null;
    }

    const isUser = message.role === 'user';

    return (
        <div
            className={`rounded-lg p-4 mb-4 shadow-sm ${
                isUser
                    ? 'bg-orange-100 dark:bg-orange-900 w-[70%] ml-auto'
                    : 'bg-white dark:bg-gray-800 w-full border border-gray-200 dark:border-gray-700'
            }`}
        >
            {isUser ? (
                <p className="text-gray-900 dark:text-gray-100">
                    {message.content}
                </p>
            ) : (
                <div
                    className="
                        prose prose-sm dark:prose-invert max-w-none
                        [&_p]:mb-4 [&_p]:leading-7 [&_p]:text-gray-900 [&_p]:dark:text-gray-100
                        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-gray-900 [&_h1]:dark:text-white
                        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-gray-900 [&_h2]:dark:text-white
                        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-gray-900 [&_h3]:dark:text-white
                        [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:text-gray-900 [&_ul]:dark:text-gray-100
                        [&_ol]:mb-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:text-gray-900 [&_ol]:dark:text-gray-100
                        [&_li]:mb-1 [&_li]:leading-7
                        [&_code]:bg-gray-100 [&_code]:dark:bg-gray-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-pink-600 [&_code]:dark:text-pink-400
                        [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-900 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4 [&_pre]:border [&_pre]:border-gray-300 [&_pre]:dark:border-gray-700
                        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-900 [&_pre_code]:dark:text-gray-100 [&_pre_code]:text-sm
                        [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:dark:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_blockquote]:text-gray-700 [&_blockquote]:dark:text-gray-300
                        [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:hover:text-blue-800 [&_a]:dark:hover:text-blue-300
                        [&_strong]:font-bold [&_strong]:text-gray-900 [&_strong]:dark:text-white
                        [&_em]:italic
                        [&_hr]:my-6 [&_hr]:border-gray-300 [&_hr]:dark:border-gray-600
                        [&_table]:w-full [&_table]:mb-4 [&_table]:border-collapse
                        [&_th]:border [&_th]:border-gray-300 [&_th]:dark:border-gray-600 [&_th]:px-4 [&_th]:py-2 [&_th]:bg-gray-100 [&_th]:dark:bg-gray-900 [&_th]:font-semibold [&_th]:text-left
                        [&_td]:border [&_td]:border-gray-300 [&_td]:dark:border-gray-600 [&_td]:px-4 [&_td]:py-2
                    "
                >
                    <Markdown>{message.content}</Markdown>
                </div>
            )}
        </div>
    );
}
