import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  type AgentChatEvent,
  Alert,
  AlertDescription,
  useAgentChat,
  usePluginClientConfig,
} from '@databricks/appkit-ui/react';
import {
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  Database,
  FileSearch,
  FileText,
  Gavel,
  Loader2,
  RotateCcw,
  Sparkles,
  Stamp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useWhoAmI } from '../lib/records';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
}

interface AgentsClientConfig {
  agents: string[];
  defaultAgent: string | null;
}

const STARTERS: { icon: LucideIcon; title: string; question: string }[] = [
  {
    icon: FileText,
    title: 'Contract terms',
    question: 'What notice period is needed to terminate the records management agreement?',
  },
  { icon: Gavel, title: 'Court case', question: 'How much did the court award Al Noor, and when is the next hearing?' },
  { icon: Stamp, title: 'Power of attorney', question: 'What powers does Mariam Al Hashimi have under the power of attorney?' },
  { icon: CalendarClock, title: 'Upcoming expiries', question: 'Which documents expire in the next 12 months?' },
  { icon: Wallet, title: 'Spend', question: 'What is our total invoice spend by vendor?' },
];

/** Describe a tool call in words people understand, keeping the raw request inspectable. */
function describeTool(name: string, args: string): { label: string; detail: string; kind: 'search' | 'genie' | 'other' } {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(args) as Record<string, unknown>;
  } catch {
    // arguments may still be streaming
  }
  const asText = (v: unknown) => (typeof v === 'string' ? v : args);
  if (name.toLowerCase().includes('genie') || name.toLowerCase().includes('sendmessage')) {
    return { kind: 'genie', label: 'Asked the records data', detail: asText(parsed.content ?? parsed.message) };
  }
  const sqlText = asText(parsed.query ?? parsed.sql);
  const phrase = /query_text\s*=>\s*'((?:[^']|'')*)'/i.exec(sqlText)?.[1]?.replace(/''/g, "'");
  if (phrase) return { kind: 'search', label: `Searched documents for “${phrase}”`, detail: sqlText };
  return { kind: 'other', label: 'Queried records data', detail: sqlText };
}

