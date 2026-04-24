import { App } from "fresh";
import { State } from "./utils.ts";

const app = new App<State>();
await app.listen();
