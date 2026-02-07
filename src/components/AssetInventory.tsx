import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Asset, Finding } from "../types";
import {
    Search,
    Filter,
    Globe,
    ShieldAlert,
    ArrowUpDown,
    X,
    Code,
    Copy,
    Check,
    Maximize2,
    ExternalLink,
    Tag,
    Plus,
    Share2,
    FileText,
    Play,
    Send,
    Clock,
    Trash2,
    Zap,
    Terminal,
    ExternalLink as PostmanIcon,
} from "lucide-react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-http";
import jsPDF from "jspdf";
import "jspdf-autotable";
// @ts-ignore
import { autoTable } from "jspdf-autotable";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import AIAssistant from "./AIAssistant";

interface AssetInventoryProps {
    onSendToRepeater?: (data: { url: string; method: string; body?: string; headers?: Record<string, string> }) => void;
}

export default function AssetInventory({ onSendToRepeater }: AssetInventoryProps) {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterSource, setFilterSource] = useState<string>("all");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [sortBy, setSortBy] = useState<"last_seen" | "violations">("last_seen");
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [findings, setFindings] = useState<Finding[]>([]);
    const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [assetTags, setAssetTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [copied, setCopied] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<"details" | "findings" | "history">("details");
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    useEffect(() => {
        loadAssets();
    }, []);

    const loadAssets = async () => {
        setIsLoading(true);
        try {
            const data = await invoke<Asset[]>("get_assets");
            setAssets(data);
        } catch (e) {
            console.error("Failed to load assets:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectAsset = async (asset: Asset) => {
        setSelectedAsset(asset);
        setActiveTab("details");
        try {
            const [findingsData, tagsData, historyData] = await Promise.all([
                invoke<Finding[]>("get_findings", { assetId: asset.id }),
                invoke<string[]>("get_asset_tags", { assetId: asset.id }),
                invoke<any[]>("get_asset_history", { assetId: asset.id })
            ]);
            setFindings(findingsData);
            setAssetTags(tagsData);
            setHistory(historyData);
        } catch (e) {
            console.error(e);
            setFindings([]);
            setAssetTags([]);
            setHistory([]);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUpdateAnnotation = async (updates: Partial<Finding>) => {
        if (!selectedFinding || !selectedFinding.id) return;
        setIsSaving(true);
        try {
            await invoke("update_finding_annotation", {
                request: {
                    id: selectedFinding.id,
                    notes: updates.notes !== undefined ? updates.notes : selectedFinding.notes,
                    is_false_positive: updates.is_false_positive !== undefined ? updates.is_false_positive : selectedFinding.is_false_positive,
                    severity_override: updates.severity_override !== undefined ? updates.severity_override : selectedFinding.severity_override
                }
            });

            // Refresh findings
            if (selectedAsset) {
                const data = await invoke<Finding[]>("get_findings", { assetId: selectedAsset.id });
                setFindings(data);
                const updated = data.find(f => f.id === selectedFinding.id);
                if (updated) setSelectedFinding(updated);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleSelect = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === filteredAssets.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredAssets.map(a => a.id));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} assets?`)) return;
        try {
            for (const id of selectedIds) {
                await invoke("delete_asset", { id });
            }
            setSelectedIds([]);
            loadAssets();
        } catch (e) {
            alert(e);
        }
    };

    const handleBulkTag = async () => {
        const tag = prompt("Enter tag name to apply to all selected assets:");
        if (!tag) return;
        try {
            for (const id of selectedIds) {
                await invoke("add_asset_tag", { assetId: id, tagName: tag });
            }
            setSelectedIds([]);
            loadAssets();
        } catch (e) {
            alert(e);
        }
    };

    const handleToggleTag = async (tagName: string) => {
        if (!selectedAsset) return;
        try {
            if (assetTags.includes(tagName)) {
                await invoke("remove_asset_tag", { assetId: selectedAsset.id, tagName });
                setAssetTags(prev => prev.filter(t => t !== tagName));
            } else {
                await invoke("add_asset_tag", { assetId: selectedAsset.id, tagName });
                setAssetTags(prev => [...prev, tagName]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleGenerateAssetSummary = () => {
        if (!selectedAsset) return;

        const hf = findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "High");
        const mf = findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "Medium");

        let report = `🚨 **API Security Triage Report**\n`;
        report += `**Asset:** ${selectedAsset.url}\n`;
        report += `**Method:** ${selectedAsset.method || 'GET'}\n`;
        report += `**Risk Level:** ${hf.length > 0 ? 'CRITICAL / HIGH' : mf.length > 0 ? 'MEDIUM' : 'LOW'}\n`;
        report += `**Active Findings:** ${findings.filter(f => !f.is_false_positive).length}\n\n`;

        report += `--- \n\n`;
        report += `**Key Vulnerabilities:**\n`;

        findings.filter(f => !f.is_false_positive).forEach((f, i) => {
            report += `${i + 1}. **${f.name}** [${f.severity_override || f.severity}]\n`;
            report += `   - *Description:* ${f.description}\n`;
            if (f.notes) report += `   - *Analyst Notes:* ${f.notes}\n`;
            report += `   - *Evidence Match (truncated):* \`${f.match_content.slice(0, 150)}...\`\n\n`;
        });

        report += `--- \n`;
        report += `*Generated via APISec Analyst Pro*\n`;

        navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleBroadcastToSlack = async () => {
        if (!selectedAsset) return;
        setIsSaving(true);
        try {
            const hf = findings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "High").length;
            const total = findings.filter(f => !f.is_false_positive).length;

            const title = `🚨 APISec Security Alert: ${selectedAsset.url}`;
            const message = `*Risk Profile:* ${hf > 0 ? "CRITICAL" : "CAUTION"}\n*Total Findings:* ${total}\n*Source:* ${selectedAsset.source}\n\n_View more details in APISec Analyst Pro Dashboard_`;

            await invoke("send_notification", { title, message });
            alert("Broadcasted to security channel!");
        } catch (e) {
            alert("Failed to broadcast: " + e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const currentWorkspace = await invoke<string>("get_current_workspace");
        const date = new Date().toLocaleDateString();

        // --- Cover Page ---
        doc.setFillColor(24, 24, 27); // Zinc-900ish
        doc.rect(0, 0, 210, 297, "F");

        // Header Accent
        doc.setFillColor(139, 92, 246); // Brand Purple (8b5cf6)
        doc.rect(0, 0, 210, 40, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.setTextColor(255);
        doc.text("SECURITY ASSESSMENT", 14, 25);

        doc.setFontSize(14);
        doc.setTextColor(161, 161, 170); // Zinc-400
        doc.text("Executive Technical Report", 14, 33);

        doc.setFontSize(18);
        doc.setTextColor(255);
        doc.text("Project: " + currentWorkspace, 14, 80);

        doc.setFontSize(12);
        doc.setTextColor(161, 161, 170); // Zinc-400
        const statsInfo = [
            `Date: ${date}`,
            `Analyst: APISec AI Engine`,
            `Surface Size: ${assets.length} Assets`
        ];
        statsInfo.forEach((info, i) => doc.text(info, 14, 95 + (i * 8)));

        // Risk Summary Card (simulated)
        const allFindings: Finding[] = [];
        for (const asset of assets) {
            try {
                const f = await invoke<Finding[]>("get_findings", { assetId: asset.id });
                allFindings.push(...f);
            } catch (e) { }
        }

        const high = allFindings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "High").length;
        const total = allFindings.filter(f => !f.is_false_positive).length;
        const score = Math.max(0, 100 - (high * 15 + (total - high) * 5));

        doc.setFillColor(39, 39, 42); // Zinc-800
        doc.roundedRect(14, 130, 182, 50, 5, 5, "F");

        doc.setFontSize(10);
        doc.setTextColor(161, 161, 170);
        doc.text("POSTURE SCORE", 20, 142);

        doc.setFontSize(32);
        doc.setTextColor(score > 80 ? 34 : score > 50 ? 249 : 239, score > 80 ? 197 : score > 50 ? 115 : 68, score > 80 ? 94 : score > 50 ? 22 : 68); // Coloring score
        doc.text(score.toString() + "/100", 20, 165);

        doc.setFontSize(10);
        doc.setTextColor(255);
        const statusText = score > 85 ? "STABLE" : score > 60 ? "ELEVATED RISK" : "CRITICAL REMEDIATION REQUIRED";
        doc.text(statusText, 20, 175);

        doc.addPage();
        // --- End Cover Page ---

        // Page Header for Content
        const addHeader = (pageTitle: string) => {
            doc.setFillColor(24, 24, 27);
            doc.rect(0, 0, 210, 20, "F");
            doc.setFontSize(10);
            doc.setTextColor(139, 92, 246);
            doc.text("APISEC ANALYST PRO // " + pageTitle.toUpperCase(), 14, 13);
            doc.setTextColor(100);
            doc.text(date, 180, 13);
        };

        addHeader("Executive Summary");

        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("1. Vulnerability Breakdown", 14, 35);

        const summaryData = [
            ["Severity Cluster", "Count", "Percentage"],
            ["Critical / High", high.toString(), `${total > 0 ? Math.round((high / total) * 100) : 0}%`],
            ["Medium", allFindings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "Medium").length.toString(), "-"],
            ["Low / Info", allFindings.filter(f => !f.is_false_positive && (f.severity_override || f.severity) === "Low").length.toString(), "-"],
            ["Excluded (FP)", allFindings.filter(f => f.is_false_positive).length.toString(), "-"],
        ];

        (doc as any).autoTable({
            startY: 42,
            head: [summaryData[0]],
            body: summaryData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246] }
        });

        doc.setFontSize(16);
        doc.text("2. Remediation Priorities", 14, (doc as any).lastAutoTable.finalY + 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        const priorities = [
            "• Rotate any SaaS / Cloud API keys identified in the Technical Findings section.",
            "• Implement stricter BOLA (Broken Object Level Authorization) checks on public-facing IDs.",
            "• Scrub internal IP addresses and stack traces from production error bodies.",
            "• Review all findings marked as 'High' and assign to corresponding dev teams."
        ];
        priorities.forEach((p, i) => doc.text(p, 14, (doc as any).lastAutoTable.finalY + 30 + (i * 8)));

        // Findings Detail
        doc.addPage();
        addHeader("Technical Findings Detail");

        const tableData = allFindings
            .filter(f => !f.is_false_positive)
            .sort((a, b) => {
                const getPrio = (s: string) => s === "High" ? 3 : s === "Medium" ? 2 : 1;
                return getPrio(b.severity_override || b.severity) - getPrio(a.severity_override || a.severity);
            })
            .map((f) => [
                (f.severity_override || f.severity).toUpperCase(),
                f.name,
                f.rule_id,
                f.description.slice(0, 120) + (f.description.length > 120 ? "..." : "")
            ]);

        (doc as any).autoTable({
            startY: 30,
            head: [["Prio", "Vulnerability Name", "Signature ID", "Description / Impact"]],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [63, 63, 70] },
            columnStyles: {
                0: { cellWidth: 20, fontStyle: 'bold' },
                1: { cellWidth: 45 },
                2: { cellWidth: 35 },
                3: { cellWidth: 'auto' }
            }
        });

        doc.save(`APISec_Report_${currentWorkspace.replace(/\s+/g, '_')}_${date.replace(/\//g, '-')}.pdf`);
    };

    const handleDeleteAsset = async (id: number) => {
        if (!confirm("Are you sure you want to delete this asset and its findings?")) return;
        try {
            await invoke("delete_asset", { id });
            setSelectedAsset(null);
            loadAssets();
        } catch (e) {
            alert(e);
        }
    };

    const handleClearInventory = async () => {
        if (!confirm("DANGER: This will permanently delete ALL assets and findings. Proceed?")) return;
        try {
            await invoke("clear_inventory");
            setAssets([]);
            setSelectedAsset(null);
            alert("Inventory cleared.");
        } catch (e) {
            alert(e);
        }
    };

    const highlightCode = (code: string, lang: string = 'json') => {
        try {
            const grammar = Prism.languages[lang] || Prism.languages.javascript;
            return Prism.highlight(code, grammar, lang);
        } catch (e) {
            return code;
        }
    };

    const filteredAssets = assets
        .filter(asset => {
            // Smart Filter DSL Implementation
            if (!searchTerm.trim()) return filterSource === "all" || asset.source === filterSource;

            const parts = searchTerm.split(" ");
            let isMatch = true;

            for (const part of parts) {
                if (part.includes(":")) {
                    const [key, val] = part.split(":");
                    if (!val) continue;

                    switch (key.toLowerCase()) {
                        case "severity":
                            // Note: Asset doesn't have an overall severity, but we can check if it has findings of that severity
                            // For now, let's just match against source or other fields if valid, or just skip if logic too complex
                            break;
                        case "method":
                            if (asset.method?.toLowerCase() !== val.toLowerCase()) isMatch = false;
                            break;
                        case "source":
                            if (asset.source.toLowerCase() !== val.toLowerCase()) isMatch = false;
                            break;
                        case "findings":
                            const count = asset.findings_count || 0;
                            if (val.startsWith(">")) {
                                if (count <= parseInt(val.slice(1))) isMatch = false;
                            } else if (val.startsWith("<")) {
                                if (count >= parseInt(val.slice(1))) isMatch = false;
                            } else {
                                if (count !== parseInt(val)) isMatch = false;
                            }
                            break;
                        case "domain":
                            if (!asset.url.toLowerCase().includes(val.toLowerCase())) isMatch = false;
                            break;
                    }
                } else {
                    // Regular text search
                    if (!asset.url.toLowerCase().includes(part.toLowerCase())) isMatch = false;
                }
            }

            const matchesSource = filterSource === "all" || asset.source === filterSource;
            return isMatch && matchesSource;
        })
        .sort((a, b) => {
            if (sortBy === "violations") {
                return (b.findings_count || 0) - (a.findings_count || 0);
            }
            return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        });

    const sources = ["all", ...new Set(assets.map(a => a.source))];
    const categories = ["all", "PCI", "PII", "AUTH", "INFRA", "COMPLIANCE", "VIN"];

    return (
        <div className="relative h-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
                <div className="space-y-1">
                    <h2 className="text-4xl font-bold tracking-tight text-white uppercase tracking-tighter">Asset Inventory</h2>
                    <p className="text-zinc-500 font-medium">Managing {assets.length} discovered endpoints across all projects.</p>
                </div>

                <div className="flex items-center gap-3">
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 px-4 py-2 rounded-2xl animate-in fade-in slide-in-from-top-2">
                            <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest mr-2">{selectedIds.length} SELECTED</span>
                            <Button variant="ghost" size="sm" onClick={handleBulkTag} className="h-8 text-[10px] font-bold text-brand-400 hover:bg-brand-500/20">
                                <Tag className="h-3 w-3 mr-2" /> BATCH TAG
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleBulkDelete} className="h-8 text-[10px] font-bold text-red-500 hover:bg-red-500/20">
                                <Trash2 className="h-3 w-3 mr-2" /> DISCARD SELECTED
                            </Button>
                            <div className="h-4 w-px bg-brand-500/20 mx-1" />
                            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="h-8 text-[10px] font-bold text-zinc-500">
                                CANCEL
                            </Button>
                        </div>
                    )}
                    <Button
                        variant={sortBy === "violations" ? "accent" : "outline"}
                        onClick={() => setSortBy(sortBy === "violations" ? "last_seen" : "violations")}
                        className="h-11 px-5 rounded-xl border-white/5 bg-zinc-900/40 backdrop-blur-md transition-all"
                    >
                        <ShieldAlert className="mr-2 h-4 w-4" />
                        {sortBy === "violations" ? "Sorted by Violations" : "Sort by Violations"}
                    </Button>
                    <Button variant="outline" onClick={handleExportPDF} className="h-11 px-5 rounded-xl border-brand-500/20 bg-brand-500/5 text-brand-400 hover:bg-brand-500/10 transition-all">
                        <FileText className="mr-2 h-4 w-4" /> Export Report
                    </Button>
                    <Button variant="outline" onClick={loadAssets} className="h-11 px-5 rounded-xl border-white/5 bg-zinc-900/40 backdrop-blur-md text-zinc-400 hover:text-white transition-all">
                        <ArrowUpDown className="mr-2 h-4 w-4" /> Sync Registry
                    </Button>
                    <Button variant="outline" onClick={handleClearInventory} className="h-11 px-5 rounded-xl border-red-500/20 bg-red-500/5 text-red-500 hover:bg-red-500/10 transition-all">
                        <X className="mr-2 h-4 w-4" /> Clear All
                    </Button>
                </div>
            </div>

            {/* Control Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 shrink-0">
                <div className="md:col-span-6 relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-zinc-500 group-focus-within:text-brand-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by URL, domain, or notes..."
                        className="w-full h-14 bg-zinc-900/40 border border-white/5 rounded-2xl pl-12 pr-4 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all backdrop-blur-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="md:col-span-3 relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                        <Filter className="h-4 w-4" />
                    </div>
                    <select
                        className="w-full h-14 bg-zinc-900/40 border border-white/5 rounded-2xl pl-12 pr-4 text-zinc-200 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/50 backdrop-blur-xl capitalize cursor-pointer"
                        value={filterSource}
                        onChange={(e) => setFilterSource(e.target.value)}
                    >
                        {sources.map(s => (
                            <option key={s} value={s} className="bg-zinc-950">{s} Sources</option>
                        ))}
                    </select>
                </div>
                <div className="md:col-span-3 relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                        <ShieldAlert className="h-4 w-4" />
                    </div>
                    <select
                        className="w-full h-14 bg-zinc-900/40 border border-white/5 rounded-2xl pl-12 pr-4 text-zinc-200 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/50 backdrop-blur-xl capitalize cursor-pointer"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                    >
                        {categories.map(c => (
                            <option key={c} value={c} className="bg-zinc-950">{c} Violations</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
                {/* Assets Grid */}
                <div className={cn(
                    "glass overflow-hidden rounded-3xl border border-white/5 flex flex-col transition-all duration-500",
                    selectedAsset ? "w-1/2" : "w-full"
                )}>
                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-white/5 bg-zinc-900/80 backdrop-blur-md">
                                    <th className="w-12 px-6 py-5">
                                        <input
                                            type="checkbox"
                                            className="rounded border-zinc-700 bg-zinc-950 text-brand-500 focus:ring-brand-500"
                                            checked={filteredAssets.length > 0 && selectedIds.length === filteredAssets.length}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th className="px-6 py-5 text-xs font-bold text-zinc-500 uppercase tracking-widest">Asset Details</th>
                                    <th className="px-6 py-5 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Violations</th>
                                    <th className="px-6 py-5 text-xs font-bold text-zinc-500 uppercase tracking-widest">Activity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {isLoading ? (
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-8"><div className="h-4 w-48 bg-zinc-800 rounded"></div></td>
                                            <td className="px-6 py-8"><div className="h-6 w-12 bg-zinc-800 rounded-full mx-auto"></div></td>
                                            <td className="px-6 py-8"><div className="h-4 w-32 bg-zinc-800 rounded"></div></td>
                                        </tr>
                                    ))
                                ) : filteredAssets.length > 0 ? (
                                    filteredAssets.map((asset) => (
                                        <tr
                                            key={asset.id}
                                            onClick={() => handleSelectAsset(asset)}
                                            className={cn(
                                                "group hover:bg-white/[0.02] transition-colors cursor-pointer",
                                                selectedAsset?.id === asset.id ? "bg-brand-500/5 border-l-2 border-brand-500" : "",
                                                selectedIds.includes(asset.id) ? "bg-white/[0.03]" : ""
                                            )}
                                        >
                                            <td className="px-6 py-6" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-zinc-700 bg-zinc-950 text-brand-500 focus:ring-brand-500"
                                                    checked={selectedIds.includes(asset.id)}
                                                    onChange={(e) => handleToggleSelect(asset.id, e as any)}
                                                />
                                            </td>
                                            <td className="px-6 py-6" onClick={() => handleSelectAsset(asset)}>
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-xl bg-zinc-950 flex flex-shrink-0 items-center justify-center border border-white/5">
                                                        <Globe className={cn(
                                                            "h-5 w-5 transition-all",
                                                            selectedAsset?.id === asset.id ? "text-brand-400 scale-110" : "text-zinc-400 group-hover:text-brand-400"
                                                        )} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-semibold text-white truncate group-hover:text-brand-400 transition-colors uppercase tracking-tight">{asset.url}</span>
                                                        <span className="text-[10px] text-zinc-500 font-bold opacity-70 uppercase tracking-tighter">
                                                            {asset.method || 'GET'} • {asset.source}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className={cn(
                                                        "h-10 w-10 rounded-full border flex items-center justify-center transition-all duration-500",
                                                        (asset.findings_count || 0) > 0
                                                            ? "border-red-500/30 bg-red-500/5 text-red-400"
                                                            : "border-zinc-800 text-green-400"
                                                    )}>
                                                        <span className="text-xs font-black">
                                                            {asset.findings_count || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex flex-col text-zinc-500">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">{new Date(asset.last_seen).toLocaleDateString()}</span>
                                                    <span className="text-[9px] font-mono opacity-50">{new Date(asset.last_seen).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-24 text-center">
                                            <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">No assets match your search</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Asset Inspector Panel */}
                {selectedAsset && (
                    <div className="w-1/2 glass rounded-3xl border border-white/5 flex flex-col min-h-0 animate-in slide-in-from-right-4 duration-500">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center border border-brand-500/20">
                                    <ShieldAlert className="h-5 w-5 text-brand-400" />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="font-bold text-white uppercase tracking-tighter">Asset Intelligence</h3>
                                    <span className="text-[10px] text-zinc-500 font-mono">NODE_HASH: {btoa(selectedAsset.id.toString()).slice(0, 8)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleBroadcastToSlack}
                                    title="Broadcast to Slack/Teams"
                                    className="h-10 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 transition-all text-zinc-500 hover:text-brand-400 group/slack"
                                >
                                    <Send className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleGenerateAssetSummary}
                                    title="Copy triage summary for Teams/Outlook"
                                    className="h-10 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 transition-all text-zinc-500 hover:text-brand-400 group/share"
                                >
                                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
                                    <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">Triage</span>
                                </button>
                                {onSendToRepeater && (
                                    <button
                                        onClick={() => onSendToRepeater({
                                            url: selectedAsset.url,
                                            method: selectedAsset.method || "GET",
                                            body: selectedAsset.req_body || undefined
                                        })}
                                        title="Send to Repeater"
                                        className="h-10 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 transition-all text-zinc-500 hover:text-brand-400 group/replay"
                                    >
                                        <Play className="h-4 w-4" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">Replay</span>
                                    </button>
                                )}
                                <button
                                    onClick={async () => {
                                        try {
                                            const curl = await invoke<string>("export_as_curl", { assetId: selectedAsset.id });
                                            await navigator.clipboard.writeText(curl);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        } catch (e) {
                                            console.error("Failed to export as cURL:", e);
                                        }
                                    }}
                                    title="Copy as cURL"
                                    className="h-10 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 transition-all text-zinc-500 hover:text-green-400 group/curl"
                                >
                                    <Terminal className="h-4 w-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">cURL</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            const link = await invoke<string>("export_as_postman_link", { assetId: selectedAsset.id });
                                            window.open(link, "_blank");
                                        } catch (e) {
                                            console.error("Failed to open in Postman:", e);
                                        }
                                    }}
                                    title="Open in Postman"
                                    className="h-10 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 transition-all text-zinc-500 hover:text-orange-400 group/postman"
                                >
                                    <PostmanIcon className="h-4 w-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">Postman</span>
                                </button>
                                <button
                                    onClick={() => handleDeleteAsset(selectedAsset.id)}
                                    title="Delete Asset"
                                    className="h-10 px-3 rounded-xl hover:bg-red-500/10 flex items-center gap-2 transition-all text-zinc-500 hover:text-red-500 group/delete"
                                >
                                    <X className="h-4 w-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">Delete</span>
                                </button>
                                <button
                                    onClick={() => setSelectedAsset(null)}
                                    className="h-10 w-10 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-500 hover:text-white"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="px-6 border-b border-white/5 bg-white/[0.01] flex gap-4">
                            {[
                                { id: "details", label: "Overview", icon: Globe },
                                { id: "findings", label: "Findings", icon: ShieldAlert, count: findings.length },
                                { id: "history", label: "History", icon: Clock, count: history.length },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={cn(
                                        "py-4 text-[10px] font-black uppercase tracking-[0.2em] relative transition-all",
                                        activeTab === tab.id ? "text-brand-400" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <tab.icon size={12} />
                                        {tab.label}
                                        {tab.count !== undefined && tab.count > 0 && (
                                            <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-md leading-none text-[8px]">{tab.count}</span>
                                        )}
                                    </div>
                                    {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {activeTab === "details" && (
                                <>
                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5">
                                            <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Status</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]",
                                                    (selectedAsset.status_code || 200) < 400 ? "text-green-500" : "text-red-500"
                                                )} />
                                                <span className="text-sm font-bold text-white uppercase">{selectedAsset.status_code || 200} READY</span>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5">
                                            <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Violations</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <ShieldAlert className="h-4 w-4 text-red-400" />
                                                <span className="text-sm font-bold text-red-400">{findings.length} TOTAL</span>
                                            </div>
                                        </div>
                                    </div>

                                    {findings.length > 0 && (
                                        <div className="p-6 rounded-2xl bg-brand-500/5 border border-brand-500/10 space-y-3 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 blur-[40px] rounded-full -mr-16 -mt-16" />
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Zap className="h-4 w-4 text-brand-400" />
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-brand-400">Hunter's Intelligence Summary</h4>
                                                </div>
                                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-1 rounded-lg bg-zinc-950/50 border border-white/5">Local AI Triage Enabled</span>
                                            </div>
                                            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                                                This endpoint is currently exposing <span className="text-red-400 font-bold">{findings.length} security violations</span>.
                                                The most critical risk involves <span className="text-white font-bold">{findings[0].name}</span> which requires immediate attention from the <span className="underline decoration-brand-500/50">Asset Owner</span>.
                                            </p>
                                            <div className="flex items-center gap-4 pt-1">
                                                <button onClick={() => setActiveTab("findings" as any)} className="text-[10px] font-black uppercase text-brand-400 hover:text-white transition-colors flex items-center gap-1">
                                                    Inspect Findings <ExternalLink size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tags */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                            <Tag className="h-3 w-3" /> Labels & Metadata
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {assetTags.map(tag => (
                                                <div key={tag} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 text-[10px] font-bold uppercase transition-all hover:bg-brand-500/20">
                                                    {tag}
                                                    <button onClick={() => handleToggleTag(tag)} className="hover:text-white transition-colors">
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 group-focus-within:border-brand-500/30 transition-all">
                                                <input
                                                    type="text"
                                                    placeholder="Add label..."
                                                    className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest text-zinc-500 focus:text-white focus:outline-none w-24"
                                                    value={tagInput}
                                                    onChange={(e) => setTagInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && tagInput.trim()) {
                                                            handleToggleTag(tagInput.trim());
                                                            setTagInput("");
                                                        }
                                                    }}
                                                />
                                                <Plus className="h-3 w-3 text-zinc-600 group-hover:text-brand-400 transition-colors" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* HTTP Payloads */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                            <Code className="h-3 w-3" /> Request / Response Bodies
                                        </h4>

                                        {selectedAsset.req_body && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Request Body</span>
                                                    <button onClick={() => handleCopy(selectedAsset.req_body!)} className="text-zinc-500 hover:text-white transition-colors">
                                                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                                    </button>
                                                </div>
                                                <div className="bg-zinc-950 rounded-2xl border border-white/5 p-4 overflow-hidden relative group">
                                                    <div className="absolute top-4 right-4 text-[8px] font-bold text-zinc-700 uppercase">application/json</div>
                                                    <pre className="text-[10px] font-mono text-brand-400 overflow-x-auto whitespace-pre-wrap max-h-60">
                                                        {selectedAsset.req_body}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}

                                        {selectedAsset.res_body && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Response Body</span>
                                                    <button onClick={() => handleCopy(selectedAsset.res_body!)} className="text-zinc-500 hover:text-white transition-colors">
                                                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                                    </button>
                                                </div>
                                                <div className="bg-zinc-950 rounded-2xl border border-white/5 p-4 overflow-hidden relative group">
                                                    <div className="absolute top-4 right-4 text-[8px] font-bold text-zinc-700 uppercase">API Snapshot</div>
                                                    <pre className="text-[10px] font-mono text-accent-400 overflow-x-auto whitespace-pre-wrap max-h-96">
                                                        {selectedAsset.res_body}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}

                                        {!selectedAsset.req_body && !selectedAsset.res_body && (
                                            <div className="p-8 border border-dashed border-white/5 rounded-2xl text-center">
                                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">No HTTP data recorded</span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeTab === "findings" && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                        <ShieldAlert className="h-3 w-3" /> Security Findings
                                    </h4>
                                    <div className="space-y-3">
                                        {findings.length > 0 ? (
                                            findings.map((f, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => setSelectedFinding(f)}
                                                    className="group/finding p-4 rounded-2xl bg-red-500/5 border border-red-500/10 space-y-2 cursor-pointer hover:bg-red-500/10 transition-all hover:border-red-500/30"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-white group-hover/finding:text-red-400 transition-colors">{f.name}</span>
                                                            <Maximize2 className="h-3 w-3 text-zinc-600 opacity-0 group-hover/finding:opacity-100 transition-all" />
                                                        </div>
                                                        <span className={cn(
                                                            "text-[9px] font-black px-2 py-0.5 rounded-full uppercase",
                                                            (f.severity_override || f.severity) === "High" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                                                        )}>{f.severity_override || f.severity}</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{f.description}</p>
                                                    <div className="mt-2 p-2 bg-black/40 rounded-lg text-[10px] font-mono text-zinc-500 overflow-hidden relative">
                                                        <pre className="overflow-x-auto">
                                                            {f.match_content.slice(0, 100)}{f.match_content.length > 100 ? '...' : ''}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-8 border border-dashed border-white/5 rounded-2xl text-center">
                                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">No violations detected</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === "history" && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                        <Clock className="h-3 w-3" /> Version History & Variations
                                    </h4>
                                    <div className="space-y-3">
                                        {history.length > 0 ? (
                                            history.map((h, i) => (
                                                <div
                                                    key={i}
                                                    className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 hover:bg-white/[0.04] transition-all group"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                                                                (h.status_code || 200) < 400 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                                            )}>
                                                                HTTP {h.status_code || 200}
                                                            </div>
                                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{new Date(h.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            className="h-6 px-3 rounded-lg text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                // Compare current body with this historical body
                                                                // For now just show this body
                                                                alert("Historical Body Snapshot Captured. Implementation of side-by-side diff in progress.");
                                                            }}
                                                        >
                                                            VIEW SNAPSHOT
                                                        </Button>
                                                    </div>
                                                    <div className="p-3 bg-black/40 rounded-xl max-h-32 overflow-hidden relative">
                                                        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
                                                        <pre className="text-[9px] font-mono text-zinc-500 whitespace-pre-wrap">
                                                            {h.res_body?.slice(0, 300) || "Empty response body snapshot."}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-8 border border-dashed border-white/5 rounded-2xl text-center">
                                                <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">No variations recorded yet.</p>
                                                <p className="text-[10px] text-zinc-600 mt-1 uppercase italic">History is captured when API responses change.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Finding Detail Modal */}
            {selectedFinding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div
                        className="w-full max-w-4xl max-h-full glass rounded-[32px] border border-white/10 flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-5">
                                <div className={cn(
                                    "h-14 w-14 rounded-2xl flex items-center justify-center border shadow-lg",
                                    selectedFinding.severity === "High" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-orange-500/10 border-orange-500/20 text-orange-400"
                                )}>
                                    <ShieldAlert className="h-8 w-8" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-2xl font-bold text-white tracking-tight">{selectedFinding.name}</h3>
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest",
                                            selectedFinding.severity === "High" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                                        )}>{selectedFinding.severity} SEVERITY</span>
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800/50 px-2 py-1 rounded">RULE_ID: {selectedFinding.rule_id}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedFinding(null)}
                                className="h-12 w-12 rounded-2xl hover:bg-white/5 flex items-center justify-center transition-all text-zinc-500 hover:text-white group"
                            >
                                <X className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Analysis & Description</h4>
                                    <p className="text-zinc-300 leading-relaxed">
                                        {selectedFinding.description}
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center justify-between">
                                        Analyst Notes
                                        {selectedFinding.notes && <Check className="h-3 w-3 text-green-500" />}
                                    </h4>
                                    <textarea
                                        placeholder="Add context, investigation steps, or remediation notes..."
                                        className="w-full h-24 bg-zinc-950 border border-white/5 rounded-2xl p-4 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-500/50 transition-all resize-none"
                                        value={noteDraft || selectedFinding.notes || ""}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        onBlur={() => {
                                            if (noteDraft !== selectedFinding.notes) {
                                                handleUpdateAnnotation({ notes: noteDraft });
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* AI Triage Section */}
                            <div className="p-8 rounded-[32px] bg-purple-500/[0.03] border border-purple-500/10 shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full -mr-16 -mt-16" />
                                <AIAssistant
                                    findingId={selectedFinding.id || 0}
                                    findingName={selectedFinding.name}
                                    description={selectedFinding.description}
                                    evidence={selectedFinding.match_content}
                                    url={selectedAsset?.url || "unknown"}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Severity Override</h4>
                                    <div className="flex gap-2">
                                        {(["High", "Medium", "Low", "Info"] as const).map((sev) => (
                                            <button
                                                key={sev}
                                                onClick={() => handleUpdateAnnotation({ severity_override: sev })}
                                                className={cn(
                                                    "px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all",
                                                    (selectedFinding.severity_override || selectedFinding.severity) === sev
                                                        ? "bg-brand-500 border-brand-400 text-black"
                                                        : "bg-zinc-900 border-white/5 text-zinc-500 hover:text-zinc-300"
                                                )}
                                            >
                                                {sev}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Evidence / Match Content</h4>
                                    <button
                                        onClick={() => handleCopy(selectedFinding.match_content)}
                                        className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors"
                                    >
                                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                        {copied ? "COPIED" : "COPY RAW"}
                                    </button>
                                </div>
                                <div className="relative group/code">
                                    <div className="absolute -inset-px bg-gradient-to-r from-brand-500/20 to-accent-500/20 rounded-2xl blur opacity-0 group-hover/code:opacity-100 transition duration-500" />
                                    <div className="relative bg-zinc-950 border border-white/5 rounded-2xl p-6 overflow-hidden">
                                        <pre
                                            className="text-sm font-mono leading-relaxed overflow-x-auto max-h-[400px]"
                                            dangerouslySetInnerHTML={{ __html: highlightCode(selectedFinding.match_content) }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-start gap-4">
                                <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                                    <ExternalLink className="h-5 w-5 text-brand-400" />
                                </div>
                                <div className="space-y-1">
                                    <h5 className="text-sm font-bold text-white">Remediation Guidance</h5>
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                        Ensure that sensitive tokens or credentials are not exposed in client-side code, logs, or public URLs.
                                        Rotate the exposed secret immediately and implement environment variable-based configuration.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-white/5 bg-white/[0.01] flex justify-between items-center bg-zinc-900/50">
                            <div className="flex items-center gap-2">
                                {isSaving && (
                                    <div className="flex items-center gap-2 text-zinc-500">
                                        <div className="h-3 w-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Saving Changes...</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedFinding(null)}
                                    className="h-12 px-8 rounded-xl border-white/5 text-zinc-400 font-bold hover:text-white transition-all bg-transparent"
                                >
                                    Close Insight
                                </Button>
                                <Button
                                    onClick={() => handleUpdateAnnotation({ is_false_positive: !selectedFinding.is_false_positive })}
                                    className={cn(
                                        "h-12 px-8 rounded-xl font-bold transition-all shadow-lg",
                                        selectedFinding.is_false_positive
                                            ? "bg-zinc-800 text-zinc-400 border border-white/5"
                                            : "bg-red-500 hover:bg-red-400 text-black shadow-red-500/20"
                                    )}
                                >
                                    {selectedFinding.is_false_positive ? "Mark as Significant" : "Mark as False Positive"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

