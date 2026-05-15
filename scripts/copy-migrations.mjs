// Copies src/db/migrations/*.sql into dist/db/migrations/ after tsc.
// Required because tsc does not copy non-.ts assets — without this, the
// published package fails at first `getDb()` call when migrate.ts resolves
// the SQL files via import.meta.url at runtime.
import { cp } from "node:fs/promises";
await cp("src/db/migrations", "dist/db/migrations", { recursive: true });
