/**
 * Field interview playbooks trained from common industry practices:
 * - Tech: coding depth, system design trade-offs, ownership (Tech Interview Handbook / senior eng loops)
 * - Finance/IB/PE: technicals (3-statements, DCF/LBO), deal judgment, why banking (IB interview guides)
 * - Consulting: structured case thinking + PEI depth probes (McKinsey-style)
 * - Product: product sense, metrics, prioritization (CIRCLES / RICE style without naming frameworks)
 * - Marketing: funnel metrics, campaigns, creative + ROI trade-offs
 * - Healthcare: patient safety, escalation, ethics, clinical judgment (SBAR-style clarity)
 * - General: competency STAR probing
 */

function detectField(role = "", jobDescription = "") {
    const text = `${role} ${jobDescription}`.toLowerCase()

    const rules = [
        {
            field: "finance",
            keywords: [
                "finance", "investment bank", "investment banking", "ib ", " private equity", "pe ",
                "hedge fund", "equity research", "fp&a", "financial analyst", "accountant", "cfo",
                "lbo", "dcf", "valuation", "m&a", "trading", "wealth management"
            ]
        },
        {
            field: "consulting",
            keywords: [
                "consulting", "consultant", "mckinsey", "bain", "bcg", "strategy consulting",
                "management consultant", "case interview"
            ]
        },
        {
            field: "product",
            keywords: [
                "product manager", "product management", " pm ", "apm", "product owner",
                "product sense", "roadmap", "growth pm"
            ]
        },
        {
            field: "marketing",
            keywords: [
                "marketing", "brand manager", "growth marketer", "seo", "performance marketing",
                "content marketing", "demand gen", "social media manager", "cmo"
            ]
        },
        {
            field: "healthcare",
            keywords: [
                "nurse", "nursing", "doctor", "physician", "clinical", "hospital", "healthcare",
                "medical", "pharmacist", "therapist", "patient care", "rn ", "md "
            ]
        },
        {
            field: "tech",
            keywords: [
                "software", "engineer", "developer", "backend", "frontend", "full stack", "fullstack",
                "sde", "devops", "sre", "data engineer", "machine learning", "ml engineer", "ai engineer",
                "android", "ios", "react", "node", "java", "python", "system design", "qa engineer"
            ]
        }
    ]

    for (const rule of rules) {
        if (rule.keywords.some((k) => text.includes(k.trim()) || text.includes(k))) {
            return rule.field
        }
    }
    return "general"
}

