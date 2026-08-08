const multer = require("multer")

const ALLOWED = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
])

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (_req, file, cb) => {
        const name = String(file.originalname || "").toLowerCase()
        const okMime = ALLOWED.has(file.mimetype)
        const okExt = name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc")
        if (okMime || okExt) {
            cb(null, true)
        } else {
            cb(new Error("Only PDF or DOCX resumes are allowed."))
        }
    }
})

module.exports = upload
