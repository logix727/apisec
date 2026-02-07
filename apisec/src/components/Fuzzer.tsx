import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Zap, Play, Activity, ShieldAlert, Terminal, ChevronRight, Search, Bug } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../lib/utils";
import { Asset } from "../types";

interface FuzzResult {
    payload: string;
    status: number;
    time_ms: number;
    finding: any | null;
}

export default function Fuzzer() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [attackType, setAttackType] = useState("sql_injection");
    const [isFuzzing, setIsFuzzing] = useState(false);
    const [results, setResults] = useState<FuzzResult[]>([]);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        const loadAssets = async () => {
            const res = await invoke<Asset[]>("get_assets");
            setAssets(res);
        };
        loadAssets();

        const unlisten = listen("fuzz-progress", (event: any) => {
            const [current, total, result] = event.payload;
            setProgress({ current, total });
            setResults(prev => [...prev, result]);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const startFuzzing = async () => {
        if (!selectedAsset) return;
        setResults([]);
        setIsFuzzing(true);
        try {
            await invoke("run_active_fuzz", {
                task: {
                    url: selectedAsset.url,
                    method: selectedAsset.method || "GET",
                    headers: {},
                    body: selectedAsset.req_body
                },
                attackType
            });
        } catch (e) {
            alert(e);
        } finally {
            setIsFuzzing(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col gap-1">
                <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Active Fuzzing Engine</h2>
                <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Automated Parameter & Input Validation</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
                {/* Control Panel */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="glass-card space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
                                <Bug className="text-accent-400 h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-black text-white uppercase italic">Fuzz Configuration</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Target Asset</label>
                                <select
                                    className="w-full h-12 bg-zinc-950 border border-white/5 rounded-xl px-4 text-xs font-mono text-white outline-none focus:border-accent-500 transition-all"
                                    onChange={(e) => setSelectedAsset(assets.find(a => a.id === Number(e.target.value)) || null)}
                                >
                                    <option value="">Select an asset...</option>
                                    {assets.map(asset => (
                                        <option key={asset.id} value={asset.id}>{asset.method} {asset.url}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Attack Vector</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: "sql_injection", name: "SQL Injection", desc: "Test for database logic leaks" },
                                        { id: "xss", name: "Reflected XSS", desc: "Test for script reflection" },
                                    ].map(type => (
                                        <button
                                            key={type.id}
                                            onClick={() => setAttackType(type.id)}
                                            className={cn(
                                                "p-4 rounded-xl border text-left transition-all",
                                                attackType === type.id
                                                    ? "bg-accent-500/10 border-accent-500/30 text-white"
                                                    : "bg-zinc-950 border-white/5 text-zinc-500 hover:border-white/10"
                                            )}
                                        >
                                            <div className="text-[11px] font-black uppercase italic">{type.name}</div>
                                            <div className="text-[9px] font-bold opacity-60 uppercase">{type.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                onClick={startFuzzing}
                                disabled={isFuzzing || !selectedAsset}
                                className={cn(
                                    "w-full h-14 font-black flex gap-3 items-center justify-center rounded-xl shadow-lg transition-all duration-300",
                                    isFuzzing
                                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                        : "bg-accent-500 hover:bg-accent-400 text-black shadow-accent-500/20"
                                )}
                            >
                                {isFuzzing ? <Activity className="animate-spin h-5 w-5" /> : <Play fill="currentColor" size={16} />}
                                {isFuzzing ? "FUZZING TARGET..." : "EXECUTE ATTACK"}
                            </Button>
                        </div>
                    </div>

                    <div className="p-8 glass rounded-[32px] border border-brand-500/20 bg-brand-500/5 flex flex-col gap-4 relative overflow-hidden group">
                        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-brand-500/10 blur-[100px] rounded-full group-hover:bg-brand-500/20 transition-all duration-700" />
                        <ShieldAlert className="h-8 w-8 text-brand-400" />
                        <h4 className="text-lg font-black text-white italic uppercase tracking-tight">Active Scan Policy</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Active fuzzing involves sending multiple mutated requests to the target. Ensure you have
                            **explicit permission** to scan this target as it may trigger security alerts or perform
                            destructive actions.
                        </p>
                    </div>
                </div>

                {/* Results View */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex-1 glass rounded-[32px] border border-white/5 flex flex-col overflow-hidden shadow-2xl relative">
                        {isFuzzing && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-900 z-30">
                                <div
                                    className="h-full bg-accent-500 shadow-[0_0_12px_#f97316] transition-all duration-300"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                        )}

                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <Terminal className="text-accent-400 h-5 w-5" />
                                <h3 className="text-sm font-black text-white italic uppercase tracking-widest">Fuzzer Output Stream</h3>
                            </div>
                            {isFuzzing && (
                                <span className="text-[10px] font-black text-accent-400 animate-pulse">
                                    {progress.current} / {progress.total} VECTORS TESTED
                                </span>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 flex flex-col font-mono text-[11px] space-y-2">
                            {results.length === 0 && !isFuzzing ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-4">
                                    <Search size={64} className="text-zinc-700" />
                                    <p className="text-zinc-500 font-black uppercase tracking-tighter text-2xl italic">Select Asset to Begin Fuzzing</p>
                                </div>
                            ) : (
                                results.map((res, i) => (
                                    <div key={i} className={cn(
                                        "p-3 rounded-xl border flex items-center justify-between transition-all duration-300",
                                        res.finding
                                            ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
                                            : "bg-zinc-950 border-white/5 text-zinc-500"
                                    )}>
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={cn(
                                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                                res.finding ? "bg-red-500 text-black border-red-400" : "bg-zinc-900 text-zinc-600 border-white/5"
                                            )}>
                                                {res.finding ? <ShieldAlert size={16} /> : <Zap size={16} />}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold truncate uppercase tracking-tighter italic">Payload: {res.payload}</span>
                                                <span className="text-[9px] opacity-60">Status: {res.status} | Time: {res.time_ms}ms</span>
                                            </div>
                                        </div>
                                        {res.finding && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] font-black uppercase tracking-widest">Confirmed!</span>
                                                <ChevronRight size={14} />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