const PLAYBOOKS = {
    tech: {
        label: "Technology / Software",
        opening: (role) =>
            `Hi, I'm Maya — senior interviewer for the ${role} role. Let's start with a concrete engineering story: walk me through one system or feature you personally owned — the problem, your design choices, and what you were accountable for.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_technical",
            "probe_constraints",
            "probe_incident",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Dig into architecture, APIs, data flow, or failure modes of their project — not a resume rewrite.",
            probe_ownership: "Separate team work from their commits/decisions/reviews. Ask what they designed vs implemented.",
            probe_constraints: "Probe latency, scale, cost, tech debt, or deadline trade-offs.",
            probe_technical: "Ask a system-design or debugging style question tied to their stack WITH a constraint (10x traffic, regional outage, schema migration).",
            probe_incident: "A time it broke: first signal, first hypothesis and why it was wrong, real root cause, what they changed permanently.",
            probe_conflict: "Code review disagreement or pushback on approach — their position, how they influenced, what was decided.",
            probe_failure: "A call they got wrong: what they believed, what proved them wrong, what they do differently now.",
            probe_judgment: "What they chose not to build, when to rewrite vs patch, how they prioritize reliability vs speed."
        },
        scoringFocus: "technical depth, ownership, trade-off clarity, incident judgment, communication under ambiguity"
    },

    finance: {
        label: "Finance / IB / PE / Markets",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for the ${role} role. Start with a deal, model, or analysis you personally drove: what was the question, what numbers mattered, and what recommendation you made.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_technical",
            "probe_constraints",
            "probe_metrics",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Push for drivers: revenue, margins, multiples, IRR, risks — not vague 'I worked on a deal'.",
            probe_ownership: "What tabs/assumptions did THEY own? What call would they defend to an MD/partner?",
            probe_technical: "Ask a crisp technical: 3-statement link, DCF vs comps, LBO return drivers, accretion/dilution intuition — keep it spoken and short.",
            probe_constraints: "Incomplete data, time pressure, conflicting banker/client views — how did they choose?",
            probe_metrics: "A number that moved against the thesis: how they'd isolate the driver and what they'd change in the model.",
            probe_judgment: "Would you invest / advise buy or pass? Force a recommendation + key risks.",
            probe_conflict: "Disagreement on valuation, comps set, or pitch narrative — how they influenced without authority.",
            probe_failure: "An assumption that turned out wrong — what it cost, and how they check for it now."
        },
        scoringFocus: "technical accuracy, structured thinking, investment judgment, composure with numbers, clear recommendation"
    },

    consulting: {
        label: "Consulting / Strategy",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for ${role}. Give me one client or business problem you owned: the objective, how you structured it, and the recommendation you left behind.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_technical",
            "probe_constraints",
            "probe_metrics",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Look for MECE-ish structure, hypothesis-driven approach, and measurable impact.",
            probe_ownership: "Their workstream vs partner narrative. What analysis did they personally drive?",
            probe_technical: "Mini case probe: clarify goal, structure 2-3 buckets, ask for one estimate or driver, then a recommendation.",
            probe_constraints: "Missing data, stakeholder politics, timeline — how they adapted the approach.",
            probe_metrics: "A client KPI moving the wrong way: how they'd segment it, name the likeliest driver, and what they'd recommend.",
            probe_conflict: "Client pushback or team disagreement — PEI-style depth on personal action.",
            probe_failure: "A recommendation that did not land or an analysis that was wrong — what they own about it.",
            probe_judgment: "What would they do differently with one more week? What did they deprioritize?"
        },
        scoringFocus: "structure, business judgment, communication clarity, ownership, client influence"
    },

    product: {
        label: "Product Management",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for ${role}. Tell me about one product decision you owned: the user problem, options you considered, and the outcome metrics.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_metrics",
            "probe_technical",
            "probe_constraints",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "User, problem, success metric — push past feature laundry lists.",
            probe_ownership: "Decision they made vs PM-by-committee. What call was theirs?",
            probe_metrics: "Give them a metric moving the wrong way on THEIR product: define it, segment it, name the likeliest driver, commit to one action.",
            probe_technical: "Product sense probe: improve or extend the product they own, forced to a clear recommendation under one constraint.",
            probe_constraints: "Scope cut, eng capacity, legal/privacy, go-to-market limits.",
            probe_conflict: "Eng/design/sales disagreement — influence without authority.",
            probe_failure: "A launch or bet that did not work — what signal they ignored and what they changed.",
            probe_judgment: "Prioritization: what they said no to and why (impact vs effort thinking without naming frameworks)."
        },
        scoringFocus: "customer empathy, metrics fluency, prioritization, crisp recommendation, cross-functional leadership"
    },

    marketing: {
        label: "Marketing / Growth / Brand",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for ${role}. Walk me through one campaign or growth initiative you owned: goal, channel mix, results, and what you personally optimized.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_metrics",
            "probe_technical",
            "probe_constraints",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Ask for funnel metrics: CAC, conversion, ROAS, retention — specifics over vibes.",
            probe_ownership: "Creative vs media buy vs analytics — what lever did they pull?",
            probe_metrics: "A funnel number drops: how they segment it, the likeliest driver, and the one action they commit to.",
            probe_technical: "Diagnose a channel that stopped working OR how they'd allocate a fixed budget across channels.",
            probe_constraints: "Budget cut, brand guidelines, legal review, seasonality.",
            probe_conflict: "Agency/brand/sales conflict — how they aligned on messaging or spend.",
            probe_failure: "A campaign that underperformed — what they misread about the audience.",
            probe_judgment: "What they killed, what they doubled down on, and how they measured incrementality."
        },
        scoringFocus: "metrics literacy, experimentation mindset, creative judgment, ROI thinking, stakeholder alignment"
    },

    healthcare: {
        label: "Healthcare / Clinical",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for ${role}. Share one clinical or patient-care situation you handled: what was happening, what you assessed, and what you did to keep the patient safe.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_technical",
            "probe_constraints",
            "probe_incident",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Push for assessment, action, escalation — clarity like SBAR without naming it.",
            probe_ownership: "Their clinical decision vs team protocol. What did they escalate and when?",
            probe_technical: "Clinical judgment under uncertainty: vitals change, medication conflict, triage priority.",
            probe_constraints: "Staffing, time pressure, incomplete history, family conflict.",
            probe_incident: "A patient deteriorating: first sign they noticed, first working assumption, what it actually was, what changed in their practice.",
            probe_conflict: "Disagreement with physician/peer/family — advocacy + professionalism.",
            probe_failure: "A miss or near-miss they own — what they misread and the safeguard they now use.",
            probe_judgment: "Ethics/safety: when they would refuse an unsafe order or deviate from routine."
        },
        scoringFocus: "patient safety, clinical judgment, escalation timing, empathy, ethical clarity"
    },

    general: {
        label: "General Professional",
        opening: (role) =>
            `Hi, I'm Maya — interviewing for the ${role} role. Start with one recent piece of work you personally owned: the goal, what you did, and the result.`,
        phases: [
            "open_project",
            "probe_ownership",
            "probe_technical",
            "probe_constraints",
            "probe_incident",
            "probe_conflict",
            "probe_failure",
            "probe_judgment"
        ],
        phaseHints: {
            open_project: "Get a concrete STAR story with measurable result.",
            probe_ownership: "Force personal decisions and accountability.",
            probe_constraints: "Time, resources, conflicting priorities.",
            probe_technical: "Role-skill probe: tools, process expertise, or domain knowledge for this job.",
            probe_incident: "Something went wrong mid-delivery: first signal, first assumption, real cause, permanent fix.",
            probe_conflict: "Disagreement with a teammate or stakeholder — their position and how it resolved.",
            probe_failure: "A time they were wrong — what convinced them, and what they changed.",
            probe_judgment: "Prioritization and what they would do differently."
        },
        scoringFocus: "ownership, clarity, problem solving, collaboration, judgment"
    }
}

