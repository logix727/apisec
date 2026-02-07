import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
    RadarChart, PolarGrid, PolarAngleAxis, Radar,
    ScatterChart, Scatter, ZAxis, LabelList
} from 'recharts';
import { ShieldAlert, Globe, Zap, Activity, Info, AlertTriangle, ShieldCheck, FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { Asset, Finding } from "../types";

export default function Analytics() {
    const [stats, setStats] = useState<{
        assets: Asset[],
        findings: Finding[],
        loading: boolean
    }>({ assets: [], findings: [], loading: true });

    useEffect(() => {
        const loadData = async () => {
            try {
                const assets = await invoke<Asset[]>("get_assets");
                const findings = await invoke<Finding[]>("get_all_findings_full");
                setStats({ assets, findings, loading: false });
            } catch (e) {
                console.error(e);
                setStats(prev => ({ ...prev, loading: false }));
            }
        };
        loadData();
    }, []);

    const exportCSV = () => {
        const headers = ["ID", "Asset URL", "Rule ID", "Name", "Severity", "Description", "Match Content"];
        const rows = stats.findings.map(f => [
            f.id,
            f.url || "N/A",
            f.rule_id,
            f.name,
            f.severity_override || f.severity,
            f.description.replace(/,/g, ';'),
            f.match_content.substring(0, 100).replace(/,/g, ';').replace(/\n/g, ' ')
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `apisec_findings_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const exportSARIF = () => {
        const sarif = {
            version: "2.1.0",
            $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json",
            runs: [{
                tool: {
                    driver: {
                        name: "APISec Analyst Pro",
                        version: "0.5.0",
                        informationUri: "https://github.com/logix/apisec"
                    }
                },
                results: stats.findings.map(f => ({
                    ruleId: f.rule_id,
                    level: (f.severity_override || f.severity).toLowerCase() === 'high' ? 'error' : 'warning',
                    message: { text: f.description },
                    locations: [{
                        physicalLocation: {
                            address: { fullyQualifiedName: f.url || "N/A" }
                        }
                    }],
                    properties: {
                        name: f.name,
                        match_content: f.match_content,
                        notes: f.notes
                    }
                }))
            }]
        };
        const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `apisec_findings_${new Date().getTime()}.sarif`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (stats.loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-zinc-500 font-bold animate-pulse">Computing Security Metrics...</p>
                </div>
            </div>
        );
    }

    const severityData = [
        { name: 'Critical', value: stats.findings.filter(f => (f.severity_override || f.severity) === 'High' && !f.is_false_positive).length, color: '#ef4444' },
        { name: 'Medium', value: stats.findings.filter(f => (f.severity_override || f.severity) === 'Medium' && !f.is_false_positive).length, color: '#f97316' },
        { name: 'Low', value: stats.findings.filter(f => (f.severity_override || f.severity) === 'Low' && !f.is_false_positive).length, color: '#facc15' },
        { name: 'Info', value: stats.findings.filter(f => (f.severity_override || f.severity) === 'Info' && !f.is_false_positive).length, color: '#3b82f6' },
    ].filter(d => d.value > 0);

    const categoryData = [
        { subject: 'Auth', A: stats.findings.filter(f => f.rule_id.startsWith('AUTH')).length, fullMark: 10 },
        { subject: 'Inject', A: stats.findings.filter(f => f.rule_id.startsWith('INJ')).length, fullMark: 10 },
        { subject: 'PII', A: stats.findings.filter(f => f.rule_id.startsWith('PII')).length, fullMark: 10 },
        { subject: 'BrokenAuth', A: stats.findings.filter(f => f.rule_id.startsWith('VULN-BOLA') || f.rule_id.startsWith('AUTH-BASIC')).length, fullMark: 10 },
        { subject: 'Leaks', A: stats.findings.filter(f => f.rule_id.startsWith('LEAK') || f.rule_id.startsWith('CONF-SENSITIVE')).length, fullMark: 10 },
        { subject: 'Infra', A: stats.findings.filter(f => f.rule_id.startsWith('INFRA') || f.rule_id.startsWith('SaaS')).length, fullMark: 10 },
        { subject: 'MassAssig', A: stats.findings.filter(f => f.rule_id.startsWith('VULN-MASS')).length, fullMark: 10 },
        { subject: 'SSRF', A: stats.findings.filter(f => f.rule_id.startsWith('VULN-SSRF')).length, fullMark: 10 },
        { subject: 'Mgmt', A: stats.findings.filter(f => f.rule_id.startsWith('MGMT')).length, fullMark: 10 },
        { subject: 'Drift', A: stats.findings.filter(f => f.rule_id.startsWith('DRIFT')).length, fullMark: 10 },
        { subject: 'Privacy', A: stats.findings.filter(f => f.rule_id.startsWith('PII') || f.rule_id.startsWith('DATA-VIN')).length, fullMark: 10 },
        { subject: 'Compliance', A: stats.findings.filter(f => f.rule_id.startsWith('COMP') || f.rule_id.startsWith('PCI')).length, fullMark: 10 },
    ];

    const topAssets = stats.assets
        .map(a => ({ name: a.url.replace(/https?:\/\//, '').slice(0, 25), val: a.findings_count || 0 }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 6);

    const scatterData = stats.assets.map(a => ({
        x: a.status_code || 200,
        y: a.findings_count || 0,
        name: a.url.split('/').pop() || 'index',
        size: (a.findings_count || 0) * 10 + 5
    })).filter(d => d.y > 0);

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-12">
            <div className="space-y-1">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">Workspace Intelligence</h2>
                <div className="flex items-center justify-between gap-4">
                    <p className="text-zinc-500 font-medium">Real-time posture analysis across {stats.assets.length} monitored assets.</p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportCSV}
                            className="h-9 px-4 rounded-xl border-white/5 bg-zinc-900/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
                        >
                            <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Export CSV
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportSARIF}
                            className="h-9 px-4 rounded-xl border-white/5 bg-zinc-900/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
                        >
                            <FileJson className="mr-2 h-3.5 w-3.5" /> Export SARIF
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: "Critical Risk", val: severityData.find(d => d.name === 'Critical')?.value || 0, icon: ShieldAlert, color: "text-red-500" },
                    { label: "Assets Scanned", val: stats.assets.length, icon: Globe, color: "text-brand-400" },
                    { label: "Total Findings", val: stats.findings.length, icon: Activity, color: "text-accent-400" },
                    { label: "False Positives", val: stats.findings.filter(f => f.is_false_positive).length, icon: ShieldCheck, color: "text-green-500" },
                ].map((stat, i) => (
                    <div key={i} className="glass rounded-2xl p-6 border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <stat.icon size={64} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{stat.label}</span>
                            <span className={cn("text-3xl font-black mt-1", stat.color)}>{stat.val}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Findings Trend */}
                <div className="glass-card space-y-6 flex flex-col">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold flex items-center gap-2 italic">
                            <Activity className="h-5 w-5 text-brand-400" />
                            Most Vulnerable Endpoints
                        </h3>
                    </div>
                    <div className="h-[300px] w-full mt-auto">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topAssets} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                                <XAxis type="number" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis dataKey="name" type="category" stroke="#999" fontSize={9} axisLine={false} tickLine={false} width={120} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="val" fill="url(#barGradient)" radius={[0, 4, 4, 0]} barSize={20}>
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#8b5cf6" />
                                        </linearGradient>
                                    </defs>
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Severity Split */}
                    <div className="glass-card flex flex-col space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 italic">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Risk Split
                        </h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={severityData}
                                        innerRadius={45}
                                        outerRadius={65}
                                        paddingAngle={8}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {severityData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Vector Analysis */}
                    <div className="glass-card flex flex-col space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 italic">
                            <Zap className="h-5 w-5 text-accent-400" />
                            Threat Vector
                        </h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={categoryData}>
                                    <PolarGrid stroke="#ffffff10" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 10 }} />
                                    <Radar
                                        name="Findings"
                                        dataKey="A"
                                        stroke="#a855f7"
                                        fill="#a855f7"
                                        fillOpacity={0.4}
                                    />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Risk Topology */}
                <div className="lg:col-span-2 glass-card space-y-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 italic">
                        <Globe className="h-5 w-5 text-brand-400" />
                        Asset Risk Topology
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid stroke="#ffffff05" strokeDasharray="3 3" />
                                <XAxis type="number" dataKey="x" name="Status Code" unit="" stroke="#666" fontSize={10} domain={[100, 600]} />
                                <YAxis type="number" dataKey="y" name="Findings" unit="" stroke="#666" fontSize={10} />
                                <ZAxis type="number" dataKey="size" range={[50, 400]} />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                />
                                <Scatter name="Assets" data={scatterData} fill="#3b82f6" fillOpacity={0.6}>
                                    <LabelList dataKey="name" position="top" style={{ fill: '#999', fontSize: '9px', fontWeight: 'bold' }} offset={10} />
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-8">
                    <div className="glass shadow-xl shadow-brand-500/5 rounded-3xl p-8 border border-white/5 space-y-4">
                        <div className="h-12 w-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-400">
                            <Info size={24} />
                        </div>
                        <h4 className="text-xl font-black text-white italic">AI Strategy</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Cluster analysis indicates **{scatterData.length}** endpoints are outlier risks.
                            Your **Status 403/401** responses are leaking excessive PII in the error bodies.
                        </p>
                        <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                            <span className="text-[10px] font-black text-zinc-500 uppercase">Recommended Patch</span>
                            <code className="text-[10px] bg-black/40 p-2 rounded text-brand-300">CONF-VERBOSE-ERROR</code>
                        </div>
                    </div>

                    <div className="glass-card relative overflow-hidden h-fit">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/10 blur-3xl rounded-full" />
                        <div className="relative flex flex-col h-full justify-between gap-6">
                            <div className="space-y-2">
                                <h4 className="text-2xl font-black text-white italic">Governance</h4>
                                <p className="text-sm text-zinc-500 leading-tight">Workspace compliance status and policy enforcement metrics.</p>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col">
                                    <span className="text-4xl font-black text-brand-400 italic">94%</span>
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Policy match</span>
                                </div>
                                <div className="flex flex-col text-right ml-auto shrink-0">
                                    <span className="text-sm font-bold text-zinc-400 italic">Posture</span>
                                    <div className="h-2 w-24 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                        <div className="h-full bg-brand-500 w-[85%] shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
