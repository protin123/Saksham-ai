require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();

const PORT = process.env.PORT || 3000;

const PROVIDER =
    String(process.env.PROVIDER || "gemini").toLowerCase();

const API_KEY =
    process.env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";


// ============================================================
// DATABASE
// ============================================================

const DB_PATH = path.join(
    __dirname,
    "Database",
    "saksham_new.db"
);

const SCHEMA_PATH = path.join(
    __dirname,
    "Database",
    "schema.sql"
);

const db = new Database(DB_PATH);

db.pragma("foreign_keys = ON");

console.log("SQLite database connected.");

if (fs.existsSync(SCHEMA_PATH)) {

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
// EXPRESS
// ============================================================

app.use(cors());

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
    express.static(__dirname)
);


// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT =
    "You are Saksham AI, a helpful and concise AI assistant. " +
    "Answer clearly and accurately. " +
    "Do not invent phone numbers, emergency numbers, helpline numbers, " +
    "legal information, medical information, or other critical facts. " +
    "If the user asks for a verified helpline number, use the application's " +
    "verified helpline database instead of guessing a number. " +
    "For general questions, provide a useful and concise answer. " +
    "When the user attaches an image or text file, analyze the attachment " +
    "and answer based on its contents when possible.";


// ============================================================
// AI PROVIDERS
// ============================================================

const PROVIDERS = {

    gemini: {
        label: "Gemini",
        model: "gemini-3.6-flash"
    },

    anthropic: {
        label: "Claude",
        model: "claude-sonnet-5"
    },

    openai: {
        label: "OpenAI",
        model: "gpt-5-mini"
    },

    groq: {
        label: "Groq",
        model: "llama-3.3-70b-versatile"
    },

    openrouter: {
        label: "OpenRouter",
        model: "openrouter/free"
    }

};


// ============================================================
// PROVIDER DETECTION
// ============================================================

function detectProvider(key) {

    if (!key) {
        return PROVIDER;
    }

    const value =
        String(key).toLowerCase();

    if (
        value.startsWith("AIza")
    ) {
        return "gemini";
    }

    if (
        value.startsWith("sk-ant-")
    ) {
        return "anthropic";
    }

    if (
        value.startsWith("sk-or-")
    ) {
        return "openrouter";
    }

    if (
        value.startsWith("gsk_")
    ) {
        return "groq";
    }

    if (
        value.startsWith("sk-")
    ) {
        return "openai";
    }

    return PROVIDER;
}


// ============================================================
// HELPLINES
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
        String(messageText || "").trim();

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
                ).split(",")[1] ||
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

    const filePath =
        attachment.filePath ||
        null;

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
                filePath
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
// HELPLINE DETECTION
// ============================================================