/**
 * A few company loops are structurally different enough that the field arc is
 * the wrong shape. Indian IT services runs self-intro → project defence →
 * CS fundamentals → fit, which no field playbook models. Everything else keeps
 * the field arc.
 */
const COMPANY_PHASE_ARCS = {
    indian_it: {
        phases: [
            "open_intro",
            "open_project",
            "probe_ownership",
            "probe_fundamentals",
            "probe_technical",
            "probe_constraints",
            "probe_failure",
            "probe_fit"
        ],
        phaseHints: {
            open_intro: "Ask for the two-minute self-introduction. This is the ONE allowed generic opener — after this, every question must be grounded in the resume.",
            probe_fundamentals: "One crisp CS fundamental spoken aloud: OOPS pillars, DBMS normalization, process vs thread, indexing, or a short SQL query. Ask for the reasoning, not the textbook line.",
            probe_fit: "Fit round: relocation, rotational shifts, service-vs-product preference, and why this company specifically."
        }
    }
}

/**
 * Freshers have no workplace to draw conflict or ownership stories from, so the
 * default hints misfire on them. Only the phases that actually break get an
 * override — the rest fall through to the field playbook.
 */
const SENIORITY_PHASE_HINTS = {
    fresher: {
        open_project: "Their strongest college/personal project. What they built, what was hard, what they decided.",
        probe_ownership: "Which part of the group project was theirs ALONE — the file, module or decision nobody else touched.",
        probe_constraints: "Deadline, no budget, unfamiliar library, teammates dropping out — what they cut.",
        probe_incident: "A bug that took them longest to fix: first symptom, first wrong guess, real cause, what they now do differently.",
        probe_conflict: "Disagreement in a college team, hackathon or club — not workplace politics. How they argued their side.",
        probe_failure: "Something they thought they understood and did not — a concept, a library, an estimate. What corrected them.",
        probe_technical: "Fundamentals are fair game even outside their project — ask them to reason it out loud, not recite.",
        probe_metrics: "Give them a hypothetical number moving the wrong way and make them reason it out — they will not have production metrics.",
        probe_judgment: "What they would build differently if they restarted the project today, and why."
    },
    early_career: {
        probe_conflict: "Disagreement with a teammate, mentor or reviewer — junior-level influence, not org politics.",
        probe_judgment: "A scoping or approach call they made inside their slice of the work."
    }
}

function getPlaybook(role, jobDescription) {
    const field = detectField(role, jobDescription)
    return { field, ...PLAYBOOKS[field] }
}

/**
 * Overlays a company-specific arc on top of the field playbook when one exists.
 * Hints merge so company phases add to, rather than replace, the field hints.
 */
function applyCompanyArc(playbook, companyKey) {
    const arc = COMPANY_PHASE_ARCS[companyKey]
    if (!arc) return playbook
    return {
        ...playbook,
        phases: arc.phases,
        phaseHints: { ...(playbook.phaseHints || {}), ...(arc.phaseHints || {}) }
    }
}

function getPhaseHint(playbook, phase, seniority = "") {
    const override = SENIORITY_PHASE_HINTS[seniority]?.[phase]
    return override || playbook.phaseHints?.[phase] || ""
}

/**
 * Spreads however many phases a playbook has evenly across the turns that are
 * actually available for questions. Indexing phases[turnCount - 1] and clamping
 * meant the last three turns of every 10-turn interview collapsed onto the final
 * phase.
 */
function getPhaseForField(playbook, turnCount, maxTurns) {
    const phases = playbook.phases || PLAYBOOKS.general.phases
    const questionTurns = Math.max(1, maxTurns - 2)
    if (turnCount > questionTurns) return "wrap_up"
    if (phases.length === questionTurns) return phases[turnCount - 1]
    const slot = Math.floor(((turnCount - 1) * phases.length) / questionTurns)
    return phases[Math.min(slot, phases.length - 1)] || "probe_technical"
}

module.exports = {
    detectField,
    getPlaybook,
    getPhaseForField,
    getPhaseHint,
    applyCompanyArc,
    COMPANY_PHASE_ARCS,
    SENIORITY_PHASE_HINTS,
    PLAYBOOKS
}
