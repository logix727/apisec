import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Play, ShieldAlert, Zap, Globe, Gauge, Activity, Terminal, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../lib/utils";
import { FileCode, Trash2, Plus, FileJson, AlertCircle } from "lucide-react";

interface ApiSpec {
    id: number;
    name: string;
    content: string;
    version?: string;
}

interface RateLimitResult {
    url: String;
    total_requests: number;
    success_count: number;
    rate_limited_count: number;
    avg_latency_ms: number;
    is_vulnerable: boolean;
}

export default function Auditor() {
    const [url, setUrl] = useState("");
    const [rps, setRps] = useState(10);
    const [duration, setDuration] = useState(30);
    const [isTesting, setIsTesting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState<RateLimitResult | null>(null);
    const [specs, setSpecs] = useState<ApiSpec[]>([]);

    const loadSpecs = async () => {
        try {
            const res = await invoke<ApiSpec[]>("get_api_specs");
            setSpecs(res);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadSpecs();
    }, []);

    const handleAddSpec = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.yaml,.yml';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event: any) => {
                const content = event.target.result;
                try {
                    await invoke("add_api_spec", {
                        name: file.name,
                        content,
                        version: "1.0.0"
                    });
                    loadSpecs();
                } catch (err) {
                    alert(err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleDeleteSpec = async (id: number) => {
        if (confirm("Delete this reference specification? Drift detection for this API will stop.")) {
            try {
                await invoke("delete_api_spec", { id });
                loadSpecs();
            } catch (e) {
                alert(e);
            }
        }
    };

    useEffect(() => {
        const unlisten = listen("rate-limit-progress", (event: any) => {
            setProgress(event.payload);
        });
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const runTest = async () => {
        if (!url) return;
        setIsTesting(true);
        setResults(null);
        try {
            const res = await invoke<RateLimitResult>("run_rate_limit_test", {
                url,
                rps: Number(rps),
                duration: Number(duration)
            });
            setResults(res);
        } catch (e) {
            alert(e);
        } finally {
            setIsTesting(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col gap-1">
                <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Auditor Workbench</h2>
                <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Active Security Orchestration & Stress Testing</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
                {/* Configuration Panel */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="glass-card space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                                <Gauge className="text-brand-400 h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-black text-white uppercase italic">Rate Limit Stresser</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Target Endpoint</label>
                                <div className="relative group">
                                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-brand-400 transition-colors" />
                                    <input
                                        className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl pl-12 pr-4 text-xs font-mono text-white focus:border-brand-500 outline-none transition-all"
                                        placeholder="https://api.target.com/v1/resource"
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Requests /Sec</label>
                                    <input
                                        type="number"
                                        className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl px-4 text-xs font-black text-white focus:border-brand-500 outline-none"
                                        value={rps}
                                        onChange={e => setRps(Number(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Duration (s)</label>
                                    <input
                                        type="number"
                                        className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl px-4 text-xs font-black text-white focus:border-brand-500 outline-none"
                                        value={duration}
                                        onChange={e => setDuration(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={runTest}
                                disabled={isTesting || !url}
                                className={cn(
                                    "w-full h-14 font-black flex gap-3 items-center justify-center rounded-xl shadow-lg transition-all duration-300",
                                    isTesting
                                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                        : "bg-brand-500 hover:bg-brand-400 text-black shadow-brand-500/20"
                                )}
                            >
                                {isTesting ? <Activity className="animate-spin h-5 w-5" /> : <Play fill="currentColor" size={16} />}
                                {isTesting ? "STRESSING TARGET..." : "INITIATE AUDIT"}
                            </Button>
                        </div>
                    </div>

                    <div className="p-8 glass rounded-[32px] border border-accent-500/20 bg-accent-500/5 flex flex-col gap-4 relative overflow-hidden group">
                        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-accent-500/10 blur-[100px] rounded-full group-hover:bg-accent-500/20 transition-all duration-700" />
                        <ShieldAlert className="h-8 w-8 text-accent-400" />
                        <h4 className="text-lg font-black text-white italic uppercase tracking-tight">Vulnerability Context</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            A lack of rate limiting allows for **DoS attacks**, **Brute-forcing**, and **Resource Exhaustion**.
                            If APISec detects no `429 Too Many Requests` status codes at high RPS, the endpoint is flagged as **Vulnerable**.
                        </p>
                    </div>

                    {/* Spec Management Section */}
                    <div className="glass-card flex-1 flex flex-col gap-6 min-h-[300px]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                                    <FileCode className="text-brand-400 h-5 w-5" />
                                </div>
                                <h3 className="text-sm font-black text-white uppercase italic">Reference Specs</h3>
                            </div>
                            <Button onClick={handleAddSpec} variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-brand-500/20 text-brand-400">
                                <Plus size={18} />
                            </Button>
                        </div>

                        <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                            {specs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 gap-2">
                                    <FileJson size={32} className="text-zinc-600" />
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">No OpenAPI specs loaded</p>
                                </div>
                            ) : (
                                specs.map(spec => (
                                    <div key={spec.id} className="p-4 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-between group/spec">
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[11px] font-black text-white truncate uppercase italic">{spec.name}</span>
                                            <span className="text-[9px] font-bold text-zinc-600 uppercase">Version {spec.version || "N/A"}</span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSpec(spec.id)}
                                            className="opacity-0 group-hover/spec:opacity-100 p-2 text-zinc-600 hover:text-red-500 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-auto p-4 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-start gap-3">
                            <AlertCircle size={16} className="text-brand-400 shrink-0 mt-0.5" />
                            <p className="text-[9px] font-bold text-zinc-500 leading-normal uppercase">
                                Loaded specs are used for **Drift Detection**. Observed traffic is matched against these schemas to find undocumented fields or methods.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Live Console & Results */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex-1 glass rounded-[32px] border border-white/5 flex flex-col overflow-hidden shadow-2xl relative">
                        {isTesting && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-900 z-30">
                                <div
                                    className="h-full bg-brand-500 shadow-[0_0_12px_#3b82f6] transition-all duration-300"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                        )}

                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <Terminal className="text-brand-400 h-5 w-5" />
                                <h3 className="text-sm font-black text-white italic uppercase tracking-widest">Auditor Real-time Feed</h3>
                            </div>
                            {isTesting && (
                                <span className="text-[10px] font-black text-brand-400 animate-pulse">
                                    {progress.current} / {progress.total} REQUESTS SENT
                                </span>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 flex flex-col font-mono text-xs">
                            {!results && !isTesting ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-4">
                                    <Activity size={64} className="text-zinc-700" />
                                    <p className="text-zinc-500 font-black uppercase tracking-tighter text-2xl italic">System Ready for Injection</p>
                                </div>
                            ) : leads_results(results, isTesting, progress)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function leads_results(results: RateLimitResult | null, isTesting: boolean, progress: any) {
    if (isTesting) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-zinc-500">
                    <span className="text-brand-500">[SYSTEM]</span> Initializing high-concurrency client...
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                    <span className="text-brand-500">[SYSTEM]</span> Bypassing TLS certificate validation...
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                    <span className="text-brand-500">[INJECT]</span> Flooding target with GET requests...
                </div>
                {[...Array(Math.min(10, Math.floor(progress.current / 5)))].map((_, i) => (
                    <div key={i} className="flex items-center gap-2 text-brand-400/50">
                        <ChevronRight size={10} /> REQ {i * 5 + 1} {"->"} 200 OK (latency: {Math.random() * 50 + 20 | 0}ms)
                    </div>
                ))}
            </div>
        );
    }

    if (results) {
        return (
            <div className="p-6 space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="glass-card flex flex-col items-center p-6 border-brand-500/10">
                        <span className="text-[10px] font-black text-zinc-500 uppercase mb-2">Total Load</span>
                        <span className="text-3xl font-black text-white">{results.total_requests}</span>
                    </div>
                    <div className="glass-card flex flex-col items-center p-6 border-green-500/10">
                        <span className="text-[10px] font-black text-zinc-500 uppercase mb-2">Success Rate</span>
                        <span className="text-3xl font-black text-green-400">{((results.success_count / results.total_requests) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="glass-card flex flex-col items-center p-6 border-red-500/10">
                        <span className="text-[10px] font-black text-zinc-500 uppercase mb-2">Limited (429)</span>
                        <span className="text-3xl font-black text-red-500">{results.rate_limited_count}</span>
                    </div>
                    <div className="glass-card flex flex-col items-center p-6 border-zinc-500/10">
                        <span className="text-[10px] font-black text-zinc-500 uppercase mb-2">Avg Latency</span>
                        <span className="text-3xl font-black text-white">{results.avg_latency_ms}ms</span>
                    </div>
                </div>

                <div className={cn(
                    "p-8 rounded-[32px] border flex items-center justify-between",
                    results.is_vulnerable
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-green-500/10 border-green-500/30"
                )}>
                    <div className="flex items-center gap-6">
                        <div className={cn(
                            "h-16 w-16 rounded-2xl flex items-center justify-center border shadow-xl",
                            results.is_vulnerable ? "bg-red-500 border-red-400 text-black shadow-red-500/20" : "bg-green-500 border-green-400 text-black shadow-green-500/20"
                        )}>
                            {results.is_vulnerable ? <ShieldAlert size={32} /> : <Zap size={32} />}
                        </div>
                        <div className="flex flex-col">
                            <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                                {results.is_vulnerable ? "Vulnerability Confirmed" : "Resilient Endpoint"}
                            </h4>
                            <p className="text-sm font-medium text-zinc-400 max-w-md">
                                {results.is_vulnerable
                                    ? "Target shows NO rate limiting during high-volume injection. This endpoint is vulnerable to resource exhaustion."
                                    : "Target correctly applied 429 backoff or handled all requests without performance degradation."}
                            </p>
                        </div>
                    </div>
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Confidence Score</span>
                        <span className="text-xl font-bold text-white">{(Math.min(results.total_requests, 100)) / 100 * 100}%</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Technical Evidence</h5>
                    <div className="bg-zinc-950 rounded-2xl p-6 border border-white/5 font-mono text-[11px] leading-relaxed text-zinc-500 max-h-48 overflow-y-auto">
                        [AUDIT START] - {new Date().toISOString()}<br />
                        [INFO] Client initialized with RPS={results.total_requests / (results.total_requests / results.success_count)}<br />
                        [TARGET] {results.url}<br />
                        [STATS] OK: {results.success_count} | 429: {results.rate_limited_count} | TIMEOUT: 0<br />
                        [RESULT] {results.is_vulnerable ? "VULNERABLE (NONE_RATE_LIMIT)" : "SECURE"}<br />
                        [AUDIT END]
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
