import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "../types";
import {
    Search,
    Terminal,
    FileJson,
    ShieldAlert,
    Globe,
    Copy,
    CheckCircle2
} from "lucide-react";
import { cn } from "../lib/utils";

export default function GlobalSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<{ type: 'asset' | 'finding', data: any } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setIsLoading(true);
        try {
            const data = await invoke<SearchResult>("global_search", { query });
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Search Panel */}
            <div className="w-1/3 flex flex-col gap-6">
                <div className="space-y-1">
                    <h2 className="text-4xl font-bold tracking-tight text-white">Global Search</h2>
                    <p className="text-zinc-500 font-medium">Deep inspection across assets, bodies, and tokens.</p>
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-zinc-500 group-focus-within:text-brand-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search for tokens, domains, or strings..."
                        className="w-full h-14 bg-zinc-900/40 border border-white/5 rounded-2xl pl-12 pr-4 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 backdrop-blur-xl"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                </div>

                <div className="flex-1 overflow-auto rounded-3xl border border-white/5 bg-zinc-950/20 backdrop-blur-md p-4 space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : results ? (
                        <>
                            <div className="space-y-2">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Findings ({results.findings.length})</h3>
                                {results.findings.map((f, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedItem({ type: 'finding', data: f })}
                                        className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all group",
                                            selectedItem?.data === f ? "bg-red-500/10 border-red-500/30" : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <ShieldAlert className="h-4 w-4 text-red-400" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-zinc-200 truncate">{f.name}</span>
                                                <span className="text-[10px] text-zinc-500 font-mono truncate">{f.rule_id}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Endpoints ({results.assets.length})</h3>
                                {results.assets.map((a, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedItem({ type: 'asset', data: a })}
                                        className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all group",
                                            selectedItem?.data === a ? "bg-brand-500/10 border-brand-500/30" : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Globe className="h-4 w-4 text-brand-400" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-zinc-200 truncate uppercase tracking-tighter">{a.url}</span>
                                                <span className="text-[10px] text-zinc-500 font-mono truncate">{a.method}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-20 text-center p-8">
                            <Terminal className="h-12 w-12 mb-4" />
                            <p className="text-sm font-bold">Ready for deep scan</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Inspector Panel */}
            <div className="flex-1 rounded-3xl border border-white/5 bg-zinc-900/30 backdrop-blur-2xl flex flex-col overflow-hidden">
                {selectedItem ? (
                    <>
                        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-zinc-950 flex items-center justify-center border border-white/5">
                                    {selectedItem.type === 'finding' ? <FileJson className="h-6 w-6 text-red-400" /> : <Terminal className="h-6 w-6 text-brand-400" />}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                                        {selectedItem.data.name || selectedItem.data.url}
                                    </h3>
                                    <span className="text-xs font-mono text-zinc-500">
                                        {selectedItem.type === 'finding' ? selectedItem.data.rule_id : `Asset ID: #${selectedItem.data.id}`}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => copyToClipboard(JSON.stringify(selectedItem.data, null, 2))}
                                    className="h-10 px-4 rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-all flex items-center gap-2"
                                >
                                    {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                                    {copied ? 'Copied' : 'Copy JSON'}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-8">
                            <div className="glass rounded-2xl p-6 bg-zinc-950/50 font-mono text-[13px] leading-relaxed text-zinc-300 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <FileJson className="h-8 w-8 text-white/5" />
                                </div>
                                <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(selectedItem.data, null, 2)}
                                </pre>
                            </div>

                            {selectedItem.type === 'finding' && selectedItem.data.match_content && (
                                <div className="mt-6 space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Token Match Preview</h4>
                                    <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-200 font-mono text-sm break-all">
                                        {selectedItem.data.match_content}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
                        <div className="relative">
                            <Search className="h-24 w-24 opacity-5 animate-pulse" />
                            <div className="absolute inset-0 bg-brand-500/10 blur-[60px]" />
                        </div>
                        <p className="mt-4 font-bold uppercase tracking-widest text-xs">Select a result to inspect</p>
                    </div>
                )}
            </div>
        </div>
    );
}
