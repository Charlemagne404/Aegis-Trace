import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LandingPage } from "./marketing/LandingPage";
import "./styles/index.css";

const openProductPreview = new URLSearchParams(window.location.search).has("app");
const isTauriRuntime = "__TAURI_INTERNALS__" in window || "__TAURI__" in window;

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {isTauriRuntime || openProductPreview ? <App /> : <LandingPage />}
  </StrictMode>
);
