require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");


// ============================================================
// APP
// ============================================================

const app = express();

const PORT =
    process.env.PORT || 3000;

const PROVIDER =
    String(
        process.env.PROVIDER || "gemini"
    ).toLowerCase();

const API_KEY =
    process.env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";

const MODEL =
    "gemini-3.6-flash";


// ============================================================
// DATABASE
// ============================================================

const DB_PATH =
    path.join(
        __dirname,
        "Database",
        "saksham_new.db"
    );

const SCHEMA_PATH =
    path.join(
        __dirname,
        "Database",
        "schema.sql"
    );


const db =
    new Database(DB_PATH);

db.pragma(
    "foreign_keys = ON"
);

console.log(
    "SQLite database connected."
);


if (
    fs.existsSync(
        SCHEMA_PATH
    )
) {

    const schema =
        fs.readFileSync(
            SCHEMA_PATH,
            "utf8"
        );

    db.exec(schema);

    console.log(
        "Database schema loaded."
    );
}

    // ============================================================
// SEED VERIFIED HELPLINES
// ============================================================

function seedHelplines() {

    const helplines = [
        {
            name: "National Emergency",
            number: "112",
            category: "Emergency",
            description: "For immediate emergency assistance."
        },
        {
            name: "Police Control Room",
            number: "100",
            category: "Police",
            description: "For police assistance and emergencies."
        },
        {
            name: "Medical Emergency / Ambulance",
            number: "108",
            category: "Medical Emergency",
            description: "For ambulance and medical emergency assistance."
        },
        {
            name: "Fire Brigade",
            number: "101",
            category: "Fire Emergency",
            description: "For fire and rescue emergencies."
        },
        {
            name: "NALSA Legal Aid",
            number: "15100",
            category: "Legal Support",
            description: "For free legal aid and legal assistance."
        },
        {
            name: "National Cyber Crime Helpline",
            number: "1930",
            category: "Cyber Crime",
            description: "For reporting cyber crime and online financial fraud."
        },
        {
            name: "National Domestic Violence Support",
            number: "181",
            category: "Women Support",
            description: "Women helpline and support services."
        },
        {
            name: "Tele-MANAS",
            number: "14416",
            category: "Mental Health",
            description: "National tele-mental health support helpline."
        },
        {
            name: "Tele-MANAS Alternate Number",
            number: "18008914416",
            category: "Mental Health",
            description: "Alternate Tele-MANAS mental health support number."
        },
        {
            name: "KIRAN Mental Health Rehabilitation",
            number: "18005990019",
            category: "Mental Health",
            description: "Mental health rehabilitation helpline."
        },
        {
            name: "NHAA SOS Helpline",
            number: "14566",
            category: "Atrocity Support",
            description: "National helpline for atrocity-related support."
        },
        {
            name: "National Commission for Women",
            number: "7827170170",
            category: "Women Support",
            description: "24-hour women helpline of the National Commission for Women."
        },
        {
            name: "Child Helpline",
            number: "1098",
            category: "Child Protection",
            description: "For children requiring help, protection or emergency support."
        }
    ];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO helplines (
            name,
            number,
            category,
            description,
            is_active
        )
        VALUES (?, ?, ?, ?, 1)
    `);

    const seedTransaction = db.transaction(() => {

        for (const helpline of helplines) {

            insert.run(
                helpline.name,
                helpline.number,
                helpline.category,
                helpline.description
            );

        }

    });

    seedTransaction();

    const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM helplines
        WHERE is_active = 1
    `).get();

    console.log(
        `Verified helplines available: ${count.count}`
    );
}

seedHelplines();



// ============================================================
// EXPRESS
// ============================================================

app.use(
    cors()
);

app.use(
    express.json({
        limit: "20mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "20mb"
    })
);

app.use(
    express.static(
        __dirname
    )
);


// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT =
    "You are Saksham AI, a helpful and concise AI assistant. " +
    "Answer clearly and accurately. " +
    "Use simple language when possible. " +
    "Do not invent phone numbers, emergency numbers, helpline numbers, " +
    "legal information, medical information, or other critical facts. " +
    "Verified helpline requests are handled by the application's " +
    "SQLite helpline database. " +
    "For normal questions, answer helpfully and directly. " +
    "When an image or text attachment is provided, analyze it when possible.";


