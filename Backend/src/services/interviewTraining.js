/**
 * Distilled interview training from public sources:
 * - Agentic AI / AI Engineer Q banks (NareshIT, Analytics Vidhya, DataCamp, Medium)
 * - Google behavioral / GCA / Googleyness (Google Careers, IGotAnOffer, Final Round AI)
 * - Microsoft behavioral + technical themes (DigitalDefynd, GFG, Medium)
 * - Conversational / voice agent interview patterns
 *
 * Used to steer Maya's probes by selected company + role + resume claims.
 */

const ROLE_CATALOG = [
    { key: "software_engineer", label: "Software Engineer", field: "tech", defaultFocus: "system design, ownership, APIs, trade-offs" },
    { key: "fullstack", label: "Full Stack Developer", field: "tech", defaultFocus: "end-to-end delivery, frontend/backend trade-offs" },
    { key: "backend", label: "Backend Engineer", field: "tech", defaultFocus: "APIs, data, reliability, scale" },
    { key: "frontend", label: "Frontend / UI-UX", field: "tech", defaultFocus: "UX decisions, performance, accessibility, design systems" },
    { key: "mobile", label: "Mobile (Flutter/React Native)", field: "tech", defaultFocus: "app architecture, offline, store releases, performance" },
    { key: "ai_engineer", label: "AI / ML Engineer", field: "tech", defaultFocus: "models, evals, data pipelines, production ML" },
    { key: "agentic_ai", label: "Agentic AI / AI Agent Engineer", field: "tech", defaultFocus: "planning loops, tools, memory, guardrails, multi-agent" },
    { key: "data_analyst", label: "Data Analyst", field: "tech", defaultFocus: "metrics, SQL, experimentation, stakeholder storytelling" },
    { key: "product_manager", label: "Product Manager", field: "product", defaultFocus: "user problems, prioritization, trade-offs, outcomes" },
    { key: "project_manager", label: "Project / Program Manager", field: "consulting", defaultFocus: "scope, risks, stakeholders, delivery under ambiguity" },
    { key: "consultant", label: "Technology Consultant", field: "consulting", defaultFocus: "client framing, recommendations, change management" },
    { key: "general", label: "General / Other", field: "general", defaultFocus: "ownership, judgment, collaboration, results" },
]

const ROLE_PROBE_BANKS = {
    agentic_ai: [
        "How would you design an agent that plans, uses tools, observes results, and retries without infinite loops?",
        "Where do you put short-term vs long-term (vector) memory, and what fails if you skip one?",
        "How do you choose tools / function-calling for a goal, and prevent tool misuse?",
        "Explain Agentic AI vs plain Generative AI vs RAG in one concrete project you owned.",
        "What guardrails would you add for a customer-support or finance agent before production?",
        "How do you evaluate an agent: success rate, tool accuracy, safety, latency, and cost?",
        "Describe a multi-agent split you would use (research / analysis / reviewer) and why.",
        "What failure modes have you seen — loops, hallucinations, bad plans — and how did you fix them?",
    ],
    ai_engineer: [
        "Walk through a model or pipeline you shipped: data, training/eval, and production constraints.",
        "How did you measure quality beyond accuracy — latency, cost, drift, user impact?",
        "Tell me about a time retrieval or prompting failed; what did you change?",
        "How do you decide between fine-tuning, RAG, and tool-using agents?",
    ],
    software_engineer: [
        "Pick one resume project — what was ambiguous, what did YOU decide, what was the measurable result?",
        "What trade-off did you make under a hard constraint (latency, cost, deadline)?",
        "Describe an API or data-flow design you owned and a failure mode you planned for.",
        "When did you disagree with a teammate on a technical choice, and what happened?",
    ],
    fullstack: [
        "How did you split frontend vs backend ownership on a feature end-to-end?",
        "What UX or API contract trade-off did you personally drive?",
        "How did you debug a production issue spanning client and server?",
    ],
    backend: [
        "Explain a reliability or scale decision you owned (caching, queues, idempotency).",
        "How did you design an API under changing requirements?",
        "What operational signal told you the system was unhealthy?",
    ],
    frontend: [
        "Describe a UI performance or accessibility decision you owned.",
        "How did you handle ambiguous design requirements with stakeholders?",
        "What trade-off did you make between polish and ship date?",
    ],
    mobile: [
        "Why Flutter/RN (or native) for that app — what constraints drove the choice?",
        "How did you handle offline, push (FCM), or release risk?",
        "What performance or store-review issue did you personally fix?",
    ],
    data_analyst: [
        "Which metric did you define, and how did it change a decision?",
        "Tell me about messy data you cleaned and how you validated trust.",
        "How did you present an insight that changed stakeholder behavior?",
    ],
    product_manager: [
        "What user problem did you prioritize, and what did you cut?",
        "How did you measure success after launch?",
        "Describe a conflict between engineering, design, and business — your call.",
    ],
    project_manager: [
        "Walk through a delivery under ambiguity — scope, risks, and what you owned.",
        "How did you recover when a milestone slipped?",
        "How did you align conflicting stakeholders without authority?",
    ],
    consultant: [
        "Structure a client problem you advised on — hypothesis, workstreams, recommendation.",
        "What risk did you flag that the client almost missed?",
        "How did you get buy-in for a recommendation?",
    ],
    general: [
        "Walk me through work you personally owned — goal, decision, result.",
        "What trade-off did you make, and what would you redo?",
        "Describe a conflict or failure and what you learned.",
    ],
}

