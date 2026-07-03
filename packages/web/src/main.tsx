import { render } from "preact";
import { App } from "./app.tsx";
import { initDb } from "./store/db/index.ts";
import { storageOk } from "./store/db/status.ts";
import "./app.css";

function mount() {
  render(<App />, document.getElementById("app")!);
}

initDb().then(mount, (e) => {
  console.error("[db] init failed, rendering without persistence", e);
  storageOk.value = false;
  mount();
});
