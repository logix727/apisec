import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Palette, Database, Shield, Trash2, Save, RefreshCw, Zap, Plus, X, AlertCircle, Bell, MessageSquare } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface CustomRule {
    id?: number;
    name: string;
    description: string;
    regex: string;
    severity: string;
    rule_id: string;
}

export default function Settings() {
    const [accentColor, setAccentColor] = useState(() => localStorage.getItem("apisec-accent") || "#3b82f6");
    const [secondaryColor, setSecondaryColor] = useState(() => localStorage.getItem("apisec-secondary") || "#a855f7");
    const [activeSubTab, setActiveSubTab] = useState<"general" | "rules" | "integrations">("general");

    // Webhook state
    const [webhookUrl, setWebhookUrl] = useState("");
    const [wbSaving, setWbSaving] = useState(false);
    // Rule state
    const [rules, setRules] = useState<CustomRule[]>([]);
    const [newRule, setNewRule] = useState<CustomRule>({
        name: "",
        description: "",
        regex: "",
        severity: "Medium",
        rule_id: "CUSTOM-001"
    });
    const [isSaving, setIsSaving] = useState(false);

    const loadRules = async () => {
        try {
            const r = await invoke<CustomRule[]>("get_custom_rules");
            setRules(r || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadSettings = async () => {
        try {
            const url = await invoke<string | null>("get_webhook");
            if (url) setWebhookUrl(url);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadRules();
        loadSettings();
    }, []);

    const handleSaveWebhook = async () => {
        setWbSaving(true);
        try {
            await invoke("set_webhook", { url: webhookUrl });
        } catch (e) {
            alert("Failed to save webhook: " + e);
        } finally {
            setWbSaving(false);
        }
    };

    const handleAddRule = async () => {
        if (!newRule.name || !newRule.regex || !newRule.rule_id) return;
        setIsSaving(true);
        try {
            await invoke("add_custom_rule", { rule: newRule });
            setNewRule({
                name: "",
                description: "",
                regex: "",
                severity: "Medium",
                rule_id: `CUSTOM-${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`
            });
            await loadRules();
        } catch (e) {
            alert("Failed to add rule: " + e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm("Delete this rule?")) return;
        try {
            await invoke("delete_custom_rule", { id });
            await loadRules();
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        document.documentElement.style.setProperty('--brand-500', accentColor);
        localStorage.setItem("apisec-accent", accentColor);
    }, [accentColor]);

    useEffect(() => {
        document.documentElement.style.setProperty('--accent-500', secondaryColor);
        localStorage.setItem("apisec-secondary", secondaryColor);
    }, [secondaryColor]);

    const handleResetColors = () => {
        setAccentColor("#3b82f6");
        setSecondaryColor("#a855f7");
    };

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="space-y-1">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">Settings & Identity</h2>
                <div className="flex items-center gap-4 mt-6">
                    <button
                        onClick={() => setActiveSubTab("general")}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all border",
                            activeSubTab === "general"
                                ? "bg-brand-500 text-black border-brand-500 shadow-lg shadow-brand-500/20"
                                : "text-zinc-500 border-white/5 hover:text-white"
                        )}
                    >
                        General Configuration
                    </button>
                    <button
                        onClick={() => setActiveSubTab("rules")}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all border",
                            activeSubTab === "rules"
                                ? "bg-accent-500 text-white border-accent-500 shadow-lg shadow-accent-500/20"
                                : "text-zinc-500 border-white/5 hover:text-white"
                        )}
                    >
                        Custom Rule Engine
                    </button>
                    <button
                        onClick={() => setActiveSubTab("integrations")}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all border",
                            activeSubTab === "integrations"
                                ? "bg-zinc-100 text-black border-zinc-100 shadow-lg shadow-zinc-100/20"
                                : "text-zinc-500 border-white/5 hover:text-white"
                        )}
                    >
                        Incidents & ChatOps
                    </button>
                </div>
            </div>

            {activeSubTab === "general" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Visual Identity */}
                    <div className="glass-card space-y-6">
                        <div className="flex items-center gap-3">
                            <Palette className="text-brand-400 h-6 w-6" />
                            <h3 className="text-xl font-bold text-white italic">Appearance</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white">Primary Accent</span>
                                    <span className="text-xs text-zinc-500">Main brand color (Default Blue)</span>
                                </div>
                                <input
                                    type="color"
                                    value={accentColor}
                                    onChange={(e) => setAccentColor(e.target.value)}
                                    className="h-10 w-10 rounded-lg cursor-pointer bg-transparent border-none"
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white">Secondary Accent</span>
                                    <span className="text-xs text-zinc-500">Highlights and gradients (Default Purple)</span>
                                </div>
                                <input
                                    type="color"
                                    value={secondaryColor}
                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                    className="h-10 w-10 rounded-lg cursor-pointer bg-transparent border-none"
                                />
                            </div>

                            <Button variant="outline" onClick={handleResetColors} className="w-full h-11 border-white/10">
                                <RefreshCw className="mr-2 h-4 w-4" /> Reset to Defaults
                            </Button>
                        </div>
                    </div>

                    {/* Data Management */}
                    <div className="glass-card space-y-6">
                        <div className="flex items-center gap-3">
                            <Database className="text-accent-400 h-6 w-6" />
                            <h3 className="text-xl font-bold text-white italic">Data Controls</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white">Export Database</span>
                                    <span className="text-xs text-zinc-500">Backup your entire workspace as a SQLite file.</span>
                                </div>
                                <Button variant="outline" className="h-11 border-zinc-700 hover:bg-white/5">
                                    <Save className="mr-2 h-4 w-4" /> Export Backup
                                </Button>
                            </div>

                            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 flex flex-col gap-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-red-400">Purge Data</span>
                                    <span className="text-xs text-red-200/40">Permanently delete all assets and findings in this workspace.</span>
                                </div>
                                <Button variant="outline" className="h-11 border-red-500/20 text-red-400 hover:bg-red-500/10">
                                    <Trash2 className="mr-2 h-4 w-4" /> Clear Current Workspace
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Rule Form */}
                    <div className="lg:col-span-1 glass-card space-y-6 h-fit sticky top-24">
                        <div className="flex items-center gap-3">
                            <Plus className="text-accent-400 h-6 w-6" />
                            <h3 className="text-xl font-bold text-white italic">Create Rule</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Rule ID (Unique)</label>
                                <input
                                    className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-accent-500 outline-none transition-all"
                                    value={newRule.rule_id}
                                    onChange={e => setNewRule({ ...newRule, rule_id: e.target.value })}
                                    placeholder="e.g. CUSTOM-SQLI"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Rule Name</label>
                                <input
                                    className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-accent-500 outline-none transition-all"
                                    value={newRule.name}
                                    onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                                    placeholder="e.g. My Custom SQLi"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Regex Pattern</label>
                                <input
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-accent-500 outline-none transition-all"
                                    value={newRule.regex}
                                    onChange={e => setNewRule({ ...newRule, regex: e.target.value })}
                                    placeholder="e.g. (SELECT|UNION).*"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Severity</label>
                                <select
                                    className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-accent-500 outline-none transition-all"
                                    value={newRule.severity}
                                    onChange={e => setNewRule({ ...newRule, severity: e.target.value })}
                                >
                                    <option>High</option>
                                    <option>Medium</option>
                                    <option>Low</option>
                                    <option>Info</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Description</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-accent-500 outline-none transition-all min-h-[80px]"
                                    value={newRule.description}
                                    onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                                />
                            </div>

                            <Button
                                onClick={handleAddRule}
                                disabled={isSaving}
                                className="w-full h-12 bg-accent-500 hover:bg-accent-400 text-white font-bold"
                            >
                                {isSaving ? "Saving..." : "Add to Engine"}
                            </Button>
                        </div>
                    </div>

                    {/* Rules List */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold flex items-center gap-2 italic">
                                <Zap className="h-5 w-5 text-accent-400" />
                                Active Custom Signatures
                            </h3>
                            <span className="text-xs font-mono text-zinc-500">{rules?.length || 0} custom rules</span>
                        </div>

                        <div className="grid gap-3 overflow-y-auto pr-2">
                            {rules && rules.length > 0 ? (
                                rules.map(rule => (
                                    <div key={rule.id} className="glass rounded-2xl p-4 border border-white/5 group relative">
                                        <button
                                            onClick={() => rule.id && handleDeleteRule(rule.id)}
                                            className="absolute top-4 right-4 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <X size={16} />
                                        </button>
                                        <div className="flex items-start gap-4">
                                            <div className={cn(
                                                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border",
                                                rule.severity === "High" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                                    rule.severity === "Medium" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                                                        "bg-brand-500/10 border-brand-500/20 text-brand-400"
                                            )}>
                                                <AlertCircle size={20} />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white uppercase text-xs">{rule.rule_id}</span>
                                                    <span className="text-sm font-bold text-zinc-300">{rule.name}</span>
                                                </div>
                                                <p className="text-xs text-zinc-500 line-clamp-1 italic">{rule.description}</p>
                                                <div className="bg-black/40 rounded-lg p-2 mt-2 font-mono text-[10px] text-accent-400 border border-white/5">
                                                    {rule.regex}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="glass rounded-3xl p-12 text-center flex flex-col items-center gap-4 border-dashed border-white/5 opacity-50">
                                    <Zap size={48} className="text-zinc-700" />
                                    <p className="text-zinc-500">No custom signatures defined yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === "integrations" && (
                <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="glass-card space-y-6">
                        <div className="flex items-center gap-3">
                            <Bell className="text-brand-400 h-6 w-6" />
                            <h3 className="text-xl font-bold text-white italic">Webhook Notifications</h3>
                        </div>

                        <p className="text-sm text-zinc-500 leading-relaxed">
                            APISec Analyst Pro can automatically push critical findings to your security or development channels.
                            Supported formats: **Slack**, **Microsoft Teams**, and **Discord**.
                        </p>

                        <div className="space-y-4 pt-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Incoming Webhook URL</label>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-500 outline-none transition-all font-mono text-brand-300"
                                        value={webhookUrl}
                                        onChange={e => setWebhookUrl(e.target.value)}
                                        placeholder="https://hooks.slack.com/services/..."
                                    />
                                    <Button
                                        onClick={handleSaveWebhook}
                                        disabled={wbSaving}
                                        className="bg-brand-500 hover:bg-brand-400 text-black font-black px-6"
                                    >
                                        {wbSaving ? "SAVING..." : "SAVE"}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-4 group hover:border-brand-500/30 transition-all cursor-pointer">
                                    <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-brand-400">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white">Slack Connect</span>
                                        <span className="text-[10px] text-zinc-500">Post finding summaries</span>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-4 group hover:border-brand-500/30 transition-all cursor-pointer opacity-50">
                                    <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-500">
                                        <Shield size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-zinc-400">Splunk SIEM</span>
                                        <span className="text-[10px] text-zinc-600">Enterprise Only</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 glass rounded-[32px] border border-brand-500/20 bg-brand-500/5 relative overflow-hidden group">
                        <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-brand-500/10 blur-[100px] rounded-full group-hover:bg-brand-500/20 transition-all duration-700" />
                        <div className="relative flex flex-col gap-4">
                            <h4 className="text-lg font-black text-white italic uppercase tracking-tight">Automation Pilot</h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                Once configured, use the <span className="text-brand-400 font-bold italic">PRO-TRIAGE</span> workflow to instantly
                                broadcast discovered JWT leaks or PII exposures to your incident team.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass shadow-2xl shadow-brand-500/5 rounded-3xl p-8 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 mt-12">
                <div className="flex items-center gap-6">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white shadow-xl shadow-brand-500/20">
                        <Shield size={32} />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-2xl font-black text-white italic">Analyst Pro <span className="text-brand-400">Elite</span></h4>
                        <p className="text-sm text-zinc-500">Advanced API Security Workbench | v0.1.0-READY</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 border-white/10 hover:bg-white/5 text-zinc-400">
                        Check for Updates
                    </Button>
                    <Button className="h-12 bg-zinc-100 text-black font-black px-8 rounded-xl hover:bg-white">
                        License Details
                    </Button>
                </div>
            </div>
        </div>
    );
}
