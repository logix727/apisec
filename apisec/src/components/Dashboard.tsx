import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useDropzone } from "react-dropzone";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ImportResult, BatchImportResult } from "../types";
import {
    Upload,
    Globe,
    ShieldAlert,
    Eye,
    EyeOff,
    Database,
    Terminal,
    Fingerprint,
    Zap,
    ArrowRight,
    Check,
    FolderPlus,
    Layout
} from "lucide-react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { cn } from "../lib/utils";
import { Asset, Finding } from "../types";

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState<"import" | "results">("import");
    const [pasteContent, setPasteContent] = useState("");
    const [results, setResults] = useState<ImportResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [monitorEnabled, setMonitorEnabled] = useState(false);
    const [importStatus, setImportStatus] = useState<BatchImportResult | null>(null);
    const [globalStats, setGlobalStats] = useState<{
        assets: Asset[],
        findings: Finding[],
        loading: boolean
    }>({ assets: [], findings: [], loading: true });

    const loadGlobalStats = async () => {
        try {
            const assets = await invoke<Asset[]>("get_assets");
            const allFindings: Finding[] = [];
            for (const asset of assets) {
                const f = await invoke<Finding[]>("get_findings", { asset_id: asset.id });
                allFindings.push(...f);
            }
            setGlobalStats({ assets, findings: allFindings, loading: false });
        } catch (e) {
            console.error("Failed to load global stats:", e);
            setGlobalStats(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        loadGlobalStats();
    }, []);

    // Listen for clipboard updates from backend
    useEffect(() => {
        const unlistenPromise = listen<string>("clipboard-update", (event) => {
            const content = event.payload;
            console.log("Clipboard update received:", content);
            setPasteContent(content);
            handleParse(content, "text");
        });

        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    const toggleMonitor = useCallback(async () => {
        const newState = !monitorEnabled;
        setMonitorEnabled(newState);
        try {
            await invoke("set_clipboard_monitor", { enable: newState });
        } catch (e) {
            console.error("Failed to toggle monitor:", e);
            setError("Failed to toggle clipboard monitor");
            setMonitorEnabled(!newState);
        }
    }, [monitorEnabled]);

    const handleParse = async (content: string, type: "text" | "excel" | "har" | "burp" | "postman", bytes?: number[]) => {
        setIsProcessing(true);
        setError(null);
        setImportStatus(null);
        try {
            let res: ImportResult;
            if (type === "excel" && bytes) {
                res = await invoke<ImportResult>("parse_binary_content", {
                    content: bytes,
                    sourceType: "excel",
                });
            } else {
                res = await invoke<ImportResult>("parse_content", {
                    content: content,
                    sourceType: type,
                });
            }
            setResults(res);
            setActiveTab("results");
        } catch (e) {
            setError(String(e));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddToWorkspace = async () => {
        if (!results || results.entries.length === 0) return;
        setIsProcessing(true);
        setImportStatus(null);
        try {
            const res = await invoke<BatchImportResult>("batch_import_full", {
                entries: results.entries,
                source: results.source_type
            });
            setImportStatus(res);
        } catch (e) {
            setError("Failed to add assets: " + String(e));
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePasteImport = () => handleParse(pasteContent, "text");

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        try {
            if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
                const arrayBuffer = await file.arrayBuffer();
                const bytes = Array.from(new Uint8Array(arrayBuffer));
                handleParse("", "excel", bytes);
            } else if (file.name.endsWith(".har")) {
                const text = await file.text();
                handleParse(text, "har");
            } else if (file.name.endsWith(".xml")) {
                const text = await file.text();
                handleParse(text, "burp");
            } else if (file.name.endsWith(".json")) {
                const text = await file.text();
                handleParse(text, "postman");
            } else {
                const text = await file.text();
                handleParse(text, "text");
            }
        } catch (e) {
            setError(String(e));
        }
    }, [handleParse]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

    const allFindings = results?.entries.flatMap(e => e.findings) || [];
    const uniqueDomainsCount = new Set(results?.entries.map(e => {
        try { return new URL(e.url).hostname } catch { return e.url }
    })).size;

    // Chart Data Preparation
    const severityData = [
        { name: 'High', value: globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'High').length, color: '#ef4444' },
        { name: 'Medium', value: globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'Medium').length, color: '#f97316' },
        { name: 'Low', value: globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'Low').length, color: '#facc15' },
        { name: 'Info', value: globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'Info').length, color: '#3b82f6' },
    ].filter(d => d.value > 0);

    const findingsPerAsset = globalStats.assets
        .map(a => ({ name: a.url.replace(/https?:\/\//, '').slice(0, 20), val: a.findings_count || 0 }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 5);

    const highFindings = globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'High').length;
    const medFindings = globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'Medium').length;
    const lowFindings = globalStats.findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === 'Low').length;

    const postureScore = globalStats.assets.length === 0 ? 100 : Math.max(0, 100 - Math.round((highFindings * 15 + medFindings * 5 + lowFindings * 2) / Math.sqrt(globalStats.assets.length + 1)));
    const postureStatus = postureScore > 90 ? "OPTIMAL" : postureScore > 70 ? "STABLE" : postureScore > 40 ? "DEGRADED" : "CRITICAL";
    const statusColor = postureScore > 90 ? "text-green-500" : postureScore > 70 ? "text-brand-400" : postureScore > 40 ? "text-orange-500" : "text-red-500";

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Hero Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-5xl font-bold tracking-tight animated-gradient-text">
                        Security Workbench
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-lg">
                        Paste any text, logs, or API traffic — we'll extract all HTTP URLs and add them to your workspace automatically.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={toggleMonitor}
                        className={cn(
                            "h-12 px-6 rounded-2xl border-white/5 bg-zinc-900/40 backdrop-blur-xl transition-all duration-500",
                            monitorEnabled
                                ? "text-brand-400 border-brand-500/20 bg-brand-500/5 glow-primary"
                                : "text-zinc-400 hover:text-white"
                        )}
                    >
                        {monitorEnabled ? <Eye className="mr-2 h-5 w-5" /> : <EyeOff className="mr-2 h-5 w-5" />}
                        {monitorEnabled ? "Active Ingest" : "Enable Monitor"}
                    </Button>
                    <div className="h-10 w-px bg-white/5" />
                    <Button
                        variant={activeTab === "import" ? "accent" : "outline"}
                        onClick={() => setActiveTab("import")}
                        className="h-12 rounded-2xl px-6"
                    >
                        <Upload className="mr-2 h-5 w-5" /> Ingest
                    </Button>
                    <Button
                        variant={activeTab === "results" ? "accent" : "outline"}
                        onClick={() => setActiveTab("results")}
                        disabled={!results}
                        className="h-12 rounded-2xl px-6"
                    >
                        <Zap className="mr-2 h-5 w-5" /> Results
                    </Button>
                </div>
            </div>

            {/* Global Insights Section (Visible when no active import results are taking focus) */}
            {!results && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="lg:col-span-1 glass-card flex flex-col justify-between relative overflow-hidden group border-brand-500/20">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-active">
                            <ShieldAlert className="h-32 w-32" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Live Workspace Posture</span>
                            <h3 className="text-4xl font-black italic tracking-tighter">SURFACE SCORE</h3>
                        </div>
                        <div className="py-8 flex items-baseline gap-2">
                            <span className={cn("text-7xl font-black tracking-tighter italic", statusColor)}>{postureScore}</span>
                            <span className="text-xl font-bold text-zinc-600">/100</span>
                        </div>
                        <div className="space-y-3">
                            <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-1000 shadow-[0_0_12px_currentColor]", statusColor.replace("text-", "bg-"))}
                                    style={{ width: `${postureScore}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className={cn("text-xs font-black uppercase tracking-widest", statusColor)}>{postureStatus}</span>
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">Risk Level: {100 - postureScore}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 glass-card space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5 text-brand-400" />
                                Findings by Root Asset
                            </h3>
                            <span className="text-xs font-mono text-zinc-500 uppercase">Top 5 Impacted</span>
                        </div>
                        <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={findingsPerAsset}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis dataKey="name" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                                    />
                                    <Bar dataKey="val" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="glass-card flex flex-col space-y-6">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Layout className="h-5 w-5 text-accent-400" />
                            Severities
                        </h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={severityData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {severityData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                    />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontStyle: 'bold' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "import" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Paste Zone */}
                    <div className="glass-card group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-accent-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                        <div className="relative space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center border border-brand-500/20">
                                        <Terminal className="h-5 w-5 text-brand-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Paste Plain Text</h3>
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold bg-zinc-800/50 px-2 py-1 rounded">LOGS / NOTES / TRAFFIC</span>
                            </div>

                            <div className="relative">
                                <Textarea
                                    placeholder="Paste anything here...

We'll automatically extract:
• http:// and https:// URLs
• API endpoints
• Domains

Example:
Check out https://api.example.com/v1/users and
also the staging server at http://staging.test.io/health"
                                    className="min-h-[280px] bg-zinc-950/50 border-white/5 rounded-xl font-mono text-sm leading-relaxed p-6 focus-visible:ring-brand-500/50"
                                    value={pasteContent}
                                    onChange={(e) => setPasteContent(e.target.value)}
                                />
                                {pasteContent.length > 0 && (
                                    <button
                                        onClick={() => setPasteContent("")}
                                        className="absolute bottom-4 right-4 text-zinc-500 hover:text-zinc-300 text-xs px-2 py-1 rounded bg-zinc-900 border border-white/5 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            <Button
                                onClick={handlePasteImport}
                                className="w-full h-14 rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-bold text-lg group active:scale-95 transition-all shadow-xl shadow-brand-500/10"
                                disabled={isProcessing || !pasteContent.trim()}
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        Extracting URLs...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        Extract & Analyze
                                        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Drop Zone */}
                    <div className="glass-card group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-500/20 to-brand-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                        <div className="relative h-full flex flex-col space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-accent-500/10 flex items-center justify-center border border-accent-500/20">
                                        <Database className="h-5 w-5 text-accent-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Import Files</h3>
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold bg-zinc-800/50 px-2 py-1 rounded">EXCEL / TXT / HAR</span>
                            </div>

                            <div
                                {...getRootProps()}
                                className={cn(
                                    "flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-500 min-h-[280px]",
                                    isDragActive
                                        ? "border-accent-500 bg-accent-500/5 shadow-[0_0_40px_-10px_rgba(168,85,247,0.2)]"
                                        : "border-white/5 hover:border-accent-500/50 hover:bg-white/5"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className="text-center p-8 space-y-4">
                                    <div className="h-16 w-16 rounded-full bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mx-auto text-accent-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                                        <Upload className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xl font-bold text-zinc-100">
                                            {isDragActive ? "Release to Scan" : "Drag & Drop Files"}
                                        </p>
                                        <p className="text-sm text-zinc-500 max-w-[200px] mx-auto">
                                            Drop any file containing URLs — HAR traffic, Excel lists, etc.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "results" && results && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: "Endpoints Found", val: results.entries.length, icon: Globe, color: "text-brand-400", bg: "bg-brand-400/10", border: "border-brand-400/20" },
                            { label: "Unique Hostnames", val: uniqueDomainsCount, icon: Fingerprint, color: "text-accent-400", bg: "bg-accent-400/10", border: "border-accent-400/20" },
                            { label: "Total Findings", val: allFindings.length, icon: ShieldAlert, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
                            { label: "Ready to Add", val: results.entries.length > 0 ? "Yes" : "No", icon: Zap, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20" },
                        ].map((stat, i) => (
                            <div key={i} className="glass rounded-2xl p-6 border border-white/5 flex items-center gap-4">
                                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center border", stat.bg, stat.border)}>
                                    <stat.icon className={cn("h-6 w-6", stat.color)} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{stat.label}</span>
                                    <span className="text-2xl font-bold text-white mt-0.5">{stat.val}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {results.entries.length > 0 && (
                        <div className="glass-card !p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-brand-500/20 bg-brand-500/5">
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-brand-500/20 flex items-center justify-center border border-brand-500/30">
                                    <FolderPlus className="h-7 w-7 text-brand-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Add {results.entries.length} Endpoints to Workspace</h3>
                                    <p className="text-sm text-zinc-400">Import extracted data including request/response bodies and findings.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {importStatus && (
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400">
                                        <Check className="h-4 w-4" />
                                        <span className="text-sm font-bold">{importStatus.added} added, {importStatus.skipped} failed/skipped</span>
                                    </div>
                                )}
                                <Button
                                    onClick={handleAddToWorkspace}
                                    disabled={isProcessing || importStatus !== null}
                                    className="h-12 px-8 rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-bold active:scale-95 transition-all"
                                >
                                    {isProcessing ? (
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                            Adding...
                                        </div>
                                    ) : importStatus ? (
                                        <div className="flex items-center gap-2">
                                            <Check className="h-5 w-5" /> Done!
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Database className="h-5 w-5" /> Add to Inventory
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        <div className="xl:col-span-2 space-y-6">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <Globe className="h-6 w-6 text-brand-400" />
                                Discovered Endpoints
                            </h3>

                            <div className="glass-card !p-2 space-y-1 max-h-[50vh] overflow-y-auto">
                                {results.entries.length > 0 ? (
                                    results.entries.map((entry, i) => (
                                        <div
                                            key={i}
                                            className="group flex items-center justify-between p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="h-10 w-10 rounded-lg bg-zinc-950 flex-shrink-0 flex items-center justify-center text-zinc-600 group-hover:text-brand-400 group-hover:scale-110 transition-all border border-white/5">
                                                    <span className="text-[10px] font-bold">{entry.method}</span>
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-mono text-sm text-zinc-300 truncate group-hover:text-white transition-colors">{entry.url}</span>
                                                    {entry.findings.length > 0 && (
                                                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">{entry.findings.length} Violations Detected</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-mono text-zinc-500">{entry.status_code || ""}</span>
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full shadow-[0_0_8px] transition-opacity",
                                                    entry.findings.length > 0 ? "bg-red-500 shadow-red-500" : "bg-brand-500 shadow-brand-500 opacity-0 group-hover:opacity-100"
                                                )} />
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                        <div className="h-16 w-16 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-600">
                                            <Globe className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <p className="text-xl font-bold text-white">No Endpoints Found</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <ShieldAlert className="h-6 w-6 text-red-400" />
                                Top Findings
                            </h3>
                            <div className="space-y-4">
                                {allFindings.length > 0 ? (
                                    allFindings.slice(0, 10).map((f, i) => (
                                        <div key={i} className="glass rounded-xl p-4 border border-white/5 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-tighter",
                                                    f.severity === "High" ? "bg-red-500/20 text-red-400" :
                                                        f.severity === "Medium" ? "bg-orange-500/20 text-orange-400" :
                                                            "bg-yellow-500/20 text-yellow-400"
                                                )}>
                                                    {f.severity}
                                                </span>
                                                <span className="text-sm font-bold text-white truncate">{f.name}</span>
                                            </div>
                                            <pre className="bg-black/40 rounded-lg p-2 font-mono text-[10px] text-zinc-400 overflow-x-auto">
                                                {f.match_content.slice(0, 80)}...
                                            </pre>
                                        </div>
                                    ))
                                ) : (
                                    <div className="glass rounded-xl p-8 border border-white/5 flex flex-col items-center text-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500">
                                            <Check className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm text-zinc-400">No security issues detected in this content.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="fixed bottom-8 right-8 bg-red-950/90 backdrop-blur-2xl border border-red-500/50 text-white p-5 rounded-2xl shadow-2xl flex items-start gap-4 animate-in slide-in-from-right-8 fade-in max-w-md z-50">
                    <div className="h-10 w-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h5 className="font-bold text-lg">System Error</h5>
                        <p className="text-sm text-red-200/70 leading-relaxed">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-white transition-colors p-1">
                        <EyeOff className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
