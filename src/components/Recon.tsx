import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Loader2, Globe, Shield, Terminal, Zap, ArrowRight, ExternalLink } from "lucide-react";

interface ReconResult {
    subdomain: string;
    ip: string | null;
    status: string;
}

export default function Recon() {
    const [domain, setDomain] = useState("");
    const [results, setResults] = useState<ReconResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRecon = async () => {
        if (!domain) return;
        setLoading(true);
        setError(null);
        try {
            const res = await invoke<ReconResult[]>("enumerate_subdomains", { domain });
            setResults(res);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="flex flex-col md:flex-row items-end justify-between gap-6">
                <div className="space-y-2">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic flex items-center gap-4">
                        <Globe className="text-brand-400 h-8 w-8" />
                        Domain Reconnaissance
                    </h2>
                    <p className="text-zinc-500 font-medium max-w-lg">
                        Actively discover subdomains and resolve infrastructure endpoints for target organizations.
                    </p>
                </div>

                <div className="flex-1 max-w-md w-full relative">
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500 to-accent-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
                        <div className="relative flex gap-2">
                            <input
                                className="flex-1 h-14 bg-zinc-900 border border-white/5 rounded-2xl px-6 text-sm font-bold text-white focus:border-brand-500 outline-none transition-all placeholder:text-zinc-600"
                                value={domain}
                                onChange={e => setDomain(e.target.value)}
                                placeholder="e.g. google.com"
                                onKeyDown={e => e.key === 'Enter' && handleRecon()}
                            />
                            <Button
                                onClick={handleRecon}
                                disabled={loading || !domain}
                                className="h-14 px-8 bg-brand-500 hover:bg-brand-400 text-black font-black rounded-2xl"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "SCAN"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[32px] flex gap-4 text-red-500 items-start animate-in shake duration-500">
                    <Shield className="h-6 w-6 shrink-0" />
                    <div className="space-y-1">
                        <p className="font-black uppercase tracking-widest text-xs italic">Recon Error</p>
                        <p className="text-sm font-bold opacity-80">{error}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Results Column */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold flex items-center gap-2 italic">
                            <Zap className="h-5 w-5 text-accent-400" />
                            Active Infrastructure
                        </h3>
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{results.length} endpoints found</span>
                    </div>

                    <div className="space-y-2">
                        {results.length > 0 ? (
                            results.map((res, i) => (
                                <div key={i} className="glass rounded-[24px] p-5 border border-white/5 hover:border-brand-500/30 transition-all group/item">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="h-12 w-12 rounded-xl bg-zinc-950 flex items-center justify-center border border-white/5 text-zinc-600 group-hover/item:text-brand-400 transition-colors">
                                                <Terminal size={20} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-black text-white truncate">{res.subdomain}</span>
                                                <span className="text-[10px] font-mono text-zinc-500">{res.ip || "N/A"}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-black text-green-400 uppercase italic">
                                                {res.status}
                                            </div>
                                            <button className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all opacity-0 group-hover/item:opacity-100">
                                                <ExternalLink size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            !loading && (
                                <div className="glass rounded-[48px] p-20 text-center flex flex-col items-center gap-4 border-dashed border-white/10 opacity-30">
                                    <Globe size={64} className="text-zinc-700" />
                                    <p className="text-zinc-500 font-bold uppercase tracking-widest italic">Enter a domain to begin enumeration</p>
                                </div>
                            )
                        )}

                        {loading && (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="glass h-20 rounded-[24px] border border-white/5 animate-pulse" />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Intel Column */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="glass shadow-xl shadow-brand-500/5 rounded-[40px] p-8 border border-white/5 space-y-6 relative overflow-hidden group">
                        <div className="absolute -right-8 -top-8 w-48 h-48 bg-brand-500/5 blur-[100px] rounded-full group-hover:bg-brand-500/10 transition-all duration-700" />
                        <div className="relative">
                            <h4 className="text-lg font-black text-white italic uppercase tracking-tighter mb-4">Recon Strategy</h4>
                            <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                                We utilize high-speed DNS resolution to identify potential attack vectors across the sub-domain landscape.
                                All discovered endpoints can be instantly <span className="text-brand-400 font-bold italic">PRO-TRIAGED</span> for security misconfigurations.
                            </p>
                            <div className="pt-6 border-t border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-zinc-600 uppercase">Detection Rate</span>
                                    <span className="text-xs font-black text-brand-400">98.2%</span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand-500 w-[98%] shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card !p-8 relative overflow-hidden h-fit flex flex-col gap-6">
                        <div className="absolute -left-8 -bottom-8 w-48 h-48 bg-accent-500/5 blur-[100px] rounded-full" />
                        <div className="relative space-y-1">
                            <h4 className="text-xl font-black text-white italic uppercase">Audit Mode</h4>
                            <p className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase">Stealth Level: PASSIVE-ACTIVE</p>
                        </div>
                        <div className="relative flex flex-col gap-3">
                            {[
                                "DNS brute-forcing enabled",
                                "Wildcard detection active",
                                "CNAME shadow check",
                                "Zone transfer test"
                            ].map((text, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs text-zinc-400 font-medium">
                                    <div className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                                    {text}
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" className="w-full h-12 border-white/5 hover:bg-white/5 text-zinc-500 hover:text-white font-bold relative">
                            View Advance Config <ArrowRight size={14} className="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
