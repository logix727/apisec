import { useState } from "react";
import { Button } from "./ui/button";
import { Brain, Sparkles, Zap, AlertCircle, CheckCircle, Loader2, Server, MessageCircle, Mail, Shield } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface TriageSuggestion {
    severity_assessment: string;
    false_positive_likelihood: string;
    owasp_category: string;
    remediation_hint: string;
    similar_cves: string[];
}

interface AIAssistantProps {
    findingId: number;
    findingName: string;
    description: string;
    evidence: string;
    url: string;
}

export default function AIAssistant({ findingId, findingName, description, evidence, url }: AIAssistantProps) {
    const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkAvailability = async () => {
        try {
            const available = await invoke<boolean>("check_llm_availability");
            setIsAvailable(available);
            return available;
        } catch (e) {
            setIsAvailable(false);
            return false;
        }
    };

    const getTriage = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const available = await checkAvailability();
            if (!available) {
                setError("Ollama is not running. Start Ollama with 'ollama serve' to enable AI triage.");
                setIsLoading(false);
                return;
            }

            const result = await invoke<TriageSuggestion>("ai_triage_finding", {
                findingId,
                findingName,
                description,
                evidence: evidence.substring(0, 500), // Limit evidence length
                url
            });

            setSuggestion(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Brain className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase italic tracking-tight">AI Triage Assistant</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Powered by Local LLM</p>
                    </div>
                </div>

                {isAvailable !== null && (
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold",
                        isAvailable
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}>
                        <Server size={12} />
                        {isAvailable ? "Ollama Online" : "Ollama Offline"}
                    </div>
                )}
            </div>

            {!suggestion && !isLoading && (
                <Button
                    onClick={getTriage}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-black shadow-lg shadow-purple-500/20 flex items-center gap-2"
                >
                    <Sparkles size={16} />
                    Analyze with AI
                </Button>
            )}

            {isLoading && (
                <div className="p-6 rounded-2xl border border-purple-500/20 bg-purple-500/5 flex flex-col items-center gap-4 animate-pulse">
                    <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                    <p className="text-sm text-purple-300 font-bold">AI is analyzing this finding...</p>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-red-400">AI Analysis Failed</p>
                        <p className="text-xs text-red-300/70 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {suggestion && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Severity Assessment */}
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                        <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-orange-400" />
                            <span className="text-xs font-black text-white uppercase">Severity Assessment</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{suggestion.severity_assessment}</p>
                    </div>

                    {/* False Positive Likelihood */}
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-400" />
                            <span className="text-xs font-black text-white uppercase">False Positive Analysis</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{suggestion.false_positive_likelihood}</p>
                    </div>

                    {/* OWASP Category */}
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-400" />
                            <span className="text-xs font-black text-white uppercase">OWASP Top 10 API Mapping</span>
                        </div>
                        <p className="text-sm text-zinc-300 font-bold leading-relaxed">{suggestion.owasp_category}</p>
                    </div>

                    {/* Remediation Hint */}
                    <div className="p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 space-y-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-brand-400" />
                            <span className="text-xs font-black text-white uppercase">Remediation Hint</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{suggestion.remediation_hint}</p>
                    </div>

                    {/* Similar CVEs */}
                    {suggestion.similar_cves.length > 0 && (
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
                            <span className="text-xs font-black text-white uppercase">Related CVEs</span>
                            <div className="flex flex-wrap gap-2">
                                {suggestion.similar_cves.map((cve, i) => (
                                    <a
                                        key={i}
                                        href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1 rounded-lg bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-400 hover:text-brand-400 hover:border-brand-500/30 transition-all"
                                    >
                                        {cve}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/5 space-y-3">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest pl-1">Escalate Finding</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const body = encodeURIComponent(`Hi, we found a security issue on ${url}.\n\nFinding: ${findingName}\nOWASP: ${suggestion.owasp_category}\n\n${suggestion.remediation_hint}`);
                                    window.open(`mailto:?subject=Security Triage: ${findingName}&body=${body}`);
                                }}
                                className="h-10 rounded-xl border-white/5 bg-zinc-900/40 text-xs font-bold text-zinc-400 hover:text-white hover:border-blue-500/30 transition-all"
                            >
                                <Mail size={14} className="mr-2" />
                                Outlook
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const msg = encodeURIComponent(`Security Triage for ${url}\nFinding: ${findingName}\nOWASP: ${suggestion.owasp_category}`);
                                    window.open(`https://teams.microsoft.com/l/chat/0/0?users=&message=${msg}`);
                                }}
                                className="h-10 rounded-xl border-white/5 bg-zinc-900/40 text-xs font-bold text-zinc-400 hover:text-white hover:border-purple-500/30 transition-all"
                            >
                                <MessageCircle size={14} className="mr-2" />
                                Teams
                            </Button>
                        </div>
                    </div>

                    <Button
                        onClick={getTriage}
                        variant="ghost"
                        className="w-full text-[10px] font-black uppercase text-zinc-600 hover:text-purple-400 py-6"
                    >
                        <Zap size={10} className="mr-1" /> Re-analyze Signature
                    </Button>
                </div>
            )}
        </div>
    );
}