const COMPANY_TRAINING = {
    google: {
        frameworks: [ "GCA", "Googleyness & Leadership", "Role-Related Knowledge", "STAR" ],
        interviewerHabits: [
            "Prefer depth on ONE story over many shallow stories",
            "Ask how they structured ambiguity and what data changed their mind",
            "Probe humility, collaboration, and doing the right thing under pressure",
            "Push for personal 'I' decisions, not only 'we'",
            "Role-related: dig into claimed tech with constraints",
        ],
        sampleBehavioral: [
            "Tell me about a time you solved an ambiguous problem.",
            "Describe a conflict on a team and how you handled it.",
            "When did you influence without authority?",
            "Tell me about a failure and what you changed afterward.",
            "Give an example of helping others succeed at your own cost.",
        ],
    },
    microsoft: {
        frameworks: [ "Growth mindset", "Customer obsession", "Collaborate", "Deliver results", "STAR" ],
        interviewerHabits: [
            "Ask what they learned from feedback or failure",
            "Anchor on customer / user impact with metrics",
            "Probe cross-team collaboration and inclusive decisions",
            "Ask what they cut to hit an outcome",
            "Mix behavioral with light technical ownership for engineering roles",
        ],
        sampleBehavioral: [
            "Tell me about a time you had to learn something quickly for a customer.",
            "Describe a project that failed and how you responded.",
            "How did you align two teams with conflicting goals?",
            "What did you prioritize down to deliver results?",
        ],
    },
    accenture: {
        frameworks: [ "Structured thinking", "Client advisory", "Delivery", "Tech judgment" ],
        interviewerHabits: [
            "Ask for MECE-ish framing and first hypothesis",
            "Probe client recommendation and change risks",
            "Focus on personal contribution on client engagements",
            "Ask why that tech approach over alternatives",
        ],
        sampleBehavioral: [
            "Walk through a client problem you structured and the recommendation you owned.",
            "What slipped on delivery and how did you recover?",
            "How did you convince a skeptical stakeholder?",
        ],
    },
    amazon: {
        frameworks: [ "Customer Obsession", "Ownership", "Dive Deep", "Bias for Action", "Deliver Results", "STAR" ],
        interviewerHabits: [
            "Demand metrics and root-cause depth",
            "Probe ownership end-to-end, not handoffs",
            "Ask what they would do differently with more data",
            "Ground every question in a resume project when possible",
        ],
        sampleBehavioral: [
            "Tell me about a time you dove deep to find a root cause.",
            "Describe ownership when something broke in production.",
            "When did you bias for action with incomplete information?",
        ],
    },
    startup: {
        frameworks: [ "Ship fast", "Ownership", "Ambiguity", "Leverage", "STAR" ],
        interviewerHabits: [
            "Ask what they shipped with scarce resources",
            "Probe cutting scope vs quality trade-offs",
            "Prefer end-to-end builders over specialists-only stories",
        ],
        sampleBehavioral: [
            "Walk through something you shipped end-to-end under a deadline.",
            "What did you cut to ship, and what was the impact?",
        ],
    },
    meta: {
        frameworks: [ "Drives Results", "Resolves Conflict", "Raises the Bar", "Embraces Ambiguity", "Communicates Effectively" ],
        interviewerHabits: [
            "Specifics beat polish — a messy story with real detail outscores a clean story with none",
            "Probe the real disagreement, not the diplomatic version of it",
            "Ask where they raised the bar beyond what was asked",
            "Push on operating without a spec or a clear owner",
            "Distrust rehearsed narratives; ask for the part they left out",
        ],
        sampleBehavioral: [
            "Tell me about the messiest project you shipped and what actually went wrong.",
            "When did you disagree with someone and lose — what did you do next?",
            "Describe work you started without being asked.",
        ],
    },
    indian_it: {
        frameworks: [ "CS fundamentals", "Project defence", "Communication", "Fit & flexibility" ],
        interviewerHabits: [
            "Open with a two-minute self-introduction, then never ask a generic question again",
            "Push the final-year project past what it did into why that choice",
            "Check core fundamentals out loud: OOPS, DBMS, OS basics, simple SQL",
            "Verify they can explain their own code, not just describe the feature",
            "Close on fit: relocation, shifts, and why this company",
        ],
        sampleBehavioral: [
            "Explain your final-year project and your exact contribution to it.",
            "Which subject are you strongest in, and can you prove it with one question?",
            "Are you comfortable with relocation and rotational shifts?",
        ],
    },
    general: {
        frameworks: [ "Ownership", "Judgment", "Collaboration", "Depth", "STAR" ],
        interviewerHabits: [
            "One concrete story at a time",
            "Dig on ownership, trade-offs, and measurable results",
            "Challenge buzzwords and vague 'we' answers",
        ],
        sampleBehavioral: [
            "Walk me through recent work you owned — goal, decisions, result.",
            "What trade-off did you make under pressure?",
        ],
    },
}