function detectHelplineRequest(text) {
    const userText =
        String(text || "")
            .toLowerCase()
            .trim();

    const numberIntentKeywords = [
        "number",
        "phone number",
        "contact number",
        "contact",
        "helpline number",
        "helpline",
        "help line",
        "toll free",
        "toll-free",
        "call",
        "dial",
        "phone",
        "support number",
        "number chahiye",
        "number batao",
        "number do",
        "phone number chahiye",
        "helpline chahiye",
        "helpline number chahiye"
    ];

    const serviceKeywords = [
        "police",
        "ambulance",
        "medical emergency",
        "fire",
        "fire brigade",
        "legal aid",
        "legal help",
        "cyber crime",
        "cyber fraud",
        "online fraud",
        "women",
        "woman",
        "mahila",
        "mental health",
        "tele-manas",
        "telemanas",
        "kiran",
        "domestic violence",
        "domestic abuse",
        "child",
        "children",
        "bachon",
        "emergency",
        "nhaa",
        "atrocity"
    ];

    const asksForNumber =
        numberIntentKeywords.some(
            keyword => userText.includes(keyword)
        );

    const serviceMatch =
        serviceKeywords.some(
            keyword => userText.includes(keyword)
        );

    const wantsAllHelplines =
        userText.includes("all helpline") ||
        userText.includes("all helpline numbers") ||
        userText.includes("all numbers") ||
        userText.includes("all emergency numbers") ||
        userText.includes("all emergency helplines") ||
        userText.includes("every helpline") ||
        userText.includes("all the helpline") ||
        userText.includes("all helplines");

    /*
      Generic helpline request:
      "give me helpline number"
      "helpline number chahiye"
      "give me a helpline"
      
      These must also use the database
      instead of Gemini.
    */
    const genericHelplineRequest =
        userText.includes("helpline") ||
        userText.includes("help line");

    const isHelplineRequest =
        wantsAllHelplines ||
        genericHelplineRequest ||
        (serviceMatch && asksForNumber);

    if (!isHelplineRequest) {
        return {
            isHelplineRequest: false,
            selectedHelplines: []
        };
    }

    const all =
        getHelplinesFromDatabase();

    /*
      If user asks for a generic helpline,
      return all verified helplines from SQLite.
    */
    if (
        wantsAllHelplines ||
        genericHelplineRequest && !serviceMatch
    ) {
        return {
            isHelplineRequest: true,
            selectedHelplines: all,
            reply:
                "Here are the verified helpline numbers available in Saksham AI."
        };
    }

    let selected = [];

    if (userText.includes("police")) {
        selected =
            all.filter(
                h => h.name === "Police Control Room"
            );

    } else if (
        userText.includes("ambulance") ||
        userText.includes("medical emergency")
    ) {
        selected =
            all.filter(
                h =>
                    h.name ===
                    "Medical Emergency / Ambulance"
            );

    } else if (
        userText.includes("fire")
    ) {
        selected =
            all.filter(
                h => h.name === "Fire Brigade"
            );

    } else if (
        userText.includes("legal aid") ||
        userText.includes("legal help")
    ) {
        selected =
            all.filter(
                h => h.name === "NALSA Legal Aid"
            );

    } else if (
        userText.includes("cyber crime") ||
        userText.includes("cyber fraud") ||
        userText.includes("online fraud")
    ) {
        selected =
            all.filter(
                h =>
                    h.name ===
                    "National Cyber Crime Helpline"
            );

    } else if (
        userText.includes("domestic violence") ||
        userText.includes("domestic abuse")
    ) {
        selected =
            all.filter(
                h =>
                    h.name ===
                    "National Domestic Violence Support"
            );

    } else if (
        userText.includes("tele-manas") ||
        userText.includes("telemanas")
    ) {
        selected =
            all.filter(
                h =>
                    h.name === "Tele-MANAS" ||
                    h.name ===
                        "Tele-MANAS Alternate Number"
            );

    } else if (
        userText.includes("kiran")
    ) {
        selected =
            all.filter(
                h =>
                    h.name ===
                    "KIRAN Mental Health Rehabilitation"
            );

    } else if (
        userText.includes("mental health")
    ) {
        selected =
            all.filter(
                h =>
                    h.category === "Mental Health"
            );

    } else if (
        userText.includes("nhaa") ||
        userText.includes("atrocity") ||
        userText.includes("14566")
    ) {
        selected =
            all.filter(
                h =>
                    h.name ===
                    "NHAA SOS Helpline"
            );

    } else if (
        userText.includes("women") ||
        userText.includes("woman") ||
        userText.includes("mahila")
    ) {
        selected =
            all.filter(
                h =>
                    h.category === "Women Support"
            );

    } else if (
        userText.includes("child") ||
        userText.includes("children") ||
        userText.includes("bachon")
    ) {
        selected =
            all.filter(
                h =>
                    h.name === "Child Helpline"
            );

    } else if (
        userText.includes("emergency") ||
        userText.includes("112")
    ) {
        selected =
            all.filter(
                h =>
                    h.name === "National Emergency"
            );
    }

    if (!selected.length) {
        selected = all;
    }

    return {
        isHelplineRequest: true,
        selectedHelplines: selected,
        reply:
            "Here is the verified helpline information you requested."
    };
}


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
// GEMINI CONTENT BUILDER
// ============================================================

