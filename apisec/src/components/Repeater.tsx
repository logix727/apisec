import { useState } from "react";
import { Button } from "./ui/button";
import { Clock, Globe, Shield, Terminal, X, Copy, Check, Play, Settings2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface RepeaterProps {
    initialRequest?: {
        url: string;
        method: string;
        body?: string;
        headers?: Record<string, string>;
    };
    onClose?: () => void;
}

interface ReplayResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    time_ms: number;
}

export default function Repeater({ initialRequest, onClose }: RepeaterProps) {
    const [url, setUrl] = useState(initialRequest?.url || "https://httpbin.org/get");
    const [method, setMethod] = useState(initialRequest?.method || "GET");
    const [body, setBody] = useState(initialRequest?.body || "");
    const [headers, setHeaders] = useState<string>(
        Object.entries(initialRequest?.headers || { "Content-Type": "application/json" })
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
    );

    const [response, setResponse] = useState<ReplayResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleExecute = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Parse headers
            const headerObj: Record<string, string> = {};
            headers.split("\n").forEach(line => {
                const [k, ...v] = line.split(":");
                if (k && v.length) {
                    headerObj[k.trim()] = v.join(":").trim();
                }
            });

            const res = await invoke<ReplayResponse>("tamper_request", {
                req: {
                    url,
                    method,
                    headers: headerObj,
                    body: method !== "GET" ? body : null
                }
            });
            setResponse(res);
        } catch (e) {
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!response) return;
        navigator.clipboard.writeText(response.body);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between shrink-0 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center border border-brand-500/20 shadow-lg shadow-brand-500/10">
                        <Terminal className="text-brand-400 h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Security Repeater</h2>
                        <p className="text-xs text-zinc-500 font-bold tracking-widest uppercase">Manual Request Replay & Tampering</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-3 rounded-xl hover:bg-white/5 transition-colors text-zinc-500 hover:text-white">
                        <X size={24} />
                    </button>
                )}
            </div>

            <div className="flex flex-1 gap-6 min-h-0">
                {/* Request Panel */}
                <div className="w-1/2 flex flex-col gap-4 min-h-0">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <Globe className="h-4 w-4 text-zinc-500" />
                            </div>
                            <input
                                className="w-full h-12 bg-zinc-900/50 border border-white/10 rounded-xl pl-12 pr-4 text-sm font-bold text-white focus:border-brand-500 outline-none transition-all"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="https://api.example.com/v1/user"
                            />
                        </div>
                        <select
                            className="h-12 bg-zinc-900/50 border border-white/10 rounded-xl px-4 text-sm font-black text-brand-400 outline-none focus:border-brand-500 appearance-none cursor-pointer"
                            value={method}
                            onChange={e => setMethod(e.target.value)}
                        >
                            <option>GET</option>
                            <option>POST</option>
                            <option>PUT</option>
                            <option>DELETE</option>
                            <option>PATCH</option>
                            <option>HEAD</option>
                            <option>OPTIONS</option>
                        </select>
                        <Button
                            onClick={handleExecute}
                            disabled={isLoading}
                            className="h-12 px-6 bg-brand-500 hover:bg-brand-400 text-black font-black flex gap-2 items-center shadow-lg shadow-brand-500/20"
                        >
                            {isLoading ? <Clock className="animate-spin" /> : <Play fill="currentColor" size={16} />}
                            SEND
                        </Button>
                    </div>

                    <div className="flex-1 flex flex-col gap-4 min-h-0">
                        <div className="flex flex-col gap-2 flex-1">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                                <Settings2 size={12} /> Request Headers
                            </span>
                            <textarea
                                className="flex-1 bg-zinc-950 border border-white/5 rounded-2xl p-4 text-xs font-mono text-zinc-400 focus:border-brand-500 outline-none transition-all resize-none shadow-inner"
                                value={headers}
                                onChange={e => setHeaders(e.target.value)}
                                placeholder="Header-Name: Value"
                            />
                        </div>

                        {method !== "GET" && (
                            <div className="flex flex-col gap-2 flex-1">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Request Body</span>
                                <textarea
                                    className="flex-1 bg-zinc-950 border border-white/5 rounded-2xl p-4 text-xs font-mono text-brand-300 focus:border-brand-500 outline-none transition-all resize-none shadow-inner"
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder='{ "action": "test" }'
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Response Panel */}
                <div className="w-1/2 flex flex-col gap-4 min-h-0 relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl animate-in fade-in duration-300">
                            <div className="flex flex-col items-center gap-4">
                                <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm font-black text-white italic">INTERCEPTING...</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex gap-3 text-red-500 text-xs font-bold shrink-0 animate-in shake duration-500">
                            <Shield size={16} />
                            {error}
                        </div>
                    )}

                    {!response && !isLoading && !error && (
                        <div className="flex-1 glass-card border-dashed flex flex-col items-center justify-center text-center opacity-30 gap-4">
                            <Terminal size={48} className="text-zinc-700" />
                            <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm italic">Capture a response to analyze</p>
                        </div>
                    )}

                    {response && (
                        <div className="flex-1 flex flex-col gap-4 min-h-0 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "px-3 py-1.5 rounded-xl text-sm font-black border flex items-center gap-2",
                                        response.status < 300 ? "bg-green-500/10 border-green-500/20 text-green-400" :
                                            response.status < 400 ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                                "bg-red-500/10 border-red-500/20 text-red-400"
                                    )}>
                                        <div className={cn(
                                            "h-2 w-2 rounded-full",
                                            response.status < 300 ? "bg-green-500" : "bg-red-500"
                                        )} />
                                        {response.status}
                                    </div>
                                    <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/5 text-[10px] font-mono text-zinc-500 flex items-center gap-2">
                                        <Clock size={12} />
                                        {response.time_ms}ms
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleCopy} className="h-9 border-white/5 hover:bg-white/5 text-zinc-400">
                                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    <span className="ml-2">Copy Body</span>
                                </Button>
                            </div>

                            <div className="flex-1 overflow-hidden glass rounded-3xl border border-white/5 flex flex-col shadow-2xl">
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic">Response Payload</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 bg-black/40">
                                        <pre className="text-xs font-mono text-brand-400 whitespace-pre-wrap break-all leading-relaxed">
                                            {response.body}
                                        </pre>
                                    </div>
                                </div>

                                <div className="h-1/3 border-t border-white/5 flex flex-col min-h-0 bg-zinc-950/50">
                                    <div className="p-4 border-b border-white/5 shrink-0 flex items-center justify-between">
                                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest italic">Response Headers</span>
                                        <span className="text-[10px] font-mono text-zinc-600">{Object.keys(response.headers).length} fields</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {Object.entries(response.headers).map(([k, v]) => (
                                            <div key={k} className="flex gap-2 text-[10px] font-mono border-b border-white/[0.02] py-1.5 last:border-none group">
                                                <span className="text-zinc-500 font-bold shrink-0 min-w-[120px] group-hover:text-brand-500 transition-colors uppercase">{k}:</span>
                                                <span className="text-zinc-400 break-all">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