function getRoleByKey(roleKey = "general") {
    return ROLE_CATALOG.find((r) => r.key === roleKey) || ROLE_CATALOG.find((r) => r.key === "general")
}

function resolveRoleKeyFromLabel(roleLabel = "") {
    const t = String(roleLabel || "").toLowerCase()
    if (/agentic|ai agent|llm agent/.test(t)) return "agentic_ai"
    if (/\bai\b|\bml\b|machine learning|llm/.test(t)) return "ai_engineer"
    if (/flutter|react native|mobile/.test(t)) return "mobile"
    if (/front.?end|ui\/?ux|design/.test(t)) return "frontend"
    if (/back.?end|api engineer/.test(t)) return "backend"
    if (/full.?stack/.test(t)) return "fullstack"
    if (/data analyst|analytics/.test(t)) return "data_analyst"
    if (/product manager|\bpm\b/.test(t)) return "product_manager"
    if (/project|program manager|scrum/.test(t)) return "project_manager"
    if (/consult/.test(t)) return "consultant"
    if (/software|sde|developer|engineer/.test(t)) return "software_engineer"
    return "general"
}

function buildTrainingBlock({ companyKey = "general", roleKey = "general", roleLabel = "", skills = [] }) {
    const company = COMPANY_TRAINING[companyKey] || COMPANY_TRAINING.general
    const role = getRoleByKey(roleKey) || getRoleByKey(resolveRoleKeyFromLabel(roleLabel))
    const probes = ROLE_PROBE_BANKS[role.key] || ROLE_PROBE_BANKS.general
    const skillHint = (skills || []).slice(0, 8).join(", ")

    return `
INTERVIEW TRAINING (use to pick probes; do not recite as a list):
Company frameworks: ${company.frameworks.join(", ")}
Interviewer habits: ${company.interviewerHabits.join("; ")}
Role: ${role.label} — focus: ${role.defaultFocus}
Role probe bank (pick ONE relevant to resume, then dig):
- ${probes.slice(0, 6).join("\n- ")}
Sample company behavioral angles: ${company.sampleBehavioral.slice(0, 3).join(" | ")}
Resume skill claims to pressure-test: ${skillHint || "infer from resume"}
RULES:
1) Always ground the question in a resume project/skill when possible.
2) Prefer STAR digs: Situation → Task → Action (personal) → Result (metric).
3) If answer is shallow, stay on SAME story; do not jump topics.
4) For Agentic/AI roles, probe planning loops, tools, memory, evals, guardrails, cost/safety.
5) Speak 1-3 short voice sentences only.
`.trim()
}

/**
 * Per-turn variant. The full training block repeats the company personaPrompt
 * almost line for line (same frameworks, same "push for I not we"), and sending
 * both on all ten turns dilutes the instruction as well as costing ~280 tokens
 * a turn. The full block still runs once at session start; mid-interview only
 * the role focus and the skill claims are actually new information.
 */
function buildTurnTrainingBlock({ roleKey = "general", roleLabel = "", skills = [] }) {
    const role = getRoleByKey(roleKey) || getRoleByKey(resolveRoleKeyFromLabel(roleLabel))
    const skillHint = (skills || []).slice(0, 8).join(", ")
    return `ROLE FOCUS: ${role.label} — ${role.defaultFocus}
Resume skill claims still unverified: ${skillHint || "infer from resume"}`
}

module.exports = {
    ROLE_CATALOG,
    ROLE_PROBE_BANKS,
    COMPANY_TRAINING,
    getRoleByKey,
    resolveRoleKeyFromLabel,
    buildTrainingBlock,
    buildTurnTrainingBlock,
}