// ============================================================
// PROVIDER
// ============================================================

const PROVIDERS = {

    gemini: {
        label: "Gemini",
        model: MODEL
    }

};


// ============================================================
// ERROR HELPER
// ============================================================

function errorDetail(error) {

    if (!error) {
        return "Unknown error";
    }

    return (
        error.message ||
        String(error)
    );

}


// ============================================================
// NORMALIZE ATTACHMENT
// ============================================================

function normalizeAttachment(raw) {

    if (!raw) {
        return null;
    }

    return {

        kind:
            raw.kind ||
            raw.type ||
            null,

        name:
            raw.name ||
            raw.fileName ||
            "attachment",

        fileName:
            raw.fileName ||
            raw.name ||
            "attachment",

        mediaType:
            raw.mediaType ||
            raw.fileType ||
            raw.mimeType ||
            null,

        fileType:
            raw.fileType ||
            raw.mediaType ||
            raw.mimeType ||
            null,

        size:
            raw.size ||
            raw.fileSize ||
            null,

        fileSize:
            raw.fileSize ||
            raw.size ||
            null,

        data:
            raw.data ||
            raw.base64 ||
            raw.dataUrl ||
            null,

        text:
            raw.text ||
            raw.content ||
            null,

        filePath:
            raw.filePath ||
            null

    };

}


// ============================================================
// HELPLINES FROM DATABASE
// ============================================================

function getHelplinesFromDatabase() {

    return db.prepare(`
        SELECT
            id,
            name,
            number,
            category,
            description
        FROM helplines
        WHERE is_active = 1
        ORDER BY id
    `).all();

}


// ============================================================
// GUEST USER
// ============================================================

function getGuestUser() {

    let user =
        db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
        `).get(
            "guest@sakshamai.local"
        );


    if (!user) {

        const result =
            db.prepare(`
                INSERT INTO users (
                    name,
                    email
                )
                VALUES (?, ?)
            `).run(
                "Guest User",
                "guest@sakshamai.local"
            );

        return result.lastInsertRowid;
    }


    return user.id;

}


// ============================================================
// CREATE CONVERSATION
// ============================================================

function createConversation(
    title = "New Chat"
) {

    const userId =
        getGuestUser();


    const result =
        db.prepare(`
            INSERT INTO conversations (
                user_id,
                title
            )
            VALUES (?, ?)
        `).run(
            userId,
            title
        );


    return result.lastInsertRowid;

}


// ============================================================
// UPDATE CONVERSATION
// ============================================================

function updateConversation(
    conversationId
) {

    try {

        db.prepare(`
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            conversationId
        );

    } catch (error) {

        console.error(
            "Conversation update error:",
            error.message
        );

    }

}


// ============================================================
// SAVE MESSAGE
// ============================================================

function saveMessage({
    conversationId,
    role,
    messageText,
    provider = null,
    model = null
}) {

    if (!conversationId) {
        return null;
    }


    const text =
        String(
            messageText || ""
        ).trim();


    if (!text) {
        return null;
    }


    const result =
        db.prepare(`
            INSERT INTO messages (
                conversation_id,
                role,
                message_text,
                provider,
                model
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            conversationId,
            role,
            text,
            provider,
            model
        );


    return result.lastInsertRowid;

}


// ============================================================
// SAVE ATTACHMENT
// ============================================================

function saveAttachmentToDatabase(
    conversationId,
    messageId,
    attachment,
    userId
) {

    if (
        !conversationId ||
        !attachment
    ) {
        return null;
    }


    const fileName =
        attachment.fileName ||
        attachment.name ||
        "attachment";


    const fileType =
        attachment.mediaType ||
        attachment.fileType ||
        (
            attachment.kind === "image"
                ? "image/*"
                : "text/plain"
        );


    let fileSize =
        attachment.fileSize ||
        attachment.size ||
        null;


    if (
        !fileSize &&
        attachment.data
    ) {

        try {

            const base64 =
                String(
                    attachment.data
                )
                .split(",")[1] ||
                String(
                    attachment.data
                );


            fileSize =
                Buffer.byteLength(
                    base64,
                    "base64"
                );

        } catch (error) {

            fileSize = null;

        }

    }


    try {

        const result =
            db.prepare(`
                INSERT INTO attachments (
                    user_id,
                    conversation_id,
                    message_id,
                    file_name,
                    file_type,
                    file_size,
                    file_path
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                userId || null,
                conversationId,
                messageId || null,
                fileName,
                fileType,
                fileSize,
                attachment.filePath || null
            );


        return result.lastInsertRowid;

    } catch (error) {

        console.error(
            "Attachment database save error:",
            error.message
        );

        return null;

    }

}