function buildGeminiContents(messages) {

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


        if (message.text) {

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

                if (match) {

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

        else if (
            attachment &&
            attachment.kind === "text" &&
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
            parts.length === 0
        ) {
            continue;
        }


        contents.push({

            role:
                message.role === "assistant"
                    ? "model"
                    : "user",

            parts

        });

    }


    return contents;
}


// ============================================================
// GEMINI
// ============================================================

async function callGemini(
    messages
) {

    const model =
        PROVIDERS.gemini.model;

    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(API_KEY);


    const contents =
        buildGeminiContents(
            messages
        );


    if (
        !contents.length
    ) {

        throw new Error(
            "No usable content was provided to Gemini."
        );

    }


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
        data?.candidates?.[0]
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
// ANTHROPIC
// ============================================================

async function callAnthropic(
    messages
) {

    const model =
        PROVIDERS.anthropic.model;


    const apiMessages =
        messages
            .filter(
                m =>
                    m &&
                    (
                        m.text ||
                        m.attachment
                    )
            )
            .map(
                m => {

                    const content = [];


                    if (m.text) {

                        content.push({

                            type: "text",

                            text:
                                String(
                                    m.text
                                )

                        });

                    }


                    const attachment =
                        normalizeAttachment(
                            m.attachment
                        );


                    if (
                        attachment &&
                        attachment.text
                    ) {

                        content.push({

                            type: "text",

                            text:
                                "\nAttached file " +
                                attachment.name +
                                ":\n" +
                                String(
                                    attachment.text
                                )

                        });

                    }


                    if (
                        attachment &&
                        attachment.kind === "image" &&
                        attachment.data
                    ) {

                        let data =
                            String(
                                attachment.data
                            );

                        let mediaType =
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


                            if (match) {

                                mediaType =
                                    match[1];

                            }

                        }


                        content.push({

                            type: "image",

                            source: {

                                type: "base64",

                                media_type:
                                    mediaType,

                                data

                            }

                        });

                    }


                    if (
                        content.length === 0
                    ) {

                        content.push({

                            type: "text",

                            text:
                                "User attached a file named " +
                                attachment?.name

                        });

                    }


                    return {

                        role:
                            m.role === "assistant"
                                ? "assistant"
                                : "user",

                        content

                    };

                }
            );


    const response =
        await fetch(
            "https://api.anthropic.com/v1/messages",
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "x-api-key":
                        process.env.ANTHROPIC_API_KEY ||
                        API_KEY,

                    "anthropic-version":
                        "2023-06-01"

                },

                body:
                    JSON.stringify({

                        model,

                        max_tokens: 1024,

                        system:
                            SYSTEM_PROMPT,

                        messages:
                            apiMessages

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
                `Anthropic API error: ${response.status}`
            );

        error.status =
            response.status;

        throw error;

    }


    return (
        data?.content
            ?.map(
                item =>
                    item.text || ""
            )
            .join("") ||
        "No response received."
    );

}


// ============================================================
// OPENAI / GROQ / OPENROUTER
// ============================================================

async function callOpenAICompatible(
    messages,
    provider
) {

    let baseUrl;
    let apiKey;


    if (
        provider === "openai"
    ) {

        baseUrl =
            "https://api.openai.com/v1/chat/completions";

        apiKey =
            process.env.OPENAI_API_KEY ||
            API_KEY;

    }

    else if (
        provider === "groq"
    ) {

        baseUrl =
            "https://api.groq.com/openai/v1/chat/completions";

        apiKey =
            process.env.GROQ_API_KEY ||
            API_KEY;

    }

    else {

        baseUrl =
            "https://openrouter.ai/api/v1/chat/completions";

        apiKey =
            process.env.OPENROUTER_API_KEY ||
            API_KEY;

    }


    const model =
        PROVIDERS[
            provider
        ].model;


    const apiMessages = [

        {

            role: "system",

            content:
                SYSTEM_PROMPT

        },

        ...messages
            .filter(
                m =>
                    m &&
                    (
                        m.text ||
                        m.attachment
                    )
            )
            .map(
                m => {

                    let content =
                        String(
                            m.text || ""
                        );


                    const attachment =
                        normalizeAttachment(
                            m.attachment
                        );


                    if (
                        attachment &&
                        attachment.text
                    ) {

                        content +=
                            "\n\nAttached file: " +
                            attachment.name +
                            "\n" +
                            String(
                                attachment.text
                            );

                    }


                    if (
                        attachment &&
                        !attachment.text &&
                        attachment.name
                    ) {

                        content +=
                            "\n\nUser attached file: " +
                            attachment.name +
                            "\nType: " +
                            (
                                attachment.mediaType ||
                                "unknown"
                            );

                    }


                    return {

                        role:
                            m.role === "assistant"
                                ? "assistant"
                                : "user",

                        content

                    };

                }
            )

    ];


    const response =
        await fetch(
            baseUrl,
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${apiKey}`

                },

                body:
                    JSON.stringify({

                        model,

                        messages:
                            apiMessages,

                        temperature:
                            0.7

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
                `AI API error: ${response.status}`
            );

        error.status =
            response.status;

        throw error;

    }


    return (
        data?.choices?.[0]
            ?.message?.content ||
        "No response received."
    );

}


// ============================================================
// AI ROUTER
// ============================================================

async function callAI(
    messages,
    provider
) {

    if (
        provider === "gemini"
    ) {

        return callGemini(
            messages
        );

    }


    if (
        provider === "anthropic"
    ) {

        return callAnthropic(
            messages
        );

    }


    return callOpenAICompatible(
        messages,
        provider
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
                null

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

            // ==================================================
            // READ REQUEST
            // ==================================================

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


            const lastMessage =
                messages[
                    messages.length - 1
                ];


            let lastUserMessage =
                String(
                    lastMessage?.text ||
                    req.body?.text ||
                    ""
                ).trim();


            // ==================================================
            // ATTACHMENT-ONLY MESSAGE
            // ==================================================

            if (
                !lastUserMessage &&
                bodyAttachment?.text
            ) {

                lastUserMessage =
                    `Please analyze the attached file: ${
                        bodyAttachment.name
                    }`;

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


            // ==================================================
            // EMPTY REQUEST CHECK
            // ==================================================

            if (
                !lastUserMessage &&
                !bodyAttachment
            ) {

                return res.status(400).json({

                    reply:
                        "Please enter a message or attach a file.",

                    error:
                        "Message or attachment is required.",

                    provider:
                        PROVIDER,

                    label:
                        PROVIDERS[
                            PROVIDER
                        ]?.label ||
                        PROVIDER,

                    helplines: []

                });

            }


            // ==================================================
            // CONVERSATION
            // ==================================================

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
                        ).slice(0, 80)
                    );

            }


            const userId =
                getGuestUser();


            // ==================================================
            // PREPARE AI MESSAGES
            // ==================================================

            const aiMessages =
                messages.map(
                    m => ({

                        role:
                            m.role ||
                            "user",

                        text:
                            m.text ||
                            "",

                        attachment:
                            normalizeAttachment(
                                m.attachment
                            )

                    })
                );


            // ==================================================
            // ADD SEPARATE ATTACHMENT
            // ==================================================

            if (
                bodyAttachment
            ) {

                if (
                    aiMessages.length > 0
                ) {

                    const lastIndex =
                        aiMessages.length - 1;


                    aiMessages[
                        lastIndex
                    ].attachment =
                        bodyAttachment;


                    if (
                        !aiMessages[
                            lastIndex
                        ].text
                    ) {

                        aiMessages[
                            lastIndex
                        ].text =
                            lastUserMessage;

                    }

                }

                else {

                    aiMessages.push({

                        role:
                            "user",

                        text:
                            lastUserMessage,

                        attachment:
                            bodyAttachment

                    });

                }

            }


            // ==================================================
            // FINAL ATTACHMENT
            // ==================================================

            const finalAttachment =
                bodyAttachment ||
                aiMessages[
                    aiMessages.length - 1
                ]?.attachment ||
                null;


            // ==================================================
            // SAVE USER MESSAGE
            // ==================================================

            const messageForDatabase =
                lastUserMessage ||
                (
                    finalAttachment?.name
                        ? `Attachment: ${finalAttachment.name}`
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


            updateConversation(
                conversationId
            );


            logActivity(
                userId,

                "message_sent",

                `Message ${
                    userMessageId ||
                    "unknown"
                } sent`

            );


            // ==================================================
            // SAVE ATTACHMENT
            // ==================================================

            let attachmentId =
                null;


            if (
                finalAttachment
            ) {

                attachmentId =
                    saveAttachmentToDatabase(

                        conversationId,

                        userMessageId,

                        finalAttachment,

                        userId

                    );

            }


            // ==================================================
            // HELPLINE CHECK
            // ==================================================

            const helplineResult =
                detectHelplineRequest(
                    lastUserMessage
                );


            if (
                helplineResult
                    .isHelplineRequest
            ) {

                const assistantText =
                    helplineResult.reply;


                const assistantMessageId =
                    saveMessage({

                        conversationId,

                        role:
                            "assistant",

                        messageText:
                            assistantText,

                        provider:
                            "Saksham AI",

                        model:
                            null

                    });


                updateConversation(
                    conversationId
                );


                logActivity(

                    userId,

                    "helpline_viewed",

                    `Helpline response ${
                        assistantMessageId
                    }`

                );


                const responseTime =
                    Date.now() -
                    startTime;


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

                        "Saksham AI",

                        null,

                        "success",

                        responseTime

                    );

                } catch (error) {

                    console.error(

                        "AI usage log error:",

                        error.message

                    );

                }


                return res.json({

                    reply:
                        assistantText,

                    provider:
                        PROVIDER,

                    label:
                        PROVIDERS[
                            PROVIDER
                        ]?.label ||
                        PROVIDER,

                    helplines:
                        helplineResult
                            .selectedHelplines,

                    conversationId,

                    messageId:
                        assistantMessageId,

                    userMessageId,

                    attachmentId

                });

            }


            // ==================================================
            // NORMAL AI
            // ==================================================

            const selectedProvider =
                detectProvider(
                    API_KEY
                );


            const aiStart =
                Date.now();


            let reply;


            try {

                reply =
                    await callAI(

                        aiMessages,

                        selectedProvider

                    );


                const responseTime =
                    Date.now() -
                    aiStart;


                // ==================================================
                // SAVE ASSISTANT MESSAGE
                // ==================================================

                const assistantMessageId =
                    saveMessage({

                        conversationId,

                        role:
                            "assistant",

                        messageText:
                            reply ||
                            "No response received.",

                        provider:
                            PROVIDERS[
                                selectedProvider
                            ]?.label ||
                            selectedProvider,

                        model:
                            PROVIDERS[
                                selectedProvider
                            ]?.model ||
                            null

                    });


                updateConversation(
                    conversationId
                );


                logActivity(

                    userId,

                    "message_received",

                    `AI response ${
                        assistantMessageId
                    } received`

                );


                // ==================================================
                // AI USAGE
                // ==================================================

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

                        selectedProvider,

                        PROVIDERS[
                            selectedProvider
                        ]?.model ||
                        null,

                        "success",

                        responseTime

                    );

                } catch (error) {

                    console.error(

                        "AI usage save error:",

                        error.message

                    );

                }


                return res.json({

                    reply:
                        reply ||
                        "No response received.",

                    provider:
                        selectedProvider,

                    label:
                        PROVIDERS[
                            selectedProvider
                        ]?.label ||
                        selectedProvider,

                    helplines: [],

                    conversationId,

                    messageId:
                        assistantMessageId,

                    userMessageId,

                    attachmentId

                });


            } catch (aiError) {

                const responseTime =
                    Date.now() -
                    aiStart;


                console.error(
                    "AI provider error:",
                    aiError
                );


                try {

                    db.prepare(`
                        INSERT INTO ai_usage (
                            user_id,
                            conversation_id,
                            message_id,
                            provider,
                            model,
                            request_status,
                            error_code,
                            response_time_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(

                        userId,

                        conversationId,

                        userMessageId,

                        selectedProvider,

                        PROVIDERS[
                            selectedProvider
                        ]?.model ||
                        null,

                        "failed",

                        String(
                            aiError?.status ||
                            aiError?.code ||
                            "AI_ERROR"
                        ),

                        responseTime

                    );

                } catch (logError) {

                    console.error(

                        "Failed to save AI usage:",

                        logError.message

                    );

                }


                return res.status(

                    aiError?.status === 429
                        ? 429
                        : 500

                ).json({

                    reply:
                        "The AI service is temporarily unavailable. Please try again.",

                    error:
                        errorDetail(
                            aiError
                        ),

                    provider:
                        selectedProvider,

                    label:
                        PROVIDERS[
                            selectedProvider
                        ]?.label ||
                        selectedProvider,

                    helplines: [],

                    conversationId,

                    userMessageId,

                    attachmentId

                });

            }


        } catch (error) {

            console.error(
                "Chat API error:",
                error
            );


            return res.status(500).json({

                reply:
                    "Something went wrong while processing your request.",

                error:
                    errorDetail(
                        error
                    ),

                provider:
                    PROVIDER,

                label:
                    PROVIDERS[
                        PROVIDER
                    ]?.label ||
                    PROVIDER,

                helplines: []

            });

        }

    }
);


