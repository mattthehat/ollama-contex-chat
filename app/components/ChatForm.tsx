import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import config from '~/lib/config';

type ActionData = {
    errors: {
        message: string | null;
        model: string | null;
    };
    message: string | null;
    model: string | null;
};

type ChatFormProps = {
    isStreaming?: boolean;
};

export default function ChatForm({ isStreaming = false }: ChatFormProps) {
    const fetcher = useFetcher<ActionData>();
    const actionData = fetcher.data;
    const isBusy = fetcher.state === 'submitting' || isStreaming;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isBusy && textareaRef.current) {
            textareaRef.current.value = '';
            textareaRef.current.focus();
        }
    }, [isStreaming, isBusy]);

    return (
        <fetcher.Form method="post" className="my-6">
            <textarea
                ref={textareaRef}
                name="message"
                className={`w-full h-40 p-2 border border-gray-300 rounded ${
                    actionData?.errors?.message
                        ? 'border-red-500'
                        : 'focus:border-blue-500'
                }`}
                placeholder="Type your message here..."
                disabled={isBusy}
                aria-invalid={actionData?.errors?.message ? 'true' : undefined}
                aria-errormessage={
                    actionData?.errors?.message ? 'message-error' : undefined
                }
            />
            {actionData?.errors?.message && (
                <div id="message-error" className="text-red-500">
                    {actionData.errors.message}
                </div>
            )}
            <select
                name="model"
                className={`mt-4 p-2 border border-gray-300 rounded block ml-auto ${
                    actionData?.errors?.model
                        ? 'border-red-500'
                        : 'focus:border-blue-500'
                }`}
                aria-invalid={actionData?.errors?.model ? 'true' : undefined}
                aria-errormessage={
                    actionData?.errors?.model ? 'model-error' : undefined
                }
                disabled={isBusy}
            >
                {config.chatModels.map((model) => (
                    <option key={model.modelName} value={model.modelName}>
                        {model.friendlyName}
                    </option>
                ))}
            </select>
            <button
                disabled={isBusy}
                type="submit"
                className={`mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
                    isBusy ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
                {isBusy ? 'Sending...' : 'Send'}
            </button>
        </fetcher.Form>
    );
}