// ============================================================
// ACTIVITY LOG
// ============================================================

function logActivity(
    userId,
    eventType,
    eventDescription = null
) {

    try {

        db.prepare(`
            INSERT INTO date_time (
                user_id,
                event_type,
                event_description
            )
            VALUES (?, ?, ?)
        `).run(
            userId || null,
            eventType,
            eventDescription
        );

    } catch (error) {

        console.error(
            "Activity log error:",
            error.message
        );

    }

}


// ============================================================
// HELPLINE DETECTION
// ============================================================

function detectHelplineRequest(
    text
) {

    const userText =
        String(
            text || ""
        )
        .toLowerCase()
        .trim();


    if (!userText) {

        return {
            isHelplineRequest: false,
            selectedHelplines: []
        };

    }


    // --------------------------------------------------------
    // EXPLICIT HELPLINE REQUEST
    // --------------------------------------------------------

    const explicitHelpline =
        [
            /\bhelpline\b/,
            /\bhelp\s*line\b/,
            /\bhelpline\s+number\b/,
            /\bhelpline\s+numbers\b/,
            /\bhelpline\s+chahiye\b/,
            /\bhelpline\s+number\s+chahiye\b/,
            /\bgive\s+me\s+(a\s+)?helpline\b/,
            /\bgive\s+me\s+(the\s+)?helpline\s+number\b/,
            /\bshow\s+me\s+(the\s+)?helpline\b/,
            /\bshow\s+me\s+(the\s+)?helpline\s+number\b/,
            /\bverified\s+helpline\b/,
            /\bhelp\s+number\b/,
            /\bsupport\s+number\b/
        ]
        .some(
            pattern =>
                pattern.test(
                    userText
                )
        );


    // --------------------------------------------------------
    // NUMBER INTENT
    // --------------------------------------------------------

    const numberIntent =
        [
            /\bnumber\b/,
            /\bphone\s+number\b/,
            /\bcontact\s+number\b/,
            /\btoll[\s-]?free\b/,
            /\bcall\b/,
            /\bdial\b/,
            /\bphone\b/,
            /\bnumber\s+chahiye\b/,
            /\bnumber\s+batao\b/,
            /\bnumber\s+do\b/
        ]
        .some(
            pattern =>
                pattern.test(
                    userText
                )
        );


    // --------------------------------------------------------
    // ALL HELPLINES
    // --------------------------------------------------------

    const wantsAll =
        [
            /\ball\s+helplines?\b/,
            /\ball\s+helpline\s+numbers\b/,
            /\ball\s+numbers\b/,
            /\ball\s+emergency\s+numbers\b/,
            /\ball\s+emergency\s+helplines\b/,
            /\bevery\s+helpline\b/
        ]
        .some(
            pattern =>
                pattern.test(
                    userText
                )
        );


    // --------------------------------------------------------
    // SERVICE
    // --------------------------------------------------------

    let service =
        null;


    if (
        /\bpolice\b/.test(
            userText
        )
    ) {

        service = "police";

    }

    else if (
        /\bambulance\b/.test(
            userText
        ) ||
        /\bmedical\s+emergency\b/.test(
            userText
        )
    ) {

        service = "ambulance";

    }

    else if (
        /\bfire\b/.test(
            userText
        ) ||
        /\bfire\s+brigade\b/.test(
            userText
        )
    ) {

        service = "fire";

    }

    else if (
        /\blegal\s+aid\b/.test(
            userText
        ) ||
        /\blegal\s+help\b/.test(
            userText
        )
    ) {

        service = "legal";

    }

    else if (
        /\bcyber\s+crime\b/.test(
            userText
        ) ||
        /\bcyber\s+fraud\b/.test(
            userText
        ) ||
        /\bonline\s+fraud\b/.test(
            userText
        )
    ) {

        service = "cyber";

    }

    else if (
        /\bdomestic\s+violence\b/.test(
            userText
        ) ||
        /\bdomestic\s+abuse\b/.test(
            userText
        )
    ) {

        service = "domestic";

    }

    else if (
        /\btele[\s-]?manas\b/.test(
            userText
        )
    ) {

        service = "telemanas";

    }

    else if (
        /\bkiran\b/.test(
            userText
        )
    ) {

        service = "kiran";

    }

    else if (
        /\bmental\s+health\b/.test(
            userText
        )
    ) {

        service = "mental";

    }

    else if (
        /\bwomen\b/.test(
            userText
        ) ||
        /\bwoman\b/.test(
            userText
        ) ||
        /\bmahila\b/.test(
            userText
        )
    ) {

        service = "women";

    }

    else if (
        /\bchild\b/.test(
            userText
        ) ||
        /\bchildren\b/.test(
            userText
        ) ||
        /\bbachon\b/.test(
            userText
        )
    ) {

        service = "child";

    }

    else if (
        /\bemergency\b/.test(
            userText
        ) ||
        /\b112\b/.test(
            userText
        )
    ) {

        service = "emergency";

    }

    else if (
        /\bnhaa\b/.test(
            userText
        ) ||
        /\batrocity\b/.test(
            userText
        ) ||
        /\b14566\b/.test(
            userText
        )
    ) {

        service = "nhaa";

    }


    // --------------------------------------------------------
    // IMPORTANT DECISION
    //
    // Normal messages such as:
    // hello
    // yes
    // how are you
    // what is AI
    //
    // MUST NOT become helpline requests.
    // --------------------------------------------------------

    const isHelplineRequest =
        wantsAll ||
        explicitHelpline ||
        (
            service !== null &&
            numberIntent
        );


    if (
        !isHelplineRequest
    ) {

        return {
            isHelplineRequest: false,
            selectedHelplines: []
        };

    }


    const all =
        getHelplinesFromDatabase();


    // --------------------------------------------------------
    // GENERIC HELPLINE
    // --------------------------------------------------------

    if (
        wantsAll ||
        (
            explicitHelpline &&
            service === null
        )
    ) {

        return {

            isHelplineRequest: true,

            selectedHelplines:
                all,

            reply:
                "Here are the verified helpline numbers available in Saksham AI."

        };

    }


    let selected = [];


    // --------------------------------------------------------
    // SERVICE FILTERS
    // --------------------------------------------------------

    if (
        service === "police"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "Police Control Room"
            );

    }

    else if (
        service === "ambulance"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "Medical Emergency / Ambulance"
            );

    }

    else if (
        service === "fire"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "Fire Brigade"
            );

    }

    else if (
        service === "legal"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "NALSA Legal Aid"
            );

    }

    else if (
        service === "cyber"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "National Cyber Crime Helpline"
            );

    }

    else if (
        service === "domestic"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "National Domestic Violence Support"
            );

    }

    else if (
        service === "telemanas"
    ) {

        selected =
            all.filter(
                h =>
                    h.name === "Tele-MANAS" ||
                    h.name ===
                        "Tele-MANAS Alternate Number"
            );

    }

    else if (
        service === "kiran"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "KIRAN Mental Health Rehabilitation"
            );

    }

    else if (
        service === "mental"
    ) {

        selected =
            all.filter(
                h =>
                    h.category ===
                    "Mental Health"
            );

    }

    else if (
        service === "women"
    ) {

        selected =
            all.filter(
                h =>
                    h.category ===
                    "Women Support"
            );

    }

    else if (
        service === "child"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "Child Helpline"
            );

    }

    else if (
        service === "emergency"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "National Emergency"
            );

    }

    else if (
        service === "nhaa"
    ) {

        selected =
            all.filter(
                h =>
                    h.name ===
                    "NHAA SOS Helpline"
            );

    }


    if (
        !selected.length
    ) {

        selected = all;

    }


    return {

        isHelplineRequest: true,

        selectedHelplines:
            selected,

        reply:
            "Here is the verified helpline information you requested."

    };

}


