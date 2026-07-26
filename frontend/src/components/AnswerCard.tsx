import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Turn [n] citations into anchor links targeting the sources panel.
function linkCitations(answer: string): string {
  return answer.replace(/\[(\d+)\]/g, (_, n) => `[[${n}]](#src-${n})`);
}

export function AnswerCard({
  answer,
  budgetExhausted,
}: {
  answer: string;
  budgetExhausted: boolean;
}) {
  return (
    <div className="answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#src-")) {
              return (
                <a
                  className="cite"
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.querySelector(href);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.classList.add("flash");
                    setTimeout(() => el?.classList.remove("flash"), 1600);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(answer)}
      </ReactMarkdown>
      {budgetExhausted && (
        <div className="warn" role="note">
          Step budget reached — this answer may be incomplete.
        </div>
      )}
    </div>
  );
}
