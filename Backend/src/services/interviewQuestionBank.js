/**
 * Style anchors for Maya, drawn from documented company loops.
 *
 * TOKEN CONTRACT — read before adding anything here:
 * The bank is large on purpose, but at most TWO exemplar lines plus ONE
 * follow-up line ever reach the prompt on a given turn. Everything else stays
 * in Node memory at zero cost. Dumping the whole bank into a prompt would cost
 * ~25k tokens per interview and put the user over their daily Groq quota after
 * a single session. Selection is by company + phase, rotated by turn number.
 *
 * These are SHAPE references, not a script. The prompt header tells the model to
 * copy the depth and re-ground the question in the candidate's own resume. If
 * Maya ever reads these verbatim the product becomes the flat static question
 * list it is meant to beat.
 */

const EXEMPLARS = {
    google: {
        open_project: [
            "What was genuinely ambiguous when that project started, and what did you decide before anyone confirmed it was right?",
            "Walk me through how you broke that problem down — what were the two or three parts you attacked first?"
        ],
        probe_ownership: [
            "Which part of that design would not exist if you had not been on the team?",
            "Where did your judgement differ from what the team originally agreed?"
        ],
        probe_technical: [
            "Take that same design at ten times the traffic — what breaks first, and what do you fix first?",
            "What data would change your mind about that architecture choice?"
        ],
        probe_failure: [
            "Tell me about a time the data proved you wrong on that project. What did you do with it?",
            "What did you believe at the start of that project that you no longer believe?"
        ],
        probe_conflict: [
            "Who disagreed with you there, and what part of their argument did you end up accepting?",
            "How did you get buy-in when you had no authority over that decision?"
        ],
        probe_judgment: [
            "What did you deliberately not build, and what convinced you that was right?",
            "If you had half the time again, which part would you cut first?"
        ]
    },

    amazon: {
        open_project: [
            "Who was the customer for that, and how did you know it actually helped them?",
            "Walk me through what you owned end to end on that — not what the team owned."
        ],
        probe_ownership: [
            "You said we — tell me exactly what you did, in the first person, on that piece.",
            "What would have failed on that project if you had been away for two weeks?"
        ],
        probe_incident: [
            "When that broke, what was the first signal you saw, and what was your first hypothesis?",
            "Take me to the actual root cause — not the symptom. How deep did you go?"
        ],
        probe_technical: [
            "Give me the number. What was it before your change, and what was it after?",
            "What alternative did you reject there, and what specifically made you reject it?"
        ],
        probe_failure: [
            "Tell me about a decision on that project you would make differently today, and why.",
            "What did you get wrong there that only showed up after you shipped?"
        ],
        probe_judgment: [
            "You had incomplete data — what made you move anyway, and what was the risk you accepted?",
            "What did you deprioritise to deliver that, and who did that cost?"
        ]
    },

    meta: {
        open_project: [
            "Give me the messy version of that story — what actually happened, not the tidy summary.",
            "What was the hardest week of that project, and what were you doing that week?"
        ],
        probe_ownership: [
            "What did you drive there that nobody asked you to drive?",
            "Where did you set a higher bar than the team was ready for?"
        ],
        probe_technical: [
            "The requirements change halfway through — what in your design survives, and what do you throw away?",
            "You had no clear spec — how did you decide what good looked like?"
        ],
        probe_conflict: [
            "Where did you and that person actually disagree — the real disagreement, not the polite one?",
            "What did you concede in that argument, and what did you refuse to concede?"
        ],
        probe_failure: [
            "What is the thing about that project you would be embarrassed for me to find out?",
            "Tell me about a time you raised the bar and it made you unpopular."
        ],
        probe_judgment: [
            "You could only ship one of those two things — which, and defend it.",
            "What signal told you to stop investing in that?"
        ]
    },

    microsoft: {
        open_project: [
            "What did you have to learn from scratch for that, and how did you go about it?",
            "Who benefited from that work, and how did you measure that they did?"
        ],
        probe_ownership: [
            "What was your specific contribution there versus the rest of the group?",
            "What call did you make on that project that you had to defend afterwards?"
        ],
        probe_technical: [
            "Suppose you do not know the answer here — talk me through how you would find it out.",
            "What constraint made that harder than it looks on paper, and how did you work inside it?"
        ],
        probe_failure: [
            "Tell me about a piece of feedback on that work that stung, and what you did with it.",
            "What failed on that project, and what did you change about how you work afterwards?"
        ],
        probe_conflict: [
            "How did you align two people who wanted different things there?",
            "When were you the one who had to change position, and what moved you?"
        ],
        probe_judgment: [
            "What did you cut to hit that outcome, and how did you decide?",
            "What would you tell someone starting that project today?"
        ]
    },

    accenture: {
        open_project: [
            "Structure it for me: what was the objective, and what were the two or three buckets you worked through?",
            "What was your first hypothesis on that, and what did you test it against?"
        ],
        probe_ownership: [
            "On that engagement, which analysis did you personally run?",
            "What did you recommend, and what did the client actually do?"
        ],
        probe_technical: [
            "Why that technology over the obvious alternative — what did the client constraint force?",
            "How would you sequence that rollout if the client can only fund half of it this year?"
        ],
        probe_constraints: [
            "What slipped on that delivery, and how did you recover it?",
            "What risk did you flag that the client did not want to hear?"
        ],
        probe_judgment: [
            "Give me the recommendation in two sentences, then the biggest risk to it.",
            "What would you have needed to be more confident, and how would you have got it?"
        ]
    },

    indian_it: {
        open_intro: [
            "Tell me about yourself in about two minutes — background, strengths, and what you want to do next.",
            "Give me a quick self-introduction: your education, your project work, and your key strengths."
        ],
        open_project: [
            "Take me through your final-year project — what problem did it solve, and what was your role?",
            "Explain the architecture of your main project as if I have never seen it."
        ],
        probe_fundamentals: [
            "Explain the four pillars of OOPS with an example from your own project code.",
            "What is normalization, and would you normalize or denormalize the main table in your project? Why?",
            "Difference between a process and a thread — and where does your project use either?",
            "Write me a query, out loud, that returns the second highest salary from an employee table."
        ],
        probe_ownership: [
            "In that team project, which module did you write yourself?",
            "Which part of that code could you explain line by line right now?"
        ],
        probe_technical: [
            "Why did you choose that database for the project instead of the alternative?",
            "If a hundred times more users hit your project tomorrow, what is the first thing that breaks?"
        ],
        probe_failure: [
            "What was the hardest bug in that project, and how long did it take you to find it?",
            "What is one thing you would build differently if you started the project again?"
        ],
        probe_fit: [
            "Are you open to relocation and rotational shifts? Tell me honestly what would be hard about that.",
            "Why this company specifically, and why services rather than a product company?"
        ]
    },

    startup: {
        open_project: [
            "What did you ship end to end, and how long did it actually take?",
            "What did you build that nobody told you to build?"
        ],
        probe_ownership: [
            "What did you do there that was technically not your job?",
            "If nobody reviewed your work for a month, what would happen?"
        ],
        probe_constraints: [
            "What did you cut to ship on time, and what did that cost you later?",
            "You have one week and no budget — what is the version of that you would build?"
        ],
        probe_failure: [
            "What is something you are genuinely not good at yet?",
            "Where did you over-engineer, and what did it cost?"
        ],
        probe_judgment: [
            "Skip the polished answer — what actually went wrong there?",
            "What would you do in your first month here that nobody has asked for?"
        ]
    },

    general: {
        open_intro: [
            "Give me a short introduction — your background and the work you are proudest of.",
            "Tell me briefly who you are professionally and what you want next."
        ],
        open_project: [
            "Walk me through that project — the goal, your decisions, and the result.",
            "What was the hardest part of that work, and what did you do about it?"
        ],
        probe_ownership: [
            "What did you personally decide there, as opposed to the team?",
            "Which part of that outcome would not have happened without you?"
        ],
        probe_technical: [
            "Add one hard constraint to that problem — how does your approach change?",
            "Explain the core technical choice you made and the alternative you passed on."
        ],
        probe_constraints: [
            "What did you have to give up to deliver that on time?",
            "What resource were you missing, and how did you work around it?"
        ],
        probe_incident: [
            "When it went wrong, what was the first sign, and what did you think it was?",
            "What was the actual root cause, and what did you change so it could not repeat?"
        ],
        probe_metrics: [
            "Suppose that number drops twenty percent next week — how do you find out why?",
            "Define the metric precisely, then tell me how you would segment it to find the driver."
        ],
        probe_conflict: [
            "Who disagreed with you, and how did it get resolved?",
            "How did you convince someone who did not report to you?"
        ],
        probe_failure: [
            "Tell me about a time you were wrong about something on that work.",
            "What did you believe then that you would argue against now?"
        ],
        probe_judgment: [
            "What did you decide not to do, and why was that the right call?",
            "With one more week, what would you have changed?"
        ],
        probe_fundamentals: [
            "Explain one core concept from your field as if I were new to it.",
            "Where does that concept actually show up in the work you have done?"
        ],
        probe_fit: [
            "What kind of work do you want more of, and what do you want less of?",
            "What would make you leave a job within a year?"
        ]
    }
}

