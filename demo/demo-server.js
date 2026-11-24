(() => {
  "use strict";

  const APP_VERSION = "0.3.9";
  const DEFAULT_CATEGORIES = [
    "Finance",
    "Taxes",
    "Medical",
    "Insurance",
    "Legal",
    "Housing",
    "Housing/Utilities",
    "Identity",
    "Receipts",
    "Travel",
    "Car",
    "Work",
    "Other",
  ];

  const DEFAULT_MODELS = [
    {
      name: "mlx-community/gemma-4-e2b-it-4bit",
      label: "Gemma 4 E2B (4-bit · Fast · 8 GB+ RAM)",
      size_gb: 3.3,
      min_ram_gb: 8,
      parameter_size: "E2B · 4-bit",
      family: "gemma4",
      downloaded: false,
      local_path: "",
    },
    {
      name: "mlx-community/gemma-4-e4b-it-4bit",
      label: "Gemma 4 E4B (4-bit · Balanced · 16 GB+ RAM)",
      size_gb: 4.8,
      min_ram_gb: 16,
      parameter_size: "E4B · 4-bit",
      family: "gemma4",
      downloaded: true,
      local_path: "~/.cache/huggingface/hub/models--mlx-community--gemma-4-e4b-it-4bit",
    },
    {
      name: "mlx-community/gemma-4-12B-it-4bit",
      label: "Gemma 4 12B (4-bit · Accurate · 16 GB+ RAM)",
      size_gb: 6.3,
      min_ram_gb: 16,
      parameter_size: "12B · 4-bit",
      family: "gemma4",
      downloaded: false,
      local_path: "",
    },
    {
      name: "mlx-community/gemma-4-26b-a4b-it-4bit",
      label: "Gemma 4 26B-A4B MoE (4-bit · Best Accuracy · 24 GB+ RAM)",
      size_gb: 14.3,
      min_ram_gb: 24,
      parameter_size: "26B-A4B · 4-bit",
      family: "gemma4",
      downloaded: false,
      local_path: "",
    },
  ];

  function isoMinutesAgo(mins) {
    return new Date(Date.now() - mins * 60 * 1000).toISOString();
  }

  function escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildSvgDataUri(spec) {
    const angle = ((Number(spec.angle || 0) % 360) + 360) % 360;
    const isLandscape = angle === 90 || angle === 270;
    const w = isLandscape ? 792 : 612;
    const h = isLandscape ? 612 : 792;
    const accent = spec.accent || "#206bff";
    const lines = (spec.lines || []).slice(0, 7);

    let transform = "";
    if (angle === 90) transform = `translate(792, 0) rotate(90)`;
    else if (angle === 180) transform = `translate(612, 792) rotate(180)`;
    else if (angle === 270) transform = `translate(0, 612) rotate(270)`;

    const bodyRows = lines
      .map((line, idx) => {
        const y = 264 + idx * 44;
        const isTotal = idx === lines.length - 1 && spec.total;
        return `
          <text x="56" y="${y}" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="${isTotal ? 18 : 15}" font-weight="${isTotal ? 700 : 400}"
            fill="${isTotal ? "#0f172a" : "#334155"}">${escapeXml(line.label || "")}</text>
          <text x="556" y="${y}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
            font-size="${isTotal ? 18 : 15}" font-weight="${isTotal ? 700 : 500}"
            fill="${isTotal ? accent : "#0f172a"}">${escapeXml(line.value || "")}</text>
          <line x1="56" y1="${y + 14}" x2="556" y2="${y + 14}" stroke="#e2e8f0" stroke-width="1" />
        `;
      })
      .join("");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#ffffff" />
        <g transform="${transform}">
          <rect x="0" y="0" width="612" height="792" fill="#ffffff" />
          <rect x="0" y="0" width="612" height="12" fill="${accent}" />
          <rect x="56" y="44" width="44" height="44" rx="10" fill="${accent}" fill-opacity="0.12" />
          <rect x="68" y="56" width="20" height="20" rx="5" fill="${accent}" />
          <text x="114" y="64" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="18" font-weight="700" fill="#0f172a">${escapeXml(spec.issuer || "Document Scan")}</text>
          <text x="114" y="84" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="12" fill="#64748b">${escapeXml(spec.subtitle || "Official Statement")}</text>
          <text x="556" y="64" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
            font-size="12" font-weight="600" fill="#475569">${escapeXml(spec.docDate || "")}</text>
          <text x="556" y="83" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="11" fill="#94a3b8">${escapeXml(spec.pageLabel || "Page 1")}</text>

          <rect x="56" y="118" width="500" height="92" rx="10" fill="#f8fafc" stroke="#e2e8f0" />
          <text x="74" y="148" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="11" font-weight="700" fill="#64748b" letter-spacing="0.06em">DOCUMENT SUMMARY</text>
          <text x="74" y="176" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="20" font-weight="700" fill="#0f172a">${escapeXml(spec.heading || "Scanned Document")}</text>
          <text x="74" y="196" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="12" fill="#64748b">${escapeXml(spec.ref || "Ref #DV-2026-0412")}</text>

          ${bodyRows}

          <rect x="56" y="610" width="500" height="86" rx="10" fill="#f8fafc" stroke="#e2e8f0" />
          <text x="74" y="640" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="12" font-weight="600" fill="#334155">${escapeXml(spec.footerTitle || "Processed 100% locally with Apple Silicon MLX Vision")}</text>
          <text x="74" y="664" font-family="-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            font-size="11" fill="#64748b">${escapeXml(spec.footerNote || "Interactive browser demo · No files leave your device.")}</text>
        </g>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createInitialState() {
    const settings = {
      vault_dir: "~/Documents/DocumentVault",
      dump_dir: "~/Downloads/ScansIncoming",
      processed_dir_name: "Processed",
      vlm_model: "mlx-community/gemma-4-e4b-it-4bit",
      thinking_mode: "off",
      watcher_enabled: true,
      watcher_debounce_seconds: 2.0,
      categories: [...DEFAULT_CATEGORIES],
      filing_rules: [],
      tree_template: "{year}/{category}",
      filename_mask: "{date} - {title}",
      date_format: "YYYY-MM-DD",
      title_separator: "space",
      title_language: "english",
      confidence_threshold: 0.72,
      custom_instructions: "",
      system_prompt_override: "",
      setup_completed: true,
    };

    const previewSpecs = new Map();

    function makeDocPreviews(id, baseSpec, pageCount = 1) {
      const names = [];
      for (let p = 1; p <= pageCount; p += 1) {
        const name = `demo_doc_${id}_p${p}.svg`;
        previewSpecs.set(name, {
          ...baseSpec,
          angle: 0,
          pageLabel: pageCount > 1 ? `Page ${p} of ${pageCount}` : "Page 1",
          heading: p === 1 ? baseSpec.heading : `${baseSpec.heading} (Cont.)`,
        });
        names.push(name);
      }
      return names;
    }

    const docs = [
      {
        id: 101,
        sha256: "a1b2c3d4e5f60001",
        original_filename: "IMG_4821_scan.pdf",
        source_mode: "watcher",
        source_path: "~/Downloads/ScansIncoming/IMG_4821_scan.pdf",
        doc_date: "2026-04-12",
        doc_year: "2026",
        category: "Taxes",
        labels: ["Taxes"],
        title: "Municipal Tax Assessment",
        confidence: 0.97,
        reason: "Issued by City Revenue Office with 2026 assessment date.",
        created_at: isoMinutesAgo(18),
        updated_at: isoMinutesAgo(18),
        file_size: 482310,
        extracted_text: "Municipal Tax Assessment 2026 Property Tax Return",
        preview_images: makeDocPreviews(
          101,
          {
            accent: "#206bff",
            issuer: "City Revenue Office",
            subtitle: "Annual Property Assessment",
            docDate: "2026-04-12",
            heading: "Municipal Tax Assessment",
            ref: "Parcel #44-9182-B · Tax Year 2026",
            lines: [
              { label: "Assessed Property Valuation", value: "$428,000.00" },
              { label: "Municipal Rate (0.85%)", value: "$3,638.00" },
              { label: "Homestead Exemption", value: "-$420.00" },
              { label: "Total Annual Tax Due", value: "$3,218.00" },
            ],
            total: true,
          },
          2
        ),
      },
      {
        id: 102,
        sha256: "a1b2c3d4e5f60002",
        original_filename: "clinic_lab_004.pdf",
        source_mode: "upload",
        source_path: "~/Downloads/clinic_lab_004.pdf",
        doc_date: "2026-08-03",
        doc_year: "2026",
        category: "Medical",
        labels: ["Medical"],
        title: "Blood Panel Lab Invoice",
        confidence: 0.94,
        reason: "Diagnostic lab statement with patient billing breakdown.",
        created_at: isoMinutesAgo(95),
        updated_at: isoMinutesAgo(95),
        file_size: 319420,
        extracted_text: "Northside Diagnostics Comprehensive Blood Panel Invoice",
        preview_images: makeDocPreviews(102, {
          accent: "#0f8558",
          issuer: "Northside Diagnostics",
          subtitle: "Laboratory Billing Statement",
          docDate: "2026-08-03",
          heading: "Blood Panel Lab Invoice",
          ref: "Claim #NSD-88412 · Outpatient",
          lines: [
            { label: "Comprehensive Metabolic Panel", value: "$145.00" },
            { label: "Lipid & Thyroid Screen", value: "$110.00" },
            { label: "Insurance Plan Adjustment", value: "-$195.00" },
            { label: "Patient Balance", value: "$60.00" },
          ],
          total: true,
        }),
      },
      {
        id: 103,
        sha256: "a1b2c3d4e5f60003",
        original_filename: "policy_renewal_2026.pdf",
        source_mode: "watcher",
        source_path: "~/Downloads/ScansIncoming/policy_renewal_2026.pdf",
        doc_date: "2026-09-19",
        doc_year: "2026",
        category: "Insurance",
        labels: ["Insurance", "Housing"],
        title: "Home Policy Renewal",
        confidence: 0.96,
        reliability_status: "check_date",
        reliability_reasons: ["Future renewal date — verify"],
        suggested_new_label: "Housing/Insurance",
        reason: "Annual homeowner insurance renewal schedule.",
        created_at: isoMinutesAgo(310),
        updated_at: isoMinutesAgo(310),
        file_size: 628910,
        extracted_text: "Harbor Mutual Homeowner Policy Renewal Schedule 2026",
        preview_images: makeDocPreviews(103, {
          accent: "#4338ca",
          issuer: "Harbor Mutual Insurance",
          subtitle: "Homeowners Policy Declarations",
          docDate: "2026-09-19",
          heading: "Home Policy Renewal",
          ref: "Policy #HM-392014-R · Effective Oct 2026",
          lines: [
            { label: "Dwelling Coverage (A)", value: "$550,000" },
            { label: "Personal Property (C)", value: "$220,000" },
            { label: "Deductible", value: "$1,500" },
            { label: "Annual Premium", value: "$1,480.00" },
          ],
          total: true,
        }),
      },
      {
        id: 104,
        sha256: "a1b2c3d4e5f60004",
        original_filename: "utility_annual_2025.pdf",
        source_mode: "vault_scan",
        source_path: "~/Documents/DocumentVault/2025/Housing/Utilities/2025-12-18 - Electric Utility Annual Summary.pdf",
        doc_date: "2025-12-18",
        doc_year: "2025",
        category: "Housing/Utilities",
        labels: ["Housing", "Utilities"],
        title: "Electric Utility Annual Summary",
        confidence: 0.95,
        reliability_status: "verified",
        reliability_reasons: [],
        suggested_new_label: "Housing/Electricity",
        reason: "Year-end electricity consumption and billing summary.",
        created_at: isoMinutesAgo(1440),
        updated_at: isoMinutesAgo(1440),
        file_size: 294100,
        extracted_text: "Pacific Grid Electric Utility Annual Summary 2025 kWh",
        preview_images: makeDocPreviews(104, {
          accent: "#0ea5e9",
          issuer: "Pacific Grid Energy",
          subtitle: "Annual Usage & Cost Statement",
          docDate: "2025-12-18",
          heading: "Electric Utility Annual Summary",
          ref: "Account #PG-77410 · Jan–Dec 2025",
          lines: [
            { label: "Total Energy Consumed", value: "4,812 kWh" },
            { label: "Clean Grid Offset", value: "100%" },
            { label: "Average Monthly Bill", value: "$78.40" },
            { label: "Annual Total Paid", value: "$940.80" },
          ],
          total: true,
        }),
      },
      {
        id: 105,
        sha256: "a1b2c3d4e5f60005",
        original_filename: "car_service_invoice.pdf",
        source_mode: "upload",
        source_path: "~/Downloads/car_service_invoice.pdf",
        doc_date: "2025-07-09",
        doc_year: "2025",
        category: "Car",
        labels: ["Car", "Receipts"],
        title: "Annual Brake & Tire Service",
        confidence: 0.92,
        reason: "Vehicle maintenance invoice and inspection report.",
        created_at: isoMinutesAgo(2880),
        updated_at: isoMinutesAgo(2880),
        file_size: 215400,
        extracted_text: "Metro Auto Care Annual Brake Tire Inspection Invoice",
        preview_images: makeDocPreviews(105, {
          accent: "#b45309",
          issuer: "Metro Auto Care",
          subtitle: "Service & Inspection Invoice",
          docDate: "2025-07-09",
          heading: "Annual Brake & Tire Service",
          ref: "RO #49102 · Odometer 38,410 mi",
          lines: [
            { label: "Brake Fluid Flush", value: "$115.00" },
            { label: "Tire Rotation & Alignment", value: "$130.00" },
            { label: "Cabin Air Filter", value: "$42.00" },
            { label: "Total Paid", value: "$287.00" },
          ],
          total: true,
        }),
      },
      {
        id: 106,
        sha256: "a1b2c3d4e5f60006",
        original_filename: "brokerage_statement_q3.pdf",
        source_mode: "upload",
        source_path: "~/Downloads/brokerage_statement_q3.pdf",
        doc_date: "2026-10-02",
        doc_year: "2026",
        category: "Finance",
        labels: ["Finance"],
        title: "Q3 Index Portfolio Statement",
        confidence: 0.98,
        reason: "Quarterly investment account summary.",
        created_at: isoMinutesAgo(600),
        updated_at: isoMinutesAgo(600),
        file_size: 405000,
        extracted_text: "Vanguard Index Portfolio Q3 Quarterly Statement Dividends",
        preview_images: makeDocPreviews(106, {
          accent: "#206bff",
          issuer: "Summit Brokerage",
          subtitle: "Quarterly Investment Statement",
          docDate: "2026-10-02",
          heading: "Q3 Index Portfolio Statement",
          ref: "Account #SB-9021 · Q3 2026",
          lines: [
            { label: "Beginning Balance", value: "$84,210.00" },
            { label: "Quarterly Dividends", value: "+$612.40" },
            { label: "Market Change", value: "+$3,190.00" },
            { label: "Ending Portfolio Value", value: "$88,012.40" },
          ],
          total: true,
        }),
      },
    ];

    const reviewPreviewName = "demo_review_201.svg";
    previewSpecs.set(reviewPreviewName, {
      accent: "#b45309",
      angle: 0,
      issuer: "Hardware & Home Supply",
      subtitle: "Thermal Receipt Scan (Faded Header)",
      docDate: "2026-11-14",
      heading: "Power Drill & Anchors Receipt",
      ref: "Store #18 · Partially cropped receipt",
      lines: [
        { label: "Cordless Drill Kit", value: "$129.00" },
        { label: "Wall Anchor Pack", value: "$14.50" },
        { label: "Sales Tax", value: "$11.48" },
        { label: "Total Charged", value: "$154.98" },
      ],
      total: true,
    });

    const reviewItems = [
      {
        id: 201,
        sha256: "rev201sha",
        source_path: "~/Downloads/ScansIncoming/receipt_blur_nov14.jpg",
        source_mode: "watcher",
        original_filename: "receipt_blur_nov14.jpg",
        suggested_date: "2026-11-14",
        suggested_category: "Receipts",
        suggested_new_category: null,
        suggested_title: "Hardware Supply Tool Receipt",
        confidence: 0.61,
        reason: "Merchant logo partially cropped; verify category (Receipts vs. Housing).",
        review_reasons: ["low_confidence"],
        duplicate_of_id: null,
        duplicate_document: null,
        extracted_text: "Hardware & Home Supply Cordless Drill Kit Total $154.98",
        preview_images: [reviewPreviewName],
        status: "pending",
        created_at: isoMinutesAgo(12),
      },
    ];

    const activity = [
      {
        id: "act-1",
        status: "filed",
        filename: "IMG_4821_scan.pdf",
        title: "Municipal Tax Assessment",
        category: "Taxes",
        vault_rel_path: "2026/Taxes/2026-04-12 - Municipal Tax Assessment.pdf",
        document_id: 101,
        preview_images: docs[0].preview_images,
        timestamp: isoMinutesAgo(18),
      },
      {
        id: "act-2",
        status: "review",
        filename: "receipt_blur_nov14.jpg",
        title: "Hardware Supply Tool Receipt",
        category: "Receipts",
        reason: "Low confidence (61%) — waiting in Review Queue",
        review_item_id: 201,
        preview_images: [reviewPreviewName],
        timestamp: isoMinutesAgo(12),
      },
    ];

    return {
      settings,
      models: DEFAULT_MODELS.map((m) => ({ ...m })),
      docs,
      reviewItems,
      activity,
      previewSpecs,
      nextId: 300,
      scanIndex: 0,
      pendingScanCount: 5,
      modelLoaded: true,
      downloadState: { status: "idle", model_id: "", percent: 0, message: "" },
      license: null,
    };
  }

  let db = createInitialState();

  function normalizeLabelPath(raw, fallback = "") {
    const parts = String(raw || "")
      .replace(/\\/g, "/")
      .split("/")
      .map((s) => s.replace(/[<>:"|?*\x00-\x1f]/g, " ").trim())
      .filter((s) => s && !/^(19\d{2}|20\d{2})$/.test(s) && s.toLowerCase() !== "unknown year");
    return parts.length ? parts.join("/") : fallback;
  }

  function formatTitleToken(title, titleSeparator) {
    const clean = String(title || "Untitled").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
    if (titleSeparator === "underscore" || titleSeparator === "_") {
      return clean.replace(/[\s_]+/g, "_");
    }
    if (titleSeparator === "hyphen" || titleSeparator === "-") {
      return clean.replace(/[\s-]+/g, "-");
    }
    return clean;
  }

  function formatPath(settings, dateStr, category, title, ext) {
    const cleanDate = String(dateStr || "").trim() || "Undated";
    const yearMatch = /^((?:19|20)\d{2})/.exec(cleanDate);
    const year = yearMatch ? yearMatch[1] : "Unknown Year";
    const cleanCatPath = normalizeLabelPath(category, "Other");
    const flatCat = cleanCatPath.replace(/\//g, " ");
    const safeTitle = formatTitleToken(title, settings.title_separator || "space");
    const cleanExt = ext.startsWith(".") ? ext : `.${ext || "pdf"}`;

    let folder = String(settings.tree_template || "{year}/{category}")
      .replaceAll("{year}", year)
      .replaceAll("{category}", cleanCatPath)
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "");

    let stem = String(settings.filename_mask || "{date} - {title}")
      .replaceAll("{date}", cleanDate)
      .replaceAll("{year}", year)
      .replaceAll("{category}", flatCat)
      .replaceAll("{title}", safeTitle)
      .trim();

    return `${folder ? `${folder}/` : ""}${stem}${cleanExt}`;
  }

  function syncDocPaths(doc) {
    const extMatch = /\.([A-Za-z0-9]+)$/.exec(doc.original_filename || "");
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : ".pdf";
    doc.category = normalizeLabelPath(doc.category, "Other");
    const rel = formatPath(db.settings, doc.doc_date, doc.category, doc.title, ext);
    doc.vault_rel_path = rel;
    doc.vault_abs_path = `${db.settings.vault_dir}/${rel}`;
    const yearMatch = /^((?:19|20)\d{2})/.exec(doc.doc_date || "");
    doc.doc_year = yearMatch ? yearMatch[1] : "Unknown Year";
    doc.labels = doc.category.split("/").filter(Boolean);
    if (!doc.labels.length) doc.labels = ["Other"];
    if (!doc.reliability_status) doc.reliability_status = "verified";
    if (!Array.isArray(doc.reliability_reasons)) doc.reliability_reasons = [];
    if (typeof doc.suggested_new_label !== "string") doc.suggested_new_label = "";
    if (typeof doc.matched_rule_id !== "string") doc.matched_rule_id = "";
  }

  db.docs.forEach(syncDocPaths);

  function computeFacets() {
    const counts = {};
    const canonByLower = {};
    const yearsSet = new Set();
    let needsCheckCount = 0;
    const suggestedSeen = new Set();

    for (const doc of db.docs) {
      yearsSet.add(doc.doc_year || "Unknown Year");
      const relSt = String(doc.reliability_status || "verified").toLowerCase();
      if (relSt === "check_date" || relSt === "low") needsCheckCount += 1;
      const sug = String(doc.suggested_new_label || "").trim();
      if (sug) suggestedSeen.add(sug.toLowerCase());

      const parts = normalizeLabelPath(doc.category, "Other").split("/").filter(Boolean);
      const seenForDoc = new Set();
      let acc = [];
      for (const seg of parts) {
        acc.push(seg);
        const rawPrefix = acc.join("/");
        const key = rawPrefix.toLowerCase();
        const canon = canonByLower[key] || (canonByLower[key] = rawPrefix);
        acc = canon.split("/");
        if (!seenForDoc.has(key)) {
          seenForDoc.add(key);
          counts[canon] = (counts[canon] || 0) + 1;
        }
      }
    }

    const categories = Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const sortedCounts = {};
    for (const c of categories) sortedCounts[c] = counts[c];

    const nodesByLower = {};
    for (const c of categories) {
      const parts = c.split("/");
      for (let i = 0; i < parts.length; i += 1) {
        const subPath = parts.slice(0, i + 1).join("/");
        const key = subPath.toLowerCase();
        if (!nodesByLower[key]) {
          nodesByLower[key] = {
            path: subPath,
            name: parts[i],
            count: sortedCounts[subPath] ?? 0,
            children: [],
          };
        }
      }
    }
    const labelTree = [];
    for (const key of Object.keys(nodesByLower).sort()) {
      const node = nodesByLower[key];
      const parts = node.path.split("/");
      if (parts.length <= 1) {
        labelTree.push(node);
      } else {
        const parentKey = parts.slice(0, -1).join("/").toLowerCase();
        if (nodesByLower[parentKey]) {
          nodesByLower[parentKey].children.push(node);
        } else {
          labelTree.push(node);
        }
      }
    }

    const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return {
      categories,
      category_counts: sortedCounts,
      label_tree: labelTree,
      total_count: db.docs.length,
      years,
      needs_check_count: needsCheckCount,
      suggested_bundles_count: suggestedSeen.size,
    };
  }

  function learnDemoRule(payload, fallbackTarget) {
    if (!payload || typeof payload !== "object") return null;
    const kws = Array.isArray(payload.match_keywords)
      ? payload.match_keywords.map((k) => String(k || "").trim()).filter(Boolean)
      : [];
    const instr = String(payload.instruction || "").trim();
    const target = normalizeLabelPath(payload.target_label || fallbackTarget, "Other");
    if (!kws.length && !instr) return null;
    if (!db.settings.categories.some((c) => c.toLowerCase() === target.toLowerCase())) {
      db.settings.categories.push(target);
    }
    const rule = {
      id: payload.id || `rule_${Date.now().toString(36)}`,
      name: payload.name || kws.slice(0, 2).join(", ") || instr.slice(0, 48),
      match_keywords: kws,
      instruction: instr,
      target_label: target,
      enabled: payload.enabled !== false,
    };
    const existingIdx = db.settings.filing_rules.findIndex((r) => r.id === rule.id);
    if (existingIdx >= 0) db.settings.filing_rules[existingIdx] = rule;
    else db.settings.filing_rules.push(rule);
    return rule;
  }

  function buildWatcherSnapshot() {
    return {
      watcher_enabled: Boolean(db.settings.watcher_enabled),
      is_watching: Boolean(db.settings.watcher_enabled),
      is_scanning: false,
      waiting_for_model: false,
      waiting_for_model_count: 0,
      active_file: null,
      active_stage: "",
      active_loading_percent: null,
      active_thinking: "",
      last_scan_at: new Date().toISOString(),
      last_error: null,
      license_blocked: false,
      license_block_message: "",
      dump_dir: db.settings.dump_dir,
      vault_dir: db.settings.vault_dir,
      pending_dump_files: db.pendingScanCount,
      scan_queue: [],
      activity: [...db.activity],
      pending_reviews: db.reviewItems.length,
    };
  }

  function countDemoProcessedDocs() {
    return db.docs.filter((d) => String(d.source_mode || "").toLowerCase() !== "vault_scan").length;
  }

  function buildLicenseStatus() {
    const freeLimit = 30;
    const processed = countDemoProcessedDocs();
    const lic = db.license;
    const licensed = Boolean(lic && lic.status === "granted");
    return {
      licensed,
      state: licensed ? "licensed" : processed >= freeLimit ? "limit_reached" : "free",
      provider: "polar",
      polar_configured: true,
      free_limit: freeLimit,
      processed_count: processed,
      remaining_free: licensed ? null : Math.max(0, freeLimit - processed),
      can_process: Boolean(licensed || processed < freeLimit),
      tier: licensed ? lic.tier : "",
      tier_label: licensed ? lic.tier_label : "Free Tier",
      display_key: licensed ? lic.display_key : "",
      activation_id: licensed ? lic.activation_id : "",
      limit_activations: licensed ? lic.limit_activations : null,
      label: licensed ? lic.label : "",
      activated_at: licensed ? lic.activated_at : null,
      last_validated_at: licensed ? lic.last_validated_at : null,
      expires_at: null,
      needs_revalidation: false,
      portal_url: "",
      business_contact_email: "hello@document-vault.app",
      plans: [
        {
          id: "starter",
          name: "Starter",
          subtitle: "Single Mac license",
          seats: 1,
          seats_label: "1 Mac",
          prices: { USD: 19, EUR: 19, CHF: 19 },
          billing: "One-time payment",
          checkout_url: "",
          badge: "",
          contact_only: false,
          contact_email: "",
          features: [
            "Unlimited processed documents",
            "1 Mac activation",
            "Works 100% offline after activation",
            "All v1.x updates included",
          ],
        },
        {
          id: "personal",
          name: "Personal",
          subtitle: "Desktop + laptop bundle",
          seats: 3,
          seats_label: "3 Macs",
          prices: { USD: 29, EUR: 29, CHF: 29 },
          billing: "One-time payment",
          checkout_url: "",
          badge: "Most Popular",
          contact_only: false,
          contact_email: "",
          features: [
            "Unlimited processed documents",
            "Up to 3 Mac activations",
            "Deactivate & transfer Macs anytime",
            "All v1.x updates included",
          ],
        },
        {
          id: "business",
          name: "Business",
          subtitle: "Teams & commercial use",
          seats: null,
          seats_label: "5+ Macs",
          prices: null,
          billing: "Custom quote",
          checkout_url: "",
          badge: "",
          contact_only: true,
          contact_email: "hello@document-vault.app",
          features: [
            "5+ seats & shared team vaults",
            "Custom VAT invoice & procurement",
            "Priority onboarding support",
          ],
        },
      ],
    };
  }

  function demoQuotaErrorResponse() {
    const processed = countDemoProcessedDocs();
    if (!db.license && processed >= 30) {
      return jsonResponse(
        {
          detail: {
            code: "license_required",
            message: `Free limit reached (${processed} of 30 processed documents in this vault).`,
            processed_count: processed,
            free_limit: 30,
          },
        },
        402
      );
    }
    return null;
  }

  function buildHealth() {
    const selected = db.settings.vlm_model;
    const selectedModelObj = db.models.find((m) => m.name === selected);
    const downloaded = Boolean(selectedModelObj && selectedModelObj.downloaded);
    return {
      status: "ok",
      version: APP_VERSION,
      setup_completed: true,
      vault_dir: db.settings.vault_dir,
      vault_config_path: `${db.settings.vault_dir}/.document_vault/vault.json`,
      local_index_db_path: "~/Library/Application Support/Document Vault/indexes/demo.db",
      vault_db_path: `${db.settings.vault_dir}/.document_vault/vault.json`,
      vault_version_error: null,
      vlm: {
        ready: Boolean(selected && downloaded),
        selected_model: selected,
        selected_downloaded: downloaded,
        downloaded_count: db.models.filter((m) => m.downloaded).length,
        system_ram_gb: 24.0,
        loaded_model: db.modelLoaded && downloaded ? selected : null,
        loading: false,
        loading_model: null,
        loading_stage: "",
        loading_percent: null,
        unload_in_seconds: db.modelLoaded ? 240 : null,
        keep_alive_seconds: 300,
        download: { ...db.downloadState },
      },
      pending_reviews: db.reviewItems.length,
      watcher: buildWatcherSnapshot(),
      license: buildLicenseStatus(),
    };
  }

  function inferFromFilename(filename) {
    const lower = String(filename || "").toLowerCase();
    const cleanStem = String(filename || "Scanned Document")
      .replace(/\.[A-Za-z0-9]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\d{4}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    let category = "Other";
    if (/tax|irs|w2|1099|assessment/.test(lower)) category = "Taxes";
    else if (/med|lab|clinic|doctor|hospital|dental|rx/.test(lower)) category = "Medical";
    else if (/insur|policy|claim|mutual/.test(lower)) category = "Insurance";
    else if (/bank|broker|statement|finance|invest/.test(lower)) category = "Finance";
    else if (/rent|lease|utility|electric|water|home|mortgage/.test(lower)) category = "Housing";
    else if (/car|auto|tire|brake|dmv|vehicle/.test(lower)) category = "Car";
    else if (/flight|hotel|train|trip|travel|boarding/.test(lower)) category = "Travel";
    else if (/receipt|order|invoice|store/.test(lower)) category = "Receipts";

    const today = new Date().toISOString().slice(0, 10);
    const title = cleanStem ? cleanStem.replace(/\b\w/g, (c) => c.toUpperCase()) : `${category} Scan`;
    return { date: today, category, title };
  }

  function addNewDemoDocument({ filename, sourceMode = "upload", customSpec = null }) {
    const id = ++db.nextId;
    const guessed = inferFromFilename(filename);
    const previewName = `demo_doc_${id}_p1.svg`;
    db.previewSpecs.set(
      previewName,
      customSpec || {
        accent: "#206bff",
        angle: 0,
        issuer: "Local Demo Extraction",
        subtitle: `Uploaded via ${sourceMode}`,
        docDate: guessed.date,
        heading: guessed.title,
        ref: `Source: ${filename}`,
        lines: [
          { label: "Extracted Date", value: guessed.date },
          { label: "Assigned Category", value: guessed.category },
          { label: "AI Confidence", value: "95%" },
          { label: "Status", value: "Filed in Demo Vault" },
        ],
        total: true,
      }
    );

    const doc = {
      id,
      sha256: `demosha${id}`,
      original_filename: filename,
      source_mode: sourceMode,
      source_path: `~/Downloads/${filename}`,
      doc_date: guessed.date,
      doc_year: guessed.date.slice(0, 4),
      category: guessed.category,
      labels: [guessed.category],
      title: guessed.title,
      confidence: 0.95,
      reason: `Demo extraction classified "${filename}" under ${guessed.category}.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_size: 184320,
      extracted_text: `${guessed.title} ${guessed.category} ${filename}`,
      preview_images: [previewName],
    };
    syncDocPaths(doc);
    db.docs.unshift(doc);
    db.activity.unshift({
      id: `act-${id}`,
      status: "filed",
      filename,
      title: doc.title,
      category: doc.category,
      vault_rel_path: doc.vault_rel_path,
      document_id: doc.id,
      preview_images: doc.preview_images,
      timestamp: new Date().toISOString(),
    });
    return doc;
  }

  function resolveVirtualPreviewUrl(rawUrl) {
    const url = String(rawUrl || "");
    const previewMatch = /\/api\/previews\/([^?#]+)/.exec(url);
    if (previewMatch) {
      const filename = decodeURIComponent(previewMatch[1]);
      const spec = db.previewSpecs.get(filename);
      if (spec) return buildSvgDataUri(spec);
    }

    const pageMatch = /\/api\/documents\/(\d+)\/pages\/(\d+)/.exec(url);
    if (pageMatch) {
      const docId = Number(pageMatch[1]);
      const pageNum = Math.max(1, Number(pageMatch[2]) || 1);
      const doc = db.docs.find((d) => d.id === docId);
      const previewName = doc && doc.preview_images[pageNum - 1];
      const spec = previewName && db.previewSpecs.get(previewName);
      if (spec) return buildSvgDataUri(spec);
    }

    const fileMatch = /\/api\/(documents|review)\/(\d+)\/file/.exec(url);
    if (fileMatch) {
      const kind = fileMatch[1];
      const itemId = Number(fileMatch[2]);
      const item =
        kind === "documents"
          ? db.docs.find((d) => d.id === itemId)
          : db.reviewItems.find((r) => r.id === itemId);
      const previewName = item && item.preview_images && item.preview_images[0];
      const spec = previewName && db.previewSpecs.get(previewName);
      if (spec) return buildSvgDataUri(spec);
    }
    return null;
  }

  function rewriteApiAssetHtml(htmlString) {
    if (typeof htmlString !== "string" || !htmlString.includes("/api/")) {
      return htmlString;
    }
    return htmlString.replace(
      /(src|href)=("([^"]*\/api\/[^"]*)"|'([^']*\/api\/[^']*)')/g,
      (full, attr, _quoted, dVal, sVal) => {
        const raw = dVal !== undefined ? dVal : sVal;
        const resolved = resolveVirtualPreviewUrl(raw);
        if (!resolved) return full;
        return `${attr}="${resolved}"`;
      }
    );
  }

  // Intercept innerHTML, setAttribute, img.src, and iframe.src synchronously so
  // virtual /api/previews/... and /api/documents/... URLs resolve to crisp inline SVGs
  // with zero 404 network requests.
  const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (nativeInnerHtml && nativeInnerHtml.set) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      get() {
        return nativeInnerHtml.get.call(this);
      },
      set(val) {
        return nativeInnerHtml.set.call(this, rewriteApiAssetHtml(val));
      },
    });
  }

  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if ((name === "src" || name === "href") && typeof value === "string" && value.includes("/api/")) {
      const resolved = resolveVirtualPreviewUrl(value);
      if (resolved) {
        return nativeSetAttribute.call(this, name, resolved);
      }
    }
    return nativeSetAttribute.call(this, name, value);
  };

  for (const proto of [HTMLImageElement.prototype, HTMLIFrameElement.prototype]) {
    const desc = Object.getOwnPropertyDescriptor(proto, "src");
    if (desc && desc.set && desc.get) {
      Object.defineProperty(proto, "src", {
        configurable: true,
        get() {
          return desc.get.call(this);
        },
        set(val) {
          const resolved = typeof val === "string" && val.includes("/api/") ? resolveVirtualPreviewUrl(val) : null;
          return desc.set.call(this, resolved || val);
        },
      });
    }
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function parseBody(init) {
    if (!init || !init.body) return {};
    if (typeof init.body === "string") {
      try {
        return JSON.parse(init.body);
      } catch {
        return {};
      }
    }
    return {};
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === "string" ? input : input && input.url ? input.url : "";
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    const path = parsedUrl.pathname;
    if (!path.startsWith("/api/")) {
      return nativeFetch(input, init);
    }

    const method = String(init.method || (input && input.method) || "GET").toUpperCase();

    // Small realistic delay for mutations so animations feel natural
    if (method !== "GET") {
      await new Promise((r) => setTimeout(r, 120));
    }

    if (path === "/api/health" && method === "GET") {
      return jsonResponse(buildHealth());
    }

    if (path === "/api/settings") {
      if (method === "GET") {
        return jsonResponse(db.settings);
      }
      if (method === "PUT") {
        const body = await parseBody(init);
        db.settings = { ...db.settings, ...body };
        db.docs.forEach(syncDocPaths);
        return jsonResponse(db.settings);
      }
    }

    if (path === "/api/models" && method === "GET") {
      return jsonResponse({
        models: db.models,
        system_ram_gb: 24.0,
        download: { ...db.downloadState },
        runtime: buildHealth().vlm,
      });
    }

    if (path === "/api/models/unload" && method === "POST") {
      db.modelLoaded = false;
      return jsonResponse({ unloaded: true, runtime: buildHealth().vlm });
    }

    if (path === "/api/models/download" && method === "POST") {
      const body = await parseBody(init);
      const m = db.models.find((item) => item.name === body.model_id);
      if (!m) return jsonResponse({ detail: "Unknown model" }, 400);
      m.downloaded = true;
      m.local_path = `~/.cache/huggingface/hub/models--${m.name.replace("/", "--")}`;
      db.settings.vlm_model = m.name;
      db.modelLoaded = true;
      return jsonResponse({ status: "completed", model_id: m.name, percent: 100, message: "Downloaded (Demo)" });
    }

    if (path === "/api/models/delete" && method === "POST") {
      const body = await parseBody(init);
      const m = db.models.find((item) => item.name === body.model_id);
      if (m) {
        m.downloaded = false;
        m.local_path = "";
      }
      return jsonResponse({ deleted: true, models: db.models, runtime: buildHealth().vlm });
    }

    if (path === "/api/intake/preview-path" && method === "POST") {
      const body = await parseBody(init);
      const previewSettings = { ...db.settings, ...body };
      const rel = formatPath(
        previewSettings,
        body.date || "2026-04-12",
        body.category || "Taxes",
        body.title || "Municipal Tax Assessment",
        body.filename || ".pdf"
      );
      return jsonResponse({ rel_path: rel, preview_rel_path: rel });
    }

    if (path === "/api/watcher/status" && method === "GET") {
      return jsonResponse(buildWatcherSnapshot());
    }

    if (path === "/api/watcher/toggle" && method === "POST") {
      db.settings.watcher_enabled = !db.settings.watcher_enabled;
      return jsonResponse(buildWatcherSnapshot());
    }

  const DEMO_SIMULATED_SCANS = [
    {
      filename: "Scanner_Inbox_009.pdf",
      doc_date: "2026-11-18",
      category: "Medical",
      title: "Dental Checkup & Hygiene Receipt",
      spec: {
        accent: "#14b8a6",
        angle: 0,
        issuer: "BrightSmile Dental Clinic",
        subtitle: "Sample Local AI Scan",
        docDate: "2026-11-18",
        heading: "Dental Checkup & Hygiene Receipt",
        lines: [
          { label: "Routine Exam & X-Ray", value: "$110.00" },
          { label: "Preventive Cleaning", value: "$95.00" },
          { label: "Insurance Coverage", value: "-$160.00" },
          { label: "Patient Copay", value: "$45.00" },
        ],
        total: true,
      },
    },
    {
      filename: "Scanner_Inbox_010.pdf",
      doc_date: "2026-11-14",
      category: "Housing/Utilities",
      title: "Monthly Fiber Internet Bill",
      spec: {
        accent: "#6366f1",
        angle: 0,
        issuer: "Helvetia Fiber Net",
        subtitle: "Monthly Connectivity Statement",
        docDate: "2026-11-14",
        heading: "Monthly Fiber Internet Bill",
        lines: [
          { label: "10 Gbps Fiber Plan", value: "$54.00" },
          { label: "Router Lease", value: "$0.00" },
          { label: "Tax & Regulatory Fee", value: "$4.30" },
          { label: "Total Due", value: "$58.30" },
        ],
        total: true,
      },
    },
    {
      filename: "Scanner_Inbox_011.pdf",
      doc_date: "2026-11-09",
      category: "Insurance",
      title: "Comprehensive Auto Policy Renewal",
      spec: {
        accent: "#d97706",
        angle: 0,
        issuer: "Alpine Auto Insurance",
        subtitle: "Annual Policy Schedule",
        docDate: "2026-11-09",
        heading: "Comprehensive Auto Policy Renewal",
        lines: [
          { label: "Collision & Comprehensive", value: "$640.00" },
          { label: "Roadside Assistance", value: "$48.00" },
          { label: "Safe Driver Credit", value: "-$96.00" },
          { label: "Annual Premium", value: "$592.00" },
        ],
        total: true,
      },
    },
    {
      filename: "Scanner_Inbox_012.pdf",
      doc_date: "2026-11-02",
      category: "Finance",
      title: "High-Yield Savings Monthly Statement",
      spec: {
        accent: "#206bff",
        angle: 0,
        issuer: "Nordic Direct Bank",
        subtitle: "Account Statement · Oct 2026",
        docDate: "2026-11-02",
        heading: "High-Yield Savings Monthly Statement",
        lines: [
          { label: "Opening Balance", value: "$24,180.00" },
          { label: "Monthly Deposit", value: "+$1,250.00" },
          { label: "Interest Earned (4.1% APY)", value: "+$84.60" },
          { label: "Closing Balance", value: "$25,514.60" },
        ],
        total: true,
      },
    },
    {
      filename: "Scanner_Inbox_013.pdf",
      doc_date: "2026-10-27",
      category: "Travel",
      title: "Annual Rail Travelcard Receipt",
      spec: {
        accent: "#0ea5e9",
        angle: 0,
        issuer: "SBB Rail Services",
        subtitle: "Digital Ticket & Pass Receipt",
        docDate: "2026-10-27",
        heading: "Annual Rail Travelcard Receipt",
        lines: [
          { label: "Half-Fare Annual Pass", value: "$185.00" },
          { label: "Loyalty Renewal Discount", value: "-$20.00" },
          { label: "VAT Included", value: "$12.30" },
          { label: "Total Paid", value: "$165.00" },
        ],
        total: true,
      },
    },
  ];

    if ((path === "/api/watcher/scan" || path === "/api/onboarding/sample") && method === "POST") {
      const blocked = demoQuotaErrorResponse();
      if (blocked) return blocked;
      const preset = DEMO_SIMULATED_SCANS[db.scanIndex % DEMO_SIMULATED_SCANS.length];
      db.scanIndex += 1;
      db.pendingScanCount = Math.max(0, db.pendingScanCount - 1);
      const sampleName = path.endsWith("/sample") ? `Sample_${preset.filename}` : preset.filename;
      const doc = addNewDemoDocument({
        filename: sampleName,
        sourceMode: path.endsWith("/sample") ? "sample" : "watcher",
        customSpec: {
          ...preset.spec,
          ref: `Demo Scan · ${sampleName}`,
        },
      });
      doc.doc_date = preset.doc_date;
      doc.category = preset.category;
      doc.labels = preset.category.split("/").filter(Boolean);
      doc.title = preset.title;
      syncDocPaths(doc);
      return jsonResponse({
        processed: 1,
        filed: 1,
        queued: 0,
        skipped: 0,
        review: 0,
        pending_reviews: db.reviewItems.length,
        cancelled: false,
        waiting_for_model: 0,
        documents: [doc],
        document: doc,
        watcher: buildWatcherSnapshot(),
      });
    }

    if (path === "/api/watcher/upload" && method === "POST") {
      const blocked = demoQuotaErrorResponse();
      if (blocked) return blocked;
      const uploadedNames = [];
      if (init.body && typeof init.body.getAll === "function") {
        for (const f of init.body.getAll("files")) {
          if (f && f.name) uploadedNames.push(f.name);
        }
      }
      if (!uploadedNames.length) uploadedNames.push("Dropped_Scan.pdf");
      const created = uploadedNames.map((name) => addNewDemoDocument({ filename: name, sourceMode: "upload" }));
      return jsonResponse({
        accepted: created.length,
        queued_count: created.length,
        filed: created.length,
        review: 0,
        pending_reviews: db.reviewItems.length,
        rejected: [],
        waiting_for_model: 0,
        documents: created,
        watcher: buildWatcherSnapshot(),
      });
    }

    if (path === "/api/documents" && method === "GET") {
      const q = (parsedUrl.searchParams.get("q") || "").trim().toLowerCase();
      const cat = normalizeLabelPath(parsedUrl.searchParams.get("category") || "");
      const year = (parsedUrl.searchParams.get("year") || "").trim();
      const sugLabel = (parsedUrl.searchParams.get("suggested_label") || "").trim().toLowerCase();
      const relFilter = (parsedUrl.searchParams.get("reliability") || "").trim().toLowerCase();
      const sort = parsedUrl.searchParams.get("sort") || "recent";
      const limit = Number(parsedUrl.searchParams.get("limit") || 48);
      const offset = Number(parsedUrl.searchParams.get("offset") || 0);
      const includeFacets = parsedUrl.searchParams.get("include_facets") !== "false";

      let filtered = db.docs.filter((d) => {
        if (cat) {
          const catLow = cat.toLowerCase();
          const dCatLow = String(d.category || "").toLowerCase();
          const labelsLow = (Array.isArray(d.labels) ? d.labels : []).map((l) => String(l).toLowerCase());
          const matchesPrefix = dCatLow === catLow || dCatLow.startsWith(`${catLow}/`);
          if (!matchesPrefix && !labelsLow.includes(catLow)) return false;
        }
        if (year && d.doc_year !== year) return false;
        if (sugLabel && String(d.suggested_new_label || "").trim().toLowerCase() !== sugLabel) return false;
        if (relFilter) {
          const dRel = String(d.reliability_status || "verified").toLowerCase();
          if (relFilter === "needs_check" || relFilter === "check" || relFilter === "attention") {
            if (dRel !== "check_date" && dRel !== "low") return false;
          } else if (dRel !== relFilter) {
            return false;
          }
        }
        if (q) {
          const hay = `${d.title} ${d.category} ${d.doc_date} ${d.vault_rel_path} ${d.extracted_text} ${d.suggested_new_label || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (sort === "date_desc") {
        filtered.sort((a, b) => (b.doc_date || "").localeCompare(a.doc_date || ""));
      } else if (sort === "date_asc") {
        filtered.sort((a, b) => (a.doc_date || "").localeCompare(b.doc_date || ""));
      } else if (sort === "title_asc") {
        filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      } else {
        filtered.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      }

      const pageDocs = filtered.slice(offset, offset + limit);
      return jsonResponse({
        documents: pageDocs,
        total: filtered.length,
        limit,
        offset,
        has_more: offset + pageDocs.length < filtered.length,
        facets: includeFacets ? computeFacets() : null,
        pruned: 0,
      });
    }

    function getPagesMetaForDoc(doc) {
      const count = doc ? Math.max(1, doc.preview_images.length) : 1;
      const pages = [];
      for (let p = 1; p <= count; p += 1) {
        const spec = doc && db.previewSpecs.get(doc.preview_images[p - 1]);
        const angle = spec ? ((Number(spec.angle || 0) % 360) + 360) % 360 : 0;
        const landscape = angle === 90 || angle === 270;
        pages.push({ page: p, width: landscape ? 792 : 612, height: landscape ? 612 : 792 });
      }
      return pages;
    }

    const pagesMatch = /^\/api\/documents\/(\d+)\/pages$/.exec(path);
    if (pagesMatch && method === "GET") {
      const doc = db.docs.find((d) => d.id === Number(pagesMatch[1]));
      return jsonResponse({ pages: getPagesMetaForDoc(doc) });
    }

    const rotateMatch = /^\/api\/documents\/(\d+)\/rotate$/.exec(path);
    if (rotateMatch && method === "POST") {
      const doc = db.docs.find((d) => d.id === Number(rotateMatch[1]));
      if (!doc) return jsonResponse({ detail: "Document not found" }, 404);
      const body = await parseBody(init);
      const pageIdx = Math.max(0, (Number(body.page) || 1) - 1);
      const angle = Number(body.angle || 90);
      const currentName = doc.preview_images[pageIdx] || doc.preview_images[0];
      const spec = db.previewSpecs.get(currentName);
      if (spec) {
        const nextName = `demo_doc_${doc.id}_p${pageIdx + 1}_r${Date.now()}.svg`;
        db.previewSpecs.set(nextName, { ...spec, angle: (spec.angle || 0) + angle });
        doc.preview_images[pageIdx] = nextName;
      }
      doc.updated_at = new Date().toISOString();
      const pages = getPagesMetaForDoc(doc);
      return jsonResponse({
        document: doc,
        pages,
        page_count: pages.length,
      });
    }

    const reclassifyMatch = /^\/api\/documents\/(\d+)\/reclassify$/.exec(path);
    if (reclassifyMatch && method === "POST") {
      const blocked = demoQuotaErrorResponse();
      if (blocked) return blocked;
      const doc = db.docs.find((d) => d.id === Number(reclassifyMatch[1]));
      if (!doc) return jsonResponse({ detail: "Document not found" }, 404);
      const sugObj = {
        date: doc.doc_date,
        category: doc.category,
        suggested_new_category: doc.suggested_new_label || null,
        title: doc.title,
        confidence: doc.confidence,
        reliability: {
          status: doc.reliability_status || "verified",
          reasons: doc.reliability_reasons || [],
          score: doc.confidence || 0.95,
        },
        reason: "Demo AI re-verified existing metadata against local rules.",
        preview_rel_path: doc.vault_rel_path,
      };
      return jsonResponse({ document: doc, suggestion: sugObj, applied: false, changed: false });
    }

    const revertMatch = /^\/api\/documents\/(\d+)\/revert$/.exec(path);
    if (revertMatch && method === "POST") {
      const doc = db.docs.find((d) => d.id === Number(revertMatch[1]));
      if (!doc) return jsonResponse({ detail: "Document not found" }, 404);
      if (!doc.previous_category) {
        return jsonResponse({ detail: "No previous label recorded for this document." }, 400);
      }
      const prevCat = doc.category;
      const prevDate = doc.doc_date;
      const prevTitle = doc.title;
      doc.category = doc.previous_category;
      if (doc.previous_doc_date !== undefined) doc.doc_date = doc.previous_doc_date;
      if (doc.previous_title !== undefined) doc.title = doc.previous_title;
      doc.previous_category = prevCat;
      doc.previous_doc_date = prevDate;
      doc.previous_title = prevTitle;
      doc.updated_at = new Date().toISOString();
      syncDocPaths(doc);
      return jsonResponse(doc);
    }

    const docIdMatch = /^\/api\/documents\/(\d+)$/.exec(path);
    if (docIdMatch) {
      const docId = Number(docIdMatch[1]);
      const idx = db.docs.findIndex((d) => d.id === docId);
      if (idx === -1) return jsonResponse({ detail: "Document not found" }, 404);
      if (method === "PATCH") {
        const body = await parseBody(init);
        const doc = db.docs[idx];
        const nextCat = body.category !== undefined ? normalizeLabelPath(body.category, "Other") : doc.category;
        const catChanged = nextCat.toLowerCase() !== String(doc.category || "").toLowerCase();
        if (catChanged) {
          doc.previous_category = doc.category;
          doc.previous_doc_date = doc.doc_date;
          doc.previous_title = doc.title;
        }
        if (body.date !== undefined) doc.doc_date = String(body.date || "");
        doc.category = nextCat;
        if (body.title !== undefined) doc.title = String(body.title || doc.title);
        if (body.clear_suggested_label || catChanged) doc.suggested_new_label = "";
        doc.reliability_status = doc.doc_date ? "verified" : "check_date";
        doc.reliability_reasons = doc.doc_date ? ["Verified by user"] : ["No date set — verify"];
        doc.confidence = doc.doc_date ? 1.0 : 0.5;
        if (body.add_category && doc.category && !db.settings.categories.some((c) => c.toLowerCase() === doc.category.toLowerCase())) {
          db.settings.categories.push(doc.category);
        }
        if (body.learn_rule) {
          learnDemoRule(body.learn_rule, doc.category);
        }
        doc.updated_at = new Date().toISOString();
        syncDocPaths(doc);
        return jsonResponse(doc);
      }
      if (method === "DELETE") {
        db.docs.splice(idx, 1);
        return jsonResponse({ deleted: true });
      }
    }

    if (path === "/api/documents/batch/reclassify" && method === "POST") {
      const blocked = demoQuotaErrorResponse();
      if (blocked) return blocked;
      const body = await parseBody(init);
      const rawIds = Array.isArray(body.doc_ids) ? body.doc_ids : (body.document_ids || []);
      const ids = new Set(rawIds.map(Number));
      const matched = db.docs.filter((d) => ids.has(d.id));
      if (!matched.length) {
        return jsonResponse({ detail: "No matching documents found to reclassify." }, 404);
      }
      const watcher = buildWatcherSnapshot();
      watcher.scan_queue = matched.map((d) => ({
        job_type: "reclassify",
        document_id: d.id,
        filename: d.title || d.original_filename || `Document #${d.id}`,
        source_path: `reclassify:${d.id}`,
        status: "unchanged",
        stage_message: "Demo AI re-verified existing metadata against local rules.",
        confidence: d.confidence ?? 0.95,
        preview_images: [...(d.preview_images || [])],
        result_path: d.vault_rel_path || "",
        category: d.category || "",
      }));
      return jsonResponse({
        queued: watcher.scan_queue,
        queued_count: watcher.scan_queue.length,
        watcher,
      });
    }

    if (path === "/api/documents/batch/delete" && method === "POST") {
      const body = await parseBody(init);
      const itemIds = Array.isArray(body.items) ? body.items.map((i) => Number(i.id)) : [];
      const docIds = Array.isArray(body.document_ids) ? body.document_ids.map(Number) : [];
      const ids = new Set(itemIds.length ? itemIds : docIds);
      db.docs = db.docs.filter((d) => !ids.has(d.id));
      return jsonResponse({ deleted_count: ids.size });
    }

    if (path === "/api/documents/batch/update" && method === "POST") {
      const body = await parseBody(init);
      const rawIds = Array.isArray(body.doc_ids) ? body.doc_ids : (body.document_ids || []);
      const ids = new Set(rawIds.map(Number));
      const targetCat = body.category ? normalizeLabelPath(body.category, "Other") : "";
      if (targetCat && body.add_category && !db.settings.categories.some((c) => c.toLowerCase() === targetCat.toLowerCase())) {
        db.settings.categories.push(targetCat);
      }
      let updated = 0;
      for (const d of db.docs) {
        if (!ids.has(d.id)) continue;
        if (targetCat) {
          d.category = targetCat;
          d.suggested_new_label = "";
        }
        if (body.date !== undefined && body.date !== null) d.doc_date = body.date;
        d.updated_at = new Date().toISOString();
        syncDocPaths(d);
        updated += 1;
      }
      const learned = body.learn_rule ? learnDemoRule(body.learn_rule, targetCat || "Other") : null;
      return jsonResponse({ updated_count: updated, errors: [], ...(learned ? { learned_rule: learned } : {}) });
    }

    if (path === "/api/labels/suggestions" && method === "GET") {
      const map = new Map();
      for (const d of db.docs) {
        const sug = String(d.suggested_new_label || "").trim();
        if (!sug) continue;
        const key = sug.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { suggested_label: sug, count: 0, doc_ids: [], sample_titles: [], current_categories: [] });
        }
        const b = map.get(key);
        b.count += 1;
        b.doc_ids.push(d.id);
        if (b.sample_titles.length < 4) b.sample_titles.push(d.title);
        if (!b.current_categories.includes(d.category)) b.current_categories.push(d.category);
      }
      const bundles = Array.from(map.values()).sort((a, b) => b.count - a.count);
      return jsonResponse({ bundles, total_docs: bundles.reduce((s, b) => s + b.count, 0) });
    }

    if (path === "/api/labels/suggestions/detail" && method === "GET") {
      const sug = normalizeLabelPath(parsedUrl.searchParams.get("suggested_label") || "");
      const docs = db.docs.filter((d) => String(d.suggested_new_label || "").toLowerCase() === sug.toLowerCase());
      return jsonResponse({ suggested_label: sug, count: docs.length, documents: docs });
    }

    if (path === "/api/labels/suggestions/apply" && method === "POST") {
      const body = await parseBody(init);
      const sug = normalizeLabelPath(body.suggested_label || "");
      const target = normalizeLabelPath(body.target_label || sug, "Other");
      const bundleDocs = db.docs.filter((d) => String(d.suggested_new_label || "").toLowerCase() === sug.toLowerCase());
      const selectedSet = Array.isArray(body.doc_ids) ? new Set(body.doc_ids.map(Number)) : new Set(bundleDocs.map((d) => d.id));
      const overrides = body.manual_overrides && typeof body.manual_overrides === "object" ? body.manual_overrides : {};
      if (!db.settings.categories.some((c) => c.toLowerCase() === target.toLowerCase())) {
        db.settings.categories.push(target);
      }
      let movedCount = 0;
      let dismissedCount = 0;
      for (const d of bundleDocs) {
        const ov = overrides[String(d.id)] ?? overrides[d.id];
        if (!selectedSet.has(d.id) && !ov) {
          if (body.dismiss_excluded) {
            d.suggested_new_label = "";
            dismissedCount += 1;
          }
          continue;
        }
        const destCat = normalizeLabelPath(ov || target, target);
        if (!db.settings.categories.some((c) => c.toLowerCase() === destCat.toLowerCase())) {
          db.settings.categories.push(destCat);
        }
        d.previous_category = d.category;
        d.previous_doc_date = d.doc_date;
        d.previous_title = d.title;
        d.category = destCat;
        d.suggested_new_label = "";
        syncDocPaths(d);
        movedCount += 1;
      }
      const learned = body.learn_rule ? learnDemoRule(body.learn_rule, target) : null;
      return jsonResponse({
        suggested_label: sug,
        target_label: target,
        moved_count: movedCount,
        dismissed_count: dismissedCount,
        errors: [],
        ...(learned ? { learned_rule: learned } : {}),
      });
    }

    if (path === "/api/labels/suggestions/dismiss" && method === "POST") {
      const body = await parseBody(init);
      const sug = normalizeLabelPath(body.suggested_label || "").toLowerCase();
      const idSet = Array.isArray(body.doc_ids) ? new Set(body.doc_ids.map(Number)) : null;
      let count = 0;
      for (const d of db.docs) {
        if (String(d.suggested_new_label || "").toLowerCase() !== sug) continue;
        if (idSet && !idSet.has(d.id)) continue;
        d.suggested_new_label = "";
        count += 1;
      }
      return jsonResponse({ dismissed_count: count });
    }

    if (path === "/api/labels/rename" && method === "POST") {
      const body = await parseBody(init);
      const oldClean = normalizeLabelPath(body.old_label || "");
      const newClean = normalizeLabelPath(body.new_label || "");
      const oldLow = oldClean.toLowerCase();
      const oldPrefix = `${oldLow}/`;
      const remap = (lbl) => {
        const norm = normalizeLabelPath(lbl || "");
        const low = norm.toLowerCase();
        if (low === oldLow) return newClean;
        if (low.startsWith(oldPrefix)) return `${newClean}/${norm.slice(oldClean.length + 1)}`;
        return norm;
      };
      const seen = new Set();
      db.settings.categories = db.settings.categories
        .map(remap)
        .filter((c) => {
          const k = c.toLowerCase();
          if (!c || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      if (newClean && !seen.has(newClean.toLowerCase())) db.settings.categories.push(newClean);
      db.settings.filing_rules.forEach((r) => {
        r.target_label = remap(r.target_label);
      });
      let movedCount = 0;
      for (const d of db.docs) {
        const curLow = String(d.category || "").toLowerCase();
        const sugLow = String(d.suggested_new_label || "").toLowerCase();
        if (body.relocate_files !== false && (curLow === oldLow || curLow.startsWith(oldPrefix))) {
          d.category = remap(d.category);
          if (sugLow === oldLow || sugLow.startsWith(oldPrefix)) d.suggested_new_label = "";
          syncDocPaths(d);
          movedCount += 1;
        } else if (sugLow === oldLow || sugLow.startsWith(oldPrefix)) {
          const nextSug = remap(d.suggested_new_label);
          d.suggested_new_label = nextSug.toLowerCase() === String(d.category || "").toLowerCase() ? "" : nextSug;
        }
      }
      return jsonResponse({ old_label: oldClean, new_label: newClean, moved_count: movedCount, categories: db.settings.categories, errors: [] });
    }

    if (path === "/api/labels/delete" && method === "POST") {
      const body = await parseBody(init);
      const cleanLbl = normalizeLabelPath(body.label || "");
      const targetLbl = normalizeLabelPath(body.reassign_to || "Other", "Other");
      const low = cleanLbl.toLowerCase();
      const prefix = `${low}/`;
      db.settings.categories = db.settings.categories.filter((c) => {
        const cl = String(c).toLowerCase();
        return cl !== low && !cl.startsWith(prefix);
      });
      if (!db.settings.categories.length) db.settings.categories = ["Other"];
      db.settings.filing_rules = db.settings.filing_rules.filter((r) => {
        const tl = String(r.target_label || "").toLowerCase();
        return tl !== low && !tl.startsWith(prefix);
      });
      let movedCount = 0;
      for (const d of db.docs) {
        const curLow = String(d.category || "").toLowerCase();
        const sugLow = String(d.suggested_new_label || "").toLowerCase();
        if (body.relocate_files && (curLow === low || curLow.startsWith(prefix))) {
          d.category = targetLbl;
          d.suggested_new_label = "";
          syncDocPaths(d);
          movedCount += 1;
        } else if (sugLow === low || sugLow.startsWith(prefix)) {
          d.suggested_new_label = "";
        }
      }
      return jsonResponse({ deleted_label: cleanLbl, moved_count: movedCount, categories: db.settings.categories, filing_rules: db.settings.filing_rules, errors: [] });
    }

    if (path === "/api/rules") {
      if (method === "GET") return jsonResponse({ rules: db.settings.filing_rules });
      if (method === "POST") {
        const body = await parseBody(init);
        const rule = learnDemoRule(body, body.target_label || "Other");
        if (!rule) return jsonResponse({ detail: "Provide match keywords or an instruction." }, 400);
        return jsonResponse({ rules: db.settings.filing_rules, rule });
      }
    }

    const delRuleMatch = /^\/api\/rules\/([^/]+)$/.exec(path);
    if (delRuleMatch && method === "DELETE") {
      const ruleId = decodeURIComponent(delRuleMatch[1]);
      db.settings.filing_rules = db.settings.filing_rules.filter((r) => String(r.id) !== ruleId);
      return jsonResponse({ rules: db.settings.filing_rules });
    }

    if (path === "/api/review" && method === "GET") {
      const items = db.reviewItems.map((item) => ({
        ...item,
        preview_rel_path: formatPath(
          db.settings,
          item.suggested_date,
          item.suggested_category,
          item.suggested_title,
          ".jpg"
        ),
      }));
      return jsonResponse({ items, pending_count: items.length });
    }

    const approveMatch = /^\/api\/review\/(\d+)\/approve$/.exec(path);
    if (approveMatch && method === "POST") {
      const blocked = demoQuotaErrorResponse();
      if (blocked) return blocked;
      const itemId = Number(approveMatch[1]);
      const idx = db.reviewItems.findIndex((i) => i.id === itemId);
      if (idx === -1) return jsonResponse({ detail: "Review item not found" }, 404);
      const item = db.reviewItems.splice(idx, 1)[0];
      const body = await parseBody(init);
      const chosenCat = normalizeLabelPath(body.category || item.suggested_category || "Other", "Other");
      const doc = {
        id: ++db.nextId,
        sha256: item.sha256,
        original_filename: item.original_filename,
        source_mode: item.source_mode,
        source_path: item.source_path,
        doc_date: body.date || item.suggested_date,
        doc_year: (body.date || item.suggested_date || "").slice(0, 4) || "Unknown Year",
        category: chosenCat,
        labels: chosenCat.split("/").filter(Boolean),
        title: body.title || item.suggested_title,
        confidence: 1.0,
        reliability_status: "verified",
        reliability_reasons: ["Reviewed and approved by user"],
        suggested_new_label: "",
        reason: "Approved from Review Queue.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_size: 164200,
        extracted_text: item.extracted_text,
        preview_images: item.preview_images,
      };
      if (body.add_category && !db.settings.categories.some((c) => c.toLowerCase() === chosenCat.toLowerCase())) {
        db.settings.categories.push(chosenCat);
      }
      const learned = body.learn_rule ? learnDemoRule(body.learn_rule, chosenCat) : null;
      syncDocPaths(doc);
      db.docs.unshift(doc);
      db.activity.unshift({
        id: `act-${doc.id}`,
        status: "filed",
        filename: doc.original_filename,
        title: doc.title,
        category: doc.category,
        vault_rel_path: doc.vault_rel_path,
        document_id: doc.id,
        preview_images: doc.preview_images,
        timestamp: new Date().toISOString(),
      });
      return jsonResponse({ document: doc, pending_count: db.reviewItems.length, ...(learned ? { learned_rule: learned } : {}) });
    }

    const dismissMatch = /^\/api\/review\/(\d+)\/dismiss$/.exec(path);
    if (dismissMatch && method === "POST") {
      const itemId = Number(dismissMatch[1]);
      const idx = db.reviewItems.findIndex((i) => i.id === itemId);
      if (idx === -1) return jsonResponse({ detail: "Review item not found" }, 404);
      const item = db.reviewItems.splice(idx, 1)[0];
      return jsonResponse({ item, pending_count: db.reviewItems.length });
    }

    if (path === "/api/license" && method === "GET") {
      return jsonResponse(buildLicenseStatus());
    }

    if (path === "/api/license/activate" && method === "POST") {
      const body = await parseBody(init);
      const key = String(body.license_key || "").trim();
      if (!key || key.toUpperCase() === "INVALID") {
        return jsonResponse(
          { detail: { code: "invalid_key", message: "License key not found or invalid." } },
          400
        );
      }
      const upper = key.toUpperCase();
      const isStarter = upper.startsWith("DVS-");
      const nowIso = new Date().toISOString();
      db.license = {
        status: "granted",
        tier: isStarter ? "starter" : "personal",
        tier_label: isStarter ? "Starter (1 Mac)" : "Personal (3 Macs)",
        display_key: key.length <= 6 ? "****" : `****-${key.slice(-6)}`,
        activation_id: `demo-act-${Date.now()}`,
        limit_activations: isStarter ? 1 : 3,
        label: String(body.label || "Demo MacBook Pro"),
        activated_at: nowIso,
        last_validated_at: nowIso,
      };
      return jsonResponse(buildLicenseStatus());
    }

    if (path === "/api/license/validate" && method === "POST") {
      if (db.license) {
        db.license.last_validated_at = new Date().toISOString();
      }
      return jsonResponse({
        ...buildLicenseStatus(),
        validation: { checked: Boolean(db.license), valid: Boolean(db.license), offline: false },
      });
    }

    if (path === "/api/license/deactivate" && method === "POST") {
      db.license = null;
      return jsonResponse({
        ...buildLicenseStatus(),
        deactivated: true,
        remote_deactivated: true,
      });
    }

    if (path === "/api/licenses" && method === "GET") {
      return jsonResponse({
        components: [
          {
            name: "FastAPI & Uvicorn",
            version: "0.115+",
            license: "MIT / BSD-3-Clause",
            description: "Local HTTP API server powering the browser UI.",
            url: "https://fastapi.tiangolo.com/",
          },
          {
            name: "MLX & mlx-vlm",
            version: "0.8+",
            license: "MIT",
            description: "On-device Apple Silicon vision-language inference.",
            url: "https://github.com/Blaizzy/mlx-vlm",
          },
          {
            name: "Sparkle 2",
            version: "2.x",
            license: "MIT",
            description: "Signed macOS automatic app updates.",
            url: "https://sparkle-project.org/",
          },
        ],
        runtime_dependencies: [],
        notices: ["Interactive demo environment — install Document Vault on macOS for full local MLX Vision processing."],
      });
    }

    if (path === "/api/vault/inspect") {
      return jsonResponse({
        exists: true,
        has_vault_config: true,
        vault_dir: db.settings.vault_dir,
        document_count: db.docs.length,
        compatible: true,
      });
    }

    if (path === "/api/fs/pick-folder" || path === "/api/folders/open") {
      return jsonResponse({
        cancelled: true,
        message: "Folder dialogs are disabled in the browser demo.",
        path: db.settings.vault_dir,
      });
    }

    return jsonResponse({ ok: true });
  };

  window.__dvDemoControl = {
    reset() {
      db = createInitialState();
      window.location.reload();
    },
    getThemeMode() {
      return document.documentElement.dataset.themeMode || "auto";
    },
    getTheme() {
      return document.documentElement.dataset.theme || "light";
    },
    setTheme(mode) {
      const btnId =
        mode === "light" ? "theme-light-btn" : mode === "dark" ? "theme-dark-btn" : "theme-auto-btn";
      const btn = document.getElementById(btnId);
      if (btn) btn.click();
    },
  };

  function bindDemoScanButtonLabel() {
    if (typeof document.getElementById !== "function") return;
    const scanBtn = document.getElementById("scan-now-btn");
    if (!scanBtn) return;
    const syncLabel = () => {
      const current = String(scanBtn.textContent || "").trim();
      if (!current || current === "Scan Now") {
        scanBtn.textContent = "Simulate scan";
      }
    };
    syncLabel();
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(syncLabel);
      observer.observe(scanBtn, { childList: true, characterData: true, subtree: true });
    }
  }

  if (typeof document.addEventListener === "function") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindDemoScanButtonLabel);
    } else {
      bindDemoScanButtonLabel();
    }
  }
})();