// ============================================================
// GEMINI CONTENT BUILDER
// ============================================================

function buildGeminiContents(
    messages
) {

    const contents = [];


    for (
        const message of messages
    ) {

        if (
            !message ||
            (
                !message.text &&
                !message.attachment
            )
        ) {

            continue;

        }


        const parts = [];


        if (
            message.text
        ) {

            parts.push({

                text:
                    String(
                        message.text
                    )

            });

        }


        const attachment =
            normalizeAttachment(
                message.attachment
            );


        // IMAGE
        if (
            attachment &&
            attachment.kind === "image" &&
            attachment.data
        ) {

            let data =
                String(
                    attachment.data
                );


            let mimeType =
                attachment.mediaType ||
                "image/jpeg";


            if (
                data.includes(",")
            ) {

                const split =
                    data.split(",");


                const header =
                    split[0];


                data =
                    split
                        .slice(1)
                        .join(",");


                const match =
                    header.match(
                        /data:([^;]+);base64/i
                    );


                if (
                    match
                ) {

                    mimeType =
                        match[1];

                }

            }


            parts.push({

                inlineData: {

                    mimeType,

                    data

                }

            });

        }


        // TEXT ATTACHMENT
        else if (
            attachment &&
            attachment.text
        ) {

            parts.push({

                text:
                    "\n\nAttached file: " +
                    attachment.name +
                    "\n" +
                    String(
                        attachment.text
                    )

            });

        }


        // FILE WITHOUT CONTENT
        else if (
            attachment
        ) {

            parts.push({

                text:
                    "\n\nThe user attached a file named " +
                    attachment.name +
                    " of type " +
                    (
                        attachment.mediaType ||
                        "unknown"
                    ) +
                    "."

            });

        }


        if (
            parts.length
        ) {

            contents.push({

                role:
                    message.role ===
                    "assistant"
                        ? "model"
                        : "user",

                parts

            });

        }

    }


    return contents;

}


