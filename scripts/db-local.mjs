import { database } from "./database.mjs";
const pg = await database();
console.log(
  "Kubera PostgreSQL is running on localhost. Keep this terminal open.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
