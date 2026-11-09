import { useEffect, useRef, useState } from 'react';
import {
  type AgentChatEvent,
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  useAgentChat,
  usePluginClientConfig,
} from '@databricks/appkit-ui/react';
import { Database, FileSearch, RotateCcw } from 'lucide-react';
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

const SUGGESTIONS = [
  'What notice period is needed to terminate the records management agreement?',
  'How much did the court award Al Noor, and when is the next hearing?',
  'What powers does Mariam Al Hashimi have under the power of attorney?',
  'Which documents expire in the next 12 months?',
  'What is our total invoice spend by vendor?',
];

/** Describe a tool call in words people understand, keeping the raw request inspectable. */
function describeTool(name: string, args: string): { label: string; detail: string; kind: 'search' | 'genie' | 'other' } {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(args) as Record<string, unknown>;
  } catch {
    // arguments may still be streaming
  }
  if (name.toLowerCase().includes('genie') || name.toLowerCase().includes('sendmessage')) {
    return { kind: 'genie', label: 'Asked Genie (records data)', detail: String(parsed.content ?? parsed.message ?? args) };
  }
  const sqlText = String(parsed.query ?? parsed.sql ?? args);
  const phrase = /query_text\s*=>\s*'((?:[^']|'')*)'/i.exec(sqlText)?.[1]?.replace(/''/g, "'");
  if (phrase) return { kind: 'search', label: `Searched documents for “${phrase}”`, detail: sqlText };
  return { kind: 'other', label: 'Queried records data', detail: sqlText };
}

/**
 * Records Assistant: answers from the indexed document passages (vector search) and, for counts and
 * totals, from the Records Genie space. Every lookup runs with the signed-in user's own permissions.
 */
export function AssistantPage() {
  const { agents, defaultAgent } = usePluginClientConfig<AgentsClientConfig>('agents');
  const agent = defaultAgent ?? agents[0] ?? '';
  const me = useWhoAmI();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleEvent = (event: AgentChatEvent) => {
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call' && event.item.name) {
      setMessages((prev) => [
        ...prev,
        { id: `t-${Date.now()}-${Math.random()}`, role: 'tool', toolName: event.item?.name, content: event.item?.arguments ?? '' },
      ]);
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call' && event.item.name) {
      // Arguments are complete now: update the latest row for this tool.
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, content]);

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

  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="f1-title text-3xl font-bold text-foreground">Records Assistant</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ask about what documents say, or about counts, totals and expiries. Answers cite the source files.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isStreaming || messages.length === 0}
          onClick={() => {
            reset();
            setMessages([]);
          }}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          New conversation
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Runs as <Badge variant="secondary">{me?.email ?? me?.user ?? 'you'}</Badge> — searches and data queries use your
        own Databricks permissions, so you only get answers from records you are allowed to see.
      </p>

      <Card className="h-[min(620px,68vh)] flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="space-y-3 mt-6">
              <p className="text-sm text-muted-foreground text-center">Try one of these:</p>
              <div className="flex flex-col gap-2 items-center">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => void ask(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            if (m.role === 'tool') {
              const t = describeTool(m.toolName ?? '', m.content);
              return (
                <details key={m.id} className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3">
                  <summary className="cursor-pointer flex items-center gap-1.5">
                    {t.kind === 'search' ? <FileSearch className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
                    {t.label}
                  </summary>
                  <pre className="mt-1 overflow-auto whitespace-pre-wrap font-mono">{t.detail}</pre>
                </details>
              );
            }
            return (
              <div
                key={m.id}
                className={`p-3 rounded-md ${m.role === 'user' ? 'bg-primary/10 ml-12' : 'bg-muted mr-12'}`}
              >
                <div className="whitespace-pre-wrap text-sm text-foreground">
                  {m.content || (isStreaming ? 'Looking through the records…' : '')}
                </div>
                {m.role === 'assistant' && m.content && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    AI-generated from the digitised records — verify important details in the original document.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>

        <form
          className="p-3 border-t flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={agent ? 'Ask about your records…' : 'Assistant unavailable'}
            disabled={!agent || isStreaming}
            aria-label="Message"
          />
          <Button type="submit" disabled={!input.trim() || !agent || isStreaming}>
            {isStreaming ? 'Thinking…' : 'Ask'}
          </Button>
        </form>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>The assistant hit an error: {error}. Try rephrasing or start a new conversation.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
