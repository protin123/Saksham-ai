const Database = require("better-sqlite3");

const db = new Database("./Database/saksham_new.db");

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
        number: "102",
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
        description: "Women helpline and support services. Availability may vary by State/UT."
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
        description: "Former KIRAN mental health rehabilitation helpline; services have been integrated with Tele-MANAS."
    },
    {
        name: "NHAA SOS Helpline",
        number: "14566",
        category: "Atrocity Support",
        description: "National Helpline Against Atrocities."
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
    INSERT OR IGNORE INTO helplines
    (name, number, category, description)
    VALUES (?, ?, ?, ?)
`);

const insertMany = db.transaction((items) => {
    for (const h of items) {
        insert.run(
            h.name,
            h.number,
            h.category,
            h.description
        );
    }
});

insertMany(helplines);

console.log("13 helplines inserted into database.");

db.close();
