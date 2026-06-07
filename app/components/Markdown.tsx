"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={
        "prose prose-invert prose-sm max-w-none " +
        "prose-headings:text-gray-100 prose-headings:font-semibold " +
        "prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-gray-100 " +
        "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline " +
        "prose-code:text-blue-300 prose-code:before:content-none prose-code:after:content-none " +
        "prose-pre:bg-gray-950 prose-pre:border prose-pre:border-gray-800 " +
        className
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