// ============================================================
// GEMINI API
// ============================================================

async function callGemini(
    messages
) {

    if (
        !API_KEY
    ) {

        const error =
            new Error(
                "Gemini API key is not configured."
            );

        error.status = 500;

        throw error;

    }


    const contents =
        buildGeminiContents(
            messages
        );


    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODEL +
        ":generateContent?key=" +
        encodeURIComponent(
            API_KEY
        );


    const response =
        await fetch(
            url,
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({

                        systemInstruction: {

                            parts: [

                                {
                                    text:
                                        SYSTEM_PROMPT
                                }

                            ]

                        },

                        contents

                    })

            }
        );


    const data =
        await response.json();


    if (
        !response.ok
    ) {

        const error =
            new Error(
                data?.error?.message ||
                `Gemini API error: ${response.status}`
            );


        error.status =
            response.status;


        throw error;

    }


    return (
        data
            ?.candidates?.[0]
            ?.content?.parts
            ?.map(
                part =>
                    part.text || ""
            )
            .join("") ||
        "No response received."
    );

}


// ============================================================
// PROVIDER API
// ============================================================

app.get(
    "/api/provider",
    (req, res) => {

        res.json({

            provider:
                PROVIDER,

            label:
                PROVIDERS[
                    PROVIDER
                ]?.label ||
                PROVIDER,

            model:
                PROVIDERS[
                    PROVIDER
                ]?.model ||
                MODEL

        });

    }
);


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/healthz",
    (req, res) => {

        res.json({
            status: "ok"
        });

    }
);


app.get(
    "/api/health",
    (req, res) => {

        res.json({

            status:
                "ok",

            database:
                "connected",

            provider:
                PROVIDER,

            model:
                MODEL

        });

    }
);


// ============================================================
// CHAT API
// ============================================================

