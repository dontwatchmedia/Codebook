import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./components/theme.css";
import { loadTheme } from "./theme";
import { loadLayout } from "./layout";
void Promise.all([loadTheme(), loadLayout()])
  .catch(console.error)
  .finally(() =>
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
