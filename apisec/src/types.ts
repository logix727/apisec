export interface Finding {
    id?: number;
    asset_id?: number;
    url?: string;
    rule_id: string;
    name: string;
    description: string;
    severity: "High" | "Medium" | "Low" | "Info";
    match_content: string;
    notes?: string;
    is_false_positive?: boolean;
    severity_override?: "High" | "Medium" | "Low" | "Info";
}

export interface ImportEntry {
    url: string;
    method: string;
    status_code?: number;
    req_body?: string;
    res_body?: string;
    findings: Finding[];
}

export interface ImportResult {
    entries: ImportEntry[];
    source_type: string;
}

export interface Asset {
    id: number;
    url: string;
    method?: string;
    status_code?: number;
    source: string;
    folder_id?: number;
    last_seen: string;
    notes?: string;
    findings_count?: number;
    req_body?: string;
    res_body?: string;
}

export interface SearchResult {
    assets: Asset[];
    findings: Finding[];
}


export interface BatchImportResult {
    added: number;
    skipped: number;
}

