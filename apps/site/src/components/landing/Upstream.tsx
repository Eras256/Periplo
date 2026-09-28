import upstream from "@/data/upstream.json";
import type { Locale } from "@/i18n/config";
import { type Dictionary, format } from "@/i18n/dictionaries";

type State = keyof Dictionary["upstream"]["states"];
interface Item {
  readonly ref: string;
  readonly kind: string;
  readonly title: string;
  readonly url: string;
  readonly state: string;
}

function isState(value: string, states: Dictionary["upstream"]["states"]): value is State {
  return value in states;
}

const VISIBLE = 5;
const PRIORITY = ["merged", "closed_completed", "open", "closed_unmerged", "closed_not_planned"];
const rank = (state: string) => {
  const index = PRIORITY.indexOf(state);
  return index === -1 ? PRIORITY.length : index;
};

function Rows({
  items,
  t,
}: {
  readonly items: readonly Item[];
  readonly t: Dictionary["upstream"];
}) {
  return (
    <ul className="upstream">
      {items.map((item) => (
        <li key={item.ref}>
          <div>
            <div className="upstream__ref">{item.ref}</div>
            <a className="upstream__title" href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          </div>
          <span className={`tag state state--${item.state}`}>
            {isState(item.state, t.states) ? t.states[item.state] : item.state}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Group({
  title,
  items,
  t,
}: {
  readonly title: string;
  readonly items: readonly Item[];
  readonly t: Dictionary["upstream"];
}) {
  const sorted = [...items].sort((a, b) => rank(a.state) - rank(b.state));
  const rest = sorted.slice(VISIBLE);
  return (
    <div className="upstream-group">
      <h3>
        {title} <span className="muted">({items.length})</span>
      </h3>
      <Rows items={sorted.slice(0, VISIBLE)} t={t} />
      {rest.length > 0 ? (
        <details className="upstream-more">
          <summary>{format(t.showMore, { count: rest.length })}</summary>
          <Rows items={rest} t={t} />
        </details>
      ) : null}
    </div>
  );
}

export function Upstream({
  locale,
  t,
}: {
  readonly locale: Locale;
  readonly t: Dictionary["upstream"];
}) {
  const items = upstream.items as readonly Item[];
  const prs = items.filter((item) => item.kind === "pr");
  const issues = items.filter((item) => item.kind === "issue");
  const checked = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(upstream.checkedAt));
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.state, (counts.get(item.state) ?? 0) + 1);

  return (
    <section id="upstream" className="section" aria-labelledby="upstream-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">04</p>
          <h2 id="upstream-title">{t.title}</h2>
          <p className="lede">{t.lede}</p>
          <p className="muted small">
            {t.checkedAt} <time dateTime={upstream.checkedAt}>{checked} UTC</time>.
          </p>
        </div>
        <div className="upstream-summary">
          {[...counts.entries()]
            .sort(([a], [b]) => rank(a) - rank(b))
            .map(([state, count]) => (
              <span key={state} className={`tag state state--${state}`}>
                {isState(state, t.states) ? t.states[state] : state}: {count}
              </span>
            ))}
        </div>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <Group title={t.prs} items={prs} t={t} />
          <Group title={t.issues} items={issues} t={t} />
        </div>
      </div>
    </section>
  );
}
