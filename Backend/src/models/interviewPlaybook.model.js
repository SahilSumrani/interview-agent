const mongoose = require("mongoose")

const competencySchema = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: "" },
    sampleProbes: { type: [ String ], default: [] }
}, { _id: false })

const rubricSchema = new mongoose.Schema({
    dimension: { type: String, required: true },
    weight: { type: Number, default: 1 },
    description: { type: String, default: "" }
}, { _id: false })

const interviewPlaybookSchema = new mongoose.Schema({
    companyKey: {
        type: String,
        required: true,
        unique: true,
        enum: [ "google", "microsoft", "amazon", "meta", "accenture", "indian_it", "startup", "general" ]
    },
    name: { type: String, required: true },
    shortLabel: { type: String, required: true },
    personaPrompt: { type: String, required: true },
    openingTemplate: { type: String, default: "" },
    competencies: { type: [ competencySchema ], default: [] },
    evaluationRubric: { type: [ rubricSchema ], default: [] },
    adaptiveRules: {
        // A 10-second spoken answer is roughly 130 characters, so the old 80-char
        // floor let genuinely thin answers pass as adequate.
        shallowThresholdChars: { type: Number, default: 140 },
        digOnBuzzwords: { type: [ String ], default: [ "we", "team", "basically", "basically just", "etc" ] },
        maxDigsBeforeAdvance: { type: Number, default: 2 }
    },
    active: { type: Boolean, default: true }
}, { timestamps: true })

module.exports = mongoose.model("InterviewPlaybook", interviewPlaybookSchema)
