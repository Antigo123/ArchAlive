import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders model-written markdown. Raw HTML is off by default in react-markdown. Images are
 * blocked too, since an image URL in model output could send data to another server when it loads.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
    return (
        <div className="tutor-md">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                disallowedElements={['img']}
                unwrapDisallowed
                components={{
                    a: ({ children: linkText, href }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">{linkText}</a>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
});