// ============================================================
// HEALTH CHECK
// ============================================================

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
                PROVIDERS[
                    PROVIDER
                ]?.model ||
                null

        });

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

                return res.status(400).json({

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

                    userId ||
                        null,

                    conversationId ||
                        null,

                    messageId ||
                        null,

                    rating ||
                        null,

                    feedbackText ||
                        null,

                    feedbackType ||
                        "other"

                );


            res.json({

                success:
                    true,

                feedbackId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Feedback error:",
                error
            );


            res.status(500).json({

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

                return res.status(400).json({

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

                    userId ||
                        null,

                    eventType,

                    eventDescription ||
                        null,

                    ipAddress ||
                        null

                );


            res.json({

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


            res.status(500).json({

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

                return res.status(400).json({

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


            res.json({

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


            res.status(500).json({

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

                return res.status(400).json({

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


            res.json({

                success:
                    true,

                updated:
                    result.changes

            });

        } catch (error) {

            console.error(
                "Logout API error:",
                error.message
            );


            res.status(500).json({

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

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "conversationId is required."

                });

            }


            if (
                !fileName
            ) {

                return res.status(400).json({

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

                    userId ||
                        null,

                    conversationId,

                    messageId ||
                        null,

                    fileName,

                    fileType ||
                        null,

                    fileSize ||
                        null,

                    filePath ||
                        null

                );


            res.json({

                success:
                    true,

                attachmentId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Attachment API error:",
                error
            );


            res.status(500).json({

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

                return res.status(400).json({

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

                    userId ||
                        null,

                    title,

                    message,

                    notificationType ||
                        "system"

                );


            res.json({

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


            res.status(500).json({

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

                return res.status(400).json({

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


            res.json({

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


            res.status(500).json({

                success:
                    false,

                error:
                    "Failed to mark notification as read."

            });

        }

    }
);


// ============================================================
// ADMIN API
// ============================================================

app.post(
    "/api/admin",
    (req, res) => {

        try {

            const {
                name,
                email,
                passwordHash,
                role
            } = req.body;


            if (
                !name ||
                !email ||
                !passwordHash
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "name, email and passwordHash are required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO admin_users (
                        name,
                        email,
                        password_hash,
                        role
                    )
                    VALUES (?, ?, ?, ?)
                `).run(

                    name,

                    email,

                    passwordHash,

                    role ||
                        "admin"

                );


            res.json({

                success:
                    true,

                adminId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Admin API error:",
                error.message
            );


            res.status(500).json({

                success:
                    false,

                error:
                    "Failed to create admin user."

            });

        }

    }
);


// ============================================================
// AUDIT LOG API
// ============================================================

app.post(
    "/api/audit-log",
    (req, res) => {

        try {

            const {
                adminUserId,
                action,
                targetType,
                targetId,
                description,
                ipAddress
            } = req.body;


            if (
                !action
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "action is required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO audit_logs (
                        admin_user_id,
                        action,
                        target_type,
                        target_id,
                        description,
                        ip_address
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(

                    adminUserId ||
                        null,

                    action,

                    targetType ||
                        null,

                    targetId ||
                        null,

                    description ||
                        null,

                    ipAddress ||
                        null

                );


            res.json({

                success:
                    true,

                auditLogId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Audit log API error:",
                error.message
            );


            res.status(500).json({

                success:
                    false,

                error:
                    "Failed to save audit log."

            });

        }

    }
);


// ============================================================
// REPORT API
// ============================================================

app.post(
    "/api/report",
    (req, res) => {

        try {

            const {
                userId,
                conversationId,
                messageId,
                reportType,
                description
            } = req.body;


            if (
                !description
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "description is required."

                });

            }


            const result =
                db.prepare(`
                    INSERT INTO reports (
                        user_id,
                        conversation_id,
                        message_id,
                        report_type,
                        description
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(

                    userId ||
                        null,

                    conversationId ||
                        null,

                    messageId ||
                        null,

                    reportType ||
                        "other",

                    description

                );


            res.json({

                success:
                    true,

                reportId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Report API error:",
                error.message
            );


            res.status(500).json({

                success:
                    false,

                error:
                    "Failed to create report."

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
                `Model: ${
                    PROVIDERS[
                        PROVIDER
                    ]?.model ||
                    "Unknown"
                }`
            );

            console.log(
                "================================"
            );

        }
    );


// ============================================================
// SERVER ERROR HANDLING
// ============================================================

server.on(
    "error",
    error => {

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


        console.error(
            "Server error:",
            error
        );

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