/**
 * The probe that follows an answer is where interview quality actually lives,
 * and a good probe is derived from the specific defect in what was just said.
 * Keyed by classifyAnswerGap().
 */
const FOLLOW_UP_LADDER = {
    vague: [
        "Their last answer was thin — ask for the concrete detail: what exactly did they do, in what order.",
        "Do not accept the summary. Ask them to replay one specific moment of that work step by step."
    ],
    we_heavy: [
        "They answered as we. Ask what THEY personally did on that, in the first person, and do not let it slide.",
        "Separate them from the team: which decision was theirs alone, and who would disagree that it was?"
    ],
    no_metric: [
        "No number came out. Ask for the measurement: before, after, and how they know.",
        "Ask what the actual number was, and if there was none, how they judged it worked at all."
    ],
    no_tradeoff: [
        "They described a choice with no cost. Ask what the alternative was and what it would have bought them.",
        "Ask what that decision made worse — every real trade-off costs something."
    ],
    strong: [
        "That was a strong answer — do not move on. Push where a rehearsed story breaks: why they rejected the obvious alternative.",
        "Escalate on the same story: what broke after it shipped, and what they would do differently now."
    ]
}

const PHASE_FALLBACK = {
    probe_incident: "probe_technical",
    probe_metrics: "probe_technical",
    probe_failure: "probe_conflict",
    probe_fundamentals: "probe_technical",
    probe_fit: "probe_judgment",
    open_intro: "open_project",
    probe_constraints: "probe_technical",
    probe_conflict: "probe_failure"
}

