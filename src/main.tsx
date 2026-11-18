import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installStandaloneInsets } from "./standaloneInsets";
import { initEditor } from "./state/store";
import "./styles.css";

installStandaloneInsets();
initEditor(window.localStorage, { autosaveDelayMs: 400 });

const root = document.getElementById("root");
if (!root) throw new Error("root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
