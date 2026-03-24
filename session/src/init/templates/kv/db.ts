import { collection, kvdex } from "@olli/kvdex";
import { SessionModel, UserModel } from "./models.ts";

const kv = await Deno.openKv();

// Create kvdex instance
const db = kvdex({
  kv,
  schema: {
    sessions: collection(SessionModel),
    users: collection(UserModel, {
      indices: {
        username: "primary",
      },
    }),
  },
});

export { db, kv };
