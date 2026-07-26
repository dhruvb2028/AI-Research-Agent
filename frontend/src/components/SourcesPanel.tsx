import type { Evidence } from "../lib/sse";

function host(url: string): string {
  if (url.startsWith("corpus://")) return url.slice("corpus://".length);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SourcesPanel({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <section className="sources" aria-label="Sources">
      <h2>Sources ({evidence.length})</h2>
      {evidence.map((ev, i) => {
        const isCorpus = ev.url.startsWith("corpus://");
        return (
          <div className="source" id={`src-${i + 1}`} key={ev.url}>
            <span className="num">[{i + 1}]</span>
            <div>
              {isCorpus ? (
                <span>
                  {ev.title}
                  <span className="tag corpus">corpus</span>
                </span>
              ) : (
                <a href={ev.url} target="_blank" rel="noreferrer">
                  {ev.title || ev.url}
                </a>
              )}
              <div className="host">{host(ev.url)}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