/**
 * Phase match beats company match. The phase decides what the question is
 * ABOUT, so a generic incident question is a better anchor for probe_incident
 * than a Google-flavoured scaling question borrowed from probe_technical.
 */
function pickPhasePool(companyKey, phase) {
    const company = EXEMPLARS[companyKey] || EXEMPLARS.general
    const fallbackPhase = PHASE_FALLBACK[phase]
    return company[phase]
        || EXEMPLARS.general[phase]
        || (fallbackPhase && company[fallbackPhase])
        || (fallbackPhase && EXEMPLARS.general[fallbackPhase])
        || EXEMPLARS.general.open_project
}

/**
 * Builds the per-turn style block. Hard capped at two exemplars and one
 * follow-up line — see the token contract at the top of this file.
 */
function buildExemplarBlock({ companyKey = "general", phase = "open_project", turnCount = 1, gapType = "", seniority = "" } = {}) {
    if (phase === "wrap_up") return ""

    const pool = pickPhasePool(companyKey, phase)
    if (!pool?.length) return ""

    const start = Math.max(0, turnCount - 1) % pool.length
    const picked = [ pool[start] ]
    if (pool.length > 1) picked.push(pool[(start + 1) % pool.length])

    const lines = [
        `STYLE ANCHORS (${companyKey} / ${phase}) — copy the SHAPE and DEPTH only. Re-ground each in THIS candidate's own resume; never read them out as written:`,
        ...picked.map((p) => `- ${p}`)
    ]

    const ladder = FOLLOW_UP_LADDER[gapType]
    if (ladder?.length) {
        lines.push(`FOLLOW-UP SHAPE (last answer read as ${gapType}): ${ladder[Math.max(0, turnCount - 1) % ladder.length]}`)
    }
    if (seniority === "fresher") {
        lines.push("Fresher: anchor these in college projects, internships or hackathons — never in workplace tenure.")
    }

    return lines.join("\n")
}

module.exports = {
    EXEMPLARS,
    FOLLOW_UP_LADDER,
    buildExemplarBlock,
}
