const Database = require("better-sqlite3");

const db = new Database("./Database/saksham.db");

console.log("\n==============================");
console.log("DATABASE CHECK");
console.log("==============================\n");

// 1. Conversations
const conversations = db.prepare(`
    SELECT *
    FROM conversations
    ORDER BY id DESC
`).all();

console.log("CONVERSATIONS:");
console.log(conversations);


// 2. Messages
const messages = db.prepare(`
    SELECT *
    FROM messages
    ORDER BY id DESC
`).all();

console.log("\nMESSAGES:");
console.log(messages);


// 3. Helplinesnode
const helplines = db.prepare(`
    SELECT id, name, number, category
    FROM helplines
    WHERE is_active = 1
    ORDER BY id
`).all();

console.log("\nHELPLINES:");
console.log(helplines);

// 4. AI Usage
const aiUsage = db.prepare(`
    SELECT *
    FROM ai_usage
    ORDER BY id DESC
`).all();

console.log("\nAI USAGE:");
console.log(aiUsage);

// 5. Feedback
const feedback = db.prepare(`
    SELECT *
    FROM feedback
    ORDER BY id DESC
`).all();

console.log("\nFEEDBACK:");
console.log(feedback);

db.close();

console.log("\n==============================");
console.log("DATABASE CHECK COMPLETE");
console.log("==============================");