app.post(
    "/api/chat",
    async (req, res) => {

        const startTime =
            Date.now();


        try {

            // ------------------------------------------------
            // REQUEST
            // ------------------------------------------------

            const messages =
                Array.isArray(
                    req.body?.messages
                )
                    ? req.body.messages
                    : [];


            const bodyAttachment =
                normalizeAttachment(
                    req.body?.attachment
                );


            // ------------------------------------------------
            // IMPORTANT FIX
            //
            // Do NOT assume the last array item is the user.
            //
            // Find the latest actual user message.
            // ------------------------------------------------

            const lastUserMessageObject =
                [...messages]
                    .reverse()
                    .find(
                        message =>
                            String(
                                message?.role ||
                                ""
                            ).toLowerCase() ===
                            "user"
                    );


            let lastUserMessage =
                String(
                    lastUserMessageObject?.text ||
                    req.body?.text ||
                    ""
                ).trim();


            // ------------------------------------------------
            // ATTACHMENT-ONLY
            // ------------------------------------------------

            if (
                !lastUserMessage &&
                bodyAttachment?.text
            ) {

                lastUserMessage =
                    `Please analyze the attached file: ${bodyAttachment.name}`;

            }


            if (
                !lastUserMessage &&
                bodyAttachment
            ) {

                lastUserMessage =
                    `Please analyze the attached ${
                        bodyAttachment.kind === "image"
                            ? "image"
                            : "file"
                    }.`;

            }


            // ------------------------------------------------
            // EMPTY REQUEST
            // ------------------------------------------------

            if (
                !lastUserMessage &&
                !bodyAttachment
            ) {

                return res.status(
                    400
                ).json({

                    reply:
                        "Please enter a message or attach a file.",

                    error:
                        "Message or attachment is required.",

                    provider:
                        PROVIDER,

                    label:
                        "Gemini",

                    helplines: []

                });

            }


            // ------------------------------------------------
            // USER
            // ------------------------------------------------

            const userId =
                getGuestUser();


            // ------------------------------------------------
            // CONVERSATION
            // ------------------------------------------------

            const requestedConversationId =
                Number(
                    req.body?.conversationId
                );


            let conversationId =
                Number.isInteger(
                    requestedConversationId
                ) &&
                requestedConversationId > 0
                    ? requestedConversationId
                    : null;


            if (
                !conversationId
            ) {

                conversationId =
                    createConversation(
                        String(
                            lastUserMessage
                        ).slice(
                            0,
                            80
                        )
                    );

            }


            // ------------------------------------------------
            // SAVE USER MESSAGE
            // ------------------------------------------------

            const messageForDatabase =
                lastUserMessage ||
                (
                    bodyAttachment?.name
                        ? `Attachment: ${bodyAttachment.name}`
                        : "Attachment sent"
                );


            const userMessageId =
                saveMessage({

                    conversationId,

                    role:
                        "user",

                    messageText:
                        messageForDatabase,

                    provider:
                        null,

                    model:
                        null

                });


            // ------------------------------------------------
            // ATTACHMENT
            // ------------------------------------------------

            const attachment =
                bodyAttachment ||
                normalizeAttachment(
                    lastUserMessageObject?.attachment
                );


            let attachmentId =
                null;


            if (
                attachment
            ) {

                attachmentId =
                    saveAttachmentToDatabase(
                        conversationId,
                        userMessageId,
                        attachment,
                        userId
                    );

            }


            // ------------------------------------------------
            // ACTIVITY
            // ------------------------------------------------

            logActivity(
                userId,
                "message_received",
                lastUserMessage
            );


            // ------------------------------------------------
            // HELPLINE CHECK
            // ------------------------------------------------

            const helplineResult =
                detectHelplineRequest(
                    lastUserMessage
                );


            if (
                helplineResult.isHelplineRequest
            ) {

                const reply =
                    helplineResult.reply ||
                    "Here is the verified helpline information.";


                const assistantMessageId =
                    saveMessage({

                        conversationId,

                        role:
                            "assistant",

                        messageText:
                            reply,

                        provider:
                            "database",

                        model:
                            "sqlite"

                    });


                updateConversation(
                    conversationId
                );


                return res.json({

                    reply,

                    provider:
                        "database",

                    label:
                        "Verified Helplines",

                    helplines:
                        helplineResult.selectedHelplines,

                    conversationId,

                    messageId:
                        assistantMessageId,

                    userMessageId,

                    attachmentId

                });

            }


            // ------------------------------------------------
            // PREPARE AI MESSAGES
            // ------------------------------------------------

            const aiMessages =
                messages
                    .map(
                        message => ({

                            role:
                                message.role ===
                                "assistant"
                                    ? "assistant"
                                    : "user",

                            text:
                                message.text ||
                                "",

                            attachment:
                                normalizeAttachment(
                                    message.attachment
                                )

                        })
                    );


            // If frontend did not include the current
            // attachment/message correctly, make sure it is
            // still sent to Gemini.

            const hasCurrentUserMessage =
                aiMessages.some(
                    message =>
                        message.role ===
                            "user" &&
                        String(
                            message.text ||
                            ""
                        ).trim() ===
                            lastUserMessage
                );


            if (
                !hasCurrentUserMessage
            ) {

                aiMessages.push({

                    role:
                        "user",

                    text:
                        lastUserMessage,

                    attachment

                });

            }


            // ------------------------------------------------
            // GEMINI
            // ------------------------------------------------

            let reply;


            try {

                reply =
                    await callGemini(
                        aiMessages
                    );

            } catch (aiError) {

                console.error(
                    "Gemini API error:",
                    aiError
                );


                return res.status(
                    aiError?.status === 429
                        ? 429
                        : 500
                ).json({

                    reply:
                        aiError?.status === 429
                            ? "The AI service is currently experiencing high demand. Please try again later."
                            : "The AI service is temporarily unavailable. Please try again.",

                    error:
                        errorDetail(
                            aiError
                        ),

                    provider:
                        PROVIDER,

                    label:
                        "Gemini",

                    helplines: [],

                    conversationId,

                    userMessageId,

                    attachmentId

                });

            }


            // ------------------------------------------------
            // SAVE ASSISTANT MESSAGE
            // ------------------------------------------------

            const assistantMessageId =
                saveMessage({

                    conversationId,

                    role:
                        "assistant",

                    messageText:
                        reply,

                    provider:
                        PROVIDER,

                    model:
                        MODEL

                });


            updateConversation(
                conversationId
            );


            logActivity(
                userId,
                "message_sent",
                `AI response ${assistantMessageId} generated`
            );


            // ------------------------------------------------
            // AI USAGE
            // ------------------------------------------------

            try {

                db.prepare(`
                    INSERT INTO ai_usage (
                        user_id,
                        conversation_id,
                        message_id,
                        provider,
                        model,
                        request_status,
                        response_time_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(

                    userId,

                    conversationId,

                    assistantMessageId,

                    PROVIDER,

                    MODEL,

                    "success",

                    Date.now() -
                    startTime

                );

            } catch (error) {

                console.error(
                    "AI usage save error:",
                    error.message
                );

            }


            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            return res.json({

                reply:
                    reply ||
                    "No response received.",

                provider:
                    PROVIDER,

                label:
                    "Gemini",

                helplines: [],

                conversationId,

                messageId:
                    assistantMessageId,

                userMessageId,

                attachmentId

            });


        } catch (error) {

            console.error(
                "Chat API error:",
                error
            );


            return res.status(
                500
            ).json({

                reply:
                    "Something went wrong while processing your request.",

                error:
                    errorDetail(
                        error
                    ),

                provider:
                    PROVIDER,

                label:
                    "Gemini",

                helplines: []

            });

        }

    }
);


// ============================================================
// FEEDBACK API
// ============================================================

app.post(
    "/api/feedback",
    (req, res) => {

        try {

            const {
                userId,
                conversationId,
                messageId,
                rating,
                feedbackText,
                feedbackType
            } = req.body;


            if (
                !rating &&
                !feedbackText
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "rating or feedbackText is required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO feedback (
                        user_id,
                        conversation_id,
                        message_id,
                        rating,
                        feedback_text,
                        feedback_type
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(

                    userId || null,

                    conversationId || null,

                    messageId || null,

                    rating || null,

                    feedbackText || null,

                    feedbackType ||
                        "other"

                );


            return res.json({

                success:
                    true,

                feedbackId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Feedback error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to save feedback."

            });

        }

    }
);


// ============================================================
// ACTIVITY API
// ============================================================

app.post(
    "/api/activity",
    (req, res) => {

        try {

            const {
                userId,
                eventType,
                eventDescription,
                ipAddress
            } = req.body;


            if (
                !eventType
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "eventType is required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO date_time (
                        user_id,
                        event_type,
                        event_description,
                        ip_address
                    )
                    VALUES (?, ?, ?, ?)
                `).run(

                    userId || null,

                    eventType,

                    eventDescription ||
                        null,

                    ipAddress ||
                        null

                );


            return res.json({

                success:
                    true,

                activityId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Activity API error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to save activity."

            });

        }

    }
);


// ============================================================
// SESSION API
// ============================================================

app.post(
    "/api/session",
    (req, res) => {

        try {

            const {
                userId,
                sessionToken,
                ipAddress,
                userAgent
            } = req.body;


            if (
                !userId ||
                !sessionToken
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "userId and sessionToken are required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO user_sessions (
                        user_id,
                        session_token,
                        ip_address,
                        user_agent
                    )
                    VALUES (?, ?, ?, ?)
                `).run(

                    userId,

                    sessionToken,

                    ipAddress ||
                        null,

                    userAgent ||
                        null

                );


            return res.json({

                success:
                    true,

                sessionId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Session API error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to create session."

            });

        }

    }
);


// ============================================================
// SESSION LOGOUT
// ============================================================

app.post(
    "/api/session/logout",
    (req, res) => {

        try {

            const {
                sessionToken
            } = req.body;


            if (
                !sessionToken
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "sessionToken is required."

                });

            }


            const result =
                db.prepare(`
                    UPDATE user_sessions
                    SET
                        logout_at = CURRENT_TIMESTAMP,
                        is_active = 0
                    WHERE session_token = ?
                `).run(
                    sessionToken
                );


            return res.json({

                success:
                    true,

                updated:
                    result.changes

            });

        } catch (error) {

            console.error(
                "Session logout error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to logout session."

            });

        }

    }
);


// ============================================================
// ATTACHMENT API
// ============================================================

app.post(
    "/api/attachment",
    (req, res) => {

        try {

            const {
                userId,
                conversationId,
                messageId,
                fileName,
                fileType,
                fileSize,
                filePath
            } = req.body;


            if (
                !conversationId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "conversationId is required."

                });

            }


            if (
                !fileName
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "fileName is required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO attachments (
                        user_id,
                        conversation_id,
                        message_id,
                        file_name,
                        file_type,
                        file_size,
                        file_path
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(

                    userId || null,

                    conversationId,

                    messageId || null,

                    fileName,

                    fileType || null,

                    fileSize || null,

                    filePath || null

                );


            return res.json({

                success:
                    true,

                attachmentId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Attachment API error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to save attachment."

            });

        }

    }
);


// ============================================================
// NOTIFICATION API
// ============================================================

app.post(
    "/api/notification",
    (req, res) => {

        try {

            const {
                userId,
                title,
                message,
                notificationType
            } = req.body;


            if (
                !title ||
                !message
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "title and message are required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO notifications (
                        user_id,
                        title,
                        message,
                        notification_type
                    )
                    VALUES (?, ?, ?, ?)
                `).run(

                    userId || null,

                    title,

                    message,

                    notificationType ||
                        "system"

                );


            return res.json({

                success:
                    true,

                notificationId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Notification API error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to create notification."

            });

        }

    }
);


