import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { loadTheme } from "./theme";
void loadTheme()
  .catch(console.error)
  .finally(() =>
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
