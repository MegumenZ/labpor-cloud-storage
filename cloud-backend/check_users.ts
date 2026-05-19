import { db, users } from "./src/db";

const allUsers = await db.select().from(users).limit(5);
console.log("Users found:", allUsers.length);
allUsers.forEach(u => {
    console.log(`User: ${u.username}, Password: ${u.password}`);
});