// ============================================================
// MARK NOTIFICATION READ
// ============================================================

app.post(
    "/api/notification/read",
    (req, res) => {

        try {

            const {
                notificationId
            } = req.body;


            if (
                !notificationId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    error:
                        "notificationId is required."

                });

            }


            const result =
                db.prepare(`
                    UPDATE notifications
                    SET
                        is_read = 1,
                        read_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    notificationId
                );


            return res.json({

                success:
                    true,

                updated:
                    result.changes

            });

        } catch (error) {

            console.error(
                "Notification read error:",
                error.message
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Failed to update notification."

            });

        }

    }
);


// ============================================================
// START SERVER
// ============================================================

const server =
    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log("");
            console.log(
                "================================"
            );
            console.log(
                "       SAKSHAM AI BACKEND"
            );
            console.log(
                "================================"
            );

            console.log(
                `Server: http://localhost:${PORT}`
            );

            console.log(
                `Provider: ${
                    PROVIDERS[
                        PROVIDER
                    ]?.label ||
                    PROVIDER
                }`
            );

            console.log(
                `Model: ${MODEL}`
            );

            console.log(
                "================================"
            );

        }
    );


// ============================================================
// SERVER ERROR
// ============================================================

server.on(
    "error",
    error => {

        console.error(
            "Server error:",
            error
        );


        if (
            error.code ===
            "EADDRINUSE"
        ) {

            console.error(
                `Port ${PORT} is already in use.`
            );

            console.error(
                "Stop the other Node.js process and run server.js again."
            );

            process.exit(1);

        }

    }
);


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown() {

    console.log(
        "\nShutting down server..."
    );


    try {

        db.close();

    } catch (error) {

        console.error(
            "Database close error:",
            error.message
        );

    }


    server.close(
        () => {

            console.log(
                "Server stopped."
            );

            process.exit(0);

        }
    );

}


process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);