/** Render **bold** and turn [file.ext] citations into source chips that search for the file. */
function renderAnswer(text: string, openSource: (file: string) => void): ReactNode {
  const parts = text.split(/(\[[^\]\n]+\.[a-z0-9]{2,5}\]|\*\*[^*]+\*\*)/gi);
  return parts.map((part, i) => {
    const cite = /^\[([^\]]+\.[a-z0-9]{2,5})\]$/i.exec(part);
    if (cite) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => openSource(cite[1])}
          className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 align-baseline text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
          title={`Find ${cite[1]}`}
        >
          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{cite[1]}</span>
        </button>
      );
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function firstName(email: string | null | undefined): string | null {
  if (!email) return null;
  const n = email.split('@')[0]?.split(/[._\d-]+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : null;
}

/**
 * Records Assistant: answers from the indexed document passages (vector search) and, for counts and
 * totals, from the Records Genie space. Every lookup runs with the signed-in user's own permissions.
 */
export function AssistantPage() {
  const navigate = useNavigate();
  const { agents, defaultAgent } = usePluginClientConfig<AgentsClientConfig>('agents');
  const agent = defaultAgent ?? agents[0] ?? '';
  const me = useWhoAmI();
  const [messages, setMessages] = useState<Message[]>([]);
  // "Ask about this" on other pages opens the Assistant with a question already filled in.
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleEvent = (event: AgentChatEvent) => {
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call' && event.item.name) {
      setMessages((prev) => [
        ...prev,
        { id: `t-${Date.now()}-${Math.random()}`, role: 'tool', toolName: event.item?.name, content: event.item?.arguments ?? '' },
      ]);
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call' && event.item.name) {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === 'tool' && m.toolName === event.item?.name);
        if (idx < 0) return prev;
        const at = prev.length - 1 - idx;
        return prev.map((m, i) => (i === at ? { ...m, content: event.item?.arguments ?? m.content } : m));
      });
    }
  };

  const { content, isStreaming, error, send, reset } = useAgentChat({ agent, onEvent: handleEvent });

  useEffect(() => {
    if (!pendingId) return;
    setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content } : m)));
  }, [content, pendingId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, content]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || isStreaming || !agent) return;
    setInput('');
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setPendingId(assistantId);
    await send(message);
    setPendingId(null);
  };

  const copy = (m: Message) => {
    void navigator.clipboard?.writeText(m.content).then(() => {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const openSource = (file: string) => navigate(`/?${new URLSearchParams({ q: file })}`);
  const name = firstName(me?.email);
  const empty = messages.length === 0;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-7.5rem)] min-h-[520px]">
      <div className="flex items-center gap-3 pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-foreground">Records Assistant</h2>
          <p className="text-xs text-muted-foreground">Answers cite the source file · uses your own permissions</p>
        </div>
        {!empty && (
          <button
            type="button"
            className="rs-action ml-auto"
            disabled={isStreaming}
            onClick={() => {
              reset();
              setMessages([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-3xl border bg-card px-4 py-5 sm:px-6">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center py-6">
            <h3 className="rs-fade text-center text-3xl font-bold text-foreground">
              {name ? `Hi ${name}, ` : ''}
              <span className="text-primary">what do you need to know?</span>
            </h3>
            <p className="rs-fade rs-d1 mt-2 text-center text-sm text-muted-foreground">
              Ask what a document says, or for counts, totals and expiries across all records.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => void ask(s.question)}
                  disabled={!agent}
                  className={`rs-tile rs-fade group flex items-start gap-3 text-left ${i === STARTERS.length - 1 ? 'sm:col-span-2' : ''}`}
                  style={{ animationDelay: `${120 + i * 50}ms` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{s.title}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{s.question}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => {
              if (m.role === 'tool') {
                const t = describeTool(m.toolName ?? '', m.content);
                const running = isStreaming && m === messages.filter((x) => x.role === 'tool').at(-1);
                return (
                  <details key={m.id} className="rs-fade ml-11 text-xs text-muted-foreground">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border bg-background px-3 py-1 hover:bg-muted">
                      {running ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : t.kind === 'search' ? (
                        <FileSearch className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Database className="h-3.5 w-3.5 text-primary" />
                      )}
                      {t.label}
                    </summary>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px]">{t.detail}</pre>
                  </details>
                );
              }
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="rs-fade flex justify-end">
                    <div className="max-w-[80%] rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                      {m.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="rs-fade flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 max-w-[85%]">
                    <div className="rounded-3xl rounded-tl-md border bg-background px-4 py-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {m.content ? (
                        renderAnswer(m.content, openSource)
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="rs-dot" />
                          <span className="rs-dot" style={{ animationDelay: '150ms' }} />
                          <span className="rs-dot" style={{ animationDelay: '300ms' }} />
                          <span className="ml-1">Looking through the records</span>
                        </span>
                      )}
                    </div>
                    {m.content && !(isStreaming && m.id === pendingId) && (
                      <div className="mt-1.5 flex items-center gap-3 pl-2 text-[11px] text-muted-foreground">
                        <button type="button" onClick={() => copy(m)} className="inline-flex items-center gap-1 hover:text-foreground">
                          {copiedId === m.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          {copiedId === m.id ? 'Copied' : 'Copy'}
                        </button>
                        <span>AI-generated · check important details in the original</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>The assistant hit a problem: {error}. Try rephrasing, or start a new chat.</AlertDescription>
        </Alert>
      )}

      <form
        className="mt-3 flex items-end gap-2 rounded-3xl border bg-card p-2 pl-4 shadow-lg shadow-primary/5 focus-within:ring-4 focus-within:ring-primary/15"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          placeholder={agent ? 'Ask about your records…' : 'Assistant unavailable'}
          disabled={!agent || isStreaming}
          aria-label="Message"
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          disabled={!input.trim() || !agent || isStreaming}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
