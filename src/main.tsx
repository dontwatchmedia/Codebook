import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./components/theme.css";
import { loadTheme } from "./theme";
import { loadLayout } from "./layout";
import { loadZoom } from "./zoom";
import { loadSidebarWidth } from "./sidebar";
void Promise.allSettled([
  loadTheme(),
  loadLayout(),
  loadZoom(),
  loadSidebarWidth(),
])
  .then((results) => {
    for (const result of results)
      if (result.status === "rejected") console.error(result.reason);
  })
  .finally(() =>
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
