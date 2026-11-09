import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initEditor } from "./state/store";
import "./styles.css";

initEditor(window.localStorage);

const root = document.getElementById("root");
if (!root) throw new Error("root